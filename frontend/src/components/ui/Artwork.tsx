import { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { API_BASE_URL } from '../../config';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, glass, radii } from '../../theme/tokens';
import { motionPresets } from '../../theme/motion';
import { coverGlyphColor, coverGradient, displayArtist, displayTitle } from '../../utils/mediaDisplay';

export type ArtworkMedia = {
  id?: string | number | null;
  title?: string | null;
  recognized_title?: string | null;
  artist?: string | null;
  recognized_artist?: string | null;
  duration_seconds?: number | null;
  media_type?: 'audio' | 'video' | string | null;
  thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  artwork_url?: string | null;
  artworkUrl?: string | null;
};

type Props = {
  media: ArtworkMedia | null | undefined;
  size?: number | '100%';
  style?: StyleProp<ViewStyle>;
  /** Prioritizes hero/now-playing art. Lists remain lazy by default. */
  priority?: boolean;
  accessibilityLabel?: string;
  borderRadius?: number;
  contentFit?: 'cover' | 'contain';
};

function resolveUri(media: ArtworkMedia | null | undefined) {
  const raw = media?.thumbnail_url ?? media?.thumbnailUrl ?? media?.artwork_url ?? media?.artworkUrl ?? null;
  if (!raw) return null;
  return raw.startsWith('/') ? `${API_BASE_URL}${raw}` : raw;
}

/** Cached, recyclable cover art with a stable fallback and no layout shift. */
export function Artwork({
  media,
  size = 48,
  style,
  priority = false,
  accessibilityLabel,
  borderRadius = radii.cover,
  contentFit = 'cover',
}: Props) {
  const reduceMotion = useReducedMotion();
  const key = String(media?.id ?? resolveUri(media) ?? 'untitled');
  const uri = resolveUri(media);
  const title = displayTitle({
    title: media?.title ?? null,
    recognized_title: media?.recognized_title ?? null,
    duration_seconds: media?.duration_seconds ?? null,
  });
  const artist = displayArtist({
    artist: media?.artist ?? null,
    recognized_artist: media?.recognized_artist ?? null,
  });
  const label = accessibilityLabel ?? `${title}${artist ? ` by ${artist}` : ''} artwork`;
  const dimensions: ViewStyle = { width: size, height: size };
  const fallbackBadgeSize = typeof size === 'number'
    ? Math.max(28, Math.min(72, size * 0.48))
    : 64;
  const fallbackGlyphSize = Math.max(16, Math.round(fallbackBadgeSize * 0.44));
  const handoff = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    handoff.stopAnimation();
    if (!priority || reduceMotion) {
      handoff.setValue(1);
      return;
    }
    handoff.setValue(0);
    Animated.timing(handoff, {
      toValue: 1,
      duration: motionPresets.emphasis.duration,
      easing: motionPresets.emphasis.easing,
      useNativeDriver: true,
    }).start();
  }, [handoff, key, priority, reduceMotion]);

  return (
    <Animated.View
      accessible={!uri}
      accessibilityRole={!uri ? 'image' : undefined}
      accessibilityLabel={!uri ? label : undefined}
      style={[
        styles.root,
        dimensions,
        { borderRadius },
        priority && {
          opacity: handoff,
          transform: [{ scale: handoff.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
        },
        style,
      ]}
    >
      <LinearGradient colors={[...coverGradient(key)]} style={StyleSheet.absoluteFill}>
        <View pointerEvents="none" style={styles.grooveField}>
          <View style={[styles.groove, styles.grooveOuter]} />
          <View style={[styles.groove, styles.grooveMiddle]} />
          <View style={[styles.groove, styles.grooveInner]} />
          <View style={styles.horizon} />
          <View style={styles.horizonNotch} />
        </View>
        <View style={styles.fallbackIcon}>
          <View
            style={[
              styles.fallbackBadge,
              { width: fallbackBadgeSize, height: fallbackBadgeSize },
            ]}
          >
            <Ionicons
              name={media?.media_type === 'video' ? 'videocam' : 'musical-notes'}
              size={fallbackGlyphSize}
              color={coverGlyphColor(key)}
            />
          </View>
        </View>
      </LinearGradient>
      {uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          priority={priority ? 'high' : 'normal'}
          loading={priority ? 'eager' : 'lazy'}
          recyclingKey={key}
          transition={reduceMotion ? 0 : priority ? motionPresets.emphasis.duration : 160}
          accessible
          accessibilityLabel={label}
          alt={label}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: colors.surfaceBright,
  },
  fallbackIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grooveField: { ...StyleSheet.absoluteFill as object, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  groove: { position: 'absolute', borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(194,232,217,0.10)' },
  grooveOuter: { width: '82%', height: '82%' },
  grooveMiddle: { width: '64%', height: '64%' },
  grooveInner: { width: '46%', height: '46%', borderColor: 'rgba(233,205,126,0.12)' },
  horizon: { position: 'absolute', left: '12%', right: '12%', bottom: '14%', height: 1, backgroundColor: 'rgba(99,214,181,0.24)' },
  horizonNotch: { position: 'absolute', bottom: '14%', width: 12, height: 3, borderRadius: radii.pill, backgroundColor: 'rgba(233,205,126,0.54)' },
  fallbackBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: glass.fillBright,
    borderWidth: 1,
    borderColor: glass.strokeStrong,
  },
});
