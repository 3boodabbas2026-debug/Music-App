import { apiClient } from './client';
import type { Playlist } from './types';

export async function listPlaylists(): Promise<Playlist[]> {
  const { data } = await apiClient.get<Playlist[]>('/playlists');
  return data;
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const { data } = await apiClient.post<Playlist>('/playlists', { name });
  return data;
}

export async function addToPlaylist(playlistId: string, mediaId: string): Promise<Playlist> {
  const { data } = await apiClient.post<Playlist>(`/playlists/${playlistId}/items`, { media_id: mediaId });
  return data;
}

export async function removeFromPlaylist(playlistId: string, mediaId: string): Promise<Playlist> {
  const { data } = await apiClient.delete<Playlist>(`/playlists/${playlistId}/items/${mediaId}`);
  return data;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await apiClient.delete(`/playlists/${playlistId}`);
}
