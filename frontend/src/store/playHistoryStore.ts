import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Media } from '../services/api/types';
import { displayArtist, displayTitle } from '../utils/mediaDisplay';

const STORAGE_KEY = 'sma.playHistory.v1';
/** Caps the event log so a long listening history doesn't grow AsyncStorage
 * without bound — 800 plays is months of normal use and plenty for both
 * "On Repeat" (30-day window) and the Replay recap (90-day window). */
const MAX_EVENTS = 800;

export type PlayEvent = {
  mediaId: string;
  title: string;
  artist: string;
  mediaType: Media['media_type'];
  at: number;
  durationSeconds: number;
};

type PlayHistoryState = {
  hydrated: boolean;
  events: PlayEvent[];
  hydrate: () => Promise<void>;
  /** Call once per genuine listen (see the threshold check in playerStore) — never on every skip. */
  recordPlay: (media: Media) => void;
  /** Most-played media ids within the window, most-played first, ties broken by recency. */
  topInWindow: (days: number, limit?: number) => PlayEvent[];
  /** Same ranking as topInWindow, but with the play count attached — for the Replay recap. */
  topEntriesInWindow: (days: number, limit?: number) => { event: PlayEvent; count: number }[];
  /** Most-played artists within the window, ranked by number of plays. */
  topArtistsInWindow: (days: number, limit?: number) => { artist: string; count: number }[];
  totalMinutesInWindow: (days: number) => number;
  totalPlaysAllTime: () => number;
  resetSession: () => Promise<void>;
};

async function persist(events: PlayEvent[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Listening history is a nicety — never let persistence break the app.
  }
}

export const usePlayHistoryStore = create<PlayHistoryState>((set, get) => ({
  hydrated: false,
  events: [],

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({ events: raw ? JSON.parse(raw) : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  recordPlay(media) {
    const event: PlayEvent = {
      mediaId: media.id,
      title: displayTitle(media),
      artist: displayArtist(media) ?? 'Unknown artist',
      mediaType: media.media_type,
      at: Date.now(),
      durationSeconds: media.duration_seconds ?? 0,
    };
    const events = [event, ...get().events].slice(0, MAX_EVENTS);
    set({ events });
    void persist(events);
  },

  topInWindow(days, limit = 8) {
    const since = Date.now() - days * 86400000;
    const inWindow = get().events.filter((e) => e.at >= since);
    const byMedia = new Map<string, { count: number; latest: PlayEvent }>();
    for (const event of inWindow) {
      const existing = byMedia.get(event.mediaId);
      if (existing) {
        existing.count += 1;
        if (event.at > existing.latest.at) existing.latest = event;
      } else {
        byMedia.set(event.mediaId, { count: 1, latest: event });
      }
    }
    return [...byMedia.values()]
      .sort((a, b) => b.count - a.count || b.latest.at - a.latest.at)
      .slice(0, limit)
      .map((entry) => entry.latest);
  },

  topEntriesInWindow(days, limit = 10) {
    const since = Date.now() - days * 86400000;
    const inWindow = get().events.filter((e) => e.at >= since);
    const byMedia = new Map<string, { count: number; latest: PlayEvent }>();
    for (const event of inWindow) {
      const existing = byMedia.get(event.mediaId);
      if (existing) {
        existing.count += 1;
        if (event.at > existing.latest.at) existing.latest = event;
      } else {
        byMedia.set(event.mediaId, { count: 1, latest: event });
      }
    }
    return [...byMedia.values()]
      .sort((a, b) => b.count - a.count || b.latest.at - a.latest.at)
      .slice(0, limit)
      .map((entry) => ({ event: entry.latest, count: entry.count }));
  },

  topArtistsInWindow(days, limit = 5) {
    const since = Date.now() - days * 86400000;
    const inWindow = get().events.filter((e) => e.at >= since);
    const byArtist = new Map<string, number>();
    for (const event of inWindow) {
      byArtist.set(event.artist, (byArtist.get(event.artist) ?? 0) + 1);
    }
    return [...byArtist.entries()]
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  totalMinutesInWindow(days) {
    const since = Date.now() - days * 86400000;
    const seconds = get()
      .events.filter((e) => e.at >= since)
      .reduce((sum, e) => sum + (e.durationSeconds || 180), 0);
    return Math.round(seconds / 60);
  },

  totalPlaysAllTime() {
    return get().events.length;
  },

  async resetSession() {
    set({ hydrated: false, events: [] });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // In-memory account data is already gone; storage cleanup is best-effort.
    }
  },
}));
