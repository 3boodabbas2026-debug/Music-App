import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '../ui/GlassPanel';
import { useResponsive } from '../../hooks/useResponsive';
import { useTrackAccent } from '../../hooks/useTrackAccent';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

const BAR_COUNT = 4;

/** A small glowing bar visualizer driven by the player's real amplitude signal — not a canned loop. */
function AmplitudeBars({ playing, amplitude }: { playing: boolean; amplitude: number }) {
  const smoothed = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    Animated.timing(smoothed, {
      toValue: playing ? Math.max(0.15, Math.min(1, amplitude * 2.2)) : 0.1,
      duration: 90,
      useNativeDriver: false,
    }).start();
  }, [amplitude, playing, smoothed]);

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

function QueuePreview({ onJump }: { onJump: () => void }) {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const playAt = usePlayerStore((s) => s.playAt);
  const upcoming = queue.slice(queueIndex + 1, queueIndex + 6);

  return (
    <View style={styles.queueCard}>
      <GlassPanel style={StyleSheet.absoluteFill as object} overlayColor="rgba(18,28,24,0.92)" />
      <Text style={styles.queueTitle}>UP NEXT</Text>
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
                {media.title ?? media.recognized_title ?? 'Untitled'}
              </Text>
              <Text numberOfLines={1} style={styles.queueRowArtist}>
                {media.artist ?? media.recognized_artist ?? 'Unknown artist'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function MiniPlayerBar() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const { currentMedia, playing, currentTime, duration, amplitude, toggle, playNext, playPrev, queue } = usePlayerStore();
  const [queueOpen, setQueueOpen] = useState(false);
  const accentColor = useTrackAccent(currentMedia?.thumbnail_url);

  if (!currentMedia) return null;

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  // On phones the bar floats above the bottom dock; on desktop there is no
  // dock, so it hugs the bottom edge as a centered strip.
  const bottom = isDesktop ? insets.bottom + spacing.md : insets.bottom + layout.dockClearance + spacing.sm;

  return (
    <View pointerEvents="box-none" style={[styles.holder, isDesktop && styles.holderDesktop, { bottom }]}>
      {queueOpen && <QueuePreview onJump={() => setQueueOpen(false)} />}
      <Pressable onPress={() => navigation.navigate('Player')} style={isDesktop ? styles.pressDesktop : undefined}>
        <View style={[playing && styles.glowWrap, playing && accentColor && { shadowColor: accentColor }]}>
          <GlassPanel style={styles.panel} overlayColor="rgba(18,28,24,0.6)">
            <View style={styles.content}>
              {currentMedia.thumbnail_url ? (
                <Image source={{ uri: currentMedia.thumbnail_url }} style={styles.cover} />
              ) : (
                <LinearGradient colors={colors.gradientPrimary} style={styles.cover}>
                  <Ionicons name="musical-notes" size={18} color="#0A0F0D" />
                </LinearGradient>
              )}
              <View style={styles.textWrap}>
                <Text numberOfLines={1} style={styles.title}>
                  {currentMedia.title ?? currentMedia.recognized_title ?? 'Untitled'}
                </Text>
                <Text numberOfLines={1} style={styles.artist}>
                  {currentMedia.artist ?? currentMedia.recognized_artist ?? 'Unknown artist'}
                </Text>
              </View>
              <AmplitudeBars playing={playing} amplitude={amplitude} />
              {isDesktop && queue.length > 1 && (
                <Pressable onPress={() => playPrev()} hitSlop={10} style={styles.skipButton}>
                  <Ionicons name="play-skip-back" size={16} color={colors.textSecondary} />
                </Pressable>
              )}
              <Pressable onPress={toggle} hitSlop={12} style={[styles.controlButton, accentColor && { backgroundColor: `${accentColor}29` }]}>
                <Ionicons name={playing ? 'pause' : 'play'} size={18} color={accentColor ?? colors.cyan} />
              </Pressable>
              {queue.length > 1 && (
                <Pressable onPress={() => playNext()} hitSlop={10} style={styles.skipButton}>
                  <Ionicons name="play-skip-forward" size={16} color={colors.textSecondary} />
                </Pressable>
              )}
              {queue.length > 1 && (
                <Pressable onPress={() => setQueueOpen((v) => !v)} hitSlop={10} style={styles.skipButton}>
                  <Ionicons name="list" size={17} color={queueOpen ? colors.cyan : colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }, accentColor && { backgroundColor: accentColor }]} />
            </View>
          </GlassPanel>
        </View>
      </Pressable>
    </View>
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
  pressDesktop: {
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
  cover: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { ...typography.subtitle, color: colors.textPrimary },
  artist: { ...typography.caption, color: colors.textMuted },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(47,191,170,0.16)',
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
    backgroundColor: 'rgba(167,176,168,0.14)',
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
    borderColor: 'rgba(167,176,168,0.14)',
    padding: spacing.md,
  },
  queueTitle: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textMuted, marginBottom: spacing.sm },
  queueEmpty: { ...typography.caption, color: colors.textMuted },
  queueRow: { paddingVertical: spacing.sm - 2, borderRadius: radii.sm },
  queueRowPressed: { backgroundColor: 'rgba(47,191,170,0.10)' },
  queueRowTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  queueRowArtist: { ...typography.caption, fontSize: 11, color: colors.textMuted },
});
