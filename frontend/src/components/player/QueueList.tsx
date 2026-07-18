import { useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Artwork } from '../ui/Artwork';
import { CompactGlassSheet } from '../ui/CompactGlassSheet';
import { ConfirmationPanel } from '../ui/SignOutConfirmSheet';
import { TextField } from '../ui/TextField';
import { usePlayerStore } from '../../store/playerStore';
import { usePlaylistStore } from '../../store/playlistStore';
import { toast } from '../../store/toastStore';
import type { Media } from '../../services/api/types';
import { apiErrorMessage } from '../../utils/apiError';
import { displayArtist, displayTitle } from '../../utils/mediaDisplay';
import { colors, glass, numericTypography, radii, spacing, typography } from '../../theme/tokens';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function QueueIdentity({ item, index, queueIndex, current, playing }: { item: Media; index: number; queueIndex: number; current: boolean; playing: boolean }) {
  const title = displayTitle(item);
  const artist = displayArtist(item) ?? 'Unknown artist';
  const itineraryNumber = index - queueIndex;
  return (
    <>
      <View style={styles.signalRail} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.signalLine} />
        <View style={[styles.signalPoint, current && styles.signalPointCurrent]}>
          {current ? (
            <Ionicons name={playing ? 'volume-high' : 'pause'} size={12} color={colors.cyan} />
          ) : index < queueIndex ? (
            <Ionicons name="checkmark" size={11} color={colors.textMuted} />
          ) : (
            <Text style={styles.indexText}>{itineraryNumber}</Text>
          )}
        </View>
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
  const [confirmClear, setConfirmClear] = useState(false);

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
    setConfirmClear(false);
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
    <>
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
                onPress={() => setConfirmClear(true)}
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
              <TextField
                autoFocus
                value={playlistName}
                onChangeText={setPlaylistName}
                onSubmitEditing={() => void handleSave()}
                placeholder="Playlist name"
                accessibilityLabel="Playlist name"
                leadingIcon="bookmark-outline"
                compact
                style={styles.saveInput}
                containerStyle={styles.saveField}
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
        const identity = <QueueIdentity item={item} index={index} queueIndex={queueIndex} current={isCurrent} playing={playing} />;
          return (
            <View style={[styles.row, isCurrent && styles.rowCurrent]}>
              <View pointerEvents="none" style={[styles.rowStateEdge, isCurrent && styles.rowStateEdgeCurrent]} />
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
    <CompactGlassSheet
      visible={confirmClear}
      onClose={() => setConfirmClear(false)}
      accessibilityLabel="Confirm queue clear"
      closeAccessibilityLabel="Cancel queue clear"
      eyebrow="Protected action"
      header={<Text style={styles.confirmTitle}>Clear the queue?</Text>}
      maxWidth={440}
    >
      <ConfirmationPanel
        affectedLabel={`${removableCount} queued ${removableCount === 1 ? 'track' : 'tracks'} will be removed`}
        consequence="The current track keeps playing; only the tracks waiting after it are cleared."
        safeAlternative="Keep the queue"
        confirmLabel="Clear queued tracks"
        onCancel={() => setConfirmClear(false)}
        onConfirm={handleClear}
      />
    </CompactGlassSheet>
    </>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 0 },
  content: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  queueTools: { gap: spacing.sm, marginBottom: spacing.md },
  queueSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  queueHeading: { ...typography.eyebrow, fontSize: 10, letterSpacing: 1.7, color: colors.textSecondary },
  queueSub: { ...typography.caption, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  queueActions: { flexDirection: 'row', gap: spacing.xs },
  toolButton: { minHeight: 38, paddingHorizontal: spacing.sm, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: glass.fill, borderWidth: 1, borderColor: colors.surfaceBorder },
  toolLabel: { ...typography.caption, fontSize: 10, color: colors.textSecondary },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveInput: { flex: 1, minHeight: 44, borderRadius: radii.md, paddingHorizontal: spacing.md, color: colors.textPrimary, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorderStrong, ...typography.body },
  saveField: { flex: 1, minWidth: 0 },
  confirmTitle: { ...typography.subtitle, color: colors.textPrimary },
  saveButton: { width: 44, height: 44, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cyan },
  undoRow: { minHeight: 44, paddingLeft: spacing.md, paddingRight: spacing.sm, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  undoText: { ...typography.caption, flex: 1, color: colors.textSecondary },
  undoButton: { minWidth: 72, minHeight: 36, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: glass.fill, borderWidth: 1, borderColor: colors.surfaceBorder },
  undoLabel: { ...typography.caption, color: colors.cyan, fontFamily: 'Sora_600SemiBold' },
  row: { position: 'relative', flexDirection: 'row', alignItems: 'center', minHeight: 68, paddingLeft: 4, borderRadius: radii.md - 4, overflow: 'hidden', marginBottom: 2, borderWidth: 1, borderColor: 'transparent' },
  rowCurrent: { backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke, shadowColor: colors.cyan, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  rowStateEdge: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 4, borderRadius: radii.pill, backgroundColor: glass.strokeStrong },
  rowStateEdgeCurrent: { top: 0, bottom: 0, backgroundColor: colors.cyan },
  rowPressed: { backgroundColor: glass.fillBright },
  identityAction: { flex: 1, minWidth: 0, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingLeft: spacing.xs, paddingRight: spacing.sm, borderRadius: radii.md - 4 },
  signalRail: { width: 28, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  signalLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: glass.strokeStrong },
  signalPoint: { width: 22, height: 22, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.surfaceBorder },
  signalPointCurrent: { width: 26, height: 26, backgroundColor: glass.fillHeavy, borderColor: colors.cyan, borderWidth: 2 },
  indexText: { ...numericTypography.rank, fontSize: 9, lineHeight: 12, textAlign: 'center', color: colors.textMuted },
  text: { flex: 1, minWidth: 0 },
  title: { ...typography.subtitle, fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  titleCurrent: { color: colors.textPrimary },
  artist: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  duration: { ...numericTypography.time, color: colors.textMuted },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingRight: spacing.xs },
  iconAction: { width: 36, height: 36, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.fill, borderWidth: 1, borderColor: colors.surfaceBorder },
  disabled: { opacity: 0.32 },
  pressed: { opacity: 0.65 },
  emptyWrap: { minHeight: 132, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyText: { ...typography.caption, color: colors.textMuted },
});
