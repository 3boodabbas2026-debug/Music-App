import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { streamUrl } from '../services/api/library';
import type { Media } from '../services/api/types';
import * as PlayerService from '../services/audio/PlayerService';
import * as mediaSession from '../services/audio/mediaSession';
import * as offlineMedia from '../services/storage/offlineMedia';
import { tokenStorage } from '../services/storage/tokenStorage';
import { haptics } from '../utils/haptics';
import { useFavoritesStore } from './favoritesStore';
import { useLibraryStore } from './libraryStore';
import { usePlayHistoryStore } from './playHistoryStore';

export type RepeatMode = 'off' | 'all' | 'one';

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75] as const;
export const SLEEP_OPTIONS_MIN = [15, 30, 60] as const;

const SESSION_KEY = 'player-session-v1';
const SETTINGS_KEY = 'player-settings-v1';
const PERSIST_INTERVAL_MS = 3000;

/** AutoMix-style crossfade window — Apple Music's own default is in this
 * neighborhood. Fixed rather than user-tunable for now: a single well-chosen
 * value beats an extra settings knob most people never touch. */
const CROSSFADE_SECONDS = 4;

/** A play only "counts" (for On Repeat / Replay) once genuinely listened to,
 * not just tapped and skipped — 30s or half the track, whichever is shorter. */
const PLAY_COUNT_SECONDS = 30;

/** How many extra tracks to queue up when Smart Continuation kicks in. */
const CONTINUATION_BATCH = 12;

type PersistedSession = {
  queue: Media[];
  queueIndex: number;
  position: number;
  repeat: RepeatMode;
  shuffle: boolean;
  rate: number;
  volume: number;
  muted: boolean;
};

type PlayerSettings = {
  crossfadeEnabled: boolean;
  autoplayContinuation: boolean;
};

type PlayerState = {
  currentMedia: Media | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  amplitude: number;
  /** True when a previous session was restored and is waiting for the first play tap. */
  restored: boolean;
  /** True while an AutoMix crossfade to the next track is actively blending. */
  crossfading: boolean;
  /** True when the current queue was extended by Smart Continuation rather than chosen by the user. */
  continuationActive: boolean;

  queue: Media[];
  queueIndex: number;
  repeat: RepeatMode;
  shuffle: boolean;
  rate: number;
  volume: number;
  muted: boolean;
  crossfadeEnabled: boolean;
  autoplayContinuation: boolean;
  /** Epoch ms when the sleep timer will pause playback, or null. */
  sleepAt: number | null;

  play: (media: Media) => Promise<void>;
  playQueue: (items: Media[], startIndex: number) => Promise<void>;
  playNext: (auto?: boolean) => Promise<void>;
  playPrev: () => Promise<void>;
  /** Jump straight to a queue position (the queue panel's click-to-play). */
  playAt: (index: number) => Promise<void>;
  addToQueue: (media: Media) => void;
  playNextInQueue: (media: Media) => void;
  removeFromQueue: (index: number) => void;
  /** Restore the last session from disk — paused, ready to resume. */
  hydrate: () => Promise<void>;
  toggle: () => void;
  seek: (seconds: number) => void;
  stop: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  cycleRate: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  cycleSleepTimer: () => void;
  setCrossfadeEnabled: (enabled: boolean) => void;
  setAutoplayContinuation: (enabled: boolean) => void;
};

let unsubscribePlayback: (() => void) | null = null;
let unsubscribeAmplitude: (() => void) | null = null;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersist = 0;

function clearSleepTimer() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
}

/** Pure "what plays after this" rule, shared by manual skip and the
 * crossfade trigger so the two can never disagree about what's next. */
function computeNextIndex(queue: Media[], queueIndex: number, shuffle: boolean, repeat: RepeatMode): number | null {
  if (queue.length === 0) return null;
  if (shuffle && queue.length > 1) {
    let index: number;
    do {
      index = Math.floor(Math.random() * queue.length);
    } while (index === queueIndex);
    return index;
  }
  const next = queueIndex + 1;
  if (next >= queue.length) return repeat === 'all' ? 0 : null;
  return next;
}

/** Resolves a playable URL for a track the same way `load()` does — offline
 * copy first, then the live stream, used by both normal loads and crossfade. */
