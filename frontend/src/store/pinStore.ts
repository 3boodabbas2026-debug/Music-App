import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { haptics } from '../utils/haptics';

const STORAGE_KEY = 'sma.pinned.v1';
/** Apple Music's own Library pin shelf caps at 6 — borrowing that number on
 * purpose: it's small enough to scan at a glance, which is the whole point
 * of a "quick access" shelf instead of just another scrollable list. */
export const MAX_PINS = 6;

type PinState = {
  ids: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (mediaId: string) => void;
  isPinned: (mediaId: string) => boolean;
  resetSession: () => Promise<void>;
};

async function persist(ids: string[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Pins are a nicety — never let persistence break the app.
  }
}

export const usePinStore = create<PinState>((set, get) => ({
  ids: [],
  hydrated: false,

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({ ids: raw ? JSON.parse(raw) : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  toggle(mediaId) {
    const ids = get().ids;
    haptics.tap();
    const next = ids.includes(mediaId) ? ids.filter((id) => id !== mediaId) : [mediaId, ...ids].slice(0, MAX_PINS);
    set({ ids: next });
    void persist(next);
  },

  isPinned(mediaId) {
    return get().ids.includes(mediaId);
  },

  async resetSession() {
    set({ ids: [], hydrated: false });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // In-memory account data is already gone; storage cleanup is best-effort.
    }
  },
}));
