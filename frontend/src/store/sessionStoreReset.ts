import * as offlineMedia from '../services/storage/offlineMedia';
import { useDashboardStore } from './dashboardStore';
import { useFavoritesStore } from './favoritesStore';
import { useLibraryStore } from './libraryStore';
import { usePinStore } from './pinStore';
import { usePlayerStore } from './playerStore';
import { usePlaylistStore } from './playlistStore';
import { usePlayHistoryStore } from './playHistoryStore';
import { useScanHistoryStore } from './scanHistoryStore';
import { useVideoPlayerStore } from './videoPlayerStore';

/**
 * Clears every account-owned client cache at an authentication boundary.
 * State is reset synchronously by each store before its best-effort disk
 * cleanup resolves, so a previous account cannot remain visible while an
 * authentication transition is finishing.
 */
export async function resetSessionStores(): Promise<void> {
  const cleanup = [
    usePlayerStore.getState().resetSession(),
    useLibraryStore.getState().resetSession(),
    useDashboardStore.getState().resetSession(),
    usePinStore.getState().resetSession(),
    usePlayHistoryStore.getState().resetSession(),
    useFavoritesStore.getState().resetSession(),
    Promise.resolve(usePlaylistStore.getState().resetSession()),
    useScanHistoryStore.getState().resetSession(),
    Promise.resolve(useVideoPlayerStore.getState().resetSession()),
    offlineMedia.clearAll(),
  ];

  await Promise.allSettled(cleanup);
}
