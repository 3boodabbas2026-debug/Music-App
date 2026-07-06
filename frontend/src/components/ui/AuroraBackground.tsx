import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { gradients } from '../../theme/theme';

/**
 * The app's living backdrop: a deep-space gradient with three softly glowing
 * aurora orbs that drift on slow multi-minute loops, plus a sparse field of
 * twinkling stars. Pure decoration — sits behind every screen.
 */

type BlobSpec = {
  id: string;
  size: number;
  color: string;
  /** Peak opacity of the glow core. */
  glow: number;
  /** Resting position (percent-ish offsets from top-left). */
  x: number;
  y: number;
  /** Drift travel in px and loop duration in ms. */
  driftX: number;
  driftY: number;
  duration: number;
};

const BLOBS: BlobSpec[] = [
  { id: 'cyan', size: 460, color: '#38BDF8', glow: 0.30, x: -140, y: -120, driftX: 70, driftY: 40, duration: 26000 },
  { id: 'indigo', size: 520, color: '#818CF8', glow: 0.26, x: 140, y: 260, driftX: -60, driftY: 70, duration: 34000 },
  { id: 'bloom', size: 420, color: '#C084FC', glow: 0.18, x: -60, y: 560, driftX: 50, driftY: -60, duration: 30000 },
];

// Deterministic star field — position/size derived from the index so the sky
// looks the same every launch.
const STARS = Array.from({ length: 18 }, (_, i) => {
  const seed = Math.sin(i * 999.7) * 10000;
  const frac = (n: number) => n - Math.floor(n);
  return {
    left: frac(seed) * 100,
    top: frac(seed * 1.7) * 100,
    size: 1.5 + frac(seed * 2.3) * 1.5,
    baseOpacity: 0.2 + frac(seed * 3.1) * 0.5,
    twinkleGroup: i % 3,
  };
});

function GlowBlob({ spec }: { spec: BlobSpec }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: spec.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: spec.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, spec.duration]);

  const r = spec.size / 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: spec.x,
        top: spec.y,
        transform: [
          { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, spec.driftX] }) },
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, spec.driftY] }) },
          { scale: drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] }) },
        ],
      }}
    >
      <Svg width={spec.size} height={spec.size}>
        <Defs>
          <RadialGradient id={`aurora-${spec.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={spec.color} stopOpacity={spec.glow} />
            <Stop offset="55%" stopColor={spec.color} stopOpacity={spec.glow * 0.4} />
            <Stop offset="100%" stopColor={spec.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#aurora-${spec.id})`} />
      </Svg>
    </Animated.View>
  );
}

function StarField() {
  const twinkles = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const loops = twinkles.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 1300),
          Animated.timing(value, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {STARS.map((star, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            borderRadius: star.size / 2,
            backgroundColor: '#F8FAFC',
            opacity: twinkles[star.twinkleGroup].interpolate({
              inputRange: [0, 1],
              outputRange: [star.baseOpacity * 0.4, star.baseOpacity],
            }),
          }}
        />
      ))}
    </>
  );
}

export function AuroraBackground() {
  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient colors={gradients.screenIdle} style={StyleSheet.absoluteFill} />
      {BLOBS.map((spec) => (
        <GlowBlob key={spec.id} spec={spec} />
      ))}
      <StarField />
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
    backgroundColor: '#060B18',
  },
});
