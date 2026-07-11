import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { palette } from '../../theme/theme';

type Props = {
  uri: string | null | undefined;
  /** How strongly the art shows through — the Player uses the default; a
   * smaller host (the Home hero card) can pass something lower so the art
   * reads as a hint of color rather than the whole scene. */
  opacity?: number;
  /** Blur strength in pixels — expo-image keeps the effect while reusing its
   * memory/disk cache across track changes. */
  blurRadius?: number;
  /** Darkness of the scrim over the art — the Player needs a strong one so
   * controls stay legible; a small card can use a lighter touch so the art
   * actually reads as color, not just a dark tile. */
  scrimOpacity?: number;
};

/**
 * The current track's own cover art, blown up and blurred into a soft
 * backdrop — the one signature visual real music apps have that a generic
 * ambient sky can't give you. Renders nothing when there's no art, so the
 * caller's default background shows through untouched. Cross-fades on track
 * change (keyed by `uri`) instead of hard-popping when skipping songs.
 */
export function CoverBackdrop({ uri, opacity = 1, blurRadius = 50, scrimOpacity = 0.62 }: Props) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    if (!uri) return;
    Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [uri, fade]);

  if (!uri) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.clip, { opacity: Animated.multiply(fade, opacity) }]}
    >
      <Image
        source={{ uri }}
        blurRadius={blurRadius}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
        loading="eager"
        recyclingKey={uri}
        transition={180}
        accessible={false}
        alt=""
        style={styles.art}
      />
      <View style={[styles.scrim, { opacity: scrimOpacity }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  art: {
    ...(StyleSheet.absoluteFill as object),
    // Scaled up so the blur's soft edges fall outside the visible crop
    // instead of showing a lighter fringe at the container's border.
    transform: [{ scale: 1.2 }],
  },
  scrim: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: palette.void,
  },
});
