import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '../ui/Artwork';
import { EmptyState } from '../ui/EmptyState';
import { PressableScale } from '../ui/PressableScale';
import { useResponsive } from '../../hooks/useResponsive';
import * as libraryApi from '../../services/api/library';
import type { Media, Playlist } from '../../services/api/types';
import { usePlaylistStore } from '../../store/playlistStore';
import { toast } from '../../store/toastStore';
import { apiErrorMessage } from '../../utils/apiError';
import { displayArtist as artistOf, displayTitle } from '../../utils/mediaDisplay';
import { colors, gradients, layout, radii, shadows, spacing, typography } from '../../theme/tokens';

function displayArtist(media: Media): string {
  return artistOf(media) ?? 'Unknown artist';
}

export function PlaylistsPane({ playlists, onOpen }: { playlists: Playlist[]; onOpen: (id: string) => void }) {
  const createPlaylist = usePlaylistStore((state) => state.create);
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
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't create that playlist."), 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <FlatList
      data={playlists}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.listContent, playlists.length === 0 && styles.emptyListContent]}
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
            <LinearGradient
              colors={colors.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.createButton}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#0B1411" />
              ) : (
                <Ionicons name="add" size={20} color="#0B1411" />
              )}
            </LinearGradient>
          </PressableScale>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyListBody}>
          <EmptyState
            icon="list-outline"
            title="No playlists yet"
            subtitle="Name one above, then long-press any track to add it."
          />
        </View>
      }
      renderItem={({ item }) => {
        const coverMedia = item.items.find((media) => media.thumbnail_url);
        return (
          <Pressable
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
          >
            {coverMedia ? (
              <Artwork media={coverMedia} size={48} borderRadius={radii.sm} />
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

export function PlaylistPickerModal({
  mediaIds,
  label,
  onClose,
  onDone,
}: {
  mediaIds: string[];
  label: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const playlists = usePlaylistStore((state) => state.playlists);
  const addItem = usePlaylistStore((state) => state.addItem);
  const createPlaylist = usePlaylistStore((state) => state.create);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Sequential by design: concurrent addItem responses can overwrite the
  // same playlist snapshot in the store and lose an item.
  async function addAllTo(playlistId: string) {
    for (const mediaId of mediaIds) {
      await addItem(playlistId, mediaId);
    }
  }

  async function pick(playlist: Playlist) {
    setBusy(true);
    try {
      await addAllTo(playlist.id);
      toast(
        mediaIds.length > 1
          ? `Added ${mediaIds.length} tracks to “${playlist.name}”`
          : `Added to “${playlist.name}”`,
        'success',
      );
      onDone();
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't add to that playlist."), 'error');
      setBusy(false);
    }
  }

  async function createAndPick() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const playlist = await createPlaylist(trimmed);
      await addAllTo(playlist.id);
      toast(
        mediaIds.length > 1
          ? `Added ${mediaIds.length} tracks to “${playlist.name}”`
          : `Added to “${playlist.name}”`,
        'success',
      );
      onDone();
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't create that playlist."), 'error');
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
          <Text numberOfLines={1} style={styles.sheetSub}>{label}</Text>

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
              <LinearGradient
                colors={colors.gradientPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.createButton}
              >
                <Ionicons name="add" size={20} color="#0B1411" />
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

export function PlaylistDetailModal({
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
  const playlist = usePlaylistStore((state) => state.playlists.find((item) => item.id === playlistId));
  const removeItem = usePlaylistStore((state) => state.removeItem);
  const removePlaylist = usePlaylistStore((state) => state.remove);
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
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't delete that playlist."), 'error');
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
              <LinearGradient
                colors={colors.gradientPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.editSave}
              >
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
                <Artwork media={item} size={40} borderRadius={radii.sm} />
                <View style={styles.listText}>
                  <Text numberOfLines={1} style={styles.cardTitle}>{displayTitle(item)}</Text>
                  <Text numberOfLines={1} style={styles.cardArtist}>{displayArtist(item)}</Text>
                </View>
                <Pressable
                  onPress={async () => {
                    try {
                      await removeItem(playlistId, item.id);
                    } catch (err) {
                      toast(apiErrorMessage(err, "Couldn't remove that track."), 'error');
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

export function SheetAction({
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

export function EditMediaModal({
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
  const [genre, setGenre] = useState(media.genre ?? '');
  const [releaseYear, setReleaseYear] = useState(media.release_year ? String(media.release_year) : '');
  const [isRemix, setIsRemix] = useState(media.is_remix === true);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsedYear = releaseYear.trim() ? Number(releaseYear) : null;
    if (parsedYear != null && (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 2100)) {
      toast('Enter a release year between 1000 and 2100.', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await libraryApi.updateMedia(media.id, {
        title: title.trim() || null,
        artist: artist.trim() || null,
        album: album.trim() || null,
        genre: genre.trim() || null,
        release_year: parsedYear,
        is_remix: isRemix,
      });
      onSaved(updated);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't save changes."), 'error');
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
            { label: 'Genre', value: genre, set: setGenre },
            { label: 'Release year', value: releaseYear, set: setReleaseYear },
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
          <Pressable
            onPress={() => setIsRemix((value) => !value)}
            style={[styles.remixToggle, isRemix && styles.toolChipActive]}
          >
            <Ionicons
              name={isRemix ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={isRemix ? colors.cyan : colors.textMuted}
            />
            <Text style={styles.editLabel}>This track is a remix</Text>
          </Pressable>
          <PressableScale onPress={save} disabled={saving} scaleTo={0.97}>
            <LinearGradient
              colors={colors.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editSave}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#0B1411" />
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

const styles = StyleSheet.create({
  listContent: { gap: spacing.md, paddingBottom: layout.tabBarClearance },
  emptyListContent: { flexGrow: 1 },
  emptyListBody: { flex: 1, justifyContent: 'center' },
  cardTitle: { ...typography.subtitle, fontSize: 15, lineHeight: 19, color: colors.textPrimary },
  cardArtist: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(17,30,25,0.5)',
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  listRowPressed: { backgroundColor: 'rgba(99,214,181,0.10)' },
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
  modalBackdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(3,5,3,0.65)' },
  sheet: {
    backgroundColor: '#1B1426',
    borderTopLeftRadius: radii.lg + 8,
    borderTopRightRadius: radii.lg + 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetDesktop: {
    width: '100%',
    maxWidth: 460,
    borderRadius: radii.lg + 8,
    paddingTop: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(158,181,170,0.16)',
    ...shadows.card,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(158,181,170,0.3)',
    marginBottom: spacing.md,
  },
  sheetSub: { ...typography.caption, color: colors.textMuted },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md - 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  sheetRowPressed: { backgroundColor: 'rgba(99,214,181,0.10)' },
  sheetRowLabel: { ...typography.body, color: colors.textPrimary },
  editTitle: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 26,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  editField: { marginBottom: spacing.md, gap: 4 },
  editLabel: { ...typography.caption, color: colors.textSecondary },
  editInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(5,10,11,0.6)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 4,
  },
  remixToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(5,10,11,0.45)',
  },
  toolChipActive: { backgroundColor: 'rgba(99,214,181,0.18)' },
  editSave: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveLabel: { ...typography.subtitle, fontFamily: 'Sora_600SemiBold', color: '#0B1411' },
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
    backgroundColor: 'rgba(17,30,25,0.6)',
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
  detailSheet: { maxHeight: '82%' },
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
    backgroundColor: 'rgba(240,131,140,0.10)',
  },
  detailDeleteLabel: { ...typography.caption, fontSize: 12, color: colors.danger },
  detailList: { marginTop: spacing.md },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
});
