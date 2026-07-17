import { create } from 'zustand';

import * as playlistsApi from '../services/api/playlists';
import type { Playlist } from '../services/api/types';

type PlaylistState = {
  playlists: Playlist[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<Playlist>;
  addItem: (playlistId: string, mediaId: string) => Promise<Playlist>;
  addItems: (playlistId: string, mediaIds: string[]) => Promise<Playlist>;
  removeItem: (playlistId: string, mediaId: string) => Promise<Playlist>;
  remove: (playlistId: string) => Promise<void>;
  resetSession: () => void;
};

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: [],
  isLoading: false,

  async refresh() {
    set({ isLoading: true });
    try {
      const playlists = await playlistsApi.listPlaylists();
      set({ playlists });
    } finally {
      set({ isLoading: false });
    }
  },

  async create(name) {
    const playlist = await playlistsApi.createPlaylist(name);
    set({ playlists: [playlist, ...get().playlists] });
    return playlist;
  },

  async addItem(playlistId, mediaId) {
    const updated = await playlistsApi.addToPlaylist(playlistId, mediaId);
    set({ playlists: get().playlists.map((p) => (p.id === updated.id ? updated : p)) });
    return updated;
  },

  async addItems(playlistId, mediaIds) {
    let updated = get().playlists.find((playlist) => playlist.id === playlistId);
    if (!updated) throw new Error('Playlist not found');

    // The endpoint returns the whole playlist. Keep writes sequential so two
    // responses cannot race and replace a newer snapshot with an older one.
    for (const mediaId of [...new Set(mediaIds)]) {
      if (updated.items.some((item) => item.id === mediaId)) continue;
      updated = await playlistsApi.addToPlaylist(playlistId, mediaId);
    }
    set({ playlists: get().playlists.map((playlist) => (playlist.id === updated!.id ? updated! : playlist)) });
    return updated;
  },

  async removeItem(playlistId, mediaId) {
    const updated = await playlistsApi.removeFromPlaylist(playlistId, mediaId);
    set({ playlists: get().playlists.map((p) => (p.id === updated.id ? updated : p)) });
    return updated;
  },

  async remove(playlistId) {
    await playlistsApi.deletePlaylist(playlistId);
    set({ playlists: get().playlists.filter((p) => p.id !== playlistId) });
  },

  resetSession() {
    set({ playlists: [], isLoading: false });
  },
}));
