import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type AppStateStatus,
  type ImageStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  variant?: 'app' | 'sanctuary';
};

const FOREST_PORTRAIT = require('../../../assets/starhollow-forest-portrait.png');
const FOREST_LANDSCAPE = require('../../../assets/starhollow-forest-landscape.png');
const NIGHT_MIST = ['rgba(151,196,183,0)', 'rgba(151,196,183,0.16)', 'rgba(210,226,219,0.06)', 'rgba(151,196,183,0)'] as const;
const DAY_MIST = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(232,243,236,0.12)', 'rgba(255,255,255,0)'] as const;

function stateIsActive(state: AppStateStatus | null): boolean {
  return state !== 'background' && state !== 'inactive';
}

/**
 * The shared Star Hollow environment. Local bundled assets keep the forest
 * available offline and avoid a different background loading state on every
 * screen. Screen-specific surfaces sit above the same responsive canvas.
 */
export function ForestBackdrop({ variant = 'app' }: Props) {
  const { width, height } = useWindowDimensions();
  const portrait = height > width * 1.12;
  const sanctuary = variant === 'sanctuary';
  const { scheme } = useTheme();
  const daylight = scheme === 'light' && !sanctuary;
  const reducedMotion = useReducedMotion();
  const [appActive, setAppActive] = useState(() => stateIsActive(AppState.currentState));
  const drift = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(stateIsActive(state)));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    drift.stopAnimation();
    if (reducedMotion) {
      drift.setValue(0.5);
      return;
    }
    if (!appActive) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 26000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 26000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [appActive, drift, reducedMotion]);

  const forestTransform = [
    { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-7, 7] }) },
    { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [3, -3] }) },
    { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.035, 1.055] }) },
  ];
  const mistTransform = [
    { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [width * 0.06, width * -0.06] }) },
    { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-3, 5] }) },
    { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.01, 1.045] }) },
  ];

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`forest-backdrop-${variant}`}
      style={[StyleSheet.absoluteFill, styles.root]}
    >
      <Animated.View testID="forest-drift-layer" style={[styles.forestMotion, { transform: forestTransform }]}>
        <Image
          source={portrait ? FOREST_PORTRAIT : FOREST_LANDSCAPE}
          style={[StyleSheet.absoluteFill, !sanctuary && !daylight && darkAppForestImage, daylight && lightForestImage]}
          contentFit="cover"
          contentPosition="center"
          cachePolicy="memory-disk"
          priority="high"
          transition={sanctuary ? 180 : 0}
        />
      </Animated.View>
      <Animated.View
        testID="forest-mist-layer"
        style={[
          styles.mistBand,
          {
            opacity: drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.34, 0.62, 0.38] }),
            transform: mistTransform,
          },
        ]}
      >
        <LinearGradient
          colors={daylight ? DAY_MIST : NIGHT_MIST}
          locations={[0, 0.36, 0.68, 1]}
          start={{ x: 0, y: 0.25 }}
          end={{ x: 1, y: 0.75 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <LinearGradient
        colors={
          sanctuary
            ? ['rgba(2,7,10,0.18)', 'rgba(3,10,9,0.22)', 'rgba(2,8,6,0.68)']
            : daylight
              ? ['rgba(246,250,246,0.34)', 'rgba(235,244,237,0.46)', 'rgba(218,232,222,0.68)']
            : ['rgba(4,10,13,0.02)', 'rgba(5,18,15,0.06)', 'rgba(4,10,9,0.22)']
        }
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      {!sanctuary ? <View style={[styles.appVeil, daylight && styles.daylightVeil]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  forestMotion: {
    position: 'absolute',
    top: -12,
    right: -12,
    bottom: -12,
    left: -12,
  },
  mistBand: {
    position: 'absolute',
    top: '36%',
    left: '-24%',
    right: '-24%',
    height: '34%',
  },
  appVeil: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(5, 13, 12, 0.02)',
  },
  daylightVeil: { backgroundColor: 'rgba(239, 246, 241, 0.16)' },
});

const lightForestImage: ImageStyle =
  Platform.OS === 'web'
    ? ({ filter: 'brightness(1.62) saturate(0.68) contrast(0.82)' } as unknown as ImageStyle)
    : { opacity: 0.88 };

const darkAppForestImage: ImageStyle =
  Platform.OS === 'web'
    ? ({ filter: 'brightness(2.05) saturate(1.05) contrast(0.96)' } as unknown as ImageStyle)
    : { opacity: 1 };
