import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Artwork } from '../ui/Artwork';
import { CompactGlassSheet } from '../ui/CompactGlassSheet';
import { EmptyState } from '../ui/EmptyState';
import { PressableScale } from '../ui/PressableScale';
import { ConfirmationPanel } from '../ui/SignOutConfirmSheet';
import { TextField } from '../ui/TextField';
import * as libraryApi from '../../services/api/library';
import type { Media, Playlist } from '../../services/api/types';
import { usePlaylistStore } from '../../store/playlistStore';
import { toast } from '../../store/toastStore';
import { apiErrorMessage } from '../../utils/apiError';
import { displayArtist as artistOf, displayTitle } from '../../utils/mediaDisplay';
import { colors, glass, layout, radii, shadows, spacing, typography } from '../../theme/tokens';

function displayArtist(media: Media): string {
  return artistOf(media) ?? 'Unknown artist';
}

function PlaylistCoverMosaic({
  playlist,
  size,
}: {
  playlist: Playlist;
  size: number;
}) {
  if (playlist.artwork_url) {
    return (
      <Artwork
        media={{
          id: `playlist-art-${playlist.id}`,
          title: playlist.name,
          thumbnail_url: playlist.artwork_url,
          media_type: 'audio',
        }}
        size={size}
        borderRadius={radii.cover}
        accessibilityLabel={`${playlist.name} playlist artwork`}
      />
    );
  }

  const cells = Array.from({ length: 4 }, (_, index) => (
    playlist.items.length > 0
      ? playlist.items[index] ?? playlist.items[index % playlist.items.length]
      : {
          id: `playlist-mosaic-${playlist.id}-${index}`,
          title: playlist.name,
          media_type: 'audio' as const,
        }
  ));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${playlist.name} playlist artwork mosaic`}
      style={[styles.playlistMosaic, { width: size, height: size }]}
    >
      {cells.map((media, index) => (
        <View
          key={`${media.id ?? index}-${index}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.playlistMosaicCell}
        >
          <Artwork media={media} size="100%" borderRadius={0} />
        </View>
      ))}
      <View pointerEvents="none" style={styles.playlistMosaicFrame} />
    </View>
  );
}

