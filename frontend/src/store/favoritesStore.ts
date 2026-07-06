import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sma.favorites';

type FavoritesState = {
  ids: Record<string, true>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (mediaId: string) => void;
  isFavorite: (mediaId: string) => boolean;
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
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      set({ ids: Object.fromEntries(list.map((id) => [id, true as const])), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  toggle(mediaId) {
    const ids = { ...get().ids };
    if (ids[mediaId]) delete ids[mediaId];
    else ids[mediaId] = true;
    set({ ids });
    void persist(ids);
  },

  isFavorite(mediaId) {
    return !!get().ids[mediaId];
  },
}));
