import { Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii } from '../../theme/tokens';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: PressableProps['onPress'];
  accessibilityHint?: string;
  variant?: 'ghost' | 'surface' | 'primary' | 'danger';
  selected?: boolean;
  disabled?: boolean;
  size?: number;
  iconSize?: number;
  hitSlop?: PressableProps['hitSlop'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function IconButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  variant = 'ghost',
  selected = false,
  disabled = false,
  size = 44,
  iconSize = 21,
  hitSlop,
  style,
  testID,
}: Props) {
  const tone = variant === 'danger' ? colors.danger : variant === 'primary' ? colors.textInverse : selected ? colors.cyan : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected }}
      style={({ pressed }) => [
        styles.base,
        { width: Math.max(44, size), height: Math.max(44, size), borderRadius: Math.max(44, size) / 2 },
        variant === 'surface' && styles.surface,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
        selected && variant !== 'primary' && styles.selected,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={tone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  surface: { backgroundColor: colors.surfaceBright, borderColor: colors.surfaceBorder },
  primary: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  danger: { backgroundColor: 'rgba(239,120,136,0.08)', borderColor: 'rgba(239,120,136,0.18)' },
  selected: { backgroundColor: 'rgba(242,139,99,0.10)', borderColor: 'rgba(242,139,99,0.24)' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.4 },
});
