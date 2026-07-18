import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { colors, glass, motion, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

const BAR_COUNT = 4;

type Props = {
  /** Additional occupied space below the player, such as a contextual action bar. */
  bottomOffset?: number;
};

/** A small glowing bar visualizer driven by the player's real amplitude signal — not a canned loop. */
function AmplitudeBars({
  playing,
  amplitude,
  reduceMotion,
  pulse,
  activeColor,
}: {
  playing: boolean;
  amplitude: number;
  reduceMotion: boolean;
  pulse: Animated.Value;
  activeColor: string;
}) {
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
                opacity: playing
                  ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] })
                  : 0.34,
                backgroundColor: playing ? activeColor : colors.textMuted,
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
  const current = queue[queueIndex] ?? null;
  const upcoming = queue.slice(queueIndex + 1, queueIndex + 6);
  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);

  return (
    <View style={styles.queueCard}>
      <GlassPanel style={StyleSheet.absoluteFill as object} overlayColor={glass.fillHeavy} />
      <View style={styles.queuePreviewHeader}>
        <View>
          <Text style={styles.queueTitle}>LISTENING ITINERARY</Text>
          <Text style={styles.queueScope}>Showing {upcoming.length} of {upcomingCount} upcoming {upcomingCount === 1 ? 'track' : 'tracks'}</Text>
        </View>
        <Pressable onPress={onOpenFullQueue} accessibilityRole="button" accessibilityLabel="Open full queue" style={styles.fullQueueButton}>
          <Text style={styles.fullQueueLabel}>Open full queue</Text>
          <Ionicons name="open-outline" size={15} color={colors.cyan} />
        </Pressable>
      </View>
      <View style={styles.previewItinerary}>
        {current ? (
          <View accessibilityRole="summary" accessibilityLabel={`${displayTitle(current)}, now playing`} style={[styles.queueRow, styles.queueRowCurrent]}>
            <View style={styles.previewSignalRail}>
              <View style={styles.previewSignalLine} />
              <View style={[styles.previewSignalPoint, styles.previewSignalPointCurrent]}>
                <Ionicons name="volume-high" size={11} color={colors.cyan} />
              </View>
            </View>
            <View style={styles.previewTrackText}>
              <Text style={styles.previewNow}>NOW</Text>
              <Text numberOfLines={1} style={styles.queueRowTitle}>{displayTitle(current)}</Text>
            </View>
          </View>
        ) : null}
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
              accessibilityRole="button"
              accessibilityLabel={`Play itinerary item ${i + 1}, ${displayTitle(media)}`}
              style={({ pressed }) => [styles.queueRow, pressed && styles.queueRowPressed]}
            >
              <View style={styles.previewSignalRail}>
                <View style={styles.previewSignalLine} />
                <View style={styles.previewSignalPoint}><Text style={styles.previewIndex}>{i + 1}</Text></View>
              </View>
              <View style={styles.previewTrackText}>
                <Text numberOfLines={1} style={styles.queueRowTitle}>{displayTitle(media)}</Text>
                <Text numberOfLines={1} style={styles.queueRowArtist}>{displayArtist(media) ?? 'Unknown artist'}</Text>
              </View>
            </Pressable>
          ))}
          </ScrollView>
        )}
      </View>
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
  const [queueRendered, setQueueRendered] = useState(false);
  const trackAccent = useTrackAccent(currentMedia ? thumbnailUri(currentMedia) : null);
  const reduceMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(0)).current;
  const playbackPulse = useRef(new Animated.Value(0)).current;
  const queueProgress = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    playbackPulse.stopAnimation();
    if (!playing || reduceMotion) {
      playbackPulse.setValue(playing ? 0.35 : 0);
      return;
    }
    playbackPulse.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(playbackPulse, {
        toValue: 1,
        duration: motion.duration.continuous,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(playbackPulse, {
        toValue: 0,
        duration: motion.duration.continuous,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [playbackPulse, playing, reduceMotion]);

  useEffect(() => {
    queueProgress.stopAnimation();
    if (queueOpen) setQueueRendered(true);
    if (reduceMotion) {
      queueProgress.setValue(queueOpen ? 1 : 0);
      if (!queueOpen) setQueueRendered(false);
      return;
    }
    Animated.timing(queueProgress, {
      toValue: queueOpen ? 1 : 0,
      duration: queueOpen ? motion.duration.base : motion.duration.fast,
      easing: queueOpen
        ? Easing.bezier(...motion.easing.decelerate)
        : Easing.bezier(...motion.easing.accelerate),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !queueOpen) setQueueRendered(false);
    });
  }, [queueOpen, queueProgress, reduceMotion]);

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
        {
          bottom,
          opacity: entrance,
          transform: [{
            translateY: Animated.add(
              entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
              queueProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
            ),
          }],
        },
      ]}
    >
      {queueRendered ? (
        <Animated.View
          style={{
            opacity: queueProgress,
            transform: [
              { translateY: queueProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
              { scaleY: queueProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            ],
          }}
        >
          <QueuePreview
            onJump={() => setQueueOpen(false)}
            onOpenFullQueue={() => {
              setQueueOpen(false);
              navigation.navigate('Player', { panel: 'queue' });
            }}
          />
        </Animated.View>
      ) : null}
      <View style={styles.playerWidth}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.playbackGlow,
            {
              borderColor: trackAccent.miniPlayerHighlight,
              opacity: playing
                ? playbackPulse.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.28] })
                : 0,
              transform: [{ scale: playbackPulse.interpolate({ inputRange: [0, 1], outputRange: [0.995, 1.008] }) }],
            },
          ]}
        />
        <GlassPanel style={styles.panel} variant="raised" overlayColor={glass.fillHeavy}>
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
              <AmplitudeBars
                playing={playing}
                amplitude={amplitude}
                reduceMotion={reduceMotion}
                pulse={playbackPulse}
                activeColor={trackAccent.miniPlayerHighlight}
              />
            </Pressable>
            <View style={styles.transportTargets} accessibilityRole="toolbar" accessibilityLabel="Mini player controls">
              {isDesktop && (
                <Pressable disabled={!previousAvailable} onPress={() => playPrev()} accessibilityRole="button" accessibilityLabel="Previous track" accessibilityState={{ disabled: !previousAvailable }} hitSlop={10} style={[styles.skipButton, !previousAvailable && styles.controlDisabled]}>
                  <Ionicons name="play-skip-back" size={16} color={previousAvailable ? colors.textSecondary : colors.textMuted} />
                </Pressable>
              )}
              <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} hitSlop={12} style={[styles.controlButton, { backgroundColor: `${trackAccent.miniPlayerHighlight}29` }]}>
                <Ionicons name={playing ? 'pause' : 'play'} size={18} color={trackAccent.miniPlayerHighlight} />
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
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: trackAccent.miniPlayerHighlight }]}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.progressEdge,
                  {
                    backgroundColor: trackAccent.miniPlayerHighlight,
                    opacity: playing
                      ? playbackPulse.interpolate({ inputRange: [0, 1], outputRange: [0.58, 1] })
                      : 0.34,
                    transform: [{ scale: playbackPulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.15] }) }],
                  },
                ]}
              />
            </View>
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
  playbackGlow: {
    ...(StyleSheet.absoluteFill as object),
    borderRadius: radii.md,
    borderWidth: 1,
    shadowColor: colors.cyan,
    shadowOpacity: 0.34,
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
  progressEdge: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    shadowColor: colors.cyan,
    shadowOpacity: 0.7,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
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
  previewItinerary: { overflow: 'hidden', borderRadius: radii.md, backgroundColor: glass.fillDeep },
  queueEmpty: { ...typography.caption, color: colors.textMuted, padding: spacing.md, paddingLeft: 48 },
  queueRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderRadius: radii.sm },
  queueRowCurrent: { minHeight: 54, backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  queueRowPressed: { backgroundColor: glass.tintPrimary },
  previewSignalRail: { width: 40, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  previewSignalLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: glass.strokeStrong },
  previewSignalPoint: { width: 20, height: 20, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.surfaceBorder },
  previewSignalPointCurrent: { width: 24, height: 24, borderWidth: 2, borderColor: colors.cyan },
  previewIndex: { ...typography.numeric, fontSize: 9, lineHeight: 12, color: colors.textMuted },
  previewTrackText: { flex: 1, minWidth: 0, paddingVertical: spacing.xs, paddingRight: spacing.sm },
  previewNow: { ...typography.eyebrow, fontSize: 8, lineHeight: 11, letterSpacing: 1.5, color: colors.cyan },
  queueRowTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  queueRowArtist: { ...typography.caption, fontSize: 11, color: colors.textMuted },
});
