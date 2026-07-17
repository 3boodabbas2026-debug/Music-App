import { apiClient } from './client';
import type { Media } from './types';

type MediaState = {
  media: Media;
  favorite: boolean;
  last_position_seconds: number;
  play_count: number;
  last_played_at: string | null;
};

export async function listFavoriteIds(): Promise<string[]> {
  const { data } = await apiClient.get<MediaState[]>('/activity/favorites');
  return data.map((entry) => entry.media.id);
}

export async function setFavorite(mediaId: string, favorite: boolean): Promise<void> {
  await apiClient.put(`/activity/media/${mediaId}`, {
    increment_play_count: false,
    favorite,
  });
}
