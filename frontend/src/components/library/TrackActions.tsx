import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Media } from '../../services/api/types';
import { displayArtist, displayTitle } from '../../utils/mediaDisplay';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';

export type TrackAction = {
  key:
    | 'play'
    | 'play-next'
    | 'queue'
    | 'favorite'
    | 'pin'
    | 'playlist'
    | 'artist'
    | 'edit'
    | 'select'
    | 'download'
    | 'offline'
    | 'delete';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint?: string;
  onPress: () => void;
};

export type TrackActionContext = {
  media: Media;
  favorite: boolean;
  pinned: boolean;
  pinLimitReached?: boolean;
  maxPins?: number;
  offlineSaved?: boolean;
  confirmDelete?: boolean;
  onPlay?: () => void;
  onPlayNext?: () => void;
  onAddToQueue?: () => void;
  onToggleFavorite?: () => void;
  onTogglePin?: () => void;
  onAddToPlaylist?: () => void;
  onMoreByArtist?: () => void;
  onEdit?: () => void;
  onSelectMultiple?: () => void;
  onSaveFile?: () => void;
  onToggleOffline?: () => void;
  onDelete?: () => void;
};

/** Single canonical action order/label builder for Library row menus and the
 * opened track's More panel. Callers provide the operations that make sense
 * in their navigation context; any unsupported operation is omitted. */
export function buildTrackActions(context: TrackActionContext): TrackAction[] {
  const artist = displayArtist(context.media) ?? 'Unknown artist';
  const candidates: (TrackAction | null)[] = [
    context.onPlay ? { key: 'play', icon: 'play', label: 'Play', onPress: context.onPlay } : null,
    context.onPlayNext ? {
      key: 'play-next', icon: 'return-down-forward', label: 'Play next', onPress: context.onPlayNext,
    } : null,
    context.onAddToQueue ? { key: 'queue', icon: 'add', label: 'Add to queue', onPress: context.onAddToQueue } : null,
    context.onToggleFavorite ? {
      key: 'favorite',
      icon: context.favorite ? 'heart' : 'heart-outline',
      label: context.favorite ? 'Remove from favorites' : 'Add to favorites',
      tint: colors.pink,
      onPress: context.onToggleFavorite,
    } : null,
    context.onTogglePin ? {
      key: 'pin',
      icon: context.pinned ? 'bookmark' : 'bookmark-outline',
      label: context.pinned
        ? 'Unpin'
        : context.pinLimitReached && context.maxPins
          ? `Pin (replaces oldest of ${context.maxPins})`
          : 'Pin for quick access',
      tint: colors.gold,
      onPress: context.onTogglePin,
    } : null,
    context.onAddToPlaylist ? {
      key: 'playlist', icon: 'list', label: 'Add to playlist', onPress: context.onAddToPlaylist,
    } : null,
    context.onMoreByArtist ? {
      key: 'artist', icon: 'person-outline', label: `More by ${artist}`, onPress: context.onMoreByArtist,
    } : null,
    context.onEdit ? {
      key: 'edit', icon: 'pencil', label: 'Rename / edit details', onPress: context.onEdit,
    } : null,
    context.onSelectMultiple ? {
      key: 'select', icon: 'checkmark-circle-outline', label: 'Select multiple…', onPress: context.onSelectMultiple,
    } : null,
    context.onSaveFile ? {
      key: 'download', icon: 'download-outline', label: 'Save file', onPress: context.onSaveFile,
    } : null,
    context.onToggleOffline ? {
      key: 'offline',
      icon: context.offlineSaved ? 'checkmark-circle' : 'cloud-download-outline',
      label: context.offlineSaved ? 'Saved for offline · tap to remove' : 'Save for offline playback',
      tint: context.offlineSaved ? colors.success : undefined,
      onPress: context.onToggleOffline,
    } : null,
    context.onDelete ? {
      key: 'delete',
      icon: context.confirmDelete ? 'alert-circle' : 'trash-outline',
      label: context.confirmDelete ? 'Sure? Tap again to delete' : 'Delete',
      tint: colors.danger,
      onPress: context.onDelete,
    } : null,
  ];
  return candidates.filter((action): action is TrackAction => action != null);
}

export function TrackActionList({ context }: { context: TrackActionContext }) {
  return (
    <>
      {buildTrackActions(context).map((action) => (
        <Pressable
          key={action.key}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${action.label} for ${displayTitle(context.media)}`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Ionicons name={action.icon} size={19} color={action.tint ?? colors.textSecondary} />
          <Text style={[styles.label, action.tint ? { color: action.tint } : null]}>{action.label}</Text>
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  rowPressed: { backgroundColor: glass.tintPrimary },
  label: { ...typography.body, color: colors.textPrimary },
});
