import { createAudioPlayer, setAudioModeAsync, type AudioMetadata, type AudioPlayer, type AudioStatus } from 'expo-audio';

export type PlaybackSnapshot = {
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  didJustFinish: boolean;
};

type PlaybackListener = (status: PlaybackSnapshot) => void;
type AmplitudeListener = (amplitude: number) => void;

/**
 * `activePlayer` is whichever AudioPlayer instance is currently "the" track
 * the app is following — during a normal load, that's the only instance
 * that exists. During a crossfade, TWO instances briefly play at once (the
 * outgoing track fading out, the incoming one fading in), but only the one
 * that equals `activePlayer` is allowed to forward events to the store; the
 * other's ticks are silently dropped. This is what keeps the UI's progress
 * bar/clock from flickering between two tracks' timelines mid-fade — it
 * doesn't switch until the fade finishes and `activePlayer` flips.
 */
let activePlayer: AudioPlayer | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let fadeIncoming: AudioPlayer | null = null;

const playbackListeners = new Set<PlaybackListener>();
const amplitudeListeners = new Set<AmplitudeListener>();

export async function configureAudioSession(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    // doNotMix is required for setActiveForLockScreen (below) to work at
    // all — duckOthers still let another app keep partial focus, which
    // silently disabled the lock-screen/notification controls.
    interruptionMode: 'doNotMix',
    // Keeps the native player alive when the app is backgrounded or the
    // screen locks — without this, Android/iOS tear the session down.
    shouldPlayInBackground: true,
  });
}

/**
 * Puts the current track on the OS lock screen / notification media
 * surface on native (Android/iOS) — the web equivalent lives in
 * mediaSession.ts, since expo-audio's lock-screen API is native-only.
 * Play/Pause pressed there drives this same native player directly, so the
 * existing playbackStatusUpdate subscription picks up the change for free;
 * no separate callback wiring needed for those two actions.
 */
export function setLockScreenActive(metadata: AudioMetadata): void {
  try {
    activePlayer?.setActiveForLockScreen(true, metadata, { showSeekForward: true, showSeekBackward: true });
  } catch {
    // Unsupported on this platform/player state — the web bridge still covers browsers.
  }
}

export function updateLockScreenMetadata(metadata: AudioMetadata): void {
  try {
    activePlayer?.updateLockScreenMetadata(metadata);
  } catch {
    // Ignore — see setLockScreenActive.
  }
}

export function clearLockScreenControls(): void {
  try {
    activePlayer?.clearLockScreenControls();
  } catch {
    // Ignore — see setLockScreenActive.
  }
}

function toSnapshot(status: AudioStatus): PlaybackSnapshot {
  return {
    playing: status.playing,
    currentTime: status.currentTime,
    duration: status.duration,
    isBuffering: status.isBuffering,
    didJustFinish: status.didJustFinish,
  };
}

/** Cancels an in-flight crossfade immediately (used before any manual
 * navigation interrupts one — a stray fade timer left running after the
 * user taps "next" would otherwise leak a silent extra player). */
function cancelInFlightFade(): void {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
  fadeIncoming?.remove();
  fadeIncoming = null;
}

function bindPlayerEvents(instance: AudioPlayer): void {
  instance.addListener('playbackStatusUpdate', (status) => {
    if (instance !== activePlayer) return; // a fading-out/abandoned instance — ignore
    playbackListeners.forEach((listener) => listener(toSnapshot(status)));
  });

  // Real signal-derived amplitude (RMS of raw PCM frames), not a simulation —
  // only enabled when the platform actually supports sampling.
  if (instance.isAudioSamplingSupported) {
    instance.setAudioSamplingEnabled(true);
    instance.addListener('audioSampleUpdate', (sample) => {
      if (instance !== activePlayer) return;
      const frames = sample.channels[0]?.frames ?? [];
      if (!frames.length) return;
      const rms = Math.sqrt(frames.reduce((sum, f) => sum + f * f, 0) / frames.length);
      amplitudeListeners.forEach((listener) => listener(Math.min(1, rms * 4)));
    });
  }
}

export type LoadOptions = {
  /** Start playback immediately (default). Pass false to restore a session paused. */
  autoplay?: boolean;
  /** Resume position in seconds. */
  startAt?: number;
};

export function loadAndPlay(uri: string, headers?: Record<string, string>, options: LoadOptions = {}): void {
  cancelInFlightFade();
  const { autoplay = true, startAt = 0 } = options;
  activePlayer?.remove();
  activePlayer = createAudioPlayer({ uri, headers }, { updateInterval: 250 });
  bindPlayerEvents(activePlayer);

  if (startAt > 0) activePlayer.seekTo(startAt);
  if (autoplay) activePlayer.play();
}

/**
 * AutoMix-style crossfade: starts the next track silently underneath the
 * current one, ramps volumes across `durationMs`, then hands control over.
 * Resolves once the new track is fully in charge — the caller (playerStore)
 * re-subscribes its listeners against it at that point, exactly as it would
 * after a normal load.
 */
export function crossfadeTo(
  uri: string,
  headers: Record<string, string> | undefined,
  durationMs: number,
  targetVolume: number,
): Promise<void> {
  return new Promise((resolve) => {
    const outgoing = activePlayer;
    const incoming = createAudioPlayer({ uri, headers }, { updateInterval: 250 });
    bindPlayerEvents(incoming);
    incoming.volume = 0;
    incoming.play();
    fadeIncoming = incoming;

    const startVolume = outgoing?.volume ?? 0;
    const steps = Math.max(4, Math.floor(durationMs / 50));
    let step = 0;

    fadeTimer = setInterval(() => {
      step += 1;
      const t = Math.min(1, step / steps);
      if (outgoing) outgoing.volume = Math.max(0, startVolume * (1 - t));
      incoming.volume = Math.min(targetVolume, targetVolume * t);

      if (t >= 1) {
        if (fadeTimer) clearInterval(fadeTimer);
        fadeTimer = null;
        fadeIncoming = null;
        activePlayer = incoming;
        outgoing?.remove();
        resolve();
      }
    }, 50);
  });
}

export function togglePlayback(): void {
  if (!activePlayer) return;
  if (activePlayer.playing) activePlayer.pause();
  else activePlayer.play();
}

export function pausePlayback(): void {
  activePlayer?.pause();
}

export function setPlaybackRate(rate: number): void {
  activePlayer?.setPlaybackRate(rate, 'high');
}

export function setVolume(volume: number): void {
  if (activePlayer) activePlayer.volume = Math.max(0, Math.min(1, volume));
}

export function setMuted(muted: boolean): void {
  if (activePlayer) activePlayer.muted = muted;
}

export function setLooping(loop: boolean): void {
  if (activePlayer) activePlayer.loop = loop;
}

export function seekTo(seconds: number): void {
  activePlayer?.seekTo(seconds);
}

export function stopAndRelease(): void {
  cancelInFlightFade();
  activePlayer?.remove();
  activePlayer = null;
}

export function isSamplingSupported(): boolean {
  return activePlayer?.isAudioSamplingSupported ?? false;
}

export function subscribePlayback(listener: PlaybackListener): () => void {
  playbackListeners.add(listener);
  return () => playbackListeners.delete(listener);
}

export function subscribeAmplitude(listener: AmplitudeListener): () => void {
  amplitudeListeners.add(listener);
  return () => amplitudeListeners.delete(listener);
}
