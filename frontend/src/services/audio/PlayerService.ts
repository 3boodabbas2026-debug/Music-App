import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';

export type PlaybackSnapshot = {
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  didJustFinish: boolean;
};

type PlaybackListener = (status: PlaybackSnapshot) => void;
type AmplitudeListener = (amplitude: number) => void;

let player: AudioPlayer | null = null;
const playbackListeners = new Set<PlaybackListener>();
const amplitudeListeners = new Set<AmplitudeListener>();

export async function configureAudioSession(): Promise<void> {
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
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

export function loadAndPlay(uri: string, headers?: Record<string, string>): void {
  player?.remove();
  player = createAudioPlayer({ uri, headers }, { updateInterval: 250 });

  player.addListener('playbackStatusUpdate', (status) => {
    const snapshot = toSnapshot(status);
    playbackListeners.forEach((listener) => listener(snapshot));
  });

  // Real signal-derived amplitude (RMS of raw PCM frames), not a simulation —
  // only enabled when the platform actually supports sampling.
  if (player.isAudioSamplingSupported) {
    player.setAudioSamplingEnabled(true);
    player.addListener('audioSampleUpdate', (sample) => {
      const frames = sample.channels[0]?.frames ?? [];
      if (!frames.length) return;
      const rms = Math.sqrt(frames.reduce((sum, f) => sum + f * f, 0) / frames.length);
      const amplitude = Math.min(1, rms * 4);
      amplitudeListeners.forEach((listener) => listener(amplitude));
    });
  }

  player.play();
}

export function togglePlayback(): void {
  if (!player) return;
  if (player.playing) player.pause();
  else player.play();
}

export function pausePlayback(): void {
  player?.pause();
}

export function setPlaybackRate(rate: number): void {
  player?.setPlaybackRate(rate, 'high');
}

export function setVolume(volume: number): void {
  if (player) player.volume = Math.max(0, Math.min(1, volume));
}

export function setMuted(muted: boolean): void {
  if (player) player.muted = muted;
}

export function setLooping(loop: boolean): void {
  if (player) player.loop = loop;
}

export function seekTo(seconds: number): void {
  player?.seekTo(seconds);
}

export function stopAndRelease(): void {
  player?.remove();
  player = null;
}

export function isSamplingSupported(): boolean {
  return player?.isAudioSamplingSupported ?? false;
}

export function subscribePlayback(listener: PlaybackListener): () => void {
  playbackListeners.add(listener);
  return () => playbackListeners.delete(listener);
}

export function subscribeAmplitude(listener: AmplitudeListener): () => void {
  amplitudeListeners.add(listener);
  return () => amplitudeListeners.delete(listener);
}
