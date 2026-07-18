import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import {
  formatDuration,
  GridCard,
  ListRow,
  metadataLine,
  SkeletonGrid,
} from '../components/library/LibraryMediaView';
import {
  EditMediaModal,
  NewPlaylistWithItemsModal,
  PlaylistDetailModal,
  PlaylistPickerModal,
  PlaylistsPane,
} from '../components/library/LibrarySheets';
import {
  EMPTY_LIBRARY_FILTERS,
  LibraryFilterSheet,
  activeLibraryFilterChips,
  advancedFiltersToQuery,
  libraryFilterCount,
  type ActiveFilterChip,
  type LibraryAdvancedFilters,
} from '../components/library/LibraryFilterSheet';
import {
  PlaylistDropStrip,
  type PlaylistDropStripHandle,
  type PlaylistDropTarget,
} from '../components/library/PlaylistDropStrip';
import { TrackActionList } from '../components/library/TrackActions';
import { SmartCategoriesPane } from '../components/library/SmartCategoriesPane';
import { LibraryFreshnessBanner } from '../components/library/LibraryFreshnessBanner';
import { useBottomChromeClearance, useDockClearance } from '../hooks/useBottomChromeClearance';
import { RAIL_WIDTH, useResponsive } from '../hooks/useResponsive';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EmptyState } from '../components/ui/EmptyState';
import { Artwork } from '../components/ui/Artwork';
import { Reveal } from '../components/ui/Reveal';
import { TabChipRow } from '../components/ui/TabChipRow';
import { CompactGlassSheet, type SheetAnchor } from '../components/ui/CompactGlassSheet';
import { tokenStorage } from '../services/storage/tokenStorage';
import { PressableScale } from '../components/ui/PressableScale';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import * as libraryApi from '../services/api/library';
import type { LibraryQuery } from '../services/api/library';
import * as recognitionsApi from '../services/api/recognitions';
import { watchJob } from '../services/api/jobSocket';
import type { Media, Playlist } from '../services/api/types';
import * as offlineMedia from '../services/storage/offlineMedia';
import { displayArtist as artistOf, displayTitle, looksLikeGarbageTitle } from '../utils/mediaDisplay';
import { useFavoritesStore } from '../store/favoritesStore';
import { useLibraryStore } from '../store/libraryStore';
import { MAX_PINS, usePinStore } from '../store/pinStore';
import { usePlayerStore } from '../store/playerStore';
import { usePlaylistStore } from '../store/playlistStore';
import { useVideoPlayerStore } from '../store/videoPlayerStore';
import { useUiStore } from '../store/uiStore';
import { toast } from '../store/toastStore';
import { apiErrorMessage } from '../utils/apiError';
import { categoryForGenre, MEDIA_CATEGORIES, type MediaCategoryId } from '../utils/mediaCategory';
import { colors, glass, glassBlur, gradients, radii, shadows, spacing, typography } from '../theme/tokens';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';

type Tab = 'all' | 'audio' | 'video' | 'favorites' | 'categories' | 'playlists';
type SortMode = 'newest' | 'title' | 'artist' | 'genre' | 'year' | 'longest';
type ViewMode = 'grid' | 'list';
type RemixFilter = 'all' | 'original' | 'remix';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'audio', label: 'Songs' },
  { key: 'video', label: 'Videos' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'categories', label: 'Categories' },
  { key: 'playlists', label: 'Playlists' },
];

const SORT_LABEL: Record<SortMode, string> = {
  newest: 'Newest',
  title: 'Title',
  artist: 'Artist',
  genre: 'Genre',
  year: 'Year',
  longest: 'Longest',
};
const SORT_ORDER: SortMode[] = ['newest', 'title', 'artist', 'genre', 'year', 'longest'];

/** Artist for display in this screen — falls back to a muted label where a
 * line of text is structurally expected (sheet subtitle, sort). */
function displayArtist(media: Media): string {
  return artistOf(media) ?? 'Unknown artist';
}

const LIBRARY_MAX_WIDTH = 1160;

