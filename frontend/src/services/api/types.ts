export type MediaType = 'audio' | 'video';
export type MediaSource = 'tiktok' | 'youtube' | 'instagram' | 'telegram' | 'other_url' | 'recognized_upload';

export type Media = {
  id: string;
  media_type: MediaType;
  source: MediaSource;
  source_url: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumbnail_url: string | null;
  recognized_title: string | null;
  recognized_artist: string | null;
  /** Auto-filled the same moment recognized_title lands — from the Shazam
   * match's own metadata (genre, release year) or a title-keyword heuristic
   * (is_remix). Null until a track has been through recognition at least once. */
  genre: string | null;
  release_year: number | null;
  is_remix: boolean | null;
  duration_seconds: number | null;
  created_at: string;
};

export type JobType = 'download' | 'recognize';
export type JobStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'cancelled';

export type Job = {
  id: string;
  job_type: JobType;
  status: JobStatus;
  progress_pct: number;
  stage_label: string | null;
  source_url: string | null;
  error_message: string | null;
  result_media: Media | null;
  match_title: string | null;
  match_artist: string | null;
  match_thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Playlist = {
  id: string;
  name: string;
  created_at: string;
  items: Media[];
};

export type User = {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
};
