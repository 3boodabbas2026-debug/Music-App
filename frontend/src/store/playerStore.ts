import { create } from 'zustand';

import { streamUrl } from '../services/api/library';
import type { Media } from '../services/api/types';
import * as PlayerService from '../services/audio/PlayerService';
import { tokenStorage } from '../services/storage/tokenStorage';

export type RepeatMode = 'off' | 'all' | 'one';

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75] as const;
export const SLEEP_OPTIONS_MIN = [15, 30, 60] as const;

type PlayerState = {
  currentMedia: Media | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  amplitude: number;

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
  addToQueue: (media: Media) => void;
  playNextInQueue: (media: Media) => void;
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

function clearSleepTimer() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  async function load(media: Media) {
    unsubscribePlayback?.();
    unsubscribeAmplitude?.();

    const token = await tokenStorage.getAccessToken();
    // The token also rides as a query param: web <audio> and native range
    // requests can't always attach the Authorization header.
    const uri = token
      ? `${streamUrl(media.id)}?token=${encodeURIComponent(token)}`
      : streamUrl(media.id);
    PlayerService.loadAndPlay(uri, token ? { Authorization: `Bearer ${token}` } : undefined);

    const { rate, volume, muted, repeat } = get();
    PlayerService.setPlaybackRate(rate);
    PlayerService.setVolume(volume);
    PlayerService.setMuted(muted);
    PlayerService.setLooping(repeat === 'one');

    set({ currentMedia: media, playing: true, currentTime: 0, duration: media.duration_seconds ?? 0, amplitude: 0 });

    unsubscribePlayback = PlayerService.subscribePlayback((status) => {
      set({
        playing: status.playing,
        currentTime: status.currentTime,
        duration: status.duration || media.duration_seconds || 0,
        isBuffering: status.isBuffering,
      });
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

    queue: [],
    queueIndex: 0,
    repeat: 'off',
    shuffle: false,
    rate: 1,
    volume: 1,
    muted: false,
    sleepAt: null,

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

    addToQueue(media) {
      const { queue, currentMedia } = get();
      if (!currentMedia) {
        void get().play(media);
        return;
      }
      set({ queue: [...queue, media] });
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
    },

    toggle() {
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
      set({
        currentMedia: null,
        playing: false,
        currentTime: 0,
        duration: 0,
        amplitude: 0,
        queue: [],
        queueIndex: 0,
        sleepAt: null,
      });
    },

    toggleRepeat() {
      const order: RepeatMode[] = ['off', 'all', 'one'];
      const next = order[(order.indexOf(get().repeat) + 1) % order.length];
      set({ repeat: next });
      PlayerService.setLooping(next === 'one');
    },

    toggleShuffle() {
      set({ shuffle: !get().shuffle });
    },

    cycleRate() {
      const current = get().rate;
      const idx = PLAYBACK_RATES.indexOf(current as (typeof PLAYBACK_RATES)[number]);
      const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
      set({ rate: next });
      PlayerService.setPlaybackRate(next);
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