export function LibraryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Library'>>();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const { isDesktop } = useResponsive();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const bottomChromeClearance = useBottomChromeClearance();
  const dockClearance = useDockClearance();
  const setBottomOverlayOffset = useUiStore((state) => state.setBottomOverlayOffset);
  const {
    items: canonicalItems,
    isLoading: canonicalLoading,
    isStale: canonicalStale,
    lastUpdatedAt: canonicalLastUpdatedAt,
    refresh: refreshCanonical,
    upsert,
    remove,
  } = useLibraryStore();
  const playQueue = usePlayerStore((s) => s.playQueue);
  const currentMedia = usePlayerStore((s) => s.currentMedia);
  const playNextInQueue = usePlayerStore((s) => s.playNextInQueue);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const pinnedIds = usePinStore((s) => s.ids);
  const togglePin = usePinStore((s) => s.toggle);

  const playlists = usePlaylistStore((s) => s.playlists);
  const refreshPlaylists = usePlaylistStore((s) => s.refresh);
  const addPlaylistItems = usePlaylistStore((s) => s.addItems);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'all');

  // Sidebar's "Playlists" shortcut re-navigates here with a fresh `tab` param
  // even when this screen is already mounted — react to that, not just the
  // initial state above.
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
    if (route.params?.query != null) setQuery(route.params.query);
    if (route.params?.selectId) {
      setSelectMode(true);
      setSelectedIds({ [route.params.selectId]: true });
    }
  }, [route.params?.query, route.params?.selectId, route.params?.tab]);
  const [sort, setSort] = useState<SortMode>('newest');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<MediaCategoryId | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [remixFilter, setRemixFilter] = useState<RemixFilter>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [sheetMedia, setSheetMedia] = useState<Media | null>(null);
  const [sheetAnchor, setSheetAnchor] = useState<SheetAnchor | null>(null);
  const [editMedia, setEditMedia] = useState<Media | null>(null);
  const [playlistDetailId, setPlaylistDetailId] = useState<string | null>(null);
  const [playlistPickTarget, setPlaylistPickTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [newPlaylistPrompt, setNewPlaylistPrompt] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<LibraryAdvancedFilters>(EMPTY_LIBRARY_FILTERS);
  const [filteredItems, setFilteredItems] = useState<Media[] | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [offlineIds, setOfflineIds] = useState<Record<string, boolean>>({});
  const [savingOffline, setSavingOffline] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [nativeDownloadQueue, setNativeDownloadQueue] = useState<{ items: Media[]; index: number; failed: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, true>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBarHeight, setBulkBarHeight] = useState(0);
  const [naming, setNaming] = useState(false);
  const [namingProgress, setNamingProgress] = useState<{ processed: number; matched: number; total: number } | null>(null);
  const [draggingMediaId, setDraggingMediaId] = useState<string | null>(null);
  const [hoveredDropKey, setHoveredDropKey] = useState<string | null>(null);
  const dragPosition = useRef(new Animated.ValueXY()).current;
  const dragVisibility = useRef(new Animated.Value(0)).current;

  useEffect(() => () => dragVisibility.stopAnimation(), [dragVisibility]);
  const playlistDropStripRef = useRef<PlaylistDropStripHandle>(null);
  const hoveredDropKeyRef = useRef<string | null>(null);
  const filterRequestIdRef = useRef(0);

  const serverQuery = useMemo<LibraryQuery>(() => {
    const filters = advancedFiltersToQuery(advancedFilters);
    return {
      ...filters,
      q: query.trim() || undefined,
      media_type: tab === 'audio' || tab === 'video' ? tab : filters.media_type,
      favorite: tab === 'favorites' ? true : filters.favorite,
    };
  }, [advancedFilters, query, tab]);
  const hasServerFilters = useMemo(
    () => Object.values(serverQuery).some((value) => value !== undefined && value !== ''),
    [serverQuery],
  );
  // Keep the last successful render in place while a query changes or fails.
  // This prevents an unavailable server from impersonating an empty library.
  const items = hasServerFilters ? filteredItems ?? canonicalItems : canonicalItems;
  const isLoading = hasServerFilters ? filterLoading : canonicalLoading;

  useEffect(() => {
    void refreshCanonical();
  }, [refreshCanonical]);

  useEffect(() => {
    refreshPlaylists().catch(() => {});
    if (offlineMedia.isSupported()) {
      offlineMedia.listOffline().then((entries) => {
        setOfflineIds(Object.fromEntries(entries.map((e) => [e.id, true])));
      });
    }
  }, [refreshPlaylists]);

  useEffect(() => {
    const requestId = ++filterRequestIdRef.current;
    if (!hasServerFilters) {
      setFilteredItems(null);
      setFilterLoading(false);
      setFilterError(null);
      return;
    }
    setFilterLoading(true);
    setFilterError(null);
    const timeout = setTimeout(() => {
      void libraryApi.listLibrary(serverQuery)
        .then((result) => {
          if (filterRequestIdRef.current === requestId) {
            setFilteredItems(result);
            setFilterError(null);
          }
        })
        .catch((error) => {
          if (filterRequestIdRef.current === requestId) {
            setFilterError(apiErrorMessage(error, 'Couldn’t update these library results.'));
          }
        })
        .finally(() => {
          if (filterRequestIdRef.current === requestId) setFilterLoading(false);
        });
    }, 300);
    return () => clearTimeout(timeout);
  }, [hasServerFilters, serverQuery]);

  async function refreshFilteredNow() {
    if (!hasServerFilters) return;
    const requestId = ++filterRequestIdRef.current;
    setFilterLoading(true);
    setFilterError(null);
    try {
      const result = await libraryApi.listLibrary(serverQuery);
      if (filterRequestIdRef.current === requestId) setFilteredItems(result);
    } catch (error) {
      if (filterRequestIdRef.current === requestId) {
        setFilterError(apiErrorMessage(error, 'Couldn’t update these library results.'));
      }
    } finally {
      if (filterRequestIdRef.current === requestId) setFilterLoading(false);
    }
  }

  async function refreshScreenLibrary() {
    await refreshCanonical();
    if (hasServerFilters) await refreshFilteredNow();
  }

  function upsertInLibraryViews(media: Media) {
    upsert(media);
    setFilteredItems((current) => {
      if (!current) return current;
      return current.map((item) => (item.id === media.id ? media : item));
    });
  }

  async function removeFromLibraryViews(mediaId: string) {
    await remove(mediaId);
    setFilteredItems((current) => current?.filter((item) => item.id !== mediaId) ?? current);
  }

  const genres = useMemo(
    () => [...new Set(items.map((m) => m.genre?.trim()).filter((value): value is string => !!value))].sort(),
    [items],
  );
  const years = useMemo(
    () => [...new Set(items.map((m) => m.release_year).filter((value): value is number => value != null))].sort((a, b) => b - a),
    [items],
  );

  const visible = useMemo(() => {
    let list = items;
    if (tab === 'audio' || tab === 'video') list = list.filter((m) => m.media_type === tab);
    if (tab === 'favorites') list = list.filter((m) => favoriteIds[m.id]);
    if (tab === 'categories' && categoryFilter) list = list.filter((m) => categoryForGenre(m.genre) === categoryFilter);
    if (genreFilter) list = list.filter((m) => m.genre === genreFilter);
    if (yearFilter) list = list.filter((m) => m.release_year === yearFilter);
    if (remixFilter === 'remix') list = list.filter((m) => m.is_remix === true);
    if (remixFilter === 'original') list = list.filter((m) => m.is_remix !== true);

    const sorted = [...list];
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
        break;
      case 'artist':
        sorted.sort((a, b) => displayArtist(a).localeCompare(displayArtist(b)));
        break;
      case 'genre':
        sorted.sort((a, b) => (a.genre ?? 'ZZZ').localeCompare(b.genre ?? 'ZZZ'));
        break;
      case 'year':
        sorted.sort((a, b) => (b.release_year ?? 0) - (a.release_year ?? 0));
        break;
      case 'longest':
        sorted.sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0));
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return sorted;
  }, [items, tab, sort, favoriteIds, categoryFilter, genreFilter, yearFilter, remixFilter]);

  function cycleGenre() {
    const index = genreFilter ? genres.indexOf(genreFilter) : -1;
    setGenreFilter(index >= genres.length - 1 ? null : genres[index + 1]);
  }

  function cycleYear() {
    const index = yearFilter ? years.indexOf(yearFilter) : -1;
    setYearFilter(index >= years.length - 1 ? null : years[index + 1]);
  }

  function openTrackSheet(media: Media, event: GestureResponderEvent) {
    const { pageX, pageY } = event.nativeEvent;
    setSheetAnchor(
      Number.isFinite(pageX) && Number.isFinite(pageY) && (pageX !== 0 || pageY !== 0)
        ? { x: pageX, y: pageY }
        : null,
    );
    setSheetMedia(media);
  }

  function closeTrackSheet() {
    setSheetMedia(null);
    setSheetAnchor(null);
    setConfirmDelete(false);
  }

  async function handlePlay(media: Media) {
    if (media.media_type === 'video') {
      useVideoPlayerStore.getState().openExpanded(media.id);
      return;
    }
    const audioOnly = visible.filter((m) => m.media_type !== 'video');
    const index = audioOnly.findIndex((m) => m.id === media.id);
    await playQueue(audioOnly, Math.max(0, index));
    navigation.navigate('Player');
  }

  async function handleSaveFile(media: Media) {
    closeTrackSheet();
    const token = await tokenStorage.getAccessToken();
    const url = token
      ? `${libraryApi.streamUrl(media.id)}?token=${encodeURIComponent(token)}`
      : libraryApi.streamUrl(media.id);
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't open that file."), 'error');
    }
  }

  async function handleToggleOffline(media: Media) {
    if (savingOffline) return;
    const alreadySaved = !!offlineIds[media.id];
    setSavingOffline(true);
    try {
      if (alreadySaved) {
        await offlineMedia.removeOffline(media.id);
        setOfflineIds((prev) => ({ ...prev, [media.id]: false }));
        toast('Removed from offline downloads', 'info');
      } else {
        const token = await tokenStorage.getAccessToken();
        // proxy=1: the backend relays the bytes same-origin — browser fetch()
        // can't read the S3 presigned redirect cross-origin (no CORS headers).
        const url = token
          ? `${libraryApi.streamUrl(media.id)}?proxy=1&token=${encodeURIComponent(token)}`
          : `${libraryApi.streamUrl(media.id)}?proxy=1`;
        toast('Saving for offline…', 'info');
        await offlineMedia.saveOffline(media, url);
        setOfflineIds((prev) => ({ ...prev, [media.id]: true }));
        toast('Saved for offline playback', 'success');
      }
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't save offline. Check your connection and try again."), 'error');
    } finally {
      setSavingOffline(false);
      closeTrackSheet();
    }
  }

  // Native has no durable offline cache yet (offlineMedia is web-only), so it
  // uses the explicit, cancellable handoff queue below.
  async function handleDownloadMany(mediaList: Media[]) {
    if (bulkDownloading || mediaList.length === 0) return;
    const webSupported = offlineMedia.isSupported();
    if (!webSupported) {
      // R4 native-manager service hook: queue every target and require one
      // explicit user action per OS handoff. Never dump external intents.
      setNativeDownloadQueue({ items: [...mediaList], index: 0, failed: 0 });
      setBulkDownloadProgress({ done: 0, total: mediaList.length });
      return;
    }

    const targets = mediaList;
    setBulkDownloading(true);
    setBulkDownloadProgress({ done: 0, total: targets.length });
    const token = await tokenStorage.getAccessToken();
    let failed = 0;

    try {
      let cursor = 0;
      const worker = async (): Promise<void> => {
        const i = cursor++;
        if (i >= targets.length) return;
        const media = targets[i];
        try {
          if (!offlineIds[media.id]) {
            const url = token
              ? `${libraryApi.streamUrl(media.id)}?proxy=1&token=${encodeURIComponent(token)}`
              : `${libraryApi.streamUrl(media.id)}?proxy=1`;
            await offlineMedia.saveOffline(media, url);
            setOfflineIds((prev) => ({ ...prev, [media.id]: true }));
          }
        } catch (err) {
          apiErrorMessage(err, "Couldn't download that track.");
          failed += 1;
        } finally {
          setBulkDownloadProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
        }
        return worker();
      };
      const concurrency = 3;
      await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));

      toast(
        failed > 0
          ? `Saved ${targets.length - failed} of ${targets.length} for offline playback`
          : `Saved ${targets.length} track${targets.length === 1 ? '' : 's'} for offline playback`,
        failed > 0 ? 'info' : 'success',
      );
    } finally {
      setBulkDownloading(false);
      setBulkDownloadProgress(null);
    }
  }

  async function handleDelete(media: Media) {
    closeTrackSheet();
    try {
      await removeFromLibraryViews(media.id);
      toast('Removed from your collection', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't delete that track."), 'error');
    }
  }

  /** Batch-name every un-recognized audio track — same flow Settings offers,
   * surfaced here where the gibberish names are actually staring at you. */
  async function handleFixNames() {
    if (naming) return;
    setNaming(true);
    try {
      const job = await recognitionsApi.recognizeWholeLibrary();
      const initialTotal = job.batch_total ?? unnamedCount;
      setNamingProgress({
        processed: job.batch_processed ?? 0,
        matched: job.batch_matched ?? 0,
        total: initialTotal,
      });
      if (initialTotal === 0) {
        toast('Every track already has a name', 'success');
        setNaming(false);
        setNamingProgress(null);
        return;
      }
      toast(`Naming all ${initialTotal} tracks…`, 'info');

      let unsubscribe: (() => void) | null = null;
      const handleUpdate = (update: typeof job) => {
        const total = update.batch_total ?? initialTotal;
        const processed = update.batch_processed ?? 0;
        const matched = update.batch_matched ?? 0;
        setNamingProgress({ processed, matched, total });
        if (update.status !== 'complete' && update.status !== 'failed' && update.status !== 'cancelled') return;

        unsubscribe?.();
        setNaming(false);
        setNamingProgress(null);
        void refreshScreenLibrary();
        const genuineFailures = update.batch_failed ?? 0;
        if (update.status === 'complete') {
          toast(
            `Named ${matched} of ${total} tracks${genuineFailures ? ` · ${genuineFailures} failed` : ''}`,
            matched > 0 ? 'success' : 'info',
          );
        } else {
          toast(`Naming stopped after ${processed} of ${total} · ${matched} named`, 'error');
        }
      };

      if (job.status === 'complete' || job.status === 'failed' || job.status === 'cancelled') handleUpdate(job);
      else unsubscribe = watchJob(job.id, handleUpdate);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't start naming."), 'error');
      setNaming(false);
      setNamingProgress(null);
    }
  }

  async function openNextNativeDownload() {
    if (!nativeDownloadQueue || bulkDownloading) return;
    const media = nativeDownloadQueue.items[nativeDownloadQueue.index];
    if (!media) return;
    setBulkDownloading(true);
    let failed = nativeDownloadQueue.failed;
    try {
      const token = await tokenStorage.getAccessToken();
      const url = token
        ? `${libraryApi.streamUrl(media.id)}?token=${encodeURIComponent(token)}`
        : libraryApi.streamUrl(media.id);
      if (!(await Linking.canOpenURL(url))) throw new Error('No download handler is available on this device.');
      await Linking.openURL(url);
    } catch (err) {
      failed += 1;
      toast(apiErrorMessage(err, "Couldn't open that download."), 'error');
    } finally {
      const nextIndex = nativeDownloadQueue.index + 1;
      setBulkDownloadProgress({ done: nextIndex, total: nativeDownloadQueue.items.length });
      setBulkDownloading(false);
      if (nextIndex >= nativeDownloadQueue.items.length) {
        toast(failed ? `Queue complete · ${failed} failed` : 'Download queue complete', failed ? 'info' : 'success');
        setNativeDownloadQueue(null);
        setBulkDownloadProgress(null);
      } else {
        setNativeDownloadQueue({ ...nativeDownloadQueue, index: nextIndex, failed });
      }
    }
  }

  function cancelNativeDownloads() {
    const remaining = nativeDownloadQueue ? nativeDownloadQueue.items.length - nativeDownloadQueue.index : 0;
    setNativeDownloadQueue(null);
    setBulkDownloadProgress(null);
    if (remaining > 0) toast(`Download queue cancelled · ${remaining} not opened`, 'info');
  }

  function toggleSelect(mediaId: string) {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[mediaId]) delete next[mediaId];
      else next[mediaId] = true;
      return next;
    });
  }

  function enterSelection(mediaId: string) {
    setSelectMode(true);
    setSelectedIds((current) => ({ ...current, [mediaId]: true }));
    closeTrackSheet();
  }

  function clearSelection() {
    setSelectedIds({});
    setConfirmBulkDelete(false);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds({});
    setConfirmBulkDelete(false);
    setNewPlaylistPrompt(false);
  }

  function dropTargetKey(target: PlaylistDropTarget | null): string | null {
    if (!target) return null;
    return target.kind === 'new' ? 'new' : target.playlist.id;
  }

  function setDropHover(target: PlaylistDropTarget | null) {
    const key = dropTargetKey(target);
    if (hoveredDropKeyRef.current === key) return;
    hoveredDropKeyRef.current = key;
    setHoveredDropKey(key);
  }

  async function handlePlaylistTarget(target: PlaylistDropTarget) {
    const ids = Object.keys(selectedIds);
    if (ids.length === 0) return;
    if (target.kind === 'new') {
      setNewPlaylistPrompt(true);
      return;
    }
    try {
      await addPlaylistItems(target.playlist.id, ids);
      toast(`Added ${ids.length} track${ids.length === 1 ? '' : 's'} to “${target.playlist.name}”`, 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't add every selected track."), 'error');
    }
  }

  function beginPlaylistDrag(mediaId: string, absoluteX: number, absoluteY: number) {
    if (!selectedIds[mediaId]) return;
    setDraggingMediaId(mediaId);
    dragPosition.setValue({ x: absoluteX - 34, y: absoluteY - 34 });
    dragVisibility.stopAnimation();
    if (reduceMotion) dragVisibility.setValue(1);
    else {
      dragVisibility.setValue(0);
      Animated.spring(dragVisibility, { toValue: 1, speed: 24, bounciness: 5, useNativeDriver: true }).start();
    }
    void playlistDropStripRef.current?.measureTargets();
  }

  function movePlaylistDrag(absoluteX: number, absoluteY: number) {
    dragPosition.setValue({ x: absoluteX - 34, y: absoluteY - 34 });
    setDropHover(playlistDropStripRef.current?.hitTest(absoluteX, absoluteY) ?? null);
  }

  function endPlaylistDrag(absoluteX: number, absoluteY: number, cancelled: boolean) {
    const target = cancelled ? null : playlistDropStripRef.current?.hitTest(absoluteX, absoluteY) ?? null;
    setDropHover(null);
    dragVisibility.stopAnimation();
    Animated.timing(dragVisibility, { toValue: 0, duration: reduceMotion ? 0 : 140, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setDraggingMediaId(null);
    });
    if (target) void handlePlaylistTarget(target);
  }

  // A newly opened (or closed) sheet always starts with the delete un-armed.
  useEffect(() => {
    setConfirmDelete(false);
  }, [sheetMedia]);

  async function handleDeleteSelected() {
    const ids = Object.keys(selectedIds);
    if (ids.length === 0) return;
    if (!confirmBulkDelete) {
      // First tap arms the button; the second actually deletes.
      setConfirmBulkDelete(true);
      return;
    }
    setConfirmBulkDelete(false);
    const failedIds: string[] = [];
    let removedCount = 0;
    for (const id of ids) {
      try {
        await removeFromLibraryViews(id);
        removedCount += 1;
      } catch {
        failedIds.push(id);
      }
    }
    if (failedIds.length === 0) {
      toast(`Removed ${removedCount} track${removedCount === 1 ? '' : 's'}`, 'success');
      exitSelectMode();
      return;
    }
    setSelectedIds(Object.fromEntries(failedIds.map((id) => [id, true])));
    setSelectMode(true);
    toast(
      `Removed ${removedCount}; ${failedIds.length} failed and remain selected. Retry delete when you're ready.`,
      'error',
    );
  }

  const unnamedCount = useMemo(
    () =>
      canonicalItems.filter(
        (m) => m.media_type === 'audio' && !m.recognized_title && looksLikeGarbageTitle(m.title),
      ).length,
    [canonicalItems],
  );
  const selectedCount = Object.keys(selectedIds).length;
  const allVisibleSelected = visible.length > 0 && visible.every((media) => selectedIds[media.id]);
  const selectedMedia = useMemo(
    () => items.filter((media) => selectedIds[media.id]),
    [items, selectedIds],
  );
  const activeAdvancedChips = useMemo(
    () => activeLibraryFilterChips(advancedFilters, playlists),
    [advancedFilters, playlists],
  );
  const advancedFilterCount = libraryFilterCount(advancedFilters);

  function selectAllVisible() {
    if (allVisibleSelected) {
      clearSelection();
      return;
    }
    setSelectedIds(Object.fromEntries(visible.map((media) => [media.id, true as const])));
  }

  function clearAdvancedFilter(chip: ActiveFilterChip) {
    setAdvancedFilters((current) => ({
      ...current,
      [chip.key]: EMPTY_LIBRARY_FILTERS[chip.key],
    }));
  }

  // Grid geometry: 2 columns on phones, as many ~220px cards as fit on desktop.
  const containerWidth = isDesktop
    ? Math.min(width - RAIL_WIDTH, LIBRARY_MAX_WIDTH) - spacing.xl * 2
    : width - spacing.lg * 2;
  const columns = view === 'grid' ? (isDesktop ? Math.max(3, Math.floor(containerWidth / 224)) : 2) : 1;
  const cellSize = (containerWidth - spacing.md * (columns - 1)) / columns;
  const hasActiveFilters = !!query || advancedFilterCount > 0 || !!categoryFilter || !!genreFilter || !!yearFilter || remixFilter !== 'all' || tab === 'favorites';
  // The bar includes safe-area padding and can grow with font scaling. Measure
  // its rendered height so the absolutely positioned player clears it exactly.
  // MiniPlayerBar already clears the mobile dock itself, so do not count that
  // shared dock padding a second time when lifting it above this bar.
  const bulkBarOffset = selectMode
    ? Math.max(bulkBarHeight - dockClearance, insets.bottom + spacing.xxxl)
    : 0;

  useEffect(() => {
    setBottomOverlayOffset(isFocused ? bulkBarOffset : 0);
    return () => setBottomOverlayOffset(0);
  }, [bulkBarOffset, isFocused, setBottomOverlayOffset]);

  function resetFilters() {
    setQuery('');
    setAdvancedFilters(EMPTY_LIBRARY_FILTERS);
    setCategoryFilter(null);
    setGenreFilter(null);
    setYearFilter(null);
    setRemixFilter('all');
    if (tab === 'favorites') setTab('all');
  }

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={LIBRARY_MAX_WIDTH}>
        <Reveal>
          <View style={[styles.archiveMasthead, selectMode && styles.archiveMastheadSelection]}>
          {selectMode ? (
            <View style={styles.selectionContext}>
              <View style={styles.selectionTopRow}>
                <Pressable
                  onPress={exitSelectMode}
                  accessibilityRole="button"
                  accessibilityLabel="Exit selection mode"
                  style={styles.selectionClose}
                >
                  <Ionicons name="close" size={20} color={colors.textPrimary} />
                </Pressable>
                <View style={styles.selectionTitleWrap}>
                  <Text style={styles.selectionEyebrow}>ARCHIVE SELECTION</Text>
                  <Text accessibilityRole="header" style={styles.selectionTitle}>
                    {selectedCount} selected
                  </Text>
                  <Text style={styles.selectionSubtitle}>Shape a set, then move, save, or clear it below.</Text>
                </View>
                <View style={styles.selectionHeaderActions}>
                  <Pressable onPress={selectAllVisible} style={styles.selectionHeaderButton}>
                    <Text style={styles.selectionHeaderLabel}>{allVisibleSelected ? 'Unselect all' : 'Select all'}</Text>
                  </Pressable>
                  <Pressable onPress={clearSelection} disabled={selectedCount === 0} style={styles.selectionHeaderButton}>
                    <Text style={[styles.selectionHeaderLabel, selectedCount === 0 && styles.disabledLabel]}>Clear</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>YOUR MUSIC</Text>
                <Text accessibilityRole="header" style={styles.megaTitle}>Library</Text>
                <Text style={styles.librarySummary}>
                  {canonicalItems.length === 0
                    ? 'A private archive for every sound you bring into the hollow.'
                    : `${canonicalItems.length} ${canonicalItems.length === 1 ? 'piece' : 'pieces'} in the archive  ·  ${Object.keys(offlineIds).length} offline  ·  ${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}`}
                </Text>
              </View>
              <SidebarTrigger />
            </View>
          )}
          <View style={styles.mastheadRule}>
            <View style={styles.mastheadRuleGlow} />
          </View>
          </View>
        </Reveal>

        <LibraryFreshnessBanner
          stale={canonicalStale}
          lastUpdatedAt={canonicalLastUpdatedAt}
          refreshing={canonicalLoading}
          onRetry={() => void refreshScreenLibrary()}
        />

        {filterError && hasServerFilters ? (
          <View style={styles.filterError} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
            <View style={styles.filterErrorCopy}>
              <Text style={styles.filterErrorTitle}>Results couldn’t be updated</Text>
              <Text style={styles.filterErrorDetail}>{filterError} Your last results are still shown.</Text>
            </View>
            <Pressable
              onPress={() => void refreshFilteredNow()}
              disabled={filterLoading}
              accessibilityRole="button"
              accessibilityLabel="Retry library search"
              style={styles.filterRetry}
            >
              {filterLoading ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="refresh" size={16} color={colors.cyan} />}
              <Text style={styles.filterRetryLabel}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {selectMode ? (
          <Reveal delay={70}>
            <View style={[styles.commandDeck, styles.selectionDeck, glassBlur]}>
              <PlaylistDropStrip
                ref={playlistDropStripRef}
                playlists={playlists}
                selectedCount={selectedCount}
                hoveredKey={hoveredDropKey}
                onPick={(target) => void handlePlaylistTarget(target)}
              />
            </View>
          </Reveal>
        ) : (
        <Reveal delay={70}>
        <View style={[styles.commandDeck, glassBlur]}>
        <View style={styles.commandPrimary}>
        <View style={styles.searchCapsule}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search title or artist"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.cyan}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
          <TabChipRow
            options={TABS.map((item) => ({ value: item.key, label: item.label }))}
            value={tab}
            onChange={(nextTab) => {
              setTab(nextTab);
              setCategoryFilter(null);
              if (nextTab === 'audio' || nextTab === 'video') {
                setAdvancedFilters((current) => ({ ...current, mediaType: null }));
              }
              if (nextTab === 'favorites') {
                setAdvancedFilters((current) => ({ ...current, favorite: null }));
              }
            }}
          />
        </View>

        <View style={styles.commandDivider} />
        <View style={styles.controlsRow}>
          {tab !== 'playlists' && !(tab === 'categories' && !categoryFilter) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
              {tab === 'categories' && categoryFilter ? (
                <Pressable
                  onPress={() => setCategoryFilter(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Back to all smart categories"
                  style={[styles.toolChip, styles.toolChipActive]}
                >
                  <Ionicons name="chevron-back" size={13} color={colors.cyan} />
                  <Text style={styles.toolLabel}>
                    {MEDIA_CATEGORIES.find((category) => category.id === categoryFilter)?.label ?? 'Categories'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setFilterSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Advanced filters${advancedFilterCount ? `, ${advancedFilterCount} active` : ''}`}
                style={[styles.toolChip, advancedFilterCount > 0 && styles.toolChipActive]}
              >
                <Ionicons name="options" size={13} color={advancedFilterCount > 0 ? colors.cyan : colors.textSecondary} />
                <Text style={[styles.toolLabel, advancedFilterCount > 0 && { color: colors.cyan }]}>Filters</Text>
                {advancedFilterCount > 0 && <Text style={styles.filterCount}>{advancedFilterCount}</Text>}
              </Pressable>
              {(unnamedCount > 0 || naming) && (
                <Pressable
                  onPress={handleFixNames}
                  disabled={naming}
                  accessibilityRole="button"
                  accessibilityLabel={naming ? 'Naming tracks' : `Fix ${unnamedCount} track names`}
                  style={[styles.toolChip, styles.fixNamesChip]}
                >
                  {naming ? (
                    <ActivityIndicator size="small" color={colors.cyan} />
                  ) : (
                    <Ionicons name="sparkles" size={13} color={colors.cyan} />
                  )}
                  <Text style={[styles.toolLabel, { color: colors.cyan }]}>
                    {naming && namingProgress
                      ? `Named ${namingProgress.matched} of ${namingProgress.total}`
                      : naming
                        ? 'Naming…'
                        : `Fix ${unnamedCount} name${unnamedCount === 1 ? '' : 's'}`}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setSort(SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length])}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${SORT_LABEL[sort]}. Tap for next sort option`}
                style={styles.toolChip}
              >
                <Ionicons name="swap-vertical" size={13} color={colors.textSecondary} />
                <Text style={styles.toolLabel}>Sort: {SORT_LABEL[sort]}</Text>
              </Pressable>
              {genres.length > 0 && (
                <Pressable onPress={cycleGenre} accessibilityRole="button" accessibilityLabel={`Genre filter: ${genreFilter ?? 'all'}`} style={[styles.toolChip, !!genreFilter && styles.toolChipActive]}>
                  <Text numberOfLines={1} style={styles.toolLabel}>{genreFilter ?? 'All genres'}</Text>
                </Pressable>
              )}
              {years.length > 0 && (
                <Pressable onPress={cycleYear} accessibilityRole="button" accessibilityLabel={`Year filter: ${yearFilter ?? 'all'}`} style={[styles.toolChip, !!yearFilter && styles.toolChipActive]}>
                  <Text style={styles.toolLabel}>{yearFilter ?? 'All years'}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setRemixFilter(remixFilter === 'all' ? 'original' : remixFilter === 'original' ? 'remix' : 'all')}
                accessibilityRole="button"
                accessibilityLabel={`Mix filter: ${remixFilter}`}
                style={[styles.toolChip, remixFilter !== 'all' && styles.toolChipActive]}
              >
                <Text style={styles.toolLabel}>{remixFilter === 'all' ? 'All mixes' : remixFilter === 'remix' ? 'Remixes' : 'Originals'}</Text>
              </Pressable>
              <Pressable onPress={() => setView(view === 'grid' ? 'list' : 'grid')} accessibilityLabel={`Switch to ${view === 'grid' ? 'list' : 'grid'} view`} style={styles.toolChip}>
                <Ionicons name={view === 'grid' ? 'list' : 'grid'} size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                accessibilityRole="button"
                accessibilityLabel={selectMode ? 'Exit selection mode' : 'Select tracks'}
                style={[styles.toolChip, selectMode && styles.toolChipActive]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={14}
                  color={selectMode ? colors.cyan : colors.textSecondary}
                />
              </Pressable>
              {visible.length > 0 && (
                <Pressable
                  onPress={() => handleDownloadMany(visible)}
                  disabled={bulkDownloading}
                  accessibilityRole="button"
                  accessibilityLabel={bulkDownloading ? 'Downloading visible items' : 'Download visible items'}
                  style={[styles.toolChip, bulkDownloading && { opacity: 0.6 }]}
                >
                  {bulkDownloading ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Ionicons name="cloud-download-outline" size={14} color={colors.textSecondary} />
                  )}
                  <Text style={styles.toolLabel}>
                    {bulkDownloadProgress
                      ? `${bulkDownloadProgress.done}/${bulkDownloadProgress.total}`
                      : 'Download all'}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          )}
          {activeAdvancedChips.length > 0 && (
            <View style={styles.annotationBand}>
            <Text style={styles.annotationLabel}>ACTIVE NOTES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilterRow}>
              {activeAdvancedChips.map((chip) => (
                <Pressable
                  key={chip.key}
                  onPress={() => clearAdvancedFilter(chip)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove filter ${chip.label}`}
                  style={styles.activeFilterChip}
                >
                  <Text numberOfLines={1} style={styles.activeFilterLabel}>{chip.label}</Text>
                  <Ionicons name="close" size={13} color={colors.cyan} />
                </Pressable>
              ))}
              <Pressable onPress={() => setAdvancedFilters(EMPTY_LIBRARY_FILTERS)} style={styles.resetFiltersChip}>
                <Text style={styles.resetFiltersLabel}>Reset</Text>
              </Pressable>
            </ScrollView>
            </View>
          )}
        </View>
        </View>
        </Reveal>
        )}

        {tab === 'playlists' ? (
          <PlaylistsPane
            playlists={playlists.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))}
            onOpen={setPlaylistDetailId}
          />
        ) : tab === 'categories' && !categoryFilter ? (
          <SmartCategoriesPane
            items={items}
            bottomClearance={bottomChromeClearance}
            onSelect={setCategoryFilter}
            onNameTracks={() => void handleFixNames()}
            onReturnAll={() => setTab('all')}
          />
        ) : isLoading && visible.length === 0 ? (
          <SkeletonGrid columns={columns} cellSize={cellSize} view={view} />
        ) : (
          <Reveal key={`${view}-${columns}`} style={styles.listReveal} distance={6}>
            <FlatList
              key={`${view}-${columns}`}
              style={styles.list}
              data={visible}
              keyExtractor={(item) => item.id}
              numColumns={columns}
              refreshing={isLoading}
              onRefresh={() => void refreshScreenLibrary()}
              showsVerticalScrollIndicator={false}
              // A 100+ item library rendered all at once is real jank in the
              // WebView — window it so offscreen cards don't exist in the DOM.
              windowSize={7}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              removeClippedSubviews
              columnWrapperStyle={view === 'grid' ? styles.gridRow : undefined}
              contentContainerStyle={[
                styles.listContent,
                view === 'list' && styles.listContentRows,
                { paddingBottom: bottomChromeClearance },
                visible.length === 0 && styles.emptyListContent,
              ]}
              ListEmptyComponent={
                <EmptyState
                  icon={hasActiveFilters ? 'search-outline' : 'albums-outline'}
                  title={hasActiveFilters ? 'Nothing matches' : 'Your library is ready'}
                  subtitle={
                    hasActiveFilters
                      ? 'Try a broader search or clear the active filters.'
                      : 'Save a link or identify a song to start your collection.'
                  }
                  actionLabel={hasActiveFilters ? 'Clear filters' : 'Add your first track'}
                  onAction={hasActiveFilters ? resetFilters : () => navigation.navigate('Main', { screen: 'Home' })}
                />
              }
              renderItem={({ item }) =>
                view === 'grid' ? (
                  <GridCard
                    media={item}
                    size={cellSize}
                    favorite={!!favoriteIds[item.id]}
                    selectMode={selectMode}
                    selected={!!selectedIds[item.id]}
                    active={currentMedia?.id === item.id}
                    onPress={() => (selectMode ? toggleSelect(item.id) : handlePlay(item))}
                    onLongPress={() => {
                      if (!selectMode) enterSelection(item.id);
                      else if (!selectedIds[item.id]) toggleSelect(item.id);
                    }}
                    onMenuPress={(event) => openTrackSheet(item, event)}
                    dragEnabled={selectMode && !!selectedIds[item.id]}
                    onDragStart={(x, y) => beginPlaylistDrag(item.id, x, y)}
                    onDragMove={movePlaylistDrag}
                    onDragEnd={endPlaylistDrag}
                  />
                ) : (
                  <ListRow
                    media={item}
                    favorite={!!favoriteIds[item.id]}
                    selectMode={selectMode}
                    selected={!!selectedIds[item.id]}
                    active={currentMedia?.id === item.id}
                    compact={!isDesktop || width < 860}
                    onPress={() => (selectMode ? toggleSelect(item.id) : handlePlay(item))}
                    onLongPress={() => {
                      if (!selectMode) enterSelection(item.id);
                      else if (!selectedIds[item.id]) toggleSelect(item.id);
                    }}
                    onMenuPress={(event) => openTrackSheet(item, event)}
                    dragEnabled={selectMode && !!selectedIds[item.id]}
                    onDragStart={(x, y) => beginPlaylistDrag(item.id, x, y)}
                    onDragMove={movePlaylistDrag}
                    onDragEnd={endPlaylistDrag}
                  />
                )
              }
            />
          </Reveal>
        )}
      </ScreenContainer>

      {draggingMediaId && selectedMedia.length > 0 && (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.dragCluster,
            {
              opacity: dragVisibility,
              transform: [
                ...dragPosition.getTranslateTransform(),
                { scale: dragVisibility.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
              ],
            },
          ]}
        >
          {selectedMedia.slice(0, 3).reverse().map((media, index) => (
            <View
              key={media.id}
              style={[
                styles.dragArtwork,
                {
                  left: index * 4,
                  top: (2 - index) * 3,
                  transform: [{ rotate: `${(index - 1) * 5}deg` }],
                },
              ]}
            >
              <Artwork media={media} size={58} borderRadius={radii.md} />
            </View>
          ))}
          <View style={styles.dragCountBadge}>
            <Text style={styles.dragCountLabel}>{selectedCount}</Text>
          </View>
        </Animated.View>
      )}

      {selectMode && (
        <View
          testID="library-bulk-bar"
          onLayout={(event) => setBulkBarHeight(Math.ceil(event.nativeEvent.layout.height))}
          style={[
            styles.bulkBar,
            { paddingBottom: insets.bottom + spacing.sm + dockClearance },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bulkActions}
            accessibilityLabel="Selected track actions"
          >
            <Pressable onPress={exitSelectMode} style={styles.bulkButton}>
              <Text style={styles.bulkButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const ids = Object.keys(selectedIds);
                if (ids.length === 0) return;
                setPlaylistPickTarget({ ids, label: `${ids.length} track${ids.length === 1 ? '' : 's'}` });
              }}
              disabled={selectedCount === 0}
              style={[styles.bulkButton, selectedCount === 0 && { opacity: 0.4 }]}
            >
              <Ionicons name="list" size={15} color={colors.textSecondary} />
              <Text style={styles.bulkButtonLabel}>Move to playlist</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDownloadMany(visible.filter((m) => selectedIds[m.id]))}
              disabled={selectedCount === 0 || bulkDownloading}
              style={[styles.bulkButton, selectedCount === 0 && { opacity: 0.4 }]}
            >
              {bulkDownloading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Ionicons name="cloud-download-outline" size={15} color={colors.textSecondary} />
              )}
              <Text style={styles.bulkButtonLabel}>
                {bulkDownloadProgress ? `${bulkDownloadProgress.done}/${bulkDownloadProgress.total}` : 'Download'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDeleteSelected}
              disabled={selectedCount === 0}
              style={[styles.bulkButton, styles.bulkButtonDanger, selectedCount === 0 && { opacity: 0.4 }]}
            >
              <Ionicons name={confirmBulkDelete ? 'alert-circle' : 'trash-outline'} size={15} color={colors.danger} />
              <Text style={[styles.bulkButtonLabel, { color: colors.danger }]}>
                {confirmBulkDelete ? 'Sure? Tap again' : 'Delete'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      )}
      <MiniPlayerBar />

      {/* Track actions sheet */}
      <CompactGlassSheet
        visible={!!sheetMedia}
        onClose={closeTrackSheet}
        accessibilityLabel={sheetMedia ? `Actions for ${displayTitle(sheetMedia)}` : 'Track actions'}
        closeAccessibilityLabel="Close track actions"
        maxWidth={460}
        maxHeightRatio={0.82}
        anchor={sheetAnchor}
        scrollable
        header={sheetMedia ? (
          <View style={styles.sheetHeader}>
            <Artwork media={sheetMedia} size={52} borderRadius={radii.sm} />
            <View style={styles.sheetHeaderText}>
              <Text numberOfLines={1} style={styles.sheetTitle}>{displayTitle(sheetMedia)}</Text>
              <Text numberOfLines={1} style={styles.sheetSub}>
                {displayArtist(sheetMedia)} · {sheetMedia.media_type} · {formatDuration(sheetMedia.duration_seconds)}
              </Text>
              {metadataLine(sheetMedia) ? (
                <Text numberOfLines={1} style={[styles.sheetSub, { color: colors.cyan }]}>
                  {metadataLine(sheetMedia)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      >
        {sheetMedia && (
          <TrackActionList
            context={{
              media: sheetMedia,
              favorite: !!favoriteIds[sheetMedia.id],
              pinned: pinnedIds.includes(sheetMedia.id),
              pinLimitReached: pinnedIds.length >= MAX_PINS,
              maxPins: MAX_PINS,
              offlineSaved: !!offlineIds[sheetMedia.id],
              confirmDelete,
              onPlay: () => { closeTrackSheet(); void handlePlay(sheetMedia); },
              onPlayNext: () => { playNextInQueue(sheetMedia); closeTrackSheet(); toast('Playing next', 'success'); },
              onAddToQueue: () => { addToQueue(sheetMedia); closeTrackSheet(); toast('Added to queue', 'success'); },
              onToggleFavorite: () => toggleFavorite(sheetMedia.id),
              onTogglePin: () => togglePin(sheetMedia.id),
              onAddToPlaylist: () => {
                setPlaylistPickTarget({ ids: [sheetMedia.id], label: displayTitle(sheetMedia) });
                closeTrackSheet();
              },
              onMoreByArtist: () => { setQuery(displayArtist(sheetMedia)); setTab('all'); closeTrackSheet(); },
              onEdit: () => { setEditMedia(sheetMedia); closeTrackSheet(); },
              onSelectMultiple: () => enterSelection(sheetMedia.id),
              onSaveFile: () => void handleSaveFile(sheetMedia),
              onToggleOffline: offlineMedia.isSupported() && sheetMedia.media_type === 'audio'
                ? () => void handleToggleOffline(sheetMedia)
                : undefined,
              onDelete: () => (confirmDelete ? void handleDelete(sheetMedia) : setConfirmDelete(true)),
            }}
          />
        )}
      </CompactGlassSheet>

      {editMedia && (
        <EditMediaModal
          media={editMedia}
          onClose={() => setEditMedia(null)}
          onSaved={(updated) => {
            upsertInLibraryViews(updated);
            setEditMedia(null);
            if (hasServerFilters) void refreshFilteredNow();
            toast('Details saved', 'success');
          }}
        />
      )}

      {playlistPickTarget && (
        <PlaylistPickerModal
          mediaIds={playlistPickTarget.ids}
          label={playlistPickTarget.label}
          onClose={() => setPlaylistPickTarget(null)}
          onDone={() => {
            setPlaylistPickTarget(null);
            if (selectMode) exitSelectMode();
          }}
        />
      )}

      {newPlaylistPrompt && (
        <NewPlaylistWithItemsModal
          mediaIds={Object.keys(selectedIds)}
          onClose={() => setNewPlaylistPrompt(false)}
          onDone={() => {
            setNewPlaylistPrompt(false);
            exitSelectMode();
          }}
        />
      )}

      <CompactGlassSheet
        visible={!!nativeDownloadQueue}
        onClose={cancelNativeDownloads}
        accessibilityLabel="Managed download queue"
        closeAccessibilityLabel="Cancel download queue"
        maxWidth={460}
        header={
          <View>
            <Text style={styles.sheetTitle}>Download queue</Text>
            <Text style={styles.sheetSub}>
              {nativeDownloadQueue
                ? `${nativeDownloadQueue.index} of ${nativeDownloadQueue.items.length} opened · ${nativeDownloadQueue.items.length - nativeDownloadQueue.index} remaining`
                : ''}
            </Text>
          </View>
        }
      >
        {nativeDownloadQueue ? (
          <View style={styles.nativeQueueBody}>
            <View style={styles.nativeQueueNotice}>
              <Ionicons name="phone-portrait-outline" size={20} color={colors.warning} />
              <Text style={styles.nativeQueueNoticeText}>
                Native managed storage is not installed yet. Star Hollow will open one system download at a time, only when you approve it here.
              </Text>
            </View>
            <View style={styles.nativeQueueTrack}>
              <Artwork media={nativeDownloadQueue.items[nativeDownloadQueue.index]} size={48} borderRadius={radii.sm} />
              <View style={styles.sheetHeaderText}>
                <Text numberOfLines={1} style={styles.sheetTitle}>{displayTitle(nativeDownloadQueue.items[nativeDownloadQueue.index])}</Text>
                <Text style={styles.sheetSub}>Next in queue</Text>
              </View>
            </View>
            <View style={styles.nativeQueueActions}>
              <Pressable onPress={cancelNativeDownloads} style={styles.nativeQueueCancel} accessibilityRole="button">
                <Text style={styles.bulkButtonLabel}>Cancel queue</Text>
              </Pressable>
              <Pressable onPress={() => void openNextNativeDownload()} disabled={bulkDownloading} style={styles.nativeQueueNext} accessibilityRole="button">
                {bulkDownloading ? <ActivityIndicator size="small" color={colors.textInverse} /> : <Ionicons name="open-outline" size={17} color={colors.textInverse} />}
                <Text style={styles.nativeQueueNextLabel}>Open next</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </CompactGlassSheet>

      <LibraryFilterSheet
        visible={filterSheetOpen}
        value={advancedFilters}
        playlists={playlists}
        onClose={() => setFilterSheetOpen(false)}
        onApply={(filters) => {
          setAdvancedFilters(filters);
          // Advanced media/favorite choices are explicit and should not be
          // silently overridden by the legacy quick tabs.
          if (filters.mediaType || filters.favorite != null) setTab('all');
        }}
      />

      {playlistDetailId && (
        <PlaylistDetailModal
          playlistId={playlistDetailId}
          onClose={() => setPlaylistDetailId(null)}
          onPlayAll={async (list) => {
            setPlaylistDetailId(null);
            if (list.items.length) {
              await playQueue(list.items, 0);
              navigation.navigate('Player');
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  archiveMasthead: {
    position: 'relative',
    minHeight: 122,
    justifyContent: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
  },
  archiveMastheadSelection: { minHeight: 122 },
  mastheadRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(158,181,170,0.14)',
  },
  mastheadRuleGlow: { width: '28%', minWidth: 92, height: 1, backgroundColor: colors.cyan, opacity: 0.86 },
  headerRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.cyan, marginBottom: spacing.xs },
  megaTitle: { ...typography.mega, color: colors.textPrimary },
  librarySummary: { ...typography.caption, maxWidth: 680, color: colors.textMuted, marginTop: spacing.xs },
  filterError: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: glass.fillHeavy,
  },
  filterErrorCopy: { flex: 1, minWidth: 180 },
  filterErrorTitle: { ...typography.subtitle, fontSize: 13, color: colors.textPrimary },
  filterErrorDetail: { ...typography.caption, color: colors.textMuted },
  filterRetry: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: glass.fillBright,
  },
  filterRetryLabel: { ...typography.subtitle, fontSize: 12, color: colors.cyan },
  nativeQueueBody: { gap: spacing.md },
  nativeQueueNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: glass.fillDeep },
  nativeQueueNoticeText: { ...typography.body, flex: 1, fontSize: 13, color: colors.textSecondary },
  nativeQueueTrack: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radii.md, backgroundColor: glass.fill },
  nativeQueueActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  nativeQueueCancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.md, backgroundColor: glass.fill },
  nativeQueueNext: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.lg, borderRadius: radii.md, backgroundColor: colors.cyan },
  nativeQueueNextLabel: { ...typography.subtitle, fontSize: 13, color: colors.textInverse },
  selectionContext: {
    width: '100%',
    justifyContent: 'center',
  },
  selectionTopRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  selectionClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: glass.fillDeep,
  },
  selectionTitleWrap: { flex: 1, minWidth: 150 },
  selectionEyebrow: { ...typography.eyebrow, marginBottom: 2, color: colors.cyan },
  selectionTitle: { ...typography.screenTitle, fontSize: 30, lineHeight: 36, color: colors.textPrimary },
  selectionSubtitle: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  selectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  selectionHeaderButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: glass.fill,
  },
  selectionHeaderLabel: { ...typography.caption, color: colors.cyan },
  disabledLabel: { color: colors.textMuted, opacity: 0.5 },
  commandDeck: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.sm,
    overflow: 'hidden',
    borderRadius: radii.hero,
    borderWidth: 1,
    borderColor: glass.strokeStrong,
    backgroundColor: glass.fillHeavy,
    ...shadows.low,
  },
  selectionDeck: {
    minHeight: 104,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderColor: glass.tintPrimaryStroke,
    backgroundColor: 'rgba(18,55,49,0.32)',
  },
  commandPrimary: {
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(8,18,28,0.34)',
  },
  commandDivider: { height: 1, marginHorizontal: spacing.xs, backgroundColor: 'rgba(158,181,170,0.12)' },
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: { ...typography.body, flex: 1, color: colors.textPrimary, paddingVertical: 0 },
  controlsRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  tabRow: { flexDirection: 'row', gap: 6, paddingRight: spacing.lg },
  tabChip: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radii.pill,
    backgroundColor: glass.fill,
  },
  tabChipActive: { backgroundColor: glass.tintPrimary },
  tabLabel: { ...typography.caption, color: colors.textMuted },
  tabLabelActive: { color: colors.cyan, fontFamily: 'Sora_500Medium' },
  toolRow: { flexDirection: 'row', gap: 6, paddingRight: spacing.lg },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(9,20,29,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(158,181,170,0.08)',
  },
  toolLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
  toolChipActive: { backgroundColor: glass.tintPrimary },
  filterCount: {
    ...typography.caption,
    minWidth: 18,
    textAlign: 'center',
    fontSize: 10,
    color: colors.textInverse,
    backgroundColor: colors.cyan,
    borderRadius: radii.pill,
    paddingHorizontal: 4,
  },
  fixNamesChip: { backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  annotationBand: { gap: spacing.xs, paddingTop: spacing.xs },
  annotationLabel: { ...typography.eyebrow, fontSize: 9, letterSpacing: 1.25, color: colors.textMuted },
  activeFilterRow: { flexDirection: 'row', gap: spacing.xs, paddingRight: spacing.lg },
  activeFilterChip: {
    minHeight: 32,
    maxWidth: 210,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: glass.tintPrimary,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
  },
  activeFilterLabel: { ...typography.caption, fontSize: 11, color: colors.cyan },
  resetFiltersChip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.sm },
  resetFiltersLabel: { ...typography.caption, fontSize: 11, color: colors.textSecondary },
  gridRow: { gap: spacing.md },
  listReveal: { flex: 1 },
  list: { flex: 1 },
  listContent: { gap: spacing.md },
  listContentRows: {
    gap: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(158,181,170,0.12)',
    borderRadius: radii.lg,
    backgroundColor: 'rgba(4,12,20,0.24)',
  },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
  dragCluster: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 72,
    height: 72,
    zIndex: 100,
    elevation: 20,
  },
  dragArtwork: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  dragCountBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
  },
  dragCountLabel: { ...typography.caption, fontFamily: 'Sora_700Bold', color: colors.textInverse },
  bulkBar: {
    position: 'relative',
    zIndex: 30,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(12,38,35,0.94)',
    borderTopWidth: 1,
    borderTopColor: glass.tintPrimaryStroke,
    shadowColor: colors.cyan,
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: 18,
  },
  bulkActions: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: glass.fillDeep,
  },
  bulkButtonDanger: { backgroundColor: glass.tintDanger },
  bulkButtonLabel: { ...typography.caption, fontSize: 13, color: colors.textPrimary },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetHeaderText: { flex: 1 },
  sheetTitle: { ...typography.subtitle, color: colors.textPrimary },
  sheetSub: { ...typography.caption, color: colors.textMuted },
});
