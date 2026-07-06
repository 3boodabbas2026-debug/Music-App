import { create } from 'zustand';

import * as libraryApi from '../services/api/library';
import type { Media } from '../services/api/types';

type LibraryState = {
  items: Media[];
  isLoading: boolean;
  refresh: (query?: string) => Promise<void>;
  upsert: (media: Media) => void;
  remove: (mediaId: string) => Promise<void>;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
  isLoading: false,

  async refresh(query) {
    set({ isLoading: true });
    try {
      const items = await libraryApi.listLibrary(query);
      set({ items });
    } finally {
      set({ isLoading: false });
    }
  },

  upsert(media) {
    const existing = get().items;
    const index = existing.findIndex((item) => item.id === media.id);
    if (index === -1) {
      set({ items: [media, ...existing] });
    } else {
      const next = [...existing];
      next[index] = media;
      set({ items: next });
    }
  },

  async remove(mediaId) {
    await libraryApi.deleteMedia(mediaId);
    set({ items: get().items.filter((item) => item.id !== mediaId) });
  },
}));
