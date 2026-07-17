import { API_V1 } from '../../config';
import { apiClient } from './client';
import type { Media } from './types';

export type LibrarySourceFilter =
  | 'tiktok'
  | 'youtube'
  | 'instagram'
  | 'telegram'
  | 'other_url'
  | 'recognized_upload'
  | 'recognized'
  | 'uploaded';

/** Query contract for GET /library. Every populated field is AND-combined by
 * the API; keeping this type beside the client prevents the filter sheet from
 * quietly drifting back to client-only filtering. */
export type LibraryQuery = {
  q?: string;
  source?: LibrarySourceFilter;
  media_type?: Media['media_type'];
  named?: boolean;
  favorite?: boolean;
  min_duration?: number;
  max_duration?: number;
  added_after?: string;
  added_before?: string;
  artist?: string;
  playlist_id?: string;
};

export async function listLibrary(query?: LibraryQuery): Promise<Media[]> {
  const params = query
    ? Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== ''))
    : undefined;
  const { data } = await apiClient.get<Media[]>('/library', { params });
  return data;
}

export async function getMedia(mediaId: string): Promise<Media> {
  const { data } = await apiClient.get<Media>(`/library/${mediaId}`);
  return data;
}

export async function updateMedia(
  mediaId: string,
  patch: Partial<Pick<Media, 'title' | 'artist' | 'album' | 'genre' | 'release_year' | 'is_remix'>>,
) {
  const { data } = await apiClient.patch<Media>(`/library/${mediaId}`, patch);
  return data;
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await apiClient.delete(`/library/${mediaId}`);
}

export function streamUrl(mediaId: string): string {
  return `${API_V1}/library/${mediaId}/stream`;
}
