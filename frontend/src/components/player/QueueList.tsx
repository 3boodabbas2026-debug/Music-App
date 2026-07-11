import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Artwork } from '../ui/Artwork';
import { usePlayerStore } from '../../store/playerStore';
import type { Media } from '../../services/api/types';
import { displayArtist, displayTitle } from '../../utils/mediaDisplay';
import { colors, radii, spacing, typography } from '../../theme/tokens';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function title(media: Media): string {
  return displayTitle(media);
}

function artist(media: Media): string {
  return displayArtist(media) ?? 'Unknown artist';
}

/**
 * The live play queue: the current track glows, any other row is one tap away,
 * and upcoming tracks can be dropped without stopping the music.
 */
export function QueueList() {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const playing = usePlayerStore((s) => s.playing);
  const playAt = usePlayerStore((s) => s.playAt);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);

  if (queue.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="list-outline" size={26} color={colors.textMuted} />
        <Text style={styles.emptyText}>The queue is empty.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={queue}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      initialScrollIndex={undefined}
      renderItem={({ item, index }) => {
        const isCurrent = index === queueIndex;
        return (
          <Pressable
            onPress={() => {
              if (!isCurrent) void playAt(index);
            }}
            style={({ pressed }) => [styles.row, isCurrent && styles.rowCurrent, pressed && styles.rowPressed]}
          >
            <Text style={[styles.index, isCurrent && styles.indexCurrent]}>
              {isCurrent ? (playing ? '▶' : '❚❚') : index + 1}
            </Text>
            <Artwork
              media={item}
              size={38}
              borderRadius={radii.sm - 4}
              accessibilityLabel={`${title(item)} by ${artist(item)} artwork`}
            />
            <View style={styles.text}>
              <Text numberOfLines={1} style={[styles.title, isCurrent && styles.titleCurrent]}>
                {title(item)}
              </Text>
              <Text numberOfLines={1} style={styles.artist}>
                {artist(item)}
              </Text>
            </View>
            <Text style={styles.duration}>{formatDuration(item.duration_seconds)}</Text>
            {!isCurrent && (
              <Pressable onPress={() => removeFromQueue(index)} accessibilityLabel={`Remove ${displayTitle(item)} from queue`} hitSlop={8} style={styles.remove}>
                <Ionicons name="close" size={15} color={colors.textMuted} />
              </Pressable>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md - 4,
  },
  rowCurrent: { backgroundColor: 'rgba(255,138,92,0.10)' },
  rowPressed: { backgroundColor: 'rgba(174,165,192,0.10)' },
  index: {
    ...typography.caption,
    fontSize: 11,
    width: 20,
    textAlign: 'center',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  indexCurrent: { color: colors.cyan },
  text: { flex: 1 },
  title: { ...typography.subtitle, fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  titleCurrent: { color: colors.textPrimary },
  artist: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  duration: { ...typography.caption, fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  remove: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyText: { ...typography.caption, color: colors.textMuted },
});
