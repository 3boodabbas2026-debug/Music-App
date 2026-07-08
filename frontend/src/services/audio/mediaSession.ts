import { Platform } from 'react-native';

import type { Media } from '../api/types';

/**
 * Web Media Session bridge: puts the current track on the OS media surface
 * (lock screen, keyboard media keys, Windows/macOS media flyout, Bluetooth
 * controls) and keeps playback controllable while the tab is in the
 * background. No-ops everywhere the API doesn't exist.
 */

type Handlers = {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (seconds: number) => void;
};

function session(): MediaSession | null {
  if (Platform.OS !== 'web') return null;
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}

export function updateMetadata(media: Media): void {
  const ms = session();
  if (!ms) return;
  ms.metadata = new MediaMetadata({
    title: media.title ?? media.recognized_title ?? 'Untitled',
    artist: media.artist ?? media.recognized_artist ?? 'Unknown artist',
    album: media.album ?? 'Wavecairn',
    artwork: media.thumbnail_url
      ? [{ src: media.thumbnail_url, sizes: '512x512', type: 'image/jpeg' }]
      : [],
  });
}

export function bindHandlers(handlers: Handlers): void {
  const ms = session();
  if (!ms) return;
  try {
    ms.setActionHandler('play', handlers.onPlay);
    ms.setActionHandler('pause', handlers.onPause);
    ms.setActionHandler('nexttrack', handlers.onNext);
    ms.setActionHandler('previoustrack', handlers.onPrev);
    ms.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) handlers.onSeek(details.seekTime);
    });
    ms.setActionHandler('seekforward', () => handlers.onSeek(-1));
    ms.setActionHandler('seekbackward', () => handlers.onSeek(-2));
  } catch {
    // Individual actions can be unsupported — ignore.
  }
}

export function updatePlaybackState(playing: boolean): void {
  const ms = session();
  if (!ms) return;
  ms.playbackState = playing ? 'playing' : 'paused';
}

let lastPositionPush = 0;

export function updatePosition(position: number, duration: number, rate: number): void {
  const ms = session();
  if (!ms || !('setPositionState' in ms)) return;
  // The OS UI interpolates on its own — a push every few seconds is plenty.
  const now = Date.now();
  if (now - lastPositionPush < 3000) return;
  lastPositionPush = now;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    ms.setPositionState({
      duration,
      position: Math.min(Math.max(0, position), duration),
      playbackRate: rate || 1,
    });
  } catch {
    // Invalid state mid-track-change — skip this push.
  }
}

export function clear(): void {
  const ms = session();
  if (!ms) return;
  ms.metadata = null;
  ms.playbackState = 'none';
}
