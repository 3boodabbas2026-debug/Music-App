import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Media } from './types';
import { looksLikeGarbageTitle } from '../../utils/mediaDisplay';

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

async function queryLrclib(media: Media): Promise<LrclibRecord | null> {
  // Never search lrclib with a base64-ish garbage title — it can only miss.
  const title = !looksLikeGarbageTitle(media.title) ? media.title : media.recognized_title;
  const artist = media.artist ?? media.recognized_artist;
  if (!title) return null;

  const base = 'https://lrclib.net/api';
  const attempts: string[] = [];
  if (artist && media.duration_seconds) {
    attempts.push(
      `${base}/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}&duration=${Math.round(media.duration_seconds)}`,
    );
  }
  attempts.push(`${base}/search?q=${encodeURIComponent(artist ? `${artist} ${title}` : title)}`);

  for (const url of attempts) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const body = await res.json();
      const record: LrclibRecord | undefined = Array.isArray(body) ? body[0] : body;
      if (record && (record.syncedLyrics || record.plainLyrics)) return record;
    } catch {
      // Network hiccup — try the next strategy.
    }
  }
  return null;
}

export async function fetchLyrics(media: Media): Promise<Lyrics | null> {
  if (memoryCache.has(media.id)) return memoryCache.get(media.id) ?? null;

  const storageKey = `lyrics-v1:${media.id}`;
  try {
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Lyrics | null;
      memoryCache.set(media.id, parsed);
      return parsed;
    }
  } catch {
    // Cache miss path below covers it.
  }

  const record = await queryLrclib(media);
  const lyrics: Lyrics | null = record
    ? {
        synced: record.syncedLyrics ? parseLrc(record.syncedLyrics) : null,
        plain: record.plainLyrics ?? null,
      }
    : null;

  memoryCache.set(media.id, lyrics);
  AsyncStorage.setItem(storageKey, JSON.stringify(lyrics)).catch(() => {});
  return lyrics;
}
