import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import { RAIL_WIDTH, useResponsive } from '../hooks/useResponsive';
import { EmptyState } from '../components/ui/EmptyState';
import { FadeImage } from '../components/ui/FadeImage';
import { Reveal } from '../components/ui/Reveal';
import { tokenStorage } from '../services/storage/tokenStorage';
import { GradientText } from '../components/ui/GradientText';
import { PressableScale } from '../components/ui/PressableScale';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import * as libraryApi from '../services/api/library';
import type { Media, Playlist } from '../services/api/types';
import * as offlineMedia from '../services/storage/offlineMedia';
import { useFavoritesStore } from '../store/favoritesStore';
import { useLibraryStore } from '../store/libraryStore';
import { MAX_PINS, usePinStore } from '../store/pinStore';
import { usePlayerStore } from '../store/playerStore';
import { usePlaylistStore } from '../store/playlistStore';
import { useVideoPlayerStore } from '../store/videoPlayerStore';
import { toast } from '../store/toastStore';
import { colors, gradients, layout, radii, shadows, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Tab = 'all' | 'audio' | 'video' | 'favorites' | 'playlists';
type SortMode = 'newest' | 'title' | 'artist' | 'longest';
type ViewMode = 'grid' | 'list';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'audio', label: 'Audio' },
  { key: 'video', label: 'Video' },
  { key: 'favorites', label: '♥' },
  { key: 'playlists', label: 'Lists' },
];

const SORT_LABEL: Record<SortMode, string> = {
  newest: 'Newest',
  title: 'Title',
  artist: 'Artist',
  longest: 'Longest',
};
const SORT_ORDER: SortMode[] = ['newest', 'title', 'artist', 'longest'];

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function displayTitle(media: Media): string {
  return media.title ?? media.recognized_title ?? 'Untitled';
}

function displayArtist(media: Media): string {
  return media.artist ?? media.recognized_artist ?? 'Unknown artist';
}

const LIBRARY_MAX_WIDTH = 1160;

