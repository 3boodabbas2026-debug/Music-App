import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Media } from './types';
import { cleanMediaArtist, cleanMediaTitle, looksLikeGarbageTitle } from '../../utils/mediaDisplay';

/**
 * Lyrics via lrclib.net — a free, CORS-open lyrics database with word-for-word
 * LRC timestamps for most popular tracks. Results are cached per media id so
 * each track hits the network once.
 */

export type SyncedLine = { time: number; text: string };

export type Lyrics = {
  synced: SyncedLine[] | null;
  plain: string | null;
};

type LrclibRecord = {
  syncedLyrics: string | null;
  plainLyrics: string | null;
};

const memoryCache = new Map<string, Lyrics | null>();

const LRC_LINE = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)/;
const TITLE_ARTIST_SEPARATOR = /\s+[-–—]\s+/;

type LyricsSearchCandidate = { title: string; artist: string | null };

/**
 * Builds conservative lookup variants from cleaned metadata. Recognition is
 * authoritative when available; a two-part scraped title is tried in both
 * common “Artist — Title” and “Title — Artist” orientations instead of
 * guessing which convention a source used.
 */
export function buildLyricsSearchCandidates(media: Media): LyricsSearchCandidate[] {
  const candidates: LyricsSearchCandidate[] = [];
  const add = (title: string | null, artist: string | null) => {
    if (!title || looksLikeGarbageTitle(title)) return;
    const key = `${title.toLocaleLowerCase()}\u0000${artist?.toLocaleLowerCase() ?? ''}`;
    if (candidates.some((candidate) =>
      `${candidate.title.toLocaleLowerCase()}\u0000${candidate.artist?.toLocaleLowerCase() ?? ''}` === key
    )) return;
    candidates.push({ title, artist });
  };

  const recognizedTitle = cleanMediaTitle(media.recognized_title);
  const recognizedArtist = cleanMediaArtist(media.recognized_artist);
  const rawTitle = cleanMediaTitle(media.title);
  const rawArtist = cleanMediaArtist(media.artist);

  add(recognizedTitle, recognizedArtist ?? rawArtist);
  add(rawTitle, rawArtist ?? recognizedArtist);

  if (rawTitle) {
    const parts = rawTitle.split(TITLE_ARTIST_SEPARATOR).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) {
      add(parts[0], parts[1]);
      add(parts[1], parts[0]);
    }
  }

  return candidates;
}

function lyricsCacheKey(mediaId: string, candidates: LyricsSearchCandidate[]): string {
  const fingerprint = JSON.stringify(candidates);
  let hash = 2166136261;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `lyrics-v2:${mediaId}:${(hash >>> 0).toString(36)}`;
}

export function parseLrc(lrc: string): SyncedLine[] {
  const lines: SyncedLine[] = [];
  for (const raw of lrc.split('\n')) {
    const match = LRC_LINE.exec(raw.trim());
    if (!match) continue;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const fraction = match[3] ? Number(match[3].padEnd(3, '0')) / 1000 : 0;
    const text = match[4].trim();
    if (!text) continue;
    lines.push({ time: minutes * 60 + seconds + fraction, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

async function queryLrclib(media: Media, candidates: LyricsSearchCandidate[]): Promise<LrclibRecord | null> {
  const base = 'https://lrclib.net/api';
  const attempts: string[] = [];
  for (const { title, artist } of candidates) {
    if (artist && media.duration_seconds) {
      attempts.push(
        `${base}/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}&duration=${Math.round(media.duration_seconds)}`,
      );
    }
  }
  for (const { title, artist } of candidates) {
    attempts.push(`${base}/search?q=${encodeURIComponent(artist ? `${artist} ${title}` : title)}`);
  }

  if (attempts.length === 0) throw new Error('This track does not have enough title or artist information to search for lyrics.');
  let receivedValidResponse = false;
  let failureReason: string | null = null;
  for (const url of attempts) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) failureReason = 'The lyrics provider refused this request.';
        else if (res.status === 429) failureReason = 'The lyrics provider is busy. Wait a moment, then retry.';
        else if (res.status >= 500) failureReason = 'The lyrics provider is temporarily unavailable.';
        continue;
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        failureReason = 'The lyrics provider returned a response that could not be read.';
        continue;
      }
      receivedValidResponse = true;
      const record: LrclibRecord | undefined = Array.isArray(body) ? body[0] : body;
      if (record && (record.syncedLyrics || record.plainLyrics)) return record;
    } catch {
      failureReason = 'Could not reach the lyrics provider. Check your connection and retry.';
    }
  }
  if (!receivedValidResponse && failureReason) throw new Error(failureReason);
  return null;
}

export async function fetchLyrics(media: Media, options?: { forceRefresh?: boolean }): Promise<Lyrics | null> {
  const candidates = buildLyricsSearchCandidates(media);
  const storageKey = lyricsCacheKey(media.id, candidates);
  if (!options?.forceRefresh && memoryCache.has(storageKey)) return memoryCache.get(storageKey) ?? null;

  if (!options?.forceRefresh) try {
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Lyrics | null;
      memoryCache.set(storageKey, parsed);
      return parsed;
    }
  } catch {
    // Cache miss path below covers it.
  }

  const record = await queryLrclib(media, candidates);
  const lyrics: Lyrics | null = record
    ? {
        synced: record.syncedLyrics ? parseLrc(record.syncedLyrics) : null,
        plain: record.plainLyrics ?? null,
      }
    : null;

  memoryCache.set(storageKey, lyrics);
  // A miss may be a transient network/CORS failure. Cache only real lyrics
  // on disk so a later app session can retry instead of preserving null
  // forever after the metadata-cleaning fix.
  if (lyrics) AsyncStorage.setItem(storageKey, JSON.stringify(lyrics)).catch(() => {});
  return lyrics;
}
