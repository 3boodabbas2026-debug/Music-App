import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { streamUrl } from '../services/api/library';
import type { Media } from '../services/api/types';
import * as PlayerService from '../services/audio/PlayerService';
import * as mediaSession from '../services/audio/mediaSession';
import * as offlineMedia from '../services/storage/offlineMedia';
import { tokenStorage } from '../services/storage/tokenStorage';

export type RepeatMode = 'off' | 'all' | 'one';

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75] as const;
export const SLEEP_OPTIONS_MIN = [15, 30, 60] as const;

const SESSION_KEY = 'player-session-v1';
const PERSIST_INTERVAL_MS = 3000;

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

type PlayerState = {
  currentMedia: Media | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  amplitude: number;
  /** True when a previous session was restored and is waiting for the first play tap. */
  restored: boolean;

  queue: Media[];
  queueIndex: number;
  repeat: RepeatMode;
  shuffle: boolean;
  rate: number;
  volume: number;
  muted: boolean;
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

export const usePlayerStore = create<PlayerState>((set, get) => {
  function persist(force = false) {
    const now = Date.now();
    if (!force && now - lastPersist < PERSIST_INTERVAL_MS) return;
    lastPersist = now;
    const { queue, queueIndex, currentTime, repeat, shuffle, rate, volume, muted, currentMedia } = get();
    if (!currentMedia || queue.length === 0) return;
    const payload: PersistedSession = {
      queue,
      queueIndex,
      position: currentTime,
      repeat,
      shuffle,
      rate,
      volume,
      muted,
    };
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(payload)).catch(() => {});
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

  async function load(media: Media, options: PlayerService.LoadOptions = {}) {
    unsubscribePlayback?.();
    unsubscribeAmplitude?.();

    // Prefer a track explicitly saved for offline playback — works whether
    // or not the network is actually up, and skips a redundant fetch either way.
    const offlineUri = await offlineMedia.getOfflineBlobUrl(media.id);
    if (offlineUri) {
      PlayerService.loadAndPlay(offlineUri, undefined, options);
    } else {
      const token = await tokenStorage.getAccessToken();
      // The token also rides as a query param: web <audio> and native range
      // requests can't always attach the Authorization header.
      const uri = token
        ? `${streamUrl(media.id)}?token=${encodeURIComponent(token)}`
        : streamUrl(media.id);
      PlayerService.loadAndPlay(uri, token ? { Authorization: `Bearer ${token}` } : undefined, options);
    }

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
    });
    bindMediaSession(media);
    mediaSession.updatePlaybackState(autoplay);
    persist(true);

    let wasPlaying = autoplay;
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
      if (status.didJustFinish && get().repeat !== 'one') {
        void get().playNext(true);
      }
    });
    unsubscribeAmplitude = PlayerService.subscribeAmplitude((amplitude) => set({ amplitude }));
  }

  return {
    currentMedia: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    isBuffering: false,
    amplitude: 0,
    restored: false,

    queue: [],
    queueIndex: 0,
    repeat: 'off',
    shuffle: false,
    rate: 1,
    volume: 1,
    muted: false,
    sleepAt: null,

    async hydrate() {
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
      set({ queue: [media], queueIndex: 0 });
      await load(media);
    },

    async playQueue(items, startIndex) {
      if (!items.length) return;
      const index = Math.max(0, Math.min(items.length - 1, startIndex));
      set({ queue: items, queueIndex: index });
      await load(items[index]);
    },

    async playNext(auto = false) {
      const { queue, queueIndex, shuffle, repeat } = get();
      if (queue.length === 0) return;

      let nextIndex: number;
      if (shuffle && queue.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * queue.length);
        } while (nextIndex === queueIndex);
      } else {
        nextIndex = queueIndex + 1;
        if (nextIndex >= queue.length) {
          if (repeat === 'all' || !auto) nextIndex = 0;
          else return; // reached the end of the queue on autoplay
        }
      }
      set({ queueIndex: nextIndex });
      await load(queue[nextIndex]);
    },

    async playPrev() {
      const { queue, queueIndex, currentTime } = get();
      if (queue.length === 0) return;
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
      });
    },

    toggleRepeat() {
      const order: RepeatMode[] = ['off', 'all', 'one'];
      const next = order[(order.indexOf(get().repeat) + 1) % order.length];
      set({ repeat: next });
      PlayerService.setLooping(next === 'one');
      persist(true);
    },

    toggleShuffle() {
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
  };
});