export function LibraryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [view, setView] = useState<ViewMode>('grid');
  const [sheetMedia, setSheetMedia] = useState<Media | null>(null);
  const [editMedia, setEditMedia] = useState<Media | null>(null);
  const [playlistDetailId, setPlaylistDetailId] = useState<string | null>(null);
  const [playlistPickMedia, setPlaylistPickMedia] = useState<Media | null>(null);
  const [offlineIds, setOfflineIds] = useState<Record<string, boolean>>({});
  const [savingOffline, setSavingOffline] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, true>>({});

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

  const visible = useMemo(() => {
    let list = items;
    if (tab === 'audio' || tab === 'video') list = list.filter((m) => m.media_type === tab);
    if (tab === 'favorites') list = list.filter((m) => favoriteIds[m.id]);

    const sorted = [...list];
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
        break;
      case 'artist':
        sorted.sort((a, b) => displayArtist(a).localeCompare(displayArtist(b)));
        break;
      case 'longest':
        sorted.sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0));
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return sorted;
  }, [items, tab, sort, favoriteIds]);

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
    } catch {
      toast("Couldn't open that file", 'error');
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
    } catch {
      toast("Couldn't save offline — check your connection and try again", 'error');
    } finally {
      setSavingOffline(false);
      setSheetMedia(null);
    }
  }

  async function handleDelete(media: Media) {
    setSheetMedia(null);
    try {
      await remove(media.id);
      toast('Removed from your collection', 'success');
    } catch {
      toast("Couldn't delete that track", 'error');
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
  }

  async function handleDeleteSelected() {
    const ids = Object.keys(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => remove(id)));
      toast(`Removed ${ids.length} track${ids.length === 1 ? '' : 's'}`, 'success');
    } catch {
      toast("Couldn't remove every selected track", 'error');
    } finally {
      exitSelectMode();
    }
  }

  // Grid geometry: 2 columns on phones, as many ~220px cards as fit on desktop.
  const containerWidth = isDesktop
    ? Math.min(width - RAIL_WIDTH, LIBRARY_MAX_WIDTH) - spacing.xl * 2
    : width - spacing.lg * 2;
  const columns = view === 'grid' ? (isDesktop ? Math.max(3, Math.floor(containerWidth / 224)) : 2) : 1;
  const cellSize = (containerWidth - spacing.md * (columns - 1)) / columns;

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={LIBRARY_MAX_WIDTH}>
        <Reveal>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>THE COLLECTION</Text>
              <GradientText style={styles.megaTitle}>Library</GradientText>
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
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        </Reveal>

        <Reveal delay={120}>
        <View style={styles.controlsRow}>
          <View style={styles.tabRow}>
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
              >
                <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          {tab !== 'playlists' && (
            <View style={styles.toolRow}>
              <Pressable
                onPress={() => setSort(SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length])}
                style={styles.toolChip}
              >
                <Ionicons name="swap-vertical" size={13} color={colors.textSecondary} />
                <Text style={styles.toolLabel}>{SORT_LABEL[sort]}</Text>
              </Pressable>
              <Pressable onPress={() => setView(view === 'grid' ? 'list' : 'grid')} style={styles.toolChip}>
                <Ionicons name={view === 'grid' ? 'list' : 'grid'} size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                style={[styles.toolChip, selectMode && styles.toolChipActive]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={14}
                  color={selectMode ? colors.cyan : colors.textSecondary}
                />
              </Pressable>
            </View>
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
          columnWrapperStyle={view === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              title={tab === 'favorites' ? 'No favorites yet' : 'Nothing here yet'}
              subtitle={
                tab === 'favorites'
                  ? 'Long-press any track and tap the heart.'
                  : 'Downloaded and recognized tracks will show up here.'
              }
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
            {Object.keys(selectedIds).length} selected
          </Text>
          <View style={styles.bulkActions}>
            <Pressable onPress={exitSelectMode} style={styles.bulkButton}>
              <Text style={styles.bulkButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleDeleteSelected}
              disabled={Object.keys(selectedIds).length === 0}
              style={[styles.bulkButton, styles.bulkButtonDanger, Object.keys(selectedIds).length === 0 && { opacity: 0.4 }]}
            >
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={[styles.bulkButtonLabel, { color: colors.danger }]}>Delete</Text>
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
                {sheetMedia.thumbnail_url ? (
                  <Image source={{ uri: sheetMedia.thumbnail_url }} style={styles.sheetCover} />
                ) : (
                  <LinearGradient colors={gradients.coverFallback} style={styles.sheetCover}>
                    <Ionicons name="musical-notes" size={22} color="rgba(248,250,252,0.4)" />
                  </LinearGradient>
                )}
                <View style={styles.sheetHeaderText}>
                  <Text numberOfLines={1} style={styles.sheetTitle}>{displayTitle(sheetMedia)}</Text>
                  <Text numberOfLines={1} style={styles.sheetSub}>
                    {displayArtist(sheetMedia)} · {sheetMedia.media_type} · {formatDuration(sheetMedia.duration_seconds)}
                  </Text>
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
                onPress={() => { setPlaylistPickMedia(sheetMedia); setSheetMedia(null); }}
              />
              <SheetAction
                icon="person-outline"
                label={`More by ${displayArtist(sheetMedia)}`}
                onPress={() => { setQuery(displayArtist(sheetMedia)); setTab('all'); setSheetMedia(null); }}
              />
              <SheetAction
                icon="create-outline"
                label="Edit details"
                onPress={() => { setEditMedia(sheetMedia); setSheetMedia(null); }}
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
              <SheetAction icon="trash-outline" label="Delete" tint={colors.danger} onPress={() => handleDelete(sheetMedia)} />
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

      {playlistPickMedia && (
        <PlaylistPickerModal media={playlistPickMedia} onClose={() => setPlaylistPickMedia(null)} />
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

function PlaylistsPane({ playlists, onOpen }: { playlists: Playlist[]; onOpen: (id: string) => void }) {
  const createPlaylist = usePlaylistStore((s) => s.create);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createPlaylist(trimmed);
      setName('');
      toast('Playlist created', 'success');
    } catch {
      toast("Couldn't create that playlist", 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <FlatList
      data={playlists}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.createRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="New playlist name"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.cyan}
            style={styles.createInput}
            onSubmitEditing={handleCreate}
          />
          <PressableScale onPress={handleCreate} disabled={creating || !name.trim()} scaleTo={0.9}>
            <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButton}>
              {creating ? <ActivityIndicator size="small" color="#0A0F0D" /> : <Ionicons name="add" size={20} color="#0A0F0D" />}
            </LinearGradient>
          </PressableScale>
        </View>
      }
      ListEmptyComponent={
        <EmptyState title="No playlists yet" subtitle="Name one above, then long-press any track to add it." />
      }
      renderItem={({ item }) => {
        const coverUrl = item.items.find((m) => m.thumbnail_url)?.thumbnail_url ?? null;
        return (
          <Pressable
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
          >
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.listCover} />
            ) : (
              <LinearGradient colors={gradients.coverFallback} style={styles.listCover}>
                <Ionicons name="list" size={16} color="rgba(248,250,252,0.4)" />
              </LinearGradient>
            )}
            <View style={styles.listText}>
              <Text numberOfLines={1} style={styles.cardTitle}>{item.name}</Text>
              <Text numberOfLines={1} style={styles.cardArtist}>
                {item.items.length} {item.items.length === 1 ? 'track' : 'tracks'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        );
      }}
    />
  );
}

