import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Media } from '../../services/api/types';
import type { RootStackParamList } from '../../navigation/types';
import * as libraryApi from '../../services/api/library';
import * as offlineMedia from '../../services/storage/offlineMedia';
import { tokenStorage } from '../../services/storage/tokenStorage';
import { useFavoritesStore } from '../../store/favoritesStore';
import { useLibraryStore } from '../../store/libraryStore';
import { MAX_PINS, usePinStore } from '../../store/pinStore';
import { usePlayerStore } from '../../store/playerStore';
import { toast } from '../../store/toastStore';
import { apiErrorMessage } from '../../utils/apiError';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';
import { buildMediaDetailSections, type MediaDetailItem } from '../../utils/mediaDetails';
import { displayArtist, displayTitle } from '../../utils/mediaDisplay';
import { EditMediaModal, PlaylistPickerModal } from '../library/LibrarySheets';
import { TrackActionList } from '../library/TrackActions';
import { Artwork } from '../ui/Artwork';

const DETAIL_ICONS: Record<MediaDetailItem['key'], keyof typeof Ionicons.glyphMap> = {
  album: 'disc-outline',
  genre: 'pricetag-outline',
  released: 'calendar-outline',
  duration: 'time-outline',
  source: 'cloud-download-outline',
  imported: 'archive-outline',
  file: 'document-outline',
};

