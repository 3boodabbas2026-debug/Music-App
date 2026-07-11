import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AccessibilityState,
  Animated,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

type Props = PropsWithChildren<{
  onPress?: PressableProps['onPress'];
  onLongPress?: PressableProps['onLongPress'];
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  hoverScaleTo?: number;
  hitSlop?: PressableProps['hitSlop'];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
}>;

/** Accessible 44pt touch target with restrained press feedback. */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  scaleTo = 0.97,
  hoverScaleTo = 1.01,
  hitSlop,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const hovered = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);

  const to = (value: number) => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 36,
      bounciness: 1,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      style={styles.hitTarget}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(hovered.current ? hoverScaleTo : 1)}
      onHoverIn={
        Platform.OS === 'web'
          ? () => {
              hovered.current = true;
              if (!disabled) to(hoverScaleTo);
            }
          : undefined
      }
      onHoverOut={
        Platform.OS === 'web'
          ? () => {
              hovered.current = false;
              to(1);
            }
          : undefined
      }
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled && styles.disabled]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
});
