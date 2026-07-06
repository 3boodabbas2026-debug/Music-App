import { PropsWithChildren, useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';

type Props = PropsWithChildren<{
  /** Stagger offset in ms. */
  delay?: number;
  style?: ViewStyle | ViewStyle[];
}>;

/** Mount entrance: content drifts up and fades in. Stagger with `delay` for editorial rhythm. */
export function Reveal({ children, delay = 0, style }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [anim, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