async function resolvePlaybackSource(media: Media): Promise<{ uri: string; headers?: Record<string, string> }> {
  const offlineUri = await offlineMedia.getOfflineBlobUrl(media.id);
  if (offlineUri) return { uri: offlineUri };
  const token = await tokenStorage.getAccessToken();
  const uri = token ? `${streamUrl(media.id)}?token=${encodeURIComponent(token)}` : streamUrl(media.id);
  return { uri, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

/** Apple Music keeps playing when your queue runs out instead of just
 * stopping — this is the same idea, built from your own library instead of
 * a licensed catalog: favorites first, then whatever you actually listen to
 * most, then a shuffle of the rest, always skipping what's already queued. */
function pickContinuationTracks(excludeIds: Set<string>): Media[] {
  const library = useLibraryStore.getState().items.filter((m) => m.media_type === 'audio' && !excludeIds.has(m.id));
  if (library.length === 0) return [];

  const favoriteIds = useFavoritesStore.getState().ids;
  const topPlayed = usePlayHistoryStore.getState().topInWindow(90, 40);
  const topPlayedRank = new Map(topPlayed.map((event, i) => [event.mediaId, i]));

  const ranked = [...library].sort((a, b) => {
    const aFav = favoriteIds[a.id] ? 0 : 1;
    const bFav = favoriteIds[b.id] ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    const aRank = topPlayedRank.get(a.id) ?? 999;
    const bRank = topPlayedRank.get(b.id) ?? 999;
    if (aRank !== bRank) return aRank - bRank;
    return Math.random() - 0.5;
  });

  return ranked.slice(0, CONTINUATION_BATCH);
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  function persist(force = false) {
    const now = Date.now();
    if (!force && now - lastPersist < PERSIST_INTERVAL_MS) return;
    lastPersist = now;
    const { queue, queueIndex, currentTime, repeat, shuffle, rate, volume, muted, currentMedia } = get();
    if (!currentMedia || queue.length === 0) return;
    const payload: PersistedSession = { queue, queueIndex, position: currentTime, repeat, shuffle, rate, volume, muted };
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(payload)).catch(() => {});
  }

  function persistSettings() {
    const { crossfadeEnabled, autoplayContinuation } = get();
    const payload: PlayerSettings = { crossfadeEnabled, autoplayContinuation };
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(payload)).catch(() => {});
  }

  function bindMediaSession(media: Media) {
    mediaSession.updateMetadata(media);
    mediaSession.bindHandlers({
      onPlay: () => get().toggle(),
      onPause: () => get().toggle(),
      onNext: () => void get().playNext(),
      onPrev: () => void get().playPrev(),
      onSeek: (seconds) => {
        const { currentTime, duration } = get();
        if (seconds === -1) get().seek(Math.min(duration, currentTime + 10));
        else if (seconds === -2) get().seek(Math.max(0, currentTime - 10));
        else get().seek(seconds);
      },
    });
  }

  /** Shared tail for both a fresh load and a completed crossfade: apply
   * settings to whichever player is now active, populate state, and
   * (re)bind the single playback/amplitude subscription to it. */
  function attachToPlayer(media: Media, options: PlayerService.LoadOptions) {
    const { rate, volume, muted, repeat } = get();
    PlayerService.setPlaybackRate(rate);
    PlayerService.setVolume(volume);
    PlayerService.setMuted(muted);
    PlayerService.setLooping(repeat === 'one');

    const autoplay = options.autoplay ?? true;
    set({
      currentMedia: media,
      playing: autoplay,
      restored: !autoplay,
      currentTime: options.startAt ?? 0,
      duration: media.duration_seconds ?? 0,
      amplitude: 0,
      crossfading: false,
    });
    bindMediaSession(media);
    mediaSession.updatePlaybackState(autoplay);
    persist(true);

    let wasPlaying = autoplay;
    let countedPlay = false;
    let crossfadeTriggered = false;

    unsubscribePlayback = PlayerService.subscribePlayback((status) => {
      set({
        playing: status.playing,
        currentTime: status.currentTime,
        duration: status.duration || media.duration_seconds || 0,
        isBuffering: status.isBuffering,
        ...(status.playing ? { restored: false } : null),
      });
      mediaSession.updatePosition(status.currentTime, status.duration || media.duration_seconds || 0, get().rate);
      if (status.playing !== wasPlaying) {
        wasPlaying = status.playing;
        mediaSession.updatePlaybackState(status.playing);
        persist(true); // exact position on pause/resume
      } else if (status.playing) {
        persist();
      }

      if (!countedPlay && (status.currentTime >= PLAY_COUNT_SECONDS || (media.duration_seconds && status.currentTime >= media.duration_seconds * 0.5))) {
        countedPlay = true;
        usePlayHistoryStore.getState().recordPlay(media);
      }

      const dur = status.duration || media.duration_seconds || 0;
      if (
        !crossfadeTriggered &&
        get().crossfadeEnabled &&
        get().repeat !== 'one' &&
        dur > 0 &&
        dur - status.currentTime > 0 &&
        dur - status.currentTime <= CROSSFADE_SECONDS
      ) {
        const { queue, queueIndex, shuffle, repeat: rep } = get();
        const nextIndex = computeNextIndex(queue, queueIndex, shuffle, rep);
        if (nextIndex !== null) {
          crossfadeTriggered = true;
          set({ crossfading: true });
          void performCrossfade(nextIndex, dur - status.currentTime);
        }
      }

      if (status.didJustFinish && get().repeat !== 'one') {
        if (!countedPlay) {
          countedPlay = true;
          usePlayHistoryStore.getState().recordPlay(media);
        }
        // A crossfade already handed off to the next track — don't double-advance.
        if (!crossfadeTriggered) void get().playNext(true);
      }
    });
    unsubscribeAmplitude = PlayerService.subscribeAmplitude((amplitude) => set({ amplitude }));
  }

  async function load(media: Media, options: PlayerService.LoadOptions = {}) {
    unsubscribePlayback?.();
    unsubscribeAmplitude?.();
    const { uri, headers } = await resolvePlaybackSource(media);
    PlayerService.loadAndPlay(uri, headers, options);
    attachToPlayer(media, options);
  }

  async function performCrossfade(nextIndex: number, remainingSeconds: number) {
    const nextMedia = get().queue[nextIndex];
    if (!nextMedia) return;
    const { uri, headers } = await resolvePlaybackSource(nextMedia);
    const targetVolume = get().muted ? 0 : get().volume;
    const fadeMs = Math.max(500, Math.min(CROSSFADE_SECONDS, remainingSeconds) * 1000);
    await PlayerService.crossfadeTo(uri, headers, fadeMs, targetVolume);

    unsubscribePlayback?.();
    unsubscribeAmplitude?.();
    set({ queueIndex: nextIndex });
    attachToPlayer(nextMedia, { autoplay: true, startAt: 0 });
  }

  return {
    currentMedia: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    isBuffering: false,
    amplitude: 0,
    restored: false,
    crossfading: false,
    continuationActive: false,

    queue: [],
    queueIndex: 0,
    repeat: 'off',
    shuffle: false,
    rate: 1,
    volume: 1,
    muted: false,
    crossfadeEnabled: true,
    autoplayContinuation: true,
    sleepAt: null,

    async hydrate() {
      try {
        const rawSettings = await AsyncStorage.getItem(SETTINGS_KEY);
        if (rawSettings) {
          const settings = JSON.parse(rawSettings) as Partial<PlayerSettings>;
          set({
            crossfadeEnabled: settings.crossfadeEnabled ?? true,
            autoplayContinuation: settings.autoplayContinuation ?? true,
          });
        }
      } catch {
        // Defaults already in place — a corrupt settings blob is harmless to ignore.
      }

      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const session = JSON.parse(raw) as PersistedSession;
        if (!session.queue?.length) return;
        const index = Math.max(0, Math.min(session.queue.length - 1, session.queueIndex));
        set({
          queue: session.queue,
          queueIndex: index,
          repeat: session.repeat ?? 'off',
          shuffle: session.shuffle ?? false,
          rate: session.rate ?? 1,
          volume: session.volume ?? 1,
          muted: session.muted ?? false,
        });
        // Load the exact track paused at the saved position — one tap resumes.
        await load(session.queue[index], { autoplay: false, startAt: session.position ?? 0 });
      } catch {
        // A malformed session should never block the app.
        AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      }
    },

    async play(media) {
      set({ queue: [media], queueIndex: 0, continuationActive: false });
      await load(media);
    },

    async playQueue(items, startIndex) {
      if (!items.length) return;
      const index = Math.max(0, Math.min(items.length - 1, startIndex));
      set({ queue: items, queueIndex: index, continuationActive: false });
      await load(items[index]);
    },

    async playNext(auto = false) {
      const { queue, queueIndex, shuffle, repeat, autoplayContinuation } = get();
      if (queue.length === 0) return;
      if (!auto) haptics.tap();

      let nextIndex = computeNextIndex(queue, queueIndex, shuffle, repeat);

      if (nextIndex === null) {
        if (auto && autoplayContinuation) {
          // Smart Continuation: the queue ran out on its own — keep the
          // music going from the library instead of just stopping.
          const additions = pickContinuationTracks(new Set(queue.map((m) => m.id)));
          if (additions.length > 0) {
            const extended = [...queue, ...additions];
            set({ queue: extended, continuationActive: true });
            nextIndex = queueIndex + 1;
          } else {
            return;
          }
        } else if (!auto) {
          nextIndex = 0; // manual "skip" past the end just wraps to the top
        } else {
          return; // reached the end of the queue on autoplay, nothing to continue with
        }
      }

      set({ queueIndex: nextIndex });
      await load(get().queue[nextIndex]);
    },

    async playPrev() {
      const { queue, queueIndex, currentTime } = get();
      if (queue.length === 0) return;
      haptics.tap();
      // Standard player behavior: restart the track unless we're near its start.
      if (currentTime > 3 || queue.length === 1) {
        PlayerService.seekTo(0);
        return;
      }
      const prevIndex = queueIndex - 1 < 0 ? queue.length - 1 : queueIndex - 1;
      set({ queueIndex: prevIndex });
      await load(queue[prevIndex]);
    },

    async playAt(index) {
      const { queue } = get();
      if (index < 0 || index >= queue.length) return;
      set({ queueIndex: index });
      await load(queue[index]);
    },

    addToQueue(media) {
      const { queue, currentMedia } = get();
      if (!currentMedia) {
        void get().play(media);
        return;
      }
      set({ queue: [...queue, media] });
      persist(true);
    },

    playNextInQueue(media) {
      const { queue, queueIndex, currentMedia } = get();
      if (!currentMedia) {
        void get().play(media);
        return;
      }
      const next = [...queue];
      next.splice(queueIndex + 1, 0, media);
      set({ queue: next });
      persist(true);
    },

    removeFromQueue(index) {
      const { queue, queueIndex } = get();
      if (index < 0 || index >= queue.length || index === queueIndex) return;
      const next = queue.filter((_, i) => i !== index);
      set({ queue: next, queueIndex: index < queueIndex ? queueIndex - 1 : queueIndex });
      persist(true);
    },

    toggle() {
      haptics.toggle();
      const { restored, currentTime } = get();
      if (restored) {
        // Resuming a restored session: the element is loaded and paused at the
        // saved position — just play.
        PlayerService.seekTo(currentTime);
      }
      PlayerService.togglePlayback();
    },

    seek(seconds) {
      PlayerService.seekTo(seconds);
    },

    stop() {
      unsubscribePlayback?.();
      unsubscribeAmplitude?.();
      unsubscribePlayback = null;
      unsubscribeAmplitude = null;
      clearSleepTimer();
      PlayerService.stopAndRelease();
      mediaSession.clear();
      AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      set({
        currentMedia: null,
        playing: false,
        currentTime: 0,
        duration: 0,
        amplitude: 0,
        queue: [],
        queueIndex: 0,
        sleepAt: null,
        restored: false,
        crossfading: false,
        continuationActive: false,
      });
    },

    toggleRepeat() {
      haptics.tap();
      const order: RepeatMode[] = ['off', 'all', 'one'];
      const next = order[(order.indexOf(get().repeat) + 1) % order.length];
      set({ repeat: next });
      PlayerService.setLooping(next === 'one');
      persist(true);
    },

    toggleShuffle() {
      haptics.tap();
      set({ shuffle: !get().shuffle });
      persist(true);
    },

    cycleRate() {
      const current = get().rate;
      const idx = PLAYBACK_RATES.indexOf(current as (typeof PLAYBACK_RATES)[number]);
      const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
      set({ rate: next });
      PlayerService.setPlaybackRate(next);
      persist(true);
    },

    setVolume(volume) {
      const clamped = Math.max(0, Math.min(1, volume));
      set({ volume: clamped, muted: false });
      PlayerService.setVolume(clamped);
      PlayerService.setMuted(false);
    },

    toggleMute() {
      const muted = !get().muted;
      set({ muted });
      PlayerService.setMuted(muted);
    },

    cycleSleepTimer() {
      clearSleepTimer();
      const { sleepAt } = get();
      const remainingMin = sleepAt ? Math.round((sleepAt - Date.now()) / 60000) : null;

      // Cycle off -> 15 -> 30 -> 60 -> off, picking the next option above the
      // currently remaining time.
      let nextMinutes: number | null = SLEEP_OPTIONS_MIN[0];
      if (remainingMin !== null) {
        const nextOption = SLEEP_OPTIONS_MIN.find((m) => m > remainingMin);
        nextMinutes = nextOption ?? null;
      }

      if (nextMinutes === null) {
        set({ sleepAt: null });
        return;
      }
      set({ sleepAt: Date.now() + nextMinutes * 60000 });
      sleepTimer = setTimeout(() => {
        PlayerService.pausePlayback();
        set({ sleepAt: null });
        sleepTimer = null;
      }, nextMinutes * 60000);
    },

    setCrossfadeEnabled(enabled) {
      set({ crossfadeEnabled: enabled });
      persistSettings();
    },

    setAutoplayContinuation(enabled) {
      set({ autoplayContinuation: enabled });
      persistSettings();
    },
  };
});
