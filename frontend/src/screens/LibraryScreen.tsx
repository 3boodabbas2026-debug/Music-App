import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useFavoritesStore } from '../store/favoritesStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { usePlaylistStore } from '../store/playlistStore';
import { toast } from '../store/toastStore';
import { colors, gradients, layout, radii, spacing, typography } from '../theme/tokens';
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

export function LibraryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { items, isLoading, refresh, upsert, remove } = useLibraryStore();
  const playQueue = usePlayerStore((s) => s.playQueue);
  const playNextInQueue = usePlayerStore((s) => s.playNextInQueue);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);

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

  useEffect(() => {
    refresh();
    refreshPlaylists().catch(() => {});
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
      navigation.navigate('VideoPlayer', { mediaId: media.id });
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

  async function handleDelete(media: Media) {
    setSheetMedia(null);
    try {
      await remove(media.id);
      toast('Removed from your vault', 'success');
    } catch {
      toast("Couldn't delete that track", 'error');
    }
  }

  const cellSize = (width - spacing.lg * 2 - spacing.md) / 2;

  return (
    <View style={styles.root}>
      <ScreenContainer>
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
            </View>
          )}
        </View>
        </Reveal>

        {tab === 'playlists' ? (
          <PlaylistsPane
            playlists={playlists.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))}
            onOpen={setPlaylistDetailId}
          />
        ) : (
        <FlatList
          key={view}
          data={visible}
          keyExtractor={(item) => item.id}
          numColumns={view === 'grid' ? 2 : 1}
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
                onPress={() => handlePlay(item)}
                onLongPress={() => setSheetMedia(item)}
              />
            ) : (
              <ListRow
                media={item}
                favorite={!!favoriteIds[item.id]}
                onPress={() => handlePlay(item)}
                onLongPress={() => setSheetMedia(item)}
              />
            )
          }
        />
        )}
      </ScreenContainer>
      <MiniPlayerBar />

      {/* Track actions sheet */}
      <Modal visible={!!sheetMedia} transparent animationType="fade" onRequestClose={() => setSheetMedia(null)}>
        {sheetMedia && (
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSheetMedia(null)} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <View style={styles.sheetHandle} />
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
              {creating ? <ActivityIndicator size="small" color="#0B1120" /> : <Ionicons name="add" size={20} color="#0B1120" />}
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
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
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
                <Ionicons name="add" size={20} color="#0B1120" />
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
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, styles.detailSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
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
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
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
                <ActivityIndicator size="small" color="#0B1120" />
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
  onPress,
  onLongPress,
}: {
  media: Media;
  size: number;
  favorite: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>
      <View style={[styles.card, { width: size, height: size }]}>
        {media.thumbnail_url ? (
          <FadeImage uri={media.thumbnail_url} style={StyleSheet.absoluteFill as object} />
        ) : (
          <LinearGradient colors={gradients.coverFallback} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={gradients.coverScrim} style={styles.scrim} />

        {!media.thumbnail_url && (
          <View style={styles.glyphWrap}>
            <Ionicons name="musical-notes" size={38} color="rgba(248,250,252,0.3)" />
          </View>
        )}

        <View style={styles.durationChip}>
          <Text style={styles.durationText}>{formatDuration(media.duration_seconds)}</Text>
        </View>
        {favorite && (
          <View style={styles.heartChip}>
            <Ionicons name="heart" size={12} color={colors.pink} />
          </View>
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
  onPress,
  onLongPress,
}: {
  media: Media;
  favorite: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
    >
      {media.thumbnail_url ? (
        <FadeImage uri={media.thumbnail_url} style={styles.listCover as object} />
      ) : (
        <LinearGradient colors={gradients.coverFallback} style={styles.listCover}>
          <Ionicons name="musical-notes" size={16} color="rgba(248,250,252,0.4)" />
        </LinearGradient>
      )}
      <View style={styles.listText}>
        <Text numberOfLines={1} style={styles.cardTitle}>{displayTitle(media)}</Text>
        <Text numberOfLines={1} style={styles.cardArtist}>{displayArtist(media)}</Text>
      </View>
      {favorite && <Ionicons name="heart" size={14} color={colors.pink} />}
      <Text style={styles.durationText}>{formatDuration(media.duration_seconds)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060B18' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.cyan, marginBottom: spacing.xs },
  megaTitle: { ...typography.mega, marginBottom: spacing.md },
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(30,41,59,0.6)',
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
    backgroundColor: 'rgba(30,41,59,0.55)',
  },
  tabChipActive: { backgroundColor: 'rgba(56,189,248,0.18)' },
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
    backgroundColor: 'rgba(30,41,59,0.55)',
  },
  toolLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
  gridRow: { gap: spacing.md },
  listContent: { gap: spacing.md, paddingBottom: layout.tabBarClearance },
  card: { borderRadius: radii.lg, overflow: 'hidden', justifyContent: 'flex-end' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  glyphWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  durationChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(6,11,24,0.65)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  heartChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(6,11,24,0.65)',
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
    backgroundColor: 'rgba(30,41,59,0.5)',
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  listRowPressed: { backgroundColor: 'rgba(56,189,248,0.10)' },
  listCover: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: { flex: 1 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill as object, backgroundColor: 'rgba(2,6,17,0.65)' },
  sheet: {
    backgroundColor: '#111A2E',
    borderTopLeftRadius: radii.lg + 8,
    borderTopRightRadius: radii.lg + 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(148,163,184,0.3)',
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
  sheetRowPressed: { backgroundColor: 'rgba(56,189,248,0.10)' },
  sheetRowLabel: { ...typography.body, color: colors.textPrimary },

  editTitle: { ...typography.title, fontSize: 20, lineHeight: 26, color: colors.textPrimary, marginBottom: spacing.md },
  editField: { marginBottom: spacing.md, gap: 4 },
  editLabel: { ...typography.caption, color: colors.textSecondary },
  editInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(6,11,24,0.6)',
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
  editSaveLabel: { ...typography.subtitle, fontFamily: 'SpaceGrotesk_600SemiBold', color: '#0B1120' },

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
    backgroundColor: 'rgba(30,41,59,0.6)',
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
    backgroundColor: 'rgba(248,113,113,0.10)',
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
