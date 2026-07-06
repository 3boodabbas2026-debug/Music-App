import { apiClient } from './client';
import type { Job } from './types';

export type AudioFormat = 'mp3-320' | 'mp3-192' | 'm4a' | 'source';
export type VideoQuality = '2160p' | '1080p' | '720p' | 'source';

export async function createDownload(
  url: string,
  mediaType: 'audio' | 'video',
  options?: { audioFormat?: AudioFormat; videoQuality?: VideoQuality },
): Promise<Job> {
  const { data } = await apiClient.post<Job>('/downloads', {
    url,
    media_type: mediaType,
    ...(options?.audioFormat ? { audio_format: options.audioFormat } : {}),
    ...(options?.videoQuality ? { video_quality: options.videoQuality } : {}),
  });
  return data;
}

export async function getDownload(jobId: string): Promise<Job> {
  const { data } = await apiClient.get<Job>(`/downloads/${jobId}`);
  return data;
}

export async function listDownloads(): Promise<Job[]> {
  const { data } = await apiClient.get<Job[]>('/downloads');
  return data;
}

export async function cancelDownload(jobId: string): Promise<Job> {
  const { data } = await apiClient.delete<Job>(`/downloads/${jobId}`);
  return data;
}
