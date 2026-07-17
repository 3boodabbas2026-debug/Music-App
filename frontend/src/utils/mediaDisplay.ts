import { API_BASE_URL } from '../config';
import { palette } from '../theme/theme';
import type { Media } from '../services/api/types';

/**
 * One long unbroken token mixing cases and/or digits — the shape of base64
 * blobs, hex hashes and numeric IDs that Telegram/yt-dlp sometimes hand back
 * as "titles". Mirrors the backend's looks_like_garbage_title heuristic
 * (job_engine.py), which decides when to auto-run recognition.
 */
const GARBAGE_TITLE_RE = /^[A-Za-z0-9_-]{16,}$/;
const PLACEHOLDER_TITLE_RE = /^(?:untitled(?:\s+(?:track|audio))?|unknown(?:\s+(?:track|title|audio))?|no\s+title|audio\s*file|track)$/i;
const TRAILING_HASHTAGS_RE = /(?:\s+#[^\s#]+)+\s*$/u;
const SOCIAL_TAG_RE = /^(?:fyp|viral|tiktok|shorts?|lyrics?|lyricsongs?|lyricsedit|music|songs?|pianocover|popmusic)$/i;
const BRACKET_SOURCE_NOISE_RE = /^(?:(?:official\s+)?(?:(?:music|lyric)\s+)?(?:video|audio)|lyrics?|visuali[sz]er|(?:(?:beginner|intermediate|advanced)\s+)?(?:piano\s+)?tutorial|(?:official\s+)?(?:music\s+)?cover|karaoke|hd|4k|shorts?)(?:\s+(?:hd|4k))?$/i;
const TRAILING_TOPIC_RE = /\s+[-–—|]\s*topic$/i;

function stripTrailingHashtags(value: string): string {
  const match = TRAILING_HASHTAGS_RE.exec(value);
  if (!match) return value;
  const tags = match[0].match(/#[^\s#]+/gu) ?? [];
  const isPublishingNoise = tags.length >= 2 || tags.every((tag) => SOCIAL_TAG_RE.test(tag.slice(1).replace(/_/g, '')));
  return isPublishingNoise ? value.slice(0, match.index).trim() : value;
}

/**
 * Removes source-site decoration without rewriting the actual song name.
 * Only trailing hashtag runs and bracket groups containing known publishing
 * noise are removed; meaningful qualifiers such as “Live”, “Remix”, or a
 * featured artist remain intact.
 */
export function cleanMediaTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  let cleaned = title.replace(/\s+/g, ' ').trim();
  cleaned = stripTrailingHashtags(cleaned);

  let previous = '';
  while (cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned.replace(/\s*[([\{]([^\])\}]+)[\])\}]\s*$/u, (match, contents: string) =>
      BRACKET_SOURCE_NOISE_RE.test(contents.trim()) ? '' : match,
    ).trim();
  }

  return cleaned || null;
}

/** Conservative cleanup for uploader/channel decoration on artist lines. */
export function cleanMediaArtist(artist: string | null | undefined): string | null {
  if (!artist) return null;
  const cleaned = artist
    .replace(/\s+/g, ' ')
    .trim();
  const withoutTags = stripTrailingHashtags(cleaned);
  return withoutTags.replace(TRAILING_TOPIC_RE, '').trim() || null;
}

export function looksLikeGarbageTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const t = title.trim();
  if (PLACEHOLDER_TITLE_RE.test(t)) return true;
  if (t.includes(' ') || !GARBAGE_TITLE_RE.test(t)) return false;
  const hasDigit = /\d/.test(t);
  let caseFlips = 0;
  for (let i = 1; i < t.length; i += 1) {
    if (/[a-z]/.test(t[i - 1]) && /[A-Z]/.test(t[i])) caseFlips += 1;
  }
  return hasDigit || caseFlips >= 2;
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * The one place "what do we call this track" is decided. A recognized title
 * always beats a garbage raw title; a garbage title with no recognition yet
 * shows as a humane "Untitled · 3:33" instead of a wall of base64.
 */
export function displayTitle(media: Pick<Media, 'title' | 'recognized_title' | 'duration_seconds'>): string {
  const title = cleanMediaTitle(media.title);
  const recognizedTitle = cleanMediaTitle(media.recognized_title);
  if (title && !looksLikeGarbageTitle(title)) return title;
  if (recognizedTitle) return recognizedTitle;
  if (media.title) {
    const duration = formatDuration(media.duration_seconds);
    return duration ? `Untitled · ${duration}` : 'Untitled track';
  }
  return 'Untitled';
}

/** Artist line, or null when there's nothing real to say — callers can hide
 * the line entirely instead of printing a noisy "Unknown artist". */
export function displayArtist(media: Pick<Media, 'artist' | 'recognized_artist'>): string | null {
  return cleanMediaArtist(media.artist) ?? cleanMediaArtist(media.recognized_artist);
}

/** Resolves a media thumbnail to something an <Image> can load. Backend-
 * generated poster frames are stored as relative API paths
 * ("/api/v1/library/{id}/thumbnail") so the DB doesn't bake in a host —
 * absolute external URLs (YouTube CDN etc.) pass through untouched. */
export function thumbnailUri(media: Pick<Media, 'thumbnail_url'>): string | null {
  const url = media.thumbnail_url;
  if (!url) return null;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
}

/** Prefer real art for a playlist cover, then the first item so its stable,
 * intentional fallback still gives the playlist a recognizable identity. */
export function firstPlaylistArtworkItem(items: readonly Media[]): Media | null {
  return items.find((item) => Boolean(thumbnailUri(item))) ?? items[0] ?? null;
}

/** Stable per-track cover gradient for tracks with no artwork — hue seeded
 * from the media id so the same track always wears the same color. Muted,
 * dark, on-palette: identity without shouting. */
const COVER_GRADIENTS: readonly (readonly [string, string])[] = [
  ['#3A241E', '#1F110C'], // ember clay
  ['#241E3E', '#131020'], // twilight violet
  ['#33301F', '#1A180F'], // dim gold
  ['#1D2840', '#0E1421'], // dusk blue
  ['#31232F', '#181117'], // mulberry
  ['#2A1E36', '#150F1D'], // deep plum
];

export function coverGradient(mediaId: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < mediaId.length; i += 1) {
    hash = (hash * 31 + mediaId.charCodeAt(i)) | 0;
  }
  return COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];
}

/** Accent glyph color matching the seeded gradient family. */
export function coverGlyphColor(mediaId: string): string {
  const idx = (() => {
    let hash = 0;
    for (let i = 0; i < mediaId.length; i += 1) {
      hash = (hash * 31 + mediaId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % COVER_GRADIENTS.length;
  })();
  return [palette.primary, palette.secondary, palette.gold, '#6FA8C9', '#C98AA8', palette.success][idx];
}
