import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, glass, glassBlur, radii, spacing } from '../../theme/tokens';
import { motion } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tintColor?: string;
  disabled?: boolean;
};

type BaseProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

type Props<T extends string> = BaseProps<T> &
  (
    | { onChange: (value: T) => void; onValueChange?: never }
    | { onValueChange: (value: T) => void; onChange?: never }
  );

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  onValueChange,
  accessibilityLabel,
  style,
}: Props<T>) {
  const select = onValueChange ?? onChange;
  const reducedMotion = useReducedMotion();
  const [rootWidth, setRootWidth] = useState(0);
  const plateX = useRef(new Animated.Value(0)).current;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const gap = 2;
  const padding = 3;
  const segmentWidth = rootWidth > 0
    ? (rootWidth - padding * 2 - gap * Math.max(0, options.length - 1)) / Math.max(1, options.length)
    : 0;

  useEffect(() => {
    if (segmentWidth <= 0) return;
    const target = padding + selectedIndex * (segmentWidth + gap);
    plateX.stopAnimation();
    if (reducedMotion) {
      plateX.setValue(target);
      return;
    }
    Animated.timing(plateX, {
      toValue: target,
      duration: motion.duration.base,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: true,
    }).start();
  }, [plateX, reducedMotion, segmentWidth, selectedIndex]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setRootWidth(Math.ceil(event.nativeEvent.layout.width))}
      style={[styles.root, glassBlur, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.selectionPlate,
          {
            opacity: segmentWidth > 0 ? 1 : 0,
            width: segmentWidth,
            transform: [{ translateX: plateX }],
          },
        ]}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => select?.(option.value)}
            disabled={option.disabled}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled: !!option.disabled }}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.selected,
              selected && option.tintColor ? { borderColor: option.tintColor } : null,
              pressed && !option.disabled && styles.pressed,
              option.disabled && styles.disabled,
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={16}
                color={option.tintColor ?? (selected ? colors.textPrimary : colors.textMuted)}
              />
            ) : null}
            <Text style={[styles.label, selected && styles.selectedLabel, option.disabled && styles.disabledLabel]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    gap: 2,
    borderRadius: radii.md,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  segment: {
    minWidth: 44,
    minHeight: 36,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selected: { borderColor: 'transparent' },
  selectionPlate: {
    position: 'absolute',
    left: 0,
    top: 3,
    bottom: 3,
    borderRadius: radii.sm,
    backgroundColor: glass.tintPrimary,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
  },
  pressed: { backgroundColor: glass.fillBright, borderColor: glass.strokeStrong },
  disabled: { backgroundColor: glass.fillDeep, borderColor: glass.stroke },
  disabledLabel: { color: colors.textMuted },
  label: { fontFamily: 'Sora_500Medium', fontSize: 12, lineHeight: 16, color: colors.textMuted },
  selectedLabel: { color: colors.textPrimary },
});
