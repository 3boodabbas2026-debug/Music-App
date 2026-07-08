import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

import { gradients } from '../../theme/theme';

/**
 * The app's ambient backdrop: a flat, quiet ground with two or three rings
 * echoing outward — the same ripple the brand mark stands on. Restrained on
 * purpose: this sits behind every screen's real content, so it stays low-
 * opacity, slow, and out of the way rather than competing for attention.
 */

type RingSpec = {
  id: string;
  size: number;
  color: string;
  opacity: number;
  x: number;
  y: number;
  duration: number;
};

const RINGS: RingSpec[] = [
  { id: 'signal', size: 620, color: '#E0954F', opacity: 0.07, x: -180, y: -160, duration: 32000 },
  { id: 'wave', size: 720, color: '#46A69C', opacity: 0.06, x: 220, y: 420, duration: 40000 },
];

function Ring({ spec }: { spec: RingSpec }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: spec.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: spec.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, spec.duration]);

  const r = spec.size / 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: spec.x,
        top: spec.y,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
        opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [spec.opacity, spec.opacity * 1.4, spec.opacity] }),
      }}
    >
      <Svg width={spec.size} height={spec.size}>
        <Circle cx={r} cy={r} r={r - 40} stroke={spec.color} strokeWidth={1.5} fill="none" />
        <Circle cx={r} cy={r} r={r - 100} stroke={spec.color} strokeWidth={1} fill="none" />
      </Svg>
    </Animated.View>
  );
}

export function RippleField() {
  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient colors={gradients.screenIdle} style={StyleSheet.absoluteFill} />
      {RINGS.map((spec) => (
        <Ring key={spec.id} spec={spec} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: '#060607',
  },
});
