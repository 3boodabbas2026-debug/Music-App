import { memo, useId } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { ambient, gradients, palette } from '../../theme/theme';

type RippleFieldProps = {
  dimmed?: boolean;
  accentColor?: string | null;
};

const STAR_COUNT = 16;

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

/**
 * Static atmospheric canvas. It keeps the dusk identity while doing no work
 * after first paint: no timers, store subscriptions, per-frame JS updates or
 * tab-hidden animation loops.
 */
export const RippleField = memo(function RippleField({ dimmed = false, accentColor }: RippleFieldProps) {
  const signal = accentColor ?? palette.primary;
  const id = useId().replace(/:/g, '');
  const topGradientId = `dusk-top-${id}`;
  const horizonGradientId = `dusk-horizon-${id}`;

  return (
    <View pointerEvents="none" style={[styles.root, dimmed && styles.dimmed]}>
      <LinearGradient colors={[...gradients.screenIdle]} style={StyleSheet.absoluteFill} />
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
      {STATIC_STAR_STYLES.map((starStyle, index) => (
        <View key={index} style={starStyle} />
      ))}
      <View style={styles.ridge}>
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
      </View>
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
    backgroundColor: palette.void,
  },
  dimmed: { opacity: 0.58 },
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
