import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
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
  PlaylistDetailModal,
  PlaylistPickerModal,
  PlaylistsPane,
  SheetAction,
} from '../components/library/LibrarySheets';
import { RAIL_WIDTH, useResponsive } from '../hooks/useResponsive';
import { EmptyState } from '../components/ui/EmptyState';
import { Artwork } from '../components/ui/Artwork';
import { Reveal } from '../components/ui/Reveal';
import { tokenStorage } from '../services/storage/tokenStorage';
import { PressableScale } from '../components/ui/PressableScale';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import * as libraryApi from '../services/api/library';
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
import { toast } from '../store/toastStore';
import { apiErrorMessage } from '../utils/apiError';
import { colors, gradients, layout, radii, shadows, spacing, typography } from '../theme/tokens';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';

type Tab = 'all' | 'audio' | 'video' | 'favorites' | 'playlists';
type SortMode = 'newest' | 'title' | 'artist' | 'genre' | 'year' | 'longest';
type ViewMode = 'grid' | 'list';
type RemixFilter = 'all' | 'original' | 'remix';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'audio', label: 'Songs' },
  { key: 'video', label: 'Videos' },
  { key: 'favorites', label: 'Favorites' },
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
  const { width } = useWindowDimensions();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { items, isLoading, refresh, upsert, remove } = useLibraryStore();
  const playQueue = usePlayerStore((s) => s.playQueue);
  const playNextInQueue = usePlayerStore((s) => s.playNextInQueue);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const pinnedIds = usePinStore((s) => s.ids);
  const togglePin = usePinStore((s) => s.toggle);

  const playlists = usePlaylistStore((s) => s.playlists);
  const refreshPlaylists = usePlaylistStore((s) => s.refresh);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'all');

  // Sidebar's "Playlists" shortcut re-navigates here with a fresh `tab` param
  // even when this screen is already mounted — react to that, not just the
  // initial state above.
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);
  const [sort, setSort] = useState<SortMode>('newest');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [remixFilter, setRemixFilter] = useState<RemixFilter>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [sheetMedia, setSheetMedia] = useState<Media | null>(null);
  const [editMedia, setEditMedia] = useState<Media | null>(null);
  const [playlistDetailId, setPlaylistDetailId] = useState<string | null>(null);
  const [playlistPickTarget, setPlaylistPickTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [offlineIds, setOfflineIds] = useState<Record<string, boolean>>({});
  const [savingOffline, setSavingOffline] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, true>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [naming, setNaming] = useState(false);

  useEffect(() => {
    refresh();
    refreshPlaylists().catch(() => {});
    if (offlineMedia.isSupported()) {
      offlineMedia.listOffline().then((entries) => {
        setOfflineIds(Object.fromEntries(entries.map((e) => [e.id, true])));
      });
    }
  }, [refresh, refreshPlaylists]);

  useEffect(() => {
    const timeout = setTimeout(() => refresh(query || undefined), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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
  }, [items, tab, sort, favoriteIds, genreFilter, yearFilter, remixFilter]);

  function cycleGenre() {
    const index = genreFilter ? genres.indexOf(genreFilter) : -1;
    setGenreFilter(index >= genres.length - 1 ? null : genres[index + 1]);
  }

  function cycleYear() {
    const index = yearFilter ? years.indexOf(yearFilter) : -1;
    setYearFilter(index >= years.length - 1 ? null : years[index + 1]);
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
    setSheetMedia(null);
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
      setSheetMedia(null);
    }
  }

  // Native has no offline cache yet (offlineMedia is web-only, see its file
  // header) — the best "save to device" we can do there is trigger the OS's
  // own download/share sheet per file, one at a time so rapid Linking.openURL
  // calls don't fight each other. Capped since firing hundreds of native
  // download intents back-to-back isn't a real "download all" experience.
  const NATIVE_DOWNLOAD_CAP = 50;

  async function handleDownloadMany(mediaList: Media[]) {
    if (bulkDownloading || mediaList.length === 0) return;
    const webSupported = offlineMedia.isSupported();
    const targets = webSupported ? mediaList : mediaList.slice(0, NATIVE_DOWNLOAD_CAP);
    if (!webSupported && mediaList.length > NATIVE_DOWNLOAD_CAP) {
      toast(`Downloading the first ${NATIVE_DOWNLOAD_CAP} — run this again for the rest`, 'info');
    }

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
          if (webSupported) {
            if (!offlineIds[media.id]) {
              const url = token
                ? `${libraryApi.streamUrl(media.id)}?proxy=1&token=${encodeURIComponent(token)}`
                : `${libraryApi.streamUrl(media.id)}?proxy=1`;
              await offlineMedia.saveOffline(media, url);
              setOfflineIds((prev) => ({ ...prev, [media.id]: true }));
            }
          } else {
            const url = token
              ? `${libraryApi.streamUrl(media.id)}?token=${encodeURIComponent(token)}`
              : libraryApi.streamUrl(media.id);
            await Linking.openURL(url);
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
        } catch (err) {
          apiErrorMessage(err, "Couldn't download that track.");
          failed += 1;
        } finally {
          setBulkDownloadProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
        }
        return worker();
      };
      // Concurrent fetches are fine for the web cache path; native OS-intent
      // downloads run one at a time (see comment above).
      const concurrency = webSupported ? 3 : 1;
      await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));

      if (webSupported) {
        toast(
          failed > 0
            ? `Saved ${targets.length - failed} of ${targets.length} for offline playback`
            : `Saved ${targets.length} track${targets.length === 1 ? '' : 's'} for offline playback`,
          failed > 0 ? 'info' : 'success',
        );
      } else {
        toast(`Started ${targets.length} download${targets.length === 1 ? '' : 's'}`, 'success');
      }
    } finally {
      setBulkDownloading(false);
      setBulkDownloadProgress(null);
    }
  }

  async function handleDelete(media: Media) {
    setSheetMedia(null);
    setConfirmDelete(false);
    try {
      await remove(media.id);
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
      const jobs = await recognitionsApi.recognizeWholeLibrary();
      if (jobs.length === 0) {
        toast('Every track already has a name', 'success');
        setNaming(false);
        return;
      }
      toast(`Naming ${jobs.length} track${jobs.length === 1 ? '' : 's'}…`, 'info');
      let done = 0;
      let named = 0;
      jobs.forEach((job) => {
        const unsubscribe = watchJob(job.id, (update) => {
          if (update.status === 'complete' || update.status === 'failed' || update.status === 'cancelled') {
            done += 1;
            if (update.stage_label === 'matched') {
              named += 1;
              if (update.result_media) upsert(update.result_media);
            }
            unsubscribe();
            if (done === jobs.length) {
              setNaming(false);
              toast(`Named ${named} of ${jobs.length} tracks`, named > 0 ? 'success' : 'info');
            }
          }
        });
      });
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't start naming."), 'error');
      setNaming(false);
    }
  }

  function toggleSelect(mediaId: string) {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[mediaId]) delete next[mediaId];
      else next[mediaId] = true;
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds({});
    setConfirmBulkDelete(false);
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
    try {
      await Promise.all(ids.map((id) => remove(id)));
      toast(`Removed ${ids.length} track${ids.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't remove every selected track."), 'error');
    } finally {
      exitSelectMode();
    }
  }

  const unnamedCount = useMemo(
    () =>
      items.filter(
        (m) => m.media_type === 'audio' && !m.recognized_title && looksLikeGarbageTitle(m.title),
      ).length,
    [items],
  );

  // Grid geometry: 2 columns on phones, as many ~220px cards as fit on desktop.
  const containerWidth = isDesktop
    ? Math.min(width - RAIL_WIDTH, LIBRARY_MAX_WIDTH) - spacing.xl * 2
    : width - spacing.lg * 2;
  const columns = view === 'grid' ? (isDesktop ? Math.max(3, Math.floor(containerWidth / 224)) : 2) : 1;
  const cellSize = (containerWidth - spacing.md * (columns - 1)) / columns;
  const hasActiveFilters = !!query || !!genreFilter || !!yearFilter || remixFilter !== 'all' || tab === 'favorites';

  function resetFilters() {
    setQuery('');
    setGenreFilter(null);
    setYearFilter(null);
    setRemixFilter('all');
    if (tab === 'favorites') setTab('all');
  }

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={LIBRARY_MAX_WIDTH}>
        <Reveal>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>YOUR MUSIC</Text>
              <Text style={styles.megaTitle}>Library</Text>
              <Text style={styles.librarySummary}>
                {items.length === 0
                  ? 'A private collection, ready when you are.'
                  : `${items.length} item${items.length === 1 ? '' : 's'} · ${Object.keys(offlineIds).length} offline`}
              </Text>
            </View>
            <SidebarTrigger />
          </View>
        </Reveal>

        <Reveal delay={70}>
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
        </Reveal>

        <Reveal delay={120}>
        <View style={styles.controlsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
            accessibilityRole="tablist"
          >
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
                style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
              >
                <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {tab !== 'playlists' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
              {unnamedCount > 0 && (
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
                    {naming ? 'Naming…' : `Fix ${unnamedCount} name${unnamedCount === 1 ? '' : 's'}`}
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
        </View>
        </Reveal>

        {tab === 'playlists' ? (
          <PlaylistsPane
            playlists={playlists.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))}
            onOpen={setPlaylistDetailId}
          />
        ) : isLoading && visible.length === 0 ? (
          <SkeletonGrid columns={columns} cellSize={cellSize} view={view} />
        ) : (
        <FlatList
          key={`${view}-${columns}`}
          data={visible}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          refreshing={isLoading}
          onRefresh={() => refresh(query || undefined)}
          showsVerticalScrollIndicator={false}
          // A 100+ item library rendered all at once is real jank in the
          // WebView — window it so offscreen cards don't exist in the DOM.
          windowSize={7}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          columnWrapperStyle={view === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                title={hasActiveFilters ? 'Nothing matches' : 'Your library is ready'}
                subtitle={
                  hasActiveFilters
                    ? 'Try a broader search or clear the active filters.'
                    : 'Save a link or identify a song to start your collection.'
                }
              />
              <Pressable
                onPress={hasActiveFilters ? resetFilters : () => navigation.navigate('Main', { screen: 'Home' })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.emptyActionLabel}>{hasActiveFilters ? 'Clear filters' : 'Add your first track'}</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) =>
            view === 'grid' ? (
              <GridCard
                media={item}
                size={cellSize}
                favorite={!!favoriteIds[item.id]}
                selectMode={selectMode}
                selected={!!selectedIds[item.id]}
                onPress={() => (selectMode ? toggleSelect(item.id) : handlePlay(item))}
                onLongPress={() => (selectMode ? toggleSelect(item.id) : setSheetMedia(item))}
              />
            ) : (
              <ListRow
                media={item}
                favorite={!!favoriteIds[item.id]}
                selectMode={selectMode}
                selected={!!selectedIds[item.id]}
                onPress={() => (selectMode ? toggleSelect(item.id) : handlePlay(item))}
                onLongPress={() => (selectMode ? toggleSelect(item.id) : setSheetMedia(item))}
              />
            )
          }
        />
        )}
      </ScreenContainer>

      {selectMode && (
        <View style={[styles.bulkBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Text style={styles.bulkLabel}>
            {Object.keys(selectedIds).length === 0
              ? 'Tap items to select'
              : `${Object.keys(selectedIds).length} selected`}
          </Text>
          <View style={styles.bulkActions}>
            <Pressable onPress={exitSelectMode} style={styles.bulkButton}>
              <Text style={styles.bulkButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const ids = Object.keys(selectedIds);
                if (ids.length === 0) return;
                setPlaylistPickTarget({ ids, label: `${ids.length} track${ids.length === 1 ? '' : 's'}` });
              }}
              disabled={Object.keys(selectedIds).length === 0}
              style={[styles.bulkButton, Object.keys(selectedIds).length === 0 && { opacity: 0.4 }]}
            >
              <Ionicons name="list" size={15} color={colors.textSecondary} />
              <Text style={styles.bulkButtonLabel}>Move to playlist</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDownloadMany(visible.filter((m) => selectedIds[m.id]))}
              disabled={Object.keys(selectedIds).length === 0 || bulkDownloading}
              style={[styles.bulkButton, Object.keys(selectedIds).length === 0 && { opacity: 0.4 }]}
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
              disabled={Object.keys(selectedIds).length === 0}
              style={[styles.bulkButton, styles.bulkButtonDanger, Object.keys(selectedIds).length === 0 && { opacity: 0.4 }]}
            >
              <Ionicons name={confirmBulkDelete ? 'alert-circle' : 'trash-outline'} size={15} color={colors.danger} />
              <Text style={[styles.bulkButtonLabel, { color: colors.danger }]}>
                {confirmBulkDelete ? 'Sure? Tap again' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      <MiniPlayerBar />

      {/* Track actions sheet */}
      <Modal visible={!!sheetMedia} transparent animationType="fade" onRequestClose={() => setSheetMedia(null)}>
        {sheetMedia && (
          <View style={[styles.modalRoot, isDesktop && styles.modalRootDesktop]}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSheetMedia(null)} />
            <View style={[styles.sheet, isDesktop && styles.sheetDesktop, { paddingBottom: insets.bottom + spacing.lg }]}>
              {!isDesktop && <View style={styles.sheetHandle} />}
              <View style={styles.sheetHeader}>
                <Artwork media={sheetMedia} size={52} borderRadius={radii.sm} />
                <View style={styles.sheetHeaderText}>
                  <Text numberOfLines={1} style={styles.sheetTitle}>{displayTitle(sheetMedia)}</Text>
                  <Text numberOfLines={1} style={styles.sheetSub}>
                    {displayArtist(sheetMedia)} · {sheetMedia.media_type} · {formatDuration(sheetMedia.duration_seconds)}
                  </Text>
                  {metadataLine(sheetMedia) && (
                    <Text numberOfLines={1} style={[styles.sheetSub, { color: colors.cyan }]}>
                      {metadataLine(sheetMedia)}
                    </Text>
                  )}
                </View>
              </View>

              <SheetAction icon="play" label="Play" onPress={() => { setSheetMedia(null); handlePlay(sheetMedia); }} />
              <SheetAction
                icon="return-down-forward"
                label="Play next"
                onPress={() => { playNextInQueue(sheetMedia); setSheetMedia(null); toast('Playing next', 'success'); }}
              />
              <SheetAction
                icon="add"
                label="Add to queue"
                onPress={() => { addToQueue(sheetMedia); setSheetMedia(null); toast('Added to queue', 'success'); }}
              />
              <SheetAction
                icon={favoriteIds[sheetMedia.id] ? 'heart' : 'heart-outline'}
                label={favoriteIds[sheetMedia.id] ? 'Remove from favorites' : 'Add to favorites'}
                tint={colors.pink}
                onPress={() => toggleFavorite(sheetMedia.id)}
              />
              <SheetAction
                icon={pinnedIds.includes(sheetMedia.id) ? 'bookmark' : 'bookmark-outline'}
                label={
                  pinnedIds.includes(sheetMedia.id)
                    ? 'Unpin'
                    : pinnedIds.length >= MAX_PINS
                      ? `Pin (replaces oldest of ${MAX_PINS})`
                      : 'Pin for quick access'
                }
                tint={colors.gold}
                onPress={() => togglePin(sheetMedia.id)}
              />
              <SheetAction
                icon="list"
                label="Add to playlist"
                onPress={() => { setPlaylistPickTarget({ ids: [sheetMedia.id], label: displayTitle(sheetMedia) }); setSheetMedia(null); }}
              />
              <SheetAction
                icon="person-outline"
                label={`More by ${displayArtist(sheetMedia)}`}
                onPress={() => { setQuery(displayArtist(sheetMedia)); setTab('all'); setSheetMedia(null); }}
              />
              <SheetAction
                icon="pencil"
                label="Rename / edit details"
                onPress={() => { setEditMedia(sheetMedia); setSheetMedia(null); }}
              />
              <SheetAction
                icon="checkmark-circle-outline"
                label="Select multiple…"
                onPress={() => {
                  setSelectMode(true);
                  setSelectedIds({ [sheetMedia.id]: true });
                  setSheetMedia(null);
                }}
              />
              <SheetAction icon="download-outline" label="Save file" onPress={() => handleSaveFile(sheetMedia)} />
              {offlineMedia.isSupported() && sheetMedia.media_type === 'audio' && (
                <SheetAction
                  icon={offlineIds[sheetMedia.id] ? 'checkmark-circle' : 'cloud-download-outline'}
                  label={offlineIds[sheetMedia.id] ? 'Saved for offline · tap to remove' : 'Save for offline playback'}
                  tint={offlineIds[sheetMedia.id] ? colors.success : undefined}
                  onPress={() => handleToggleOffline(sheetMedia)}
                />
              )}
              <SheetAction
                icon={confirmDelete ? 'alert-circle' : 'trash-outline'}
                label={confirmDelete ? 'Sure? Tap again to delete' : 'Delete'}
                tint={colors.danger}
                onPress={() => (confirmDelete ? handleDelete(sheetMedia) : setConfirmDelete(true))}
              />
            </View>
          </View>
        )}
      </Modal>

      {editMedia && (
        <EditMediaModal
          media={editMedia}
          onClose={() => setEditMedia(null)}
          onSaved={(updated) => {
            upsert(updated);
            setEditMedia(null);
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
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.cyan, marginBottom: spacing.xs },
  megaTitle: { ...typography.mega, color: colors.textPrimary },
  librarySummary: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(27,20,38,0.6)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 48,
    marginBottom: spacing.sm,
  },
  searchInput: { ...typography.body, flex: 1, color: colors.textPrimary, paddingVertical: 0 },
  controlsRow: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tabRow: { flexDirection: 'row', gap: 6, paddingRight: spacing.lg },
  tabChip: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(27,20,38,0.55)',
  },
  tabChipActive: { backgroundColor: 'rgba(255,138,92,0.18)' },
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
    backgroundColor: 'rgba(27,20,38,0.55)',
  },
  toolLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
  toolChipActive: { backgroundColor: 'rgba(255,138,92,0.18)' },
  fixNamesChip: { backgroundColor: 'rgba(255,138,92,0.14)', borderWidth: 1, borderColor: 'rgba(255,138,92,0.3)' },
  gridRow: { gap: spacing.md },
  listContent: { gap: spacing.md, paddingBottom: layout.tabBarClearance },
  emptyWrap: { alignItems: 'center', paddingBottom: spacing.xl },
  emptyAction: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
    marginTop: -spacing.md,
  },
  emptyActionLabel: { ...typography.caption, color: colors.bg, fontFamily: 'Sora_600SemiBold' },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(27,20,38,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(174,165,192,0.14)',
  },
  bulkLabel: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  bulkActions: { flexDirection: 'row', gap: spacing.sm },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(9,6,15,0.5)',
  },
  bulkButtonDanger: { backgroundColor: 'rgba(232,80,110,0.14)' },
  bulkButtonLabel: { ...typography.caption, fontSize: 13, color: colors.textPrimary },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalRootDesktop: { justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: { ...StyleSheet.absoluteFill as object, backgroundColor: 'rgba(3,5,3,0.65)' },
  sheet: {
    backgroundColor: '#1B1426',
    borderTopLeftRadius: radii.lg + 8,
    borderTopRightRadius: radii.lg + 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  // Desktop: the bottom sheet becomes a centered dialog card.
  sheetDesktop: {
    width: '100%',
    maxWidth: 460,
    borderRadius: radii.lg + 8,
    paddingTop: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(174,165,192,0.16)',
    ...shadows.card,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(174,165,192,0.3)',
    marginBottom: spacing.md,
  },
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
