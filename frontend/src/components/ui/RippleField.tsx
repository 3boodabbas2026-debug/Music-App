import { memo, useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTheme } from '../../theme/ThemeProvider';
import { ambient, palette } from '../../theme/theme';

type RippleFieldProps = {
  dimmed?: boolean;
  accentColor?: string | null;
};

const STAR_COUNT = 16;
const FIREFLY_COUNT = 6;

/** Deterministic pseudo-random so the shared sky is identical on every paint. */
function seeded(index: number, salt: number): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const STATIC_STAR_STYLES = Array.from({ length: STAR_COUNT }, (_, index): ViewStyle => {
  const size = 1 + seeded(index, 3) * 1.3;
  return {
    position: 'absolute',
    left: `${3 + ((index + seeded(index, 1)) / STAR_COUNT) * 94}%` as `${number}%`,
    top: `${4 + seeded(index, 2) * 58}%` as `${number}%`,
    width: size,
    height: size,
    borderRadius: size,
    opacity: 0.15 + seeded(index, 7) * 0.2,
    backgroundColor: seeded(index, 5) > 0.88 ? palette.gold : palette.textPrimary,
  };
});

const FIREFLY_LAYOUTS = Array.from({ length: FIREFLY_COUNT }, (_, index): ViewStyle => {
  const size = 1.8 + seeded(index, 13) * 1.8;
  return {
    position: 'absolute',
    left: `${10 + seeded(index, 17) * 80}%` as `${number}%`,
    top: `${30 + seeded(index, 19) * 55}%` as `${number}%`,
    width: size,
    height: size,
    borderRadius: size,
  };
});

/**
 * Living atmospheric overlay for the shared forest. One native-driven phase
 * gently twinkles the stars, floats a few canopy lights, and shifts the distant
 * ridge without adding per-particle timers or covering the realistic backdrop.
 */
export const RippleField = memo(function RippleField({ dimmed = false, accentColor }: RippleFieldProps) {
  const signal = accentColor ?? palette.primary;
  const id = useId().replace(/:/g, '');
  const topGradientId = `dusk-top-${id}`;
  const horizonGradientId = `dusk-horizon-${id}`;
  const twinkle = useRef(new Animated.Value(0.35)).current;
  const reducedMotion = useReducedMotion();
  const { scheme } = useTheme();
  const daylight = scheme === 'light';

  useEffect(() => {
    twinkle.stopAnimation();
    if (reducedMotion) {
      twinkle.setValue(0.5);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(twinkle, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, twinkle]);

  return (
    <View
      testID="forest-atmosphere"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, dimmed && styles.dimmed]}
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={topGradientId} cx="82%" cy="8%" rx="58%" ry="42%">
            <Stop offset="0%" stopColor={palette.secondary} stopOpacity={0.08} />
            <Stop offset="100%" stopColor={palette.secondary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={horizonGradientId} cx="14%" cy="94%" rx="72%" ry="48%">
            <Stop offset="0%" stopColor={signal} stopOpacity={dimmed ? 0.04 : 0.09} />
            <Stop offset="100%" stopColor={signal} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${topGradientId})`} />
        <Rect width="100%" height="100%" fill={`url(#${horizonGradientId})`} />
      </Svg>
      <Animated.View
        style={[
          styles.particleLayer,
          {
            opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.54, 1] }),
            transform: [{ translateY: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1.5, -1.5] }) }],
          },
        ]}
      >
        {STATIC_STAR_STYLES.map((starStyle, index) => (index % 2 === 0 ? <View key={index} style={starStyle} /> : null))}
      </Animated.View>
      <Animated.View
        style={[
          styles.particleLayer,
          {
            opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0.5] }),
            transform: [{ translateY: twinkle.interpolate({ inputRange: [0, 1], outputRange: [-1, 2] }) }],
          },
        ]}
      >
        {STATIC_STAR_STYLES.map((starStyle, index) => (index % 2 === 1 ? <View key={index} style={starStyle} /> : null))}
      </Animated.View>
      <Animated.View
        testID="forest-fireflies"
        style={[
          styles.particleLayer,
          {
            opacity: twinkle.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: daylight ? [0.08, 0.18, 0.1] : [0.28, 0.86, 0.36],
            }),
            transform: [
              { translateX: twinkle.interpolate({ inputRange: [0, 1], outputRange: [-3, 4] }) },
              { translateY: twinkle.interpolate({ inputRange: [0, 1], outputRange: [4, -5] }) },
              { scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.12] }) },
            ],
          },
        ]}
      >
        {FIREFLY_LAYOUTS.map((layout, index) => {
          const tone = daylight ? '#FFFFFF' : index % 3 === 0 ? palette.gold : palette.primary;
          return <View key={index} style={[styles.firefly, layout, { backgroundColor: tone, shadowColor: tone }]} />;
        })}
      </Animated.View>
      <Animated.View
        style={[
          styles.ridge,
          {
            transform: [
              { translateX: twinkle.interpolate({ inputRange: [0, 1], outputRange: [-2, 2] }) },
              { scale: 1.015 },
            ],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 24" preserveAspectRatio="none">
          <Path
            d="M0,20 L8,10 L15,17 L24,7 L32,15 L42,5 L52,15 L60,8 L70,16 L80,6 L90,14 L100,9 L100,24 L0,24 Z"
            fill={ambient.ridgeBack}
            opacity={0.28}
          />
          <Path
            d="M0,24 L10,16 L22,21 L34,14 L48,21 L62,15 L76,21 L88,16 L100,20 L100,24 Z"
            fill={ambient.ridgeFront}
            opacity={0.4}
          />
        </Svg>
      </Animated.View>
      <View style={styles.horizonLine} />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  dimmed: { opacity: 0.58 },
  particleLayer: { ...StyleSheet.absoluteFill as object },
  firefly: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  ridge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '18%' },
  horizonLine: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(99,214,181,0.10)',
  },
});
