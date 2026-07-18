import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '../ui/Artwork';
import { GlassPanel } from '../ui/GlassPanel';
import { useDockClearance, usePlayerChromeBottomOffset } from '../../hooks/useBottomChromeClearance';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useResponsive } from '../../hooks/useResponsive';
import { useTrackAccent } from '../../hooks/useTrackAccent';
import { canPlayNext, canPlayPrevious, usePlayerStore } from '../../store/playerStore';
import { useVideoPlayerStore } from '../../store/videoPlayerStore';
import { displayArtist, displayTitle, thumbnailUri } from '../../utils/mediaDisplay';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

const BAR_COUNT = 4;

type Props = {
  /** Additional occupied space below the player, such as a contextual action bar. */
  bottomOffset?: number;
};

/** A small glowing bar visualizer driven by the player's real amplitude signal — not a canned loop. */
function AmplitudeBars({ playing, amplitude, reduceMotion }: { playing: boolean; amplitude: number; reduceMotion: boolean }) {
  const smoothed = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    const target = playing ? Math.max(0.15, Math.min(1, amplitude * 2.2)) : 0.1;
    if (reduceMotion) {
      smoothed.setValue(playing ? 0.35 : 0.1);
      return;
    }
    const animation = Animated.timing(smoothed, {
      toValue: target,
      duration: 90,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [amplitude, playing, reduceMotion, smoothed]);

  if (!playing) return null;

  return (
    <View style={styles.eqRow}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const phase = 1 - Math.abs(i - (BAR_COUNT - 1) / 2) / BAR_COUNT;
        return (
          <Animated.View
            key={i}
            style={[
              styles.eqBar,
              {
                height: smoothed.interpolate({
                  inputRange: [0, 1],
                  outputRange: [3, 8 + phase * 12],
                }),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function QueuePreview({ onJump, onOpenFullQueue }: { onJump: () => void; onOpenFullQueue: () => void }) {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const playAt = usePlayerStore((s) => s.playAt);
  const upcoming = queue.slice(queueIndex + 1, queueIndex + 6);
  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);

  return (
    <View style={styles.queueCard}>
      <GlassPanel style={StyleSheet.absoluteFill as object} overlayColor={glass.fillHeavy} />
      <View style={styles.queuePreviewHeader}>
        <View>
          <Text style={styles.queueTitle}>UP NEXT · PREVIEW</Text>
          <Text style={styles.queueScope}>Showing {upcoming.length} of {upcomingCount} upcoming {upcomingCount === 1 ? 'track' : 'tracks'}</Text>
        </View>
        <Pressable onPress={onOpenFullQueue} accessibilityRole="button" accessibilityLabel="Open full queue" style={styles.fullQueueButton}>
          <Text style={styles.fullQueueLabel}>Open full queue</Text>
          <Ionicons name="open-outline" size={15} color={colors.cyan} />
        </Pressable>
      </View>
      {upcoming.length === 0 ? (
        <Text style={styles.queueEmpty}>End of queue.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
          {upcoming.map((media, i) => (
            <Pressable
              key={`${media.id}-${i}`}
              onPress={() => {
                playAt(queueIndex + 1 + i);
                onJump();
              }}
              style={({ pressed }) => [styles.queueRow, pressed && styles.queueRowPressed]}
            >
              <Text numberOfLines={1} style={styles.queueRowTitle}>
                {displayTitle(media)}
              </Text>
              <Text numberOfLines={1} style={styles.queueRowArtist}>
                {displayArtist(media) ?? 'Unknown artist'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function MiniPlayerBar({ bottomOffset = 0 }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const dockClearance = useDockClearance();
  const contextualBottomOffset = usePlayerChromeBottomOffset();
  // Mounted by all three tab screens, and tabs stay alive in the background —
  // without this gate, three copies render (and tick) at once.
  const isFocused = useIsFocused();
  // Per-field selectors — this bar is mounted on Home, Library, and Recognize
  // simultaneously (tabs stay alive in the background), so a whole-store
  // destructure here means 3 full re-renders per playback tick instead of 1.
  const currentMedia = usePlayerStore((s) => s.currentMedia);
  const playing = usePlayerStore((s) => s.playing);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const amplitude = usePlayerStore((s) => s.amplitude);
  const toggle = usePlayerStore((s) => s.toggle);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const repeat = usePlayerStore((s) => s.repeat);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const videoMode = useVideoPlayerStore((state) => state.mode);
  const [queueOpen, setQueueOpen] = useState(false);
  const accentColor = useTrackAccent(currentMedia ? thumbnailUri(currentMedia) : null);
  const reduceMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const visible = !!currentMedia && isFocused && videoMode === 'closed';
    if (!visible || reduceMotion) {
      entrance.setValue(visible ? 1 : 0);
      return;
    }
    entrance.setValue(0);
    const animation = Animated.spring(entrance, {
      toValue: 1,
      speed: 24,
      bounciness: 2,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [currentMedia?.id, entrance, isFocused, reduceMotion, videoMode]);

  if (!currentMedia || !isFocused || videoMode !== 'closed') return null;

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const transportState = { queue, queueIndex, currentTime, repeat, shuffle };
  const previousAvailable = canPlayPrevious(transportState);
  const nextAvailable = canPlayNext(transportState);

  // On phones the bar floats above the bottom dock; on desktop there is no
  // dock, so it hugs the bottom edge as a centered strip.
  const bottom =
    (isDesktop ? insets.bottom + spacing.md : insets.bottom + dockClearance + spacing.sm) +
    bottomOffset +
    contextualBottomOffset;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.holder,
        isDesktop && styles.holderDesktop,
        { bottom, opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
      ]}
    >
      {queueOpen && (
        <QueuePreview
          onJump={() => setQueueOpen(false)}
          onOpenFullQueue={() => {
            setQueueOpen(false);
            navigation.navigate('Player', { panel: 'queue' });
          }}
        />
      )}
      <View style={[styles.playerWidth, playing && styles.glowWrap, playing && accentColor && { shadowColor: accentColor }]}>
        <GlassPanel style={styles.panel} overlayColor={glass.fillHeavy}>
          <View style={styles.content}>
            <Pressable
              onPress={() => navigation.navigate('Player')}
              accessibilityRole="button"
              accessibilityLabel={`Open player for ${displayTitle(currentMedia)}`}
              accessibilityHint="Opens the full now playing screen."
              style={({ pressed }) => [styles.navigationTarget, pressed && styles.navigationPressed]}
            >
              <Artwork
                media={currentMedia}
                size={42}
                priority
                borderRadius={radii.sm}
                accessibilityLabel={`${displayTitle(currentMedia)} artwork`}
              />
              <View style={styles.textWrap}>
                <Text numberOfLines={1} style={styles.title}>
                  {displayTitle(currentMedia)}
                </Text>
                <Text numberOfLines={1} style={styles.artist}>
                  {displayArtist(currentMedia) ?? 'Unknown artist'}
                </Text>
              </View>
              <AmplitudeBars playing={playing} amplitude={amplitude} reduceMotion={reduceMotion} />
            </Pressable>
            <View style={styles.transportTargets} accessibilityRole="toolbar" accessibilityLabel="Mini player controls">
              {isDesktop && (
                <Pressable disabled={!previousAvailable} onPress={() => playPrev()} accessibilityRole="button" accessibilityLabel="Previous track" accessibilityState={{ disabled: !previousAvailable }} hitSlop={10} style={[styles.skipButton, !previousAvailable && styles.controlDisabled]}>
                  <Ionicons name="play-skip-back" size={16} color={previousAvailable ? colors.textSecondary : colors.textMuted} />
                </Pressable>
              )}
              <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} hitSlop={12} style={[styles.controlButton, accentColor && { backgroundColor: `${accentColor}29` }]}>
                <Ionicons name={playing ? 'pause' : 'play'} size={18} color={accentColor ?? colors.cyan} />
              </Pressable>
              {queue.length > 1 && (
                <Pressable disabled={!nextAvailable} onPress={() => playNext()} accessibilityRole="button" accessibilityLabel="Next track" accessibilityState={{ disabled: !nextAvailable }} hitSlop={10} style={[styles.skipButton, !nextAvailable && styles.controlDisabled]}>
                  <Ionicons name="play-skip-forward" size={16} color={nextAvailable ? colors.textSecondary : colors.textMuted} />
                </Pressable>
              )}
              {queue.length > 1 && (
                <Pressable onPress={() => setQueueOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={queueOpen ? 'Close queue preview' : 'Open queue preview'} accessibilityState={{ expanded: queueOpen }} hitSlop={10} style={styles.skipButton}>
                  <Ionicons name="list" size={17} color={queueOpen ? colors.cyan : colors.textSecondary} />
                </Pressable>
              )}
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }, accentColor && { backgroundColor: accentColor }]} />
          </View>
        </GlassPanel>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  holder: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  holderDesktop: {
    alignItems: 'center',
  },
  playerWidth: {
    width: '100%',
    maxWidth: 640,
  },
  glowWrap: {
    shadowColor: colors.cyan,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  panel: {
    borderRadius: radii.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  navigationTarget: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.sm },
  navigationPressed: { backgroundColor: glass.fillBright },
  transportTargets: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  textWrap: { flex: 1 },
  title: { ...typography.subtitle, color: colors.textPrimary },
  artist: { ...typography.caption, color: colors.textMuted },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: glass.tintPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDisabled: { opacity: 0.38 },
  eqRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2.5,
    height: 14,
    marginRight: 2,
  },
  eqBar: {
    width: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
  },
  progressTrack: {
    height: 2,
    backgroundColor: glass.stroke,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.cyan,
  },
  queueCard: {
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(158,181,170,0.14)',
    padding: spacing.md,
  },
  queuePreviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  queueTitle: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textMuted },
  queueScope: { ...typography.caption, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  fullQueueButton: { minHeight: 40, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.pill, backgroundColor: glass.tintPrimary },
  fullQueueLabel: { ...typography.caption, fontSize: 10, color: colors.cyan },
  queueEmpty: { ...typography.caption, color: colors.textMuted },
  queueRow: { paddingVertical: spacing.sm - 2, borderRadius: radii.sm },
  queueRowPressed: { backgroundColor: glass.tintPrimary },
  queueRowTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  queueRowArtist: { ...typography.caption, fontSize: 11, color: colors.textMuted },
});
