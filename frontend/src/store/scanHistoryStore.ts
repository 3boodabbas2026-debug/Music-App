import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sma.scanHistory';
const MAX_ENTRIES = 10;

export type ScanEntry = {
  id: string;
  matched: boolean;
  title: string | null;
  artist: string | null;
  thumbnailUrl: string | null;
  at: number;
};

type ScanHistoryState = {
  entries: ScanEntry[];
  hydrate: () => Promise<void>;
  add: (entry: Omit<ScanEntry, 'id' | 'at'>) => void;
  clear: () => void;
  resetSession: () => Promise<void>;
};

async function persist(entries: ScanEntry[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // history is a nicety — never let persistence break the app
  }
}

export const useScanHistoryStore = create<ScanHistoryState>((set, get) => ({
  entries: [],

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ entries: JSON.parse(raw) });
    } catch {
      // start empty
    }
  },

  add(entry) {
    const entries = [
      { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() },
      ...get().entries,
    ].slice(0, MAX_ENTRIES);
    set({ entries });
    void persist(entries);
  },

  clear() {
    set({ entries: [] });
    void persist([]);
  },

  async resetSession() {
    set({ entries: [] });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // In-memory account data is already gone; storage cleanup is best-effort.
    }
  },
}));
