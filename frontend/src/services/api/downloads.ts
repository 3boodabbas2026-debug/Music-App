import { apiClient } from './client';
import type { Job } from './types';

export type AudioFormat = 'mp3-320' | 'mp3-192' | 'm4a' | 'source';
export type VideoQuality = '2160p' | '1080p' | '720p' | 'source';

export type DownloadOptions = {
  audioFormat?: AudioFormat;
  videoQuality?: VideoQuality;
  /** False keeps a shared playlist track as one track; true expands the playlist server-side. */
  downloadPlaylist?: boolean;
};

export type DownloadInspection = {
  url: string;
  is_playlist: boolean;
  playlist_title: string | null;
  entry_count: number | null;
};

/**
 * Enqueue every URL independently. The endpoint deliberately returns one job
 * per URL so callers can keep progress and partial failures attached to the
 * exact link the user submitted.
 */
export async function createDownloads(
  urls: string[],
  mediaType: 'audio' | 'video',
  options?: DownloadOptions,
): Promise<Job[]> {
  const { data } = await apiClient.post<Job[]>('/downloads', {
    urls,
    media_type: mediaType,
    ...(options?.audioFormat ? { audio_format: options.audioFormat } : {}),
    ...(options?.videoQuality ? { video_quality: options.videoQuality } : {}),
    ...(options?.downloadPlaylist ? { download_playlist: true } : {}),
  });
  return data;
}

/** @deprecated Prefer createDownloads so batch progress is not collapsed. */
export async function createDownload(
  url: string,
  mediaType: 'audio' | 'video',
  options?: DownloadOptions,
): Promise<Job> {
  const [job] = await createDownloads([url], mediaType, options);
  if (!job) throw new Error('The download request did not create a job.');
  return job;
}

export async function inspectDownload(url: string): Promise<DownloadInspection> {
  const { data } = await apiClient.post<DownloadInspection>('/downloads/inspect', { url });
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

export async function retryDownload(jobId: string): Promise<Job> {
  const { data } = await apiClient.post<Job>(`/downloads/${jobId}/retry`);
  return data;
}
