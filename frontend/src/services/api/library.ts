import { API_V1 } from '../../config';
import { apiClient } from './client';
import type { Media } from './types';

export async function listLibrary(query?: string): Promise<Media[]> {
  const { data } = await apiClient.get<Media[]>('/library', { params: query ? { q: query } : undefined });
  return data;
}

export async function updateMedia(mediaId: string, patch: Partial<Pick<Media, 'title' | 'artist' | 'album'>>) {
  const { data } = await apiClient.patch<Media>(`/library/${mediaId}`, patch);
  return data;
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await apiClient.delete(`/library/${mediaId}`);
}

export function streamUrl(mediaId: string): string {
  return `${API_V1}/library/${mediaId}/stream`;
}
