import { memo, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { gradients, palette } from '../../theme/theme';

type RippleFieldProps = {
  dimmed?: boolean;
  accentColor?: string | null;
};

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
  horizonLine: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(242,139,99,0.10)',
  },
});
