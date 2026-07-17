import { forwardRef, useImperativeHandle, useRef, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Playlist } from '../../services/api/types';
import { firstPlaylistArtworkItem } from '../../utils/mediaDisplay';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';
import { Artwork } from '../ui/Artwork';

export type PlaylistDropTarget =
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'new' };

type TargetRect = {
  target: PlaylistDropTarget;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlaylistDropStripHandle = {
  measureTargets: () => Promise<void>;
  hitTest: (absoluteX: number, absoluteY: number) => PlaylistDropTarget | null;
};

function targetKey(target: PlaylistDropTarget): string {
  return target.kind === 'new' ? 'new' : target.playlist.id;
}

/** Playlist destinations used by both pointer drag/drop and a normal tap.
 * Exposing measured hit targets keeps gesture geometry out of React state,
 * which avoids re-rendering the entire library while a finger moves. */
export const PlaylistDropStrip = forwardRef(function PlaylistDropStrip(
  {
    playlists,
    selectedCount,
    hoveredKey,
    onPick,
  }: {
    playlists: Playlist[];
    selectedCount: number;
    hoveredKey: string | null;
    onPick: (target: PlaylistDropTarget) => void;
  },
  ref: React.ForwardedRef<PlaylistDropStripHandle>,
) {
  const targetRefs = useRef<Record<string, RefObject<View | null>>>({});
  const rects = useRef<TargetRect[]>([]);
  const targets: PlaylistDropTarget[] = [
    ...playlists.map((playlist): PlaylistDropTarget => ({ kind: 'playlist', playlist })),
    { kind: 'new' },
  ];

  for (const target of targets) {
    const key = targetKey(target);
    if (!targetRefs.current[key]) targetRefs.current[key] = { current: null };
  }

  useImperativeHandle(ref, () => ({
    measureTargets: async () => {
      const measured = await Promise.all(
        targets.map((target) => new Promise<TargetRect | null>((resolve) => {
          const node = targetRefs.current[targetKey(target)]?.current;
          if (!node?.measureInWindow) {
            resolve(null);
            return;
          }
          node.measureInWindow((x, y, width, height) => resolve({ target, x, y, width, height }));
        })),
      );
      rects.current = measured.filter((entry): entry is TargetRect => entry != null);
    },
    hitTest: (absoluteX, absoluteY) => {
      const hit = rects.current.find((rect) =>
        absoluteX >= rect.x
        && absoluteX <= rect.x + rect.width
        && absoluteY >= rect.y
        && absoluteY <= rect.y + rect.height,
      );
      return hit?.target ?? null;
    },
  }));

  return (
    <View style={styles.root}>
      <Text style={styles.hint}>
        {selectedCount > 0 ? 'Drag the stack here, or tap a playlist' : 'Select songs to add them to a playlist'}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.row}
      >
        {targets.map((target) => {
          const key = targetKey(target);
          const isNew = target.kind === 'new';
          const playlist = target.kind === 'playlist' ? target.playlist : null;
          const cover = playlist ? firstPlaylistArtworkItem(playlist.items) : null;
          const label = isNew ? 'New playlist' : playlist!.name;
          return (
            <View
              key={key}
              ref={(node) => {
                const holder = targetRefs.current[key];
                if (holder) holder.current = node;
              }}
              collapsable={false}
              style={styles.targetMeasure}
            >
              <Pressable
                onPress={() => onPick(target)}
                disabled={selectedCount === 0}
                accessibilityRole="button"
                accessibilityLabel={
                  isNew
                    ? `Create a new playlist with ${selectedCount} selected tracks`
                    : `Add ${selectedCount} selected tracks to ${label}`
                }
                accessibilityHint="This is also a drop target when dragging a selected song."
                style={({ pressed }) => [
                  styles.target,
                  hoveredKey === key && styles.targetHovered,
                  pressed && styles.targetPressed,
                  selectedCount === 0 && styles.targetDisabled,
                ]}
              >
                <View style={[styles.iconWrap, isNew && styles.newIconWrap]}>
                  {cover ? (
                    <Artwork media={cover} size={42} borderRadius={radii.pill} />
                  ) : (
                    <Ionicons name={isNew ? 'add' : 'musical-notes'} size={21} color={isNew ? colors.cyan : colors.textSecondary} />
                  )}
                  {hoveredKey === key && (
                    <View pointerEvents="none" style={styles.dropCheck}>
                      <Ionicons name="arrow-down" size={12} color={colors.textInverse} />
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={[styles.label, hoveredKey === key && styles.labelHovered]}>{label}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  hint: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  row: { gap: spacing.sm, paddingRight: spacing.lg, paddingVertical: spacing.xs },
  targetMeasure: { borderRadius: radii.md },
  target: {
    width: 72,
    minHeight: 70,
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  targetHovered: { backgroundColor: glass.tintPrimary, borderColor: colors.cyan },
  targetPressed: { backgroundColor: glass.fillBright },
  targetDisabled: { opacity: 0.45 },
  iconWrap: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: glass.fillDeep,
    borderWidth: 2,
    borderColor: glass.stroke,
  },
  newIconWrap: { borderStyle: 'dashed', borderColor: glass.tintPrimaryStroke },
  dropCheck: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
  },
  label: { ...typography.caption, width: '100%', textAlign: 'center', fontSize: 10, color: colors.textMuted },
  labelHovered: { color: colors.cyan, fontFamily: 'Sora_600SemiBold' },
});