function PlaylistPickerModal({ media, onClose }: { media: Media; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const playlists = usePlaylistStore((s) => s.playlists);
  const addItem = usePlaylistStore((s) => s.addItem);
  const createPlaylist = usePlaylistStore((s) => s.create);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(playlist: Playlist) {
    setBusy(true);
    try {
      await addItem(playlist.id, media.id);
      toast(`Added to “${playlist.name}”`, 'success');
      onClose();
    } catch {
      toast("Couldn't add to that playlist", 'error');
      setBusy(false);
    }
  }

  async function createAndPick() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const playlist = await createPlaylist(trimmed);
      await addItem(playlist.id, media.id);
      toast(`Added to “${playlist.name}”`, 'success');
      onClose();
    } catch {
      toast("Couldn't create that playlist", 'error');
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalRoot, isDesktop && styles.modalRootDesktop]}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, isDesktop && styles.sheetDesktop, { paddingBottom: insets.bottom + spacing.lg }]}>
          {!isDesktop && <View style={styles.sheetHandle} />}
          <Text style={styles.editTitle}>Add to playlist</Text>
          <Text numberOfLines={1} style={styles.sheetSub}>{displayTitle(media)}</Text>

          <View style={[styles.createRow, { marginTop: spacing.md }]}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="New playlist name"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.cyan}
              style={styles.createInput}
              onSubmitEditing={createAndPick}
            />
            <PressableScale onPress={createAndPick} disabled={busy || !name.trim()} scaleTo={0.9}>
              <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButton}>
                <Ionicons name="add" size={20} color="#0A0F0D" />
              </LinearGradient>
            </PressableScale>
          </View>

          {playlists.map((playlist) => (
            <Pressable
              key={playlist.id}
              onPress={() => pick(playlist)}
              disabled={busy}
              style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
            >
              <Ionicons name="list" size={19} color={colors.textSecondary} />
              <Text style={styles.sheetRowLabel}>{playlist.name}</Text>
              <Text style={styles.sheetSub}>{playlist.items.length}</Text>
            </Pressable>
          ))}
          {playlists.length === 0 && (
            <Text style={[styles.sheetSub, { textAlign: 'center', paddingVertical: spacing.md }]}>
              No playlists yet — create one above.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function PlaylistDetailModal({
  playlistId,
  onClose,
  onPlayAll,
}: {
  playlistId: string;
  onClose: () => void;
  onPlayAll: (playlist: Playlist) => void;
}) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const playlist = usePlaylistStore((s) => s.playlists.find((p) => p.id === playlistId));
  const removeItem = usePlaylistStore((s) => s.removeItem);
  const removePlaylist = usePlaylistStore((s) => s.remove);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!playlist) return null;

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await removePlaylist(playlistId);
      toast('Playlist deleted', 'success');
      onClose();
    } catch {
      toast("Couldn't delete that playlist", 'error');
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalRoot, isDesktop && styles.modalRootDesktop]}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            styles.detailSheet,
            isDesktop && styles.sheetDesktop,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          {!isDesktop && <View style={styles.sheetHandle} />}
          <View style={styles.detailHeader}>
            <View style={styles.detailHeaderText}>
              <Text numberOfLines={1} style={styles.editTitle}>{playlist.name}</Text>
              <Text style={styles.sheetSub}>
                {playlist.items.length} {playlist.items.length === 1 ? 'track' : 'tracks'}
              </Text>
            </View>
            <Pressable onPress={handleDelete} hitSlop={8} style={styles.detailDelete}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              {confirmDelete && <Text style={styles.detailDeleteLabel}>Sure?</Text>}
            </Pressable>
          </View>

          {playlist.items.length > 0 && (
            <PressableScale onPress={() => onPlayAll(playlist)} scaleTo={0.97}>
              <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editSave}>
                <Text style={styles.editSaveLabel}>Play all</Text>
              </LinearGradient>
            </PressableScale>
          )}

          <FlatList
            data={playlist.items}
            keyExtractor={(item) => item.id}
            style={styles.detailList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={[styles.sheetSub, { textAlign: 'center', paddingVertical: spacing.lg }]}>
                Empty — long-press a track in your library to add it here.
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.detailRow}>
                {item.thumbnail_url ? (
                  <Image source={{ uri: item.thumbnail_url }} style={styles.detailCover} />
                ) : (
                  <LinearGradient colors={gradients.coverFallback} style={styles.detailCover}>
                    <Ionicons name="musical-notes" size={14} color="rgba(248,250,252,0.4)" />
                  </LinearGradient>
                )}
                <View style={styles.listText}>
                  <Text numberOfLines={1} style={styles.cardTitle}>{displayTitle(item)}</Text>
                  <Text numberOfLines={1} style={styles.cardArtist}>{displayArtist(item)}</Text>
                </View>
                <Pressable
                  onPress={async () => {
                    try {
                      await removeItem(playlistId, item.id);
                    } catch {
                      toast("Couldn't remove that track", 'error');
                    }
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={17} color={colors.textMuted} />
                </Pressable>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

function SheetAction({
  icon,
  label,
  onPress,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tint?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}>
      <Ionicons name={icon} size={19} color={tint ?? colors.textSecondary} />
      <Text style={[styles.sheetRowLabel, tint ? { color: tint } : null]}>{label}</Text>
    </Pressable>
  );
}

function EditMediaModal({
  media,
  onClose,
  onSaved,
}: {
  media: Media;
  onClose: () => void;
  onSaved: (updated: Media) => void;
}) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const [title, setTitle] = useState(media.title ?? media.recognized_title ?? '');
  const [artist, setArtist] = useState(media.artist ?? media.recognized_artist ?? '');
  const [album, setAlbum] = useState(media.album ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await libraryApi.updateMedia(media.id, {
        title: title.trim() || null,
        artist: artist.trim() || null,
        album: album.trim() || null,
      } as Partial<Pick<Media, 'title' | 'artist' | 'album'>>);
      onSaved(updated);
    } catch {
      toast("Couldn't save changes", 'error');
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalRoot, isDesktop && styles.modalRootDesktop]}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, isDesktop && styles.sheetDesktop, { paddingBottom: insets.bottom + spacing.lg }]}>
          {!isDesktop && <View style={styles.sheetHandle} />}
          <Text style={styles.editTitle}>Edit details</Text>
          {[
            { label: 'Title', value: title, set: setTitle },
            { label: 'Artist', value: artist, set: setArtist },
            { label: 'Album', value: album, set: setAlbum },
          ].map((field) => (
            <View key={field.label} style={styles.editField}>
              <Text style={styles.editLabel}>{field.label}</Text>
              <TextInput
                value={field.value}
                onChangeText={field.set}
                placeholder={field.label}
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.cyan}
                style={styles.editInput}
              />
            </View>
          ))}
          <PressableScale onPress={save} disabled={saving} scaleTo={0.97}>
            <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editSave}>
              {saving ? (
                <ActivityIndicator size="small" color="#0A0F0D" />
              ) : (
                <Text style={styles.editSaveLabel}>Save</Text>
              )}
            </LinearGradient>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

