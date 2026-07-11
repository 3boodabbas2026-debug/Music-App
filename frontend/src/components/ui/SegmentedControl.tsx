import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing } from '../../theme/tokens';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
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

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.root, style]}>
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
              pressed && !option.disabled && styles.pressed,
              option.disabled && styles.disabled,
            ]}
          >
            {option.icon ? <Ionicons name={option.icon} size={16} color={selected ? colors.textPrimary : colors.textMuted} /> : null}
            <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={1}>
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
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
  },
  selected: { backgroundColor: colors.surfaceElevated },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.38 },
  label: { fontFamily: 'Sora_500Medium', fontSize: 12, lineHeight: 16, color: colors.textMuted },
  selectedLabel: { color: colors.textPrimary },
});
