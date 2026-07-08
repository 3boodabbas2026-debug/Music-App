import { Platform } from 'react-native';

import type { Media } from '../api/types';

/**
 * Explicit "download for offline" storage — separate from the app-shell
 * service worker cache (public/sw.js), which only ever caches static assets.
 * Nothing here is written unless the user taps "Save offline" on a specific
 * track, and everything here is wiped on sign-out so one account's saved
 * media never leaks into another session on a shared device.
 *
 * Web/PWA only: native (iOS/Android via Capacitor or Expo Go) has no
 * `indexedDB`/`caches` globals, so every export below is a no-op there —
 * offline playback on native is a later addition, not silently pretended to
 * work today.
 */

const DB_NAME = 'wavecairn-offline';
const DB_VERSION = 1;
const META_STORE = 'media-meta';
const CACHE_NAME = 'wavecairn-offline-media-v1';

export type OfflineEntry = {
  id: string;
  title: string;
  artist: string;
  mediaType: Media['media_type'];
  sizeBytes: number;
  savedAt: string;
};

export function isSupported(): boolean {
  return Platform.OS === 'web' && typeof indexedDB !== 'undefined' && typeof caches !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(META_STORE)) {
        req.result.createObjectStore(META_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, mode);
    const req = fn(tx.objectStore(META_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

function cacheKey(mediaId: string): string {
  return `/__offline-media__/${mediaId}`;
}

/** Fetches the stream URL once (following the API's redirect to the CDN/S3 origin) and stores the bytes + metadata for offline playback. */
export async function saveOffline(media: Media, streamUrl: string): Promise<void> {
  if (!isSupported()) return;
  const response = await fetch(streamUrl);
  if (!response.ok) throw new Error(`Could not fetch media for offline (${response.status})`);
  const blob = await response.blob();

  const cache = await caches.open(CACHE_NAME);
  await cache.put(cacheKey(media.id), new Response(blob, { headers: response.headers }));

  const entry: OfflineEntry = {
    id: media.id,
    title: media.title ?? media.recognized_title ?? 'Untitled',
    artist: media.artist ?? media.recognized_artist ?? 'Unknown artist',
    mediaType: media.media_type,
    sizeBytes: blob.size,
    savedAt: new Date().toISOString(),
  };
  await withStore('readwrite', (store) => store.put(entry));
}

export async function removeOffline(mediaId: string): Promise<void> {
  if (!isSupported()) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.delete(cacheKey(mediaId));
  await withStore('readwrite', (store) => store.delete(mediaId));
}

export async function isSavedOffline(mediaId: string): Promise<boolean> {
  if (!isSupported()) return false;
  const entry = await withStore<OfflineEntry | undefined>('readonly', (store) => store.get(mediaId));
  return !!entry;
}

export async function listOffline(): Promise<OfflineEntry[]> {
  if (!isSupported()) return [];
  return withStore<OfflineEntry[]>('readonly', (store) => store.getAll());
}

export async function getUsageBytes(): Promise<number> {
  const entries = await listOffline();
  return entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
}

/** Returns a blob: URL for offline playback, or null if this track was never saved. Caller owns revoking it. */
export async function getOfflineBlobUrl(mediaId: string): Promise<string | null> {
  if (!isSupported()) return null;
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(cacheKey(mediaId));
  if (!response) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** Wipes every offline-saved track. Called on sign-out so private media never crosses accounts on a shared device. */
export async function clearAll(): Promise<void> {
  if (!isSupported()) return;
  await caches.delete(CACHE_NAME);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
