import { memo, useEffect, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

import { Artwork } from '../ui/Artwork';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { Media } from '../../services/api/types';
import {
  displayArtist,
  displayTitle,
} from '../../utils/mediaDisplay';
import { colors, glass, gradients, radii, spacing, typography } from '../../theme/tokens';

type MediaItemProps = {
  media: Media;
  favorite: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onMenuPress: (event: GestureResponderEvent) => void;
  dragEnabled?: boolean;
  onDragStart?: (absoluteX: number, absoluteY: number) => void;
  onDragMove?: (absoluteX: number, absoluteY: number) => void;
  onDragEnd?: (absoluteX: number, absoluteY: number, cancelled: boolean) => void;
};

function DragSurface({
  enabled,
  children,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  enabled: boolean;
  children: ReactNode;
  onDragStart?: (absoluteX: number, absoluteY: number) => void;
  onDragMove?: (absoluteX: number, absoluteY: number) => void;
  onDragEnd?: (absoluteX: number, absoluteY: number, cancelled: boolean) => void;
}) {
  const lift = useState(() => new Animated.Value(0))[0];
  const reduceMotion = useReducedMotion();

  function settle() {
    if (reduceMotion) {
      lift.setValue(0);
      return;
    }
    Animated.spring(lift, { toValue: 0, speed: 22, bounciness: 1, useNativeDriver: true }).start();
  }

  function handleStateChange(event: PanGestureHandlerStateChangeEvent) {
    const { state, oldState, absoluteX, absoluteY } = event.nativeEvent;
    if (state === State.ACTIVE && oldState !== State.ACTIVE) {
      if (reduceMotion) lift.setValue(1);
      else Animated.spring(lift, { toValue: 1, speed: 22, bounciness: 4, useNativeDriver: true }).start();
      onDragStart?.(absoluteX, absoluteY);
      return;
    }
    if (oldState === State.ACTIVE && state !== State.ACTIVE) {
      settle();
      onDragEnd?.(absoluteX, absoluteY, state !== State.END);
    }
  }

  function handleGesture(event: PanGestureHandlerGestureEvent) {
    onDragMove?.(event.nativeEvent.absoluteX, event.nativeEvent.absoluteY);
  }

  return (
    <PanGestureHandler
      enabled={enabled}
      activateAfterLongPress={280}
      minDist={2}
      shouldCancelWhenOutside={false}
      onGestureEvent={handleGesture}
      onHandlerStateChange={handleStateChange}
    >
      <Animated.View
        style={{
          zIndex: enabled ? 5 : 0,
          opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
          transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }],
        }}
      >
        {children}
      </Animated.View>
    </PanGestureHandler>
  );
}

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
  onMenuPress,
  dragEnabled = false,
  onDragStart,
  onDragMove,
  onDragEnd,
}: MediaItemProps & { size: number }) {
  const [hovered, setHovered] = useState(false);
  const artist = displayArtist(media);
  const metadata = metadataLine(media);

  return (
    <DragSurface
      enabled={dragEnabled}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle(media)}${artist ? `, ${artist}` : ''}${metadata ? `, ${metadata}` : ''}`}
      accessibilityState={selectMode ? { selected: !!selected } : undefined}
      aria-selected={selectMode ? !!selected : undefined}
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
        <Artwork
          media={media}
          size="100%"
          borderRadius={radii.lg}
          contentFit={media.media_type === 'video' ? 'contain' : 'cover'}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient colors={gradients.coverScrim} style={styles.scrim} />
        {selectMode && selected && <View pointerEvents="none" style={styles.selectionTint} />}

        {!selectMode && (
          <View style={styles.durationChip}>
            <Ionicons
              name={media.media_type === 'video' ? 'videocam' : 'musical-notes'}
              size={10}
              color={colors.textSecondary}
            />
            <Text style={styles.durationText}>{formatDuration(media.duration_seconds)}</Text>
          </View>
        )}
        {favorite && (
          <View style={styles.heartChip}>
            <Ionicons name="heart" size={12} color={colors.pink} />
          </View>
        )}

        {selectMode && (
          <View style={[styles.selectCheck, selected && styles.selectCheckActive]}>
            {selected && <Ionicons name="checkmark" size={13} color="#0B1411" />}
          </View>
        )}

        {!selectMode && (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onMenuPress(event);
            }}
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
              <Ionicons name="play" size={22} color="#0B1411" style={{ marginLeft: 2 }} />
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
    </DragSurface>
  );
});

export const ListRow = memo(function ListRow({
  media,
  favorite,
  selectMode,
  selected,
  onPress,
  onLongPress,
  onMenuPress,
  dragEnabled = false,
  onDragStart,
  onDragMove,
  onDragEnd,
}: MediaItemProps) {
  const [hovered, setHovered] = useState(false);
  const artist = displayArtist(media);
  const metadata = metadataLine(media);

  return (
    <DragSurface
      enabled={dragEnabled}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle(media)}${artist ? `, ${artist}` : ''}${metadata ? `, ${metadata}` : ''}`}
      accessibilityState={selectMode ? { selected: !!selected } : undefined}
      aria-selected={selectMode ? !!selected : undefined}
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
          {selected && <Ionicons name="checkmark" size={12} color="#0B1411" />}
        </View>
      )}
      <Artwork
        media={media}
        size={48}
        borderRadius={radii.sm}
        contentFit={media.media_type === 'video' ? 'contain' : 'cover'}
      />
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
          onPress={(event) => {
            event.stopPropagation();
            onMenuPress(event);
          }}
          accessibilityLabel={`More options for ${displayTitle(media)}`}
          hitSlop={10}
          style={styles.rowMoreButton}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
        </Pressable>
      )}
      <Text style={styles.durationText}>{formatDuration(media.duration_seconds)}</Text>
      </Pressable>
    </DragSurface>
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
    borderColor: 'rgba(158,181,170,0.12)',
  },
  cardHovered: { borderColor: 'rgba(99,214,181,0.45)' },
  cardSelected: { borderColor: glass.tintPrimaryStroke },
  selectionTint: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: glass.tintPrimary,
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
    backgroundColor: 'rgba(5,10,11,0.4)',
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
    backgroundColor: 'rgba(5,10,11,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  moreChipHovered: { backgroundColor: 'rgba(5,10,11,0.85)' },
  playFabWrap: {
    position: 'absolute',
    right: spacing.sm + 2,
    bottom: 54,
    borderRadius: radii.pill,
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
    backgroundColor: 'rgba(5,10,11,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  durationChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5,10,11,0.65)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  heartChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(5,10,11,0.65)',
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
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  listRowHovered: { backgroundColor: glass.fillBright },
  listRowPressed: { backgroundColor: glass.tintPrimary },
  listRowSelected: { backgroundColor: glass.tintPrimary, borderColor: glass.tintPrimaryStroke },
  listText: { flex: 1 },
  skeletonGridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  skeletonListWrap: { gap: spacing.md },
  skeletonCard: { borderRadius: radii.lg, backgroundColor: glass.fill },
  skeletonRow: { height: 68, borderRadius: radii.md, backgroundColor: glass.fill },
});
