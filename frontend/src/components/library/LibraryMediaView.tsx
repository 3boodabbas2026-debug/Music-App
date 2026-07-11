import { memo, useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { FadeImage } from '../ui/FadeImage';
import type { Media } from '../../services/api/types';
import {
  coverGlyphColor,
  coverGradient,
  displayArtist,
  displayTitle,
  thumbnailUri,
} from '../../utils/mediaDisplay';
import { colors, gradients, radii, spacing, typography } from '../../theme/tokens';

type MediaItemProps = {
  media: Media;
  favorite: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/** Recognition metadata shown consistently in cards, rows, and the detail sheet. */
export function metadataLine(media: Media): string {
  const parts: string[] = [];
  if (media.genre) parts.push(media.genre);
  if (media.release_year) parts.push(String(media.release_year));
  if (media.is_remix) parts.push('Remix');
  return parts.join(' · ');
}

export const GridCard = memo(function GridCard({
  media,
  size,
  favorite,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: MediaItemProps & { size: number }) {
  const [hovered, setHovered] = useState(false);
  const coverUri = thumbnailUri(media);
  const artist = displayArtist(media);
  const metadata = metadataLine(media);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle(media)}${artist ? `, ${artist}` : ''}${metadata ? `, ${metadata}` : ''}`}
      delayLongPress={350}
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
    >
      <View
        style={[
          styles.card,
          hovered && styles.cardHovered,
          selected && styles.cardSelected,
          { width: size, height: size },
        ]}
      >
        {/* Video posters are letterboxed so their 16:9 framing survives the
            square card. Audio artwork remains a full-bleed cover crop. */}
        <LinearGradient
          colors={coverGradient(media.id)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {coverUri && (
          <FadeImage
            uri={coverUri}
            resizeMode={media.media_type === 'video' ? 'contain' : 'cover'}
            style={StyleSheet.absoluteFill as object}
          />
        )}
        <LinearGradient colors={gradients.coverScrim} style={styles.scrim} />

        {!coverUri && (
          <View style={styles.glyphWrap}>
            <Ionicons
              name={media.media_type === 'video' ? 'videocam' : 'musical-notes'}
              size={38}
              color={`${coverGlyphColor(media.id)}59`}
            />
          </View>
        )}

        <View style={styles.durationChip}>
          <Ionicons
            name={media.media_type === 'video' ? 'videocam' : 'musical-notes'}
            size={10}
            color={colors.textSecondary}
          />
          <Text style={styles.durationText}>{formatDuration(media.duration_seconds)}</Text>
        </View>
        {favorite && (
          <View style={styles.heartChip}>
            <Ionicons name="heart" size={12} color={colors.pink} />
          </View>
        )}

        {selectMode && (
          <View style={[styles.selectCheck, selected && styles.selectCheckActive]}>
            {selected && <Ionicons name="checkmark" size={13} color="#100B18" />}
          </View>
        )}

        {!selectMode && (
          <Pressable
            onPress={onLongPress}
            accessibilityLabel={`More options for ${displayTitle(media)}`}
            style={[styles.moreChip, hovered && styles.moreChipHovered]}
            hitSlop={8}
          >
            <Ionicons name="ellipsis-horizontal" size={15} color={colors.textPrimary} />
          </Pressable>
        )}
        {hovered && !selectMode && (
          <View pointerEvents="none" style={styles.playFabWrap}>
            <LinearGradient
              colors={colors.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playFab}
            >
              <Ionicons name="play" size={22} color="#100B18" style={{ marginLeft: 2 }} />
            </LinearGradient>
          </View>
        )}

        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.cardTitle}>{displayTitle(media)}</Text>
          {artist && <Text numberOfLines={1} style={styles.cardArtist}>{artist}</Text>}
          {!!metadata && <Text numberOfLines={1} style={styles.cardMetadata}>{metadata}</Text>}
        </View>
      </View>
    </Pressable>
  );
});

export const ListRow = memo(function ListRow({
  media,
  favorite,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: MediaItemProps) {
  const [hovered, setHovered] = useState(false);
  const coverUri = thumbnailUri(media);
  const artist = displayArtist(media);
  const metadata = metadataLine(media);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle(media)}${artist ? `, ${artist}` : ''}${metadata ? `, ${metadata}` : ''}`}
      delayLongPress={350}
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
      style={({ pressed }) => [
        styles.listRow,
        hovered && styles.listRowHovered,
        selected && styles.listRowSelected,
        pressed && styles.listRowPressed,
      ]}
    >
      {selectMode && (
        <View style={[styles.selectCheckInline, selected && styles.selectCheckActive]}>
          {selected && <Ionicons name="checkmark" size={12} color="#100B18" />}
        </View>
      )}
      {coverUri ? (
        <FadeImage uri={coverUri} style={styles.listCover as object} />
      ) : (
        <LinearGradient
          colors={coverGradient(media.id)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.listCover}
        >
          <Ionicons
            name={media.media_type === 'video' ? 'videocam' : 'musical-notes'}
            size={16}
            color={`${coverGlyphColor(media.id)}73`}
          />
        </LinearGradient>
      )}
      <View style={styles.listText}>
        <Text numberOfLines={1} style={styles.cardTitle}>{displayTitle(media)}</Text>
        {artist && <Text numberOfLines={1} style={styles.cardArtist}>{artist}</Text>}
        {!!metadata && <Text numberOfLines={1} style={styles.cardMetadata}>{metadata}</Text>}
      </View>
      <Ionicons
        name={media.media_type === 'video' ? 'videocam-outline' : 'musical-notes-outline'}
        size={13}
        color={colors.textMuted}
      />
      {favorite && <Ionicons name="heart" size={14} color={colors.pink} />}
      {!selectMode && (
        <Pressable
          onPress={onLongPress}
          accessibilityLabel={`More options for ${displayTitle(media)}`}
          hitSlop={10}
          style={styles.rowMoreButton}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
        </Pressable>
      )}
      <Text style={styles.durationText}>{formatDuration(media.duration_seconds)}</Text>
    </Pressable>
  );
});

