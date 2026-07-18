import { useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Artwork } from '../ui/Artwork';
import { usePlayerStore } from '../../store/playerStore';
import { usePlaylistStore } from '../../store/playlistStore';
import { toast } from '../../store/toastStore';
import type { Media } from '../../services/api/types';
import { apiErrorMessage } from '../../utils/apiError';
import { displayArtist, displayTitle } from '../../utils/mediaDisplay';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function QueueIdentity({ item, index, current, playing }: { item: Media; index: number; current: boolean; playing: boolean }) {
  const title = displayTitle(item);
  const artist = displayArtist(item) ?? 'Unknown artist';
  return (
    <>
      <View style={styles.index}>
        {current ? (
          <Ionicons name={playing ? 'volume-high' : 'pause'} size={14} color={colors.cyan} />
        ) : (
          <Text style={styles.indexText}>{index + 1}</Text>
        )}
      </View>
      <Artwork media={item} size={38} borderRadius={radii.sm - 4} accessibilityLabel={`${title} by ${artist} artwork`} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, current && styles.titleCurrent]}>{title}</Text>
        <Text numberOfLines={1} style={styles.artist}>{current ? `${artist} · Now playing` : artist}</Text>
      </View>
      <Text style={styles.duration}>{formatDuration(item.duration_seconds)}</Text>
    </>
  );
}

