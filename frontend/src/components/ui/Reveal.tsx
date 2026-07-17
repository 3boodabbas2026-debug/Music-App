import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleProp, ViewStyle } from 'react-native';

import { motion } from '../../theme/tokens';

type Props = PropsWithChildren<{
  delay?: number;
  style?: StyleProp<ViewStyle>;
  distance?: number;
  /** Replays the entrance without remounting child state (for focused routes). */
  resetKey?: string | number | boolean;
}>;

function initialReducedMotion() {
  return Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    : false;
}

/** A single, restrained entrance that becomes immediate with reduced motion. */
export function Reveal({ children, delay = 0, style, distance = 10, resetKey }: Props) {
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay,
      duration: motion.duration.slow,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reducedMotion, resetKey]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