/** First-load placeholder shown before cached or live library data arrives. */
export function SkeletonGrid({
  columns,
  cellSize,
  view,
}: {
  columns: number;
  cellSize: number;
  view: 'grid' | 'list';
}) {
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
    <View style={view === 'grid' ? styles.skeletonGridWrap : styles.skeletonListWrap}>
      {Array.from({ length: count }).map((_, index) =>
        view === 'grid' ? (
          <Animated.View
            key={index}
            style={[styles.skeletonCard, { width: cellSize, height: cellSize, opacity: pulse }]}
          />
        ) : (
          <Animated.View key={index} style={[styles.skeletonRow, { opacity: pulse }]} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(174,165,192,0.12)',
  },
  cardHovered: { borderColor: 'rgba(255,138,92,0.45)' },
  cardSelected: { borderColor: colors.cyan, borderWidth: 2 },
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
    backgroundColor: 'rgba(9,6,15,0.4)',
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
  selectCheckActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  moreChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(9,6,15,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  moreChipHovered: { backgroundColor: 'rgba(9,6,15,0.85)' },
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
    backgroundColor: 'rgba(9,6,15,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  glyphWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(9,6,15,0.65)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  heartChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(9,6,15,0.65)',
    borderRadius: radii.pill,
    padding: 5,
  },
  durationText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  meta: { padding: spacing.sm + 2 },
  cardTitle: { ...typography.subtitle, fontSize: 15, lineHeight: 19, color: colors.textPrimary },
  cardArtist: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  cardMetadata: { ...typography.caption, fontSize: 11, color: colors.cyan, opacity: 0.88 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(27,20,38,0.5)',
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  listRowHovered: { backgroundColor: 'rgba(27,20,38,0.85)' },
  listRowPressed: { backgroundColor: 'rgba(255,138,92,0.10)' },
  listRowSelected: { borderWidth: 1, borderColor: colors.cyan },
  listCover: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: { flex: 1 },
  skeletonGridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  skeletonListWrap: { gap: spacing.md },
  skeletonCard: { borderRadius: radii.lg, backgroundColor: 'rgba(174,165,192,0.08)' },
  skeletonRow: { height: 68, borderRadius: radii.md, backgroundColor: 'rgba(174,165,192,0.08)' },
});