export function QueueList({ style }: { style?: StyleProp<ViewStyle> }) {
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const playing = usePlayerStore((state) => state.playing);
  const playAt = usePlayerStore((state) => state.playAt);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const restoreQueueItem = usePlayerStore((state) => state.restoreQueueItem);
  const moveQueueItem = usePlayerStore((state) => state.moveQueueItem);
  const clearQueue = usePlayerStore((state) => state.clearQueue);
  const createPlaylist = usePlaylistStore((state) => state.create);
  const addItems = usePlaylistStore((state) => state.addItems);
  const [removed, setRemoved] = useState<{ media: Media; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

  const removableCount = Math.max(0, queue.length - 1);

  const handleRemove = (media: Media, index: number) => {
    removeFromQueue(index);
    setRemoved({ media, index });
    AccessibilityInfo.announceForAccessibility(`${displayTitle(media)} removed from queue. Undo is available.`);
  };

  const handleUndo = () => {
    if (!removed) return;
    restoreQueueItem(removed.media, removed.index);
    AccessibilityInfo.announceForAccessibility(`${displayTitle(removed.media)} restored to queue.`);
    setRemoved(null);
  };

  const handleMove = (media: Media, index: number, direction: -1 | 1) => {
    moveQueueItem(index, direction);
    AccessibilityInfo.announceForAccessibility(`${displayTitle(media)} moved ${direction < 0 ? 'up' : 'down'} in queue.`);
  };

  const handleClear = () => {
    clearQueue();
    setRemoved(null);
    toast('Queue cleared · current track kept playing', 'success');
  };

  const handleSave = async () => {
    const name = playlistName.trim();
    if (!name || saving || queue.length === 0) return;
    setSaving(true);
    try {
      const playlist = await createPlaylist(name);
      await addItems(playlist.id, queue.map((media) => media.id));
      toast(`Saved queue as “${name}”`, 'success');
      setPlaylistName('');
      setShowSave(false);
    } catch (error) {
      toast(apiErrorMessage(error, "Couldn't save this queue as a playlist."), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (queue.length === 0) {
    return (
      <View style={[styles.emptyWrap, style]}>
        <Ionicons name="list-outline" size={26} color={colors.textMuted} />
        <Text style={styles.emptyText}>The queue is empty.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.list, style]}
      data={queue}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.queueTools}>
          <View style={styles.queueSummary}>
            <View>
              <Text style={styles.queueHeading}>PLAY QUEUE</Text>
              <Text style={styles.queueSub}>{queue.length} {queue.length === 1 ? 'track' : 'tracks'} · current track protected</Text>
            </View>
            <View style={styles.queueActions}>
              <Pressable
                onPress={() => setShowSave((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel="Save queue as playlist"
                accessibilityState={{ expanded: showSave }}
                style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
              >
                <Ionicons name="bookmark-outline" size={17} color={colors.cyan} />
                <Text style={styles.toolLabel}>Save</Text>
              </Pressable>
              <Pressable
                onPress={handleClear}
                disabled={removableCount === 0}
                accessibilityRole="button"
                accessibilityLabel="Clear queue except current track"
                accessibilityHint="Keeps the current track playing."
                accessibilityState={{ disabled: removableCount === 0 }}
                style={({ pressed }) => [styles.toolButton, removableCount === 0 && styles.disabled, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={17} color={colors.coral} />
                <Text style={styles.toolLabel}>Clear</Text>
              </Pressable>
            </View>
          </View>

          {showSave ? (
            <View style={styles.saveRow}>
              <TextInput
                autoFocus
                value={playlistName}
                onChangeText={setPlaylistName}
                onSubmitEditing={() => void handleSave()}
                placeholder="Playlist name"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.cyan}
                accessibilityLabel="Playlist name"
                style={styles.saveInput}
              />
              <Pressable
                onPress={() => void handleSave()}
                disabled={!playlistName.trim() || saving}
                accessibilityRole="button"
                accessibilityLabel="Create playlist from queue"
                accessibilityState={{ disabled: !playlistName.trim() || saving, busy: saving }}
                style={({ pressed }) => [styles.saveButton, (!playlistName.trim() || saving) && styles.disabled, pressed && styles.pressed]}
              >
                {saving ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="checkmark" size={19} color={colors.bg} />}
              </Pressable>
            </View>
          ) : null}

          {removed ? (
            <View accessibilityRole="alert" style={styles.undoRow}>
              <Text numberOfLines={1} style={styles.undoText}>{displayTitle(removed.media)} removed</Text>
              <Pressable onPress={handleUndo} accessibilityRole="button" accessibilityLabel={`Undo removal of ${displayTitle(removed.media)}`} style={styles.undoButton}>
                <Ionicons name="arrow-undo" size={16} color={colors.cyan} />
                <Text style={styles.undoLabel}>Undo</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => {
        const isCurrent = index === queueIndex;
        const canMoveUp = !isCurrent && index > 0 && index - 1 !== queueIndex;
        const canMoveDown = !isCurrent && index < queue.length - 1 && index + 1 !== queueIndex;
        const identity = <QueueIdentity item={item} index={index} current={isCurrent} playing={playing} />;
        return (
          <View style={[styles.row, isCurrent && styles.rowCurrent]}>
            {isCurrent ? (
              <View accessibilityRole="summary" accessibilityLabel={`${displayTitle(item)}, current track`} style={styles.identityAction}>{identity}</View>
            ) : (
              <Pressable
                onPress={() => void playAt(index)}
                accessibilityRole="button"
                accessibilityLabel={`Play ${displayTitle(item)} now`}
                style={({ pressed }) => [styles.identityAction, pressed && styles.rowPressed]}
              >
                {identity}
              </Pressable>
            )}
            {!isCurrent ? (
              <View style={styles.rowActions} accessibilityRole="toolbar" accessibilityLabel={`Queue actions for ${displayTitle(item)}`}>
                <Pressable onPress={() => handleMove(item, index, -1)} disabled={!canMoveUp} accessibilityRole="button" accessibilityLabel={`Move ${displayTitle(item)} up`} accessibilityState={{ disabled: !canMoveUp }} style={[styles.iconAction, !canMoveUp && styles.disabled]}>
                  <Ionicons name="chevron-up" size={17} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => handleMove(item, index, 1)} disabled={!canMoveDown} accessibilityRole="button" accessibilityLabel={`Move ${displayTitle(item)} down`} accessibilityState={{ disabled: !canMoveDown }} style={[styles.iconAction, !canMoveDown && styles.disabled]}>
                  <Ionicons name="chevron-down" size={17} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => handleRemove(item, index)} accessibilityRole="button" accessibilityLabel={`Remove ${displayTitle(item)} from queue`} style={styles.iconAction}>
                  <Ionicons name="close" size={17} color={colors.coral} />
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 0 },
  content: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, gap: 3 },
  queueTools: { gap: spacing.sm, marginBottom: spacing.sm },
  queueSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  queueHeading: { ...typography.eyebrow, fontSize: 10, letterSpacing: 1.7, color: colors.textSecondary },
  queueSub: { ...typography.caption, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  queueActions: { flexDirection: 'row', gap: spacing.xs },
  toolButton: { minHeight: 40, paddingHorizontal: spacing.sm, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: glass.fillBright, borderWidth: 1, borderColor: colors.surfaceBorder },
  toolLabel: { ...typography.caption, fontSize: 10, color: colors.textSecondary },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveInput: { flex: 1, minHeight: 44, borderRadius: radii.md, paddingHorizontal: spacing.md, color: colors.textPrimary, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorderStrong, ...typography.body },
  saveButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cyan },
  undoRow: { minHeight: 44, paddingLeft: spacing.md, paddingRight: spacing.sm, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  undoText: { ...typography.caption, flex: 1, color: colors.textSecondary },
  undoButton: { minWidth: 72, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  undoLabel: { ...typography.caption, color: colors.cyan, fontFamily: 'Sora_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.md - 4, overflow: 'hidden' },
  rowCurrent: { backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  rowPressed: { backgroundColor: glass.fillBright },
  identityAction: { flex: 1, minWidth: 0, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radii.md - 4 },
  index: { width: 20, alignItems: 'center', justifyContent: 'center' },
  indexText: { ...typography.caption, fontSize: 11, textAlign: 'center', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  text: { flex: 1, minWidth: 0 },
  title: { ...typography.subtitle, fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  titleCurrent: { color: colors.textPrimary },
  artist: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  duration: { ...typography.caption, fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  rowActions: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  iconAction: { width: 40, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.32 },
  pressed: { opacity: 0.65 },
  emptyWrap: { minHeight: 132, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyText: { ...typography.caption, color: colors.textMuted },
});
