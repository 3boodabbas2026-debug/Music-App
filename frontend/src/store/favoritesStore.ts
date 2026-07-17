import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as activityApi from '../services/api/activity';
import { haptics } from '../utils/haptics';

const STORAGE_KEY = 'sma.favorites';

type FavoritesState = {
  ids: Record<string, true>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (mediaId: string) => void;
  isFavorite: (mediaId: string) => boolean;
  resetSession: () => Promise<void>;
};

async function persist(ids: Record<string, true>) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.keys(ids)));
  } catch {
    // favorites are a nicety — never let persistence break the app
  }
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: {},
  hydrated: false,

  async hydrate() {
    let localIds: string[] = [];
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      localIds = raw ? JSON.parse(raw) : [];
      set({ ids: Object.fromEntries(localIds.map((id) => [id, true as const])), hydrated: true });
    } catch {
      set({ hydrated: true });
    }

    try {
      const remoteIds = await activityApi.listFavoriteIds();
      const merged = [...new Set([...remoteIds, ...localIds])];
      const ids = Object.fromEntries(merged.map((id) => [id, true as const]));
      set({ ids, hydrated: true });
      void persist(ids);
      // Preserve favorites created by older app versions that only stored the
      // flag locally, so the server-side Library favorite filter is truthful.
      const remote = new Set(remoteIds);
      await Promise.allSettled(localIds.filter((id) => !remote.has(id)).map((id) => activityApi.setFavorite(id, true)));
    } catch {
      // The local snapshot remains usable offline.
    }
  },

  toggle(mediaId) {
    const ids = { ...get().ids };
    const adding = !ids[mediaId];
    if (adding) ids[mediaId] = true;
    else delete ids[mediaId];
    haptics.tap();
    set({ ids });
    void persist(ids);
    void activityApi.setFavorite(mediaId, adding).catch(() => {
      // Keep the optimistic local flag for offline use; it will be reconciled
      // with the account on the next hydrate.
    });
  },

  isFavorite(mediaId) {
    return !!get().ids[mediaId];
  },

  async resetSession() {
    set({ ids: {}, hydrated: false });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // In-memory account data is already gone; storage cleanup is best-effort.
    }
  },
}));
