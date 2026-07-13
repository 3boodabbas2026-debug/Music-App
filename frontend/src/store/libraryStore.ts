import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as libraryApi from '../services/api/library';
import type { Media } from '../services/api/types';

const CACHE_KEY = 'sma.library.cache.v1';

type LibraryState = {
  items: Media[];
  isLoading: boolean;
  /** True once the on-disk cache has been read into `items`, so screens don't flash empty before it lands. */
  hydrated: boolean;
  /** True when the last refresh() attempt failed to reach the network/API — `items` is whatever was cached. */
  isStale: boolean;
  hydrate: () => Promise<void>;
  refresh: (query?: string) => Promise<void>;
  upsert: (media: Media) => void;
  remove: (mediaId: string) => Promise<void>;
  resetSession: () => Promise<void>;
};

async function persist(items: Media[]) {
  try {
    // Cache the unfiltered library only — refresh(query) results never overwrite the offline snapshot.
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch {
    // Best-effort: offline browsing is a nicety, never let it break a live refresh.
  }
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
  isLoading: false,
  hydrated: false,
  isStale: false,

  async hydrate() {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) set({ items: JSON.parse(raw) as Media[] });
    } finally {
      set({ hydrated: true });
    }
  },

  async refresh(query) {
    set({ isLoading: true });
    try {
      const items = await libraryApi.listLibrary(query);
      set({ items, isStale: false });
      if (!query) void persist(items);
    } catch (error) {
      // Network/API unreachable — keep whatever's already loaded (live or cached) and flag it as stale
      // rather than clearing the library, which is what made it look "empty" offline before.
      set({ isStale: true });
      if (!get().hydrated) await get().hydrate();
    } finally {
      set({ isLoading: false });
    }
  },

  upsert(media) {
    const existing = get().items;
    const index = existing.findIndex((item) => item.id === media.id);
    const items = index === -1 ? [media, ...existing] : existing.map((item) => (item.id === media.id ? media : item));
    set({ items });
    void persist(items);
  },

  async remove(mediaId) {
    await libraryApi.deleteMedia(mediaId);
    const items = get().items.filter((item) => item.id !== mediaId);
    set({ items });
    void persist(items);
  },

  async resetSession() {
    set({ items: [], isLoading: false, hydrated: false, isStale: false });
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch {
      // In-memory account data is already gone; storage cleanup is best-effort.
    }
  },
}));