function GridCard({
  media,
  size,
  favorite,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: {
  media: Media;
  size: number;
  favorite: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
    >
      <View style={[styles.card, hovered && styles.cardHovered, selected && styles.cardSelected, { width: size, height: size }]}>
        {media.thumbnail_url ? (
          <FadeImage uri={media.thumbnail_url} style={StyleSheet.absoluteFill as object} />
        ) : (
          <LinearGradient colors={gradients.coverFallback} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={gradients.coverScrim} style={styles.scrim} />

        {!media.thumbnail_url && (
          <View style={styles.glyphWrap}>
            <Ionicons name={media.media_type === 'video' ? 'videocam' : 'musical-notes'} size={38} color="rgba(231,235,230,0.3)" />
          </View>
        )}

        <View style={styles.durationChip}>
          <Ionicons name={media.media_type === 'video' ? 'videocam' : 'musical-notes'} size={10} color={colors.textSecondary} />
          <Text style={styles.durationText}>{formatDuration(media.duration_seconds)}</Text>
        </View>
        {favorite && (
          <View style={styles.heartChip}>
            <Ionicons name="heart" size={12} color={colors.pink} />
          </View>
        )}

        {selectMode && (
          <View style={[styles.selectCheck, selected && styles.selectCheckActive]}>
            {selected && <Ionicons name="checkmark" size={13} color="#0A0F0D" />}
          </View>
        )}

        {/* Pointer affordances: a play FAB and an actions chip fade in on hover. */}
        {hovered && !selectMode && (
          <>
            <Pressable onPress={onLongPress} style={styles.moreChip} hitSlop={6}>
              <Ionicons name="ellipsis-horizontal" size={15} color={colors.textPrimary} />
            </Pressable>
            <View pointerEvents="none" style={styles.playFabWrap}>
              <LinearGradient
                colors={colors.gradientPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.playFab}
              >
                <Ionicons
                  name={media.media_type === 'video' ? 'play' : 'play'}
                  size={22}
                  color="#0A0F0D"
                  style={{ marginLeft: 2 }}
                />
              </LinearGradient>
            </View>
          </>
        )}

        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.cardTitle}>{displayTitle(media)}</Text>
          <Text numberOfLines={1} style={styles.cardArtist}>{displayArtist(media)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ListRow({
  media,
  favorite,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: {
  media: Media;
  favorite: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
      style={({ pressed }) => [styles.listRow, hovered && styles.listRowHovered, selected && styles.listRowSelected, pressed && styles.listRowPressed]}
    >
      {selectMode && (
        <View style={[styles.selectCheckInline, selected && styles.selectCheckActive]}>
          {selected && <Ionicons name="checkmark" size={12} color="#0A0F0D" />}
        </View>
      )}
      {media.thumbnail_url ? (
        <FadeImage uri={media.thumbnail_url} style={styles.listCover as object} />
      ) : (
        <LinearGradient colors={gradients.coverFallback} style={styles.listCover}>
          <Ionicons name={media.media_type === 'video' ? 'videocam' : 'musical-notes'} size={16} color="rgba(231,235,230,0.4)" />
        </LinearGradient>
      )}
      <View style={styles.listText}>
        <Text numberOfLines={1} style={styles.cardTitle}>{displayTitle(media)}</Text>
        <Text numberOfLines={1} style={styles.cardArtist}>{displayArtist(media)}</Text>
      </View>
      <Ionicons
        name={media.media_type === 'video' ? 'videocam-outline' : 'musical-notes-outline'}
        size={13}
        color={colors.textMuted}
      />
      {favorite && <Ionicons name="heart" size={14} color={colors.pink} />}
      {hovered && !selectMode && (
        <Pressable onPress={onLongPress} hitSlop={8} style={styles.rowMoreButton}>
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
        </Pressable>
      )}
      <Text style={styles.durationText}>{formatDuration(media.duration_seconds)}</Text>
    </Pressable>
  );
}

/** Shimmering placeholder grid/list shown only during the very first load, before any cached or live data has arrived. */
function SkeletonGrid({ columns, cellSize, view }: { columns: number; cellSize: number; view: ViewMode }) {
  const pulse = useState(() => new Animated.Value(0.4))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const count = view === 'grid' ? columns * 3 : 6;
  return (
    <View style={view === 'grid' ? styles.skeletonGridWrap : { gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) =>
        view === 'grid' ? (
          <Animated.View key={i} style={[styles.skeletonCard, { width: cellSize, height: cellSize, opacity: pulse }]} />
        ) : (
          <Animated.View key={i} style={[styles.skeletonRow, { opacity: pulse }]} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050805' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.cyan, marginBottom: spacing.xs },
  megaTitle: { ...typography.mega, marginBottom: spacing.md },
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(18,28,24,0.6)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 48,
    marginBottom: spacing.sm,
  },
  searchInput: { ...typography.body, flex: 1, color: colors.textPrimary, paddingVertical: 0 },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  tabRow: { flexDirection: 'row', gap: 6 },
  tabChip: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18,28,24,0.55)',
  },
  tabChipActive: { backgroundColor: 'rgba(47,191,170,0.18)' },
  tabLabel: { ...typography.caption, color: colors.textMuted },
  tabLabelActive: { color: colors.cyan, fontFamily: 'SpaceGrotesk_500Medium' },
  toolRow: { flexDirection: 'row', gap: 6 },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18,28,24,0.55)',
  },
  toolLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
  toolChipActive: { backgroundColor: 'rgba(47,191,170,0.18)' },
  gridRow: { gap: spacing.md },
  listContent: { gap: spacing.md, paddingBottom: layout.tabBarClearance },
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(167,176,168,0.12)',
  },
  cardHovered: {
    borderColor: 'rgba(47,191,170,0.45)',
  },
  cardSelected: {
    borderColor: colors.cyan,
    borderWidth: 2,
  },
  selectCheck: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,8,5,0.4)',
  },
  selectCheckInline: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCheckActive: {
    backgroundColor: colors.cyan,
    borderColor: colors.cyan,
  },
  moreChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(5,8,5,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  playFabWrap: {
    position: 'absolute',
    right: spacing.sm + 2,
    bottom: 54,
    shadowColor: colors.cyan,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  playFab: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMoreButton: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(5,8,5,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  glyphWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  durationChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5,8,5,0.65)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  heartChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(5,8,5,0.65)',
    borderRadius: radii.pill,
    padding: 5,
  },
  durationText: { ...typography.caption, fontSize: 11, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  meta: { padding: spacing.sm + 2 },
  cardTitle: { ...typography.subtitle, fontSize: 15, lineHeight: 19, color: colors.textPrimary },
  cardArtist: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(18,28,24,0.5)',
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  listRowHovered: { backgroundColor: 'rgba(18,28,24,0.85)' },
  listRowPressed: { backgroundColor: 'rgba(47,191,170,0.10)' },
  listRowSelected: { borderWidth: 1, borderColor: colors.cyan },
  skeletonGridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  skeletonCard: { borderRadius: radii.lg, backgroundColor: 'rgba(167,176,168,0.08)' },
  skeletonRow: { height: 68, borderRadius: radii.md, backgroundColor: 'rgba(167,176,168,0.08)' },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(18,28,24,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(167,176,168,0.14)',
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
    backgroundColor: 'rgba(5,8,5,0.5)',
  },
  bulkButtonDanger: { backgroundColor: 'rgba(224,104,95,0.14)' },
  bulkButtonLabel: { ...typography.caption, fontSize: 13, color: colors.textPrimary },
  listCover: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: { flex: 1 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalRootDesktop: { justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: { ...StyleSheet.absoluteFill as object, backgroundColor: 'rgba(3,5,3,0.65)' },
  sheet: {
    backgroundColor: '#121C18',
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
    borderColor: 'rgba(167,176,168,0.16)',
    ...shadows.card,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(167,176,168,0.3)',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetCover: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeaderText: { flex: 1 },
  sheetTitle: { ...typography.subtitle, color: colors.textPrimary },
  sheetSub: { ...typography.caption, color: colors.textMuted },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md - 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  sheetRowPressed: { backgroundColor: 'rgba(47,191,170,0.10)' },
  sheetRowLabel: { ...typography.body, color: colors.textPrimary },

  editTitle: { ...typography.title, fontSize: 20, lineHeight: 26, color: colors.textPrimary, marginBottom: spacing.md },
  editField: { marginBottom: spacing.md, gap: 4 },
  editLabel: { ...typography.caption, color: colors.textSecondary },
  editInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(5,8,5,0.6)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 4,
  },
  editSave: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveLabel: { ...typography.subtitle, fontFamily: 'SpaceGrotesk_600SemiBold', color: '#0A0F0D' },

  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  createInput: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
    backgroundColor: 'rgba(18,28,24,0.6)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 6,
  },
  createButton: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSheet: {
    maxHeight: '82%',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  detailHeaderText: { flex: 1 },
  detailDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(224,104,95,0.10)',
  },
  detailDeleteLabel: { ...typography.caption, fontSize: 12, color: colors.danger },
  detailList: {
    marginTop: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailCover: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