export function PlaylistsPane({ playlists, onOpen }: { playlists: Playlist[]; onOpen: (id: string) => void }) {
  const createPlaylist = usePlaylistStore((state) => state.create);
  const movePlaylist = usePlaylistStore((state) => state.move);
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
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="New playlist name"
            leadingIcon="add-circle-outline"
            compact
            style={styles.createInput}
            containerStyle={styles.createField}
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
            motif="shelf"
            title="No playlists yet"
            subtitle="Name one above, then long-press any track to add it."
          />
        </View>
      }
      renderItem={({ item, index }) => {
        return (
          <View style={styles.playlistRowShell}>
            <Pressable
              onPress={() => onOpen(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.name} playlist`}
              style={({ pressed }) => [styles.playlistOpen, pressed && styles.listRowPressed]}
            >
              <PlaylistCoverMosaic playlist={item} size={58} />
              <View style={styles.listText}>
                <Text numberOfLines={1} style={styles.cardTitle}>{item.name}</Text>
                <Text numberOfLines={1} style={styles.cardArtist}>
                  {item.items.length} {item.items.length === 1 ? 'track' : 'tracks'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
            <View style={styles.moveControls} accessibilityLabel={`Reorder ${item.name}`}>
              <Pressable
                onPress={() => void movePlaylist(item.id, -1).catch((err) => toast(apiErrorMessage(err, "Couldn't reorder playlists."), 'error'))}
                disabled={index === 0}
                accessibilityRole="button"
                accessibilityLabel={`Move ${item.name} up`}
                style={[styles.moveButton, index === 0 && styles.controlDisabled]}
              ><Ionicons name="chevron-up" size={18} color={colors.textSecondary} /></Pressable>
              <Pressable
                onPress={() => void movePlaylist(item.id, 1).catch((err) => toast(apiErrorMessage(err, "Couldn't reorder playlists."), 'error'))}
                disabled={index === playlists.length - 1}
                accessibilityRole="button"
                accessibilityLabel={`Move ${item.name} down`}
                style={[styles.moveButton, index === playlists.length - 1 && styles.controlDisabled]}
              ><Ionicons name="chevron-down" size={18} color={colors.textSecondary} /></Pressable>
            </View>
          </View>
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
  const playlists = usePlaylistStore((state) => state.playlists);
  const addItems = usePlaylistStore((state) => state.addItems);
  const createPlaylist = usePlaylistStore((state) => state.create);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(playlist: Playlist) {
    setBusy(true);
    try {
      await addItems(playlist.id, mediaIds);
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
      await addItems(playlist.id, mediaIds);
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
    <CompactGlassSheet
      visible
      onClose={onClose}
      accessibilityLabel={`Add ${label} to a playlist`}
      closeAccessibilityLabel="Close playlist picker"
      maxWidth={460}
      maxHeightRatio={0.72}
      scrollable
      header={
        <View>
          <Text style={styles.editTitle}>Add to playlist</Text>
          <Text numberOfLines={1} style={styles.sheetSub}>{label}</Text>
        </View>
      }
    >
      <View style={[styles.createRow, { marginBottom: spacing.md }]}>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="New playlist name"
          leadingIcon="add-circle-outline"
          compact
          style={styles.createInput}
          containerStyle={styles.createField}
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
    </CompactGlassSheet>
  );
}

/** Focused prompt used by the selection strip's "+ new playlist" target.
 * This is intentionally separate from PlaylistPickerModal: a drag drop should
 * ask for the promised name directly instead of making the user pick a second
 * destination after the drop. */
export function NewPlaylistWithItemsModal({
  mediaIds,
  onClose,
  onDone,
}: {
  mediaIds: string[];
  onClose: () => void;
  onDone: (playlist: Playlist) => void;
}) {
  const createPlaylist = usePlaylistStore((state) => state.create);
  const addItems = usePlaylistStore((state) => state.addItems);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy || mediaIds.length === 0) return;
    setBusy(true);
    try {
      const playlist = await createPlaylist(trimmed);
      const updated = await addItems(playlist.id, mediaIds);
      toast(`Created “${updated.name}” with ${mediaIds.length} track${mediaIds.length === 1 ? '' : 's'}`, 'success');
      onDone(updated);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't create that playlist."), 'error');
      setBusy(false);
    }
  }

  return (
    <CompactGlassSheet
      visible
      onClose={onClose}
      accessibilityLabel="Create a playlist from selected tracks"
      closeAccessibilityLabel="Cancel new playlist"
      maxWidth={440}
      header={
        <View>
          <Text style={styles.editTitle}>New playlist</Text>
          <Text style={styles.sheetSub}>
            {mediaIds.length} selected {mediaIds.length === 1 ? 'track' : 'tracks'} will be added.
          </Text>
        </View>
      }
    >
      <View style={styles.createRow}>
        <TextField
          autoFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={submit}
          placeholder="Playlist name"
          accessibilityLabel="New playlist name"
          leadingIcon="list-outline"
          compact
          style={styles.createInput}
          containerStyle={styles.createField}
        />
        <PressableScale onPress={submit} disabled={busy || !name.trim()} scaleTo={0.9}>
          <LinearGradient
            colors={colors.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.createButton}
          >
            {busy ? <ActivityIndicator size="small" color="#0B1411" /> : <Ionicons name="checkmark" size={20} color="#0B1411" />}
          </LinearGradient>
        </PressableScale>
      </View>
    </CompactGlassSheet>
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
  const playlist = usePlaylistStore((state) => state.playlists.find((item) => item.id === playlistId));
  const removeItem = usePlaylistStore((state) => state.removeItem);
  const addItem = usePlaylistStore((state) => state.addItem);
  const updatePlaylist = usePlaylistStore((state) => state.update);
  const reorderItems = usePlaylistStore((state) => state.reorderItems);
  const removePlaylist = usePlaylistStore((state) => state.remove);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(playlist?.name ?? '');
  const [artworkUrl, setArtworkUrl] = useState(playlist?.artwork_url ?? '');
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<{ item: Media; index: number } | null>(null);

  if (!playlist) return null;

  async function handleDelete() {
    try {
      await removePlaylist(playlistId);
      toast('Playlist deleted', 'success');
      onClose();
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't delete that playlist."), 'error');
    }
  }

  async function savePlaylist() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await updatePlaylist(playlistId, { name: trimmed, artwork_url: artworkUrl.trim() || null });
      setEditing(false);
      toast('Playlist updated', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't update that playlist."), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function moveTrack(index: number, direction: -1 | 1) {
    const target = index + direction;
    const items = playlist?.items ?? [];
    if (target < 0 || target >= items.length || busy) return;
    const ids = items.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    try {
      await reorderItems(playlistId, ids);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't reorder those tracks."), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function undoRemove() {
    if (!removed || busy) return;
    setBusy(true);
    try {
      const restored = await addItem(playlistId, removed.item.id);
      const ids = restored.items.filter((item) => item.id !== removed.item.id).map((item) => item.id);
      ids.splice(Math.min(removed.index, ids.length), 0, removed.item.id);
      await reorderItems(playlistId, ids);
      setRemoved(null);
      toast('Track restored', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't restore that track."), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <CompactGlassSheet
      visible
      onClose={onClose}
      accessibilityLabel={`${playlist.name} playlist detail`}
      closeAccessibilityLabel="Close playlist detail"
      eyebrow="Playlist detail"
      maxWidth={720}
      maxHeightRatio={0.9}
      bodyStyle={styles.detailBody}
      header={<Text numberOfLines={1} style={styles.editTitle}>{playlist.name}</Text>}
      footer={playlist.items.length > 0 ? (
        <PressableScale onPress={() => onPlayAll(playlist)} scaleTo={0.97}>
          <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editSave}>
            <Text style={styles.editSaveLabel}>Play all</Text>
          </LinearGradient>
        </PressableScale>
      ) : undefined}
    >
          <View style={styles.detailHeader}>
            <PlaylistCoverMosaic playlist={playlist} size={104} />
            <View style={styles.detailHeaderText}>
              <Text numberOfLines={1} style={styles.editTitle}>{playlist.name}</Text>
              <Text style={styles.sheetSub}>
                {playlist.items.length} {playlist.items.length === 1 ? 'track' : 'tracks'}
              </Text>
            </View>
            <Pressable
              onPress={() => setEditing((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Close playlist editor' : 'Edit playlist name and artwork'}
              style={styles.detailEdit}
            >
              <Ionicons name={editing ? 'close' : 'create-outline'} size={18} color={colors.cyan} />
            </Pressable>
            <Pressable onPress={() => setConfirmDelete(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${playlist.name} playlist`} style={styles.detailDelete}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>

          {confirmDelete ? (
            <ConfirmationPanel
              affectedLabel={`“${playlist.name}” and its ${playlist.items.length} ${playlist.items.length === 1 ? 'track reference' : 'track references'} will be removed`}
              consequence="The tracks stay in your Library; only this playlist and its ordering are deleted."
              safeAlternative="Keep playlist"
              confirmLabel="Delete playlist"
              onCancel={() => setConfirmDelete(false)}
              onConfirm={() => void handleDelete()}
              icon="trash-outline"
            />
          ) : null}

          {editing ? (
            <View style={styles.playlistEditor}>
              <TextField label="Playlist name" value={name} onChangeText={setName} accessibilityLabel="Playlist name" style={styles.editInput} />
              <TextField label="Artwork URL" value={artworkUrl} onChangeText={setArtworkUrl} accessibilityLabel="Playlist artwork URL" autoCapitalize="none" style={styles.editInput} placeholder="https://…" />
              <Pressable onPress={() => void savePlaylist()} disabled={busy || !name.trim()} accessibilityRole="button" style={styles.editorSave}>
                {busy ? <ActivityIndicator size="small" color={colors.textInverse} /> : <Ionicons name="checkmark" size={17} color={colors.textInverse} />}
                <Text style={styles.editorSaveLabel}>Save playlist</Text>
              </Pressable>
            </View>
          ) : null}

          {removed ? (
            <View style={styles.undoBar} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text numberOfLines={1} style={styles.undoText}>Removed {displayTitle(removed.item)}</Text>
              <Pressable onPress={() => void undoRemove()} disabled={busy} accessibilityRole="button" accessibilityLabel="Undo track removal" style={styles.undoButton}>
                <Ionicons name="arrow-undo" size={16} color={colors.cyan} />
                <Text style={styles.undoLabel}>Undo</Text>
              </Pressable>
            </View>
          ) : null}

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
            renderItem={({ item, index }) => (
              <View style={styles.detailRow}>
                <Artwork media={item} size={40} borderRadius={radii.sm} />
                <View style={styles.listText}>
                  <Text numberOfLines={1} style={styles.cardTitle}>{displayTitle(item)}</Text>
                  <Text numberOfLines={1} style={styles.cardArtist}>{displayArtist(item)}</Text>
                </View>
                <View style={styles.trackMoveControls}>
                  <Pressable onPress={() => void moveTrack(index, -1)} disabled={busy || index === 0} accessibilityRole="button" accessibilityLabel={`Move ${displayTitle(item)} up`} style={[styles.trackMoveButton, index === 0 && styles.controlDisabled]}>
                    <Ionicons name="chevron-up" size={17} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => void moveTrack(index, 1)} disabled={busy || index === playlist.items.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${displayTitle(item)} down`} style={[styles.trackMoveButton, index === playlist.items.length - 1 && styles.controlDisabled]}>
                    <Ionicons name="chevron-down" size={17} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <Pressable
                  onPress={async () => {
                    try {
                      await removeItem(playlistId, item.id);
                      setRemoved({ item, index });
                    } catch (err) {
                      toast(apiErrorMessage(err, "Couldn't remove that track."), 'error');
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${displayTitle(item)} from ${playlist.name}`}
                  style={styles.trackRemoveButton}
                >
                  <Ionicons name="remove-circle-outline" size={18} color={colors.danger} />
                  <Text style={styles.trackRemoveLabel}>Remove</Text>
                </Pressable>
              </View>
            )}
          />
    </CompactGlassSheet>
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
  const [title, setTitle] = useState(media.title ?? media.recognized_title ?? '');
  const [artist, setArtist] = useState(media.artist ?? media.recognized_artist ?? '');
  const [album, setAlbum] = useState(media.album ?? '');
  const [genre, setGenre] = useState(media.genre ?? '');
  const [releaseYear, setReleaseYear] = useState(media.release_year ? String(media.release_year) : '');
  const [isRemix, setIsRemix] = useState(media.is_remix === true);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = useMemo(() => (
    title !== (media.title ?? media.recognized_title ?? '')
    || artist !== (media.artist ?? media.recognized_artist ?? '')
    || album !== (media.album ?? '')
    || genre !== (media.genre ?? '')
    || releaseYear !== (media.release_year ? String(media.release_year) : '')
    || isRemix !== (media.is_remix === true)
  ), [album, artist, genre, isRemix, media, releaseYear, title]);

  function requestClose() {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmDiscard(true);
  }

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
    <CompactGlassSheet
      visible
      onClose={requestClose}
      accessibilityLabel="Edit track details"
      closeAccessibilityLabel="Close edit details"
      eyebrow="Track identity"
      header={<Text style={styles.editTitle}>Edit details</Text>}
      maxWidth={560}
      maxHeightRatio={0.88}
      scrollable
      footer={confirmDiscard ? undefined : (
        <View style={styles.editActions}>
          <Pressable onPress={requestClose} disabled={saving} style={styles.editCancel} accessibilityRole="button">
            <Text style={styles.editCancelLabel}>Cancel</Text>
          </Pressable>
          <PressableScale onPress={save} disabled={saving || !dirty} scaleTo={0.97} style={styles.editSaveWrap}>
            <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editSave}>
              {saving ? <ActivityIndicator size="small" color="#0B1411" /> : <Text style={styles.editSaveLabel}>{dirty ? 'Save' : 'Saved'}</Text>}
            </LinearGradient>
          </PressableScale>
        </View>
      )}
    >
          {[
            { label: 'Title', value: title, set: setTitle },
            { label: 'Artist', value: artist, set: setArtist },
            { label: 'Album', value: album, set: setAlbum },
            { label: 'Genre', value: genre, set: setGenre },
            { label: 'Release year', value: releaseYear, set: setReleaseYear },
          ].map((field) => (
            <TextField
                key={field.label}
                label={field.label}
                value={field.value}
                onChangeText={field.set}
                placeholder={field.label}
                style={styles.editInput}
              />
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
          {confirmDiscard ? (
            <ConfirmationPanel
              affectedLabel="Discard unsaved changes?"
              consequence="Your edits will be lost. The saved track details remain unchanged."
              safeAlternative="Keep editing"
              confirmLabel="Discard"
              onCancel={() => setConfirmDiscard(false)}
              onConfirm={onClose}
            />
          ) : null}
    </CompactGlassSheet>
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
    backgroundColor: glass.fill,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  listRowPressed: { backgroundColor: glass.tintPrimary },
  playlistRowShell: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  playlistOpen: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: glass.fill,
  },
  moveControls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moveButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: glass.fill },
  controlDisabled: { opacity: 0.3 },
  listText: { flex: 1 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalRootDesktop: { justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(3,5,3,0.65)' },
  sheet: {
    backgroundColor: colors.bgElevated,
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
    backgroundColor: glass.strokeStrong,
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
  sheetRowPressed: { backgroundColor: glass.tintPrimary },
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
    backgroundColor: glass.fillDeep,
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
    backgroundColor: glass.fillDeep,
  },
  toolChipActive: { backgroundColor: glass.tintPrimary },
  editSave: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveLabel: { ...typography.subtitle, fontFamily: 'Sora_600SemiBold', color: '#0B1411' },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editSaveWrap: { flex: 1 },
  editCancel: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.md, backgroundColor: glass.fill },
  editCancelLabel: { ...typography.subtitle, fontSize: 13, color: colors.textSecondary },
  discardPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: glass.tintDangerStroke,
    backgroundColor: glass.tintDanger,
  },
  discardCopy: { flex: 1, minWidth: 160 },
  discardTitle: { ...typography.subtitle, fontSize: 13, color: colors.textPrimary },
  discardButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.md },
  discardKeepLabel: { ...typography.subtitle, fontSize: 12, color: colors.cyan },
  discardDanger: { backgroundColor: glass.tintDanger },
  discardDangerLabel: { ...typography.subtitle, fontSize: 12, color: colors.danger },
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
    backgroundColor: glass.fill,
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
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  detailHeaderText: { flex: 1 },
  playlistMosaic: {
    position: 'relative',
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    flexShrink: 0,
    borderRadius: radii.cover,
    backgroundColor: glass.fillDeep,
  },
  createField: { flex: 1, minWidth: 0 },
  playlistMosaicCell: { width: '50%', height: '50%', overflow: 'hidden' },
  playlistMosaicFrame: {
    ...(StyleSheet.absoluteFill as object),
    borderRadius: radii.cover,
    borderWidth: 1,
    borderColor: 'rgba(218,250,238,0.22)',
  },
  detailEdit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: glass.tintPrimary,
  },
  detailDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: glass.tintDanger,
  },
  detailDeleteLabel: { ...typography.caption, fontSize: 12, color: colors.danger },
  detailBody: { minHeight: 260, flexShrink: 1 },
  detailList: { marginTop: spacing.md, flexShrink: 1 },
  playlistEditor: { padding: spacing.md, marginBottom: spacing.md, borderRadius: radii.lg, backgroundColor: glass.fillDeep },
  editorSave: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.md, backgroundColor: colors.cyan },
  editorSaveLabel: { ...typography.subtitle, fontSize: 13, color: colors.textInverse },
  undoBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingLeft: spacing.md, borderRadius: radii.md, backgroundColor: glass.tintPrimary },
  undoText: { ...typography.caption, flex: 1, color: colors.textSecondary },
  undoButton: { minWidth: 88, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.md },
  undoLabel: { ...typography.subtitle, fontSize: 12, color: colors.cyan },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  trackMoveControls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trackMoveButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: glass.fill },
  trackRemoveButton: { minWidth: 86, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: glass.tintDanger },
  trackRemoveLabel: { ...typography.caption, fontSize: 11, color: colors.danger },
});
