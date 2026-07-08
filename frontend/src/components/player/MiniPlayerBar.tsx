import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '../ui/GlassPanel';
import { useResponsive } from '../../hooks/useResponsive';
import { usePlayerStore } from '../../store/playerStore';
import { colors, layout, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

/** Three dancing bars — the universal "something is playing" signal. */
function EqBars({ active }: { active: boolean }) {
  const bars = [useRef(new Animated.Value(0.4)).current, useRef(new Animated.Value(0.7)).current, useRef(new Animated.Value(0.5)).current];

  useEffect(() => {
    if (!active) return;
    const loops = bars.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: 320 + i * 90, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(value, { toValue: 0.25, duration: 320 + i * 90, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <View style={styles.eqRow}>
      {bars.map((value, i) => (
        <Animated.View
          key={i}
          style={[
            styles.eqBar,
            { height: value.interpolate({ inputRange: [0, 1], outputRange: [3, 14] }) },
          ]}
        />
      ))}
    </View>
  );
}

export function MiniPlayerBar() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const { currentMedia, playing, currentTime, duration, toggle, playNext, playPrev, queue } = usePlayerStore();

  if (!currentMedia) return null;

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  // On phones the bar floats above the bottom dock; on desktop there is no
  // dock, so it hugs the bottom edge as a centered strip.
  const bottom = isDesktop ? insets.bottom + spacing.md : insets.bottom + layout.dockClearance + spacing.sm;

  return (
    <View pointerEvents="box-none" style={[styles.holder, isDesktop && styles.holderDesktop, { bottom }]}>
      <Pressable onPress={() => navigation.navigate('Player')} style={isDesktop ? styles.pressDesktop : undefined}>
        <GlassPanel style={styles.panel} overlayColor="rgba(23,24,27,0.6)">
          <View style={styles.content}>
            {currentMedia.thumbnail_url ? (
              <Image source={{ uri: currentMedia.thumbnail_url }} style={styles.cover} />
            ) : (
              <LinearGradient colors={colors.gradientPrimary} style={styles.cover}>
                <Ionicons name="musical-notes" size={18} color="#0C0D10" />
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
            <EqBars active={playing} />
            {isDesktop && queue.length > 1 && (
              <Pressable onPress={() => playPrev()} hitSlop={10} style={styles.skipButton}>
                <Ionicons name="play-skip-back" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
            <Pressable onPress={toggle} hitSlop={12} style={styles.controlButton}>
              <Ionicons name={playing ? 'pause' : 'play'} size={18} color={colors.cyan} />
            </Pressable>
            {queue.length > 1 && (
              <Pressable onPress={() => playNext()} hitSlop={10} style={styles.skipButton}>
                <Ionicons name="play-skip-forward" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </GlassPanel>
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
    backgroundColor: 'rgba(224,149,79,0.16)',
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
    backgroundColor: 'rgba(233,229,220,0.14)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.cyan,
  },
});
