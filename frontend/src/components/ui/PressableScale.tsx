import { PropsWithChildren, useRef } from 'react';
import { Animated, Pressable, ViewStyle } from 'react-native';

type Props = PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  /** Scale while pressed. */
  scaleTo?: number;
  hitSlop?: number;
}>;

/** Touchable that springs down on press — every tap in the app should feel physical. */
export function PressableScale({ children, onPress, disabled, style, scaleTo = 0.94, hitSlop }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.5 } : null]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