function DetailGrid({ items }: { items: MediaDetailItem[] }) {
  return (
    <View style={styles.grid} accessibilityRole="list">
      {items.map((item) => (
        <View
          key={item.key}
          accessible
          accessibilityLabel={`${item.label}: ${item.value}`}
          style={styles.detailTile}
        >
          <View style={styles.detailIcon}>
            <Ionicons name={DETAIL_ICONS[item.key]} size={17} color={colors.cyan} />
          </View>
          <View style={styles.detailText}>
            <Text style={styles.detailLabel}>{item.label}</Text>
            <Text numberOfLines={2} style={styles.detailValue}>{item.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function TrackDetails({ media }: { media: Media }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const details = buildMediaDetailSections(media);
  const artist = displayArtist(media) ?? 'Unknown artist';
  const favorite = useFavoritesStore((state) => !!state.ids[media.id]);
  const toggleFavorite = useFavoritesStore((state) => state.toggle);
  const pinnedIds = usePinStore((state) => state.ids);
  const togglePin = usePinStore((state) => state.toggle);
  const upsert = useLibraryStore((state) => state.upsert);
  const remove = useLibraryStore((state) => state.remove);
  const play = usePlayerStore((state) => state.play);
  const playNextInQueue = usePlayerStore((state) => state.playNextInQueue);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const stop = usePlayerStore((state) => state.stop);
  const currentMediaId = usePlayerStore((state) => state.currentMedia?.id);
  const [playlistPicker, setPlaylistPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);

  useEffect(() => {
    if (!offlineMedia.isSupported()) return;
    void offlineMedia.isSavedOffline(media.id).then(setOfflineSaved);
  }, [media.id]);

  async function saveFile() {
    const token = await tokenStorage.getAccessToken();
    const url = token
      ? `${libraryApi.streamUrl(media.id)}?token=${encodeURIComponent(token)}`
      : libraryApi.streamUrl(media.id);
    try {
      if (Platform.OS === 'web') window.open(url, '_blank');
      else await Linking.openURL(url);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't open that file."), 'error');
    }
  }

  async function toggleOffline() {
    if (savingOffline) return;
    setSavingOffline(true);
    try {
      if (offlineSaved) {
        await offlineMedia.removeOffline(media.id);
        setOfflineSaved(false);
        toast('Removed from offline downloads', 'info');
      } else {
        const token = await tokenStorage.getAccessToken();
        const url = token
          ? `${libraryApi.streamUrl(media.id)}?proxy=1&token=${encodeURIComponent(token)}`
          : `${libraryApi.streamUrl(media.id)}?proxy=1`;
        await offlineMedia.saveOffline(media, url);
        setOfflineSaved(true);
        toast('Saved for offline playback', 'success');
      }
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't update the offline copy."), 'error');
    } finally {
      setSavingOffline(false);
    }
  }

  async function deleteTrack() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await remove(media.id);
      if (currentMediaId === media.id) stop();
      toast('Removed from your collection', 'success');
      navigation.goBack();
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't delete that track."), 'error');
      setConfirmDelete(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        <Artwork media={media} size={64} borderRadius={radii.md} />
        <View style={styles.identityText}>
          <Text numberOfLines={2} style={styles.title}>{displayTitle(media)}</Text>
          <Text numberOfLines={1} style={styles.artist}>{artist}</Text>
          <View style={styles.chips}>
            <View style={styles.chip}>
              <Ionicons
                name={media.media_type === 'video' ? 'videocam-outline' : 'musical-notes-outline'}
                size={12}
                color={colors.textSecondary}
              />
              <Text style={styles.chipLabel}>{media.media_type === 'video' ? 'Video' : 'Audio'}</Text>
            </View>
            {media.is_remix === true ? (
              <View style={[styles.chip, styles.remixChip]}>
                <Ionicons name="sparkles-outline" size={12} color={colors.gold} />
                <Text style={[styles.chipLabel, styles.remixLabel]}>Remix</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Track actions</Text>
        <TrackActionList
          context={{
            media,
            favorite,
            pinned: pinnedIds.includes(media.id),
            pinLimitReached: pinnedIds.length >= MAX_PINS,
            maxPins: MAX_PINS,
            offlineSaved,
            confirmDelete,
            onPlay: () => void play(media),
            onPlayNext: () => { playNextInQueue(media); toast('Playing next', 'success'); },
            onAddToQueue: () => { addToQueue(media); toast('Added to queue', 'success'); },
            onToggleFavorite: () => toggleFavorite(media.id),
            onTogglePin: () => togglePin(media.id),
            onAddToPlaylist: () => setPlaylistPicker(true),
            onMoreByArtist: () => navigation.navigate('Main', { screen: 'Library', params: { tab: 'all', query: artist } }),
            onEdit: () => setEditing(true),
            onSelectMultiple: () => navigation.navigate('Main', { screen: 'Library', params: { tab: 'all', selectId: media.id } }),
            onSaveFile: saveFile,
            onToggleOffline: offlineMedia.isSupported() && media.media_type === 'audio' ? toggleOffline : undefined,
            onDelete: deleteTrack,
          }}
        />
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Music details</Text>
        {details.music.length > 0 ? (
          <DetailGrid items={details.music} />
        ) : (
          <View accessible accessibilityLabel="No album, genre, or release year yet" style={styles.emptyState}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            <Text style={styles.emptyText}>No album, genre, or release year yet.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>File & source</Text>
        <DetailGrid items={details.archive} />
      </View>

      {playlistPicker && (
        <PlaylistPickerModal
          mediaIds={[media.id]}
          label={displayTitle(media)}
          onClose={() => setPlaylistPicker(false)}
          onDone={() => setPlaylistPicker(false)}
        />
      )}
      {editing && (
        <EditMediaModal
          media={media}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            upsert(updated);
            setEditing(false);
            toast('Details saved', 'success');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg, paddingBottom: spacing.sm },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  identityText: { flex: 1, gap: 3 },
  title: { ...typography.subtitle, fontSize: 16, lineHeight: 21, color: colors.textPrimary },
  artist: { ...typography.caption, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceBright,
  },
  remixChip: { backgroundColor: 'rgba(245, 194, 107, 0.10)' },
  chipLabel: { ...typography.caption, fontSize: 10, color: colors.textSecondary },
  remixLabel: { color: colors.gold },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.eyebrow, fontSize: 10, letterSpacing: 1.5, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 145,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.tintPrimary,
  },
  detailText: { flex: 1, minWidth: 0 },
  detailLabel: { ...typography.caption, fontSize: 10, color: colors.textMuted },
  detailValue: { ...typography.caption, fontSize: 12, lineHeight: 16, color: colors.textPrimary, marginTop: 2 },
  emptyState: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  emptyText: { ...typography.caption, flex: 1, color: colors.textMuted },
});
