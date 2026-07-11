import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

export type MoonlightState = 'idle' | 'listening' | 'playing';

type MoonlightProps = {
  state: MoonlightState;
  amplitude?: number;
  size?: number;
  accentColor?: string;
};

/**
 * Duskglen's signature moon, built from composited native views.
 *
 * The previous native implementation ran a WebGL scene with a 9k-vertex
 * sphere and per-frame geometry work. The shipped APK is a Capacitor WebView,
 * and the remaining native/Expo preview does not need a second rendering
 * engine for one brand mark. This version keeps the same emotional cue with
 * a fraction of the startup, memory, and frame cost.
 */
export function Moonlight({ state, amplitude = 0, size = 220, accentColor }: MoonlightProps) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || !mounted) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(drift, {
            toValue: 1,
            duration: 3400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift, {
            toValue: 0,
            duration: 3400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });
    return () => {
      mounted = false;
      loop?.stop();
    };
  }, [drift]);

  const glow = accentColor ?? (state === 'listening' ? '#F0C36A' : state === 'playing' ? '#B8A5FF' : '#FF755D');
  const energy = Math.min(1, Math.max(0, amplitude));
  const moonSize = size * 0.48;

  return (
    <View style={[styles.root, { width: size, height: size }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          styles.halo,
          {
            width: size * 0.74,
            height: size * 0.74,
            borderRadius: size,
            backgroundColor: `${glow}18`,
            transform: [
              { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1 + energy * 0.03, 1.07 + energy * 0.08] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.moon,
          {
            width: moonSize,
            height: moonSize,
            borderRadius: moonSize,
            shadowColor: glow,
            transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [2, -3] }) }],
          },
        ]}
      >
        <View style={[styles.crater, { width: moonSize * 0.16, height: moonSize * 0.16, borderRadius: moonSize, top: moonSize * 0.2, left: moonSize * 0.22 }]} />
        <View style={[styles.crater, { width: moonSize * 0.1, height: moonSize * 0.1, borderRadius: moonSize, top: moonSize * 0.56, left: moonSize * 0.62 }]} />
        <View style={[styles.shade, { width: moonSize, height: moonSize, borderRadius: moonSize, left: moonSize * 0.34 }]} />
      </Animated.View>
      <View style={[styles.orbit, { width: size * 0.82, height: size * 0.3, borderRadius: size, borderColor: `${glow}45` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  moon: {
    overflow: 'hidden',
    backgroundColor: '#F7F3FA',
    shadowOpacity: 0.48,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  shade: { position: 'absolute', top: 0, backgroundColor: 'rgba(43,31,58,0.18)' },
  crater: { position: 'absolute', backgroundColor: 'rgba(78,60,91,0.12)' },
  orbit: { position: 'absolute', borderWidth: 1, transform: [{ rotate: '-12deg' }] },
});
