import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '../../theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  icon,
  accessibilityHint,
  testID,
}: Props) {
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={loading ? `${label}, in progress` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        isPrimary && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDanger && styles.danger,
        pressed && !isDisabled && styles.pressed,
        isDisabled && isPrimary && styles.disabledPrimary,
        isDisabled && variant === 'secondary' && styles.disabledSecondary,
        isDisabled && variant === 'ghost' && styles.disabledGhost,
        isDisabled && isDanger && styles.disabledDanger,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={isPrimary ? colors.textInverse : isDanger ? colors.danger : colors.cyan}
          />
        ) : icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={isDisabled ? colors.textMuted : isPrimary ? colors.textInverse : isDanger ? colors.danger : colors.textPrimary}
          />
        ) : null}
        <Text
          style={[
            styles.label,
            isPrimary && !isDisabled && styles.primaryLabel,
            isDanger && !isDisabled && styles.dangerLabel,
            isDisabled && !loading && styles.disabledLabel,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: colors.cyan,
    borderColor: colors.cyan,
  },
  secondary: {
    backgroundColor: colors.surfaceBright,
    borderColor: colors.surfaceBorderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.surfaceBorder,
  },
  danger: {
    backgroundColor: 'rgba(239,120,136,0.08)',
    borderColor: 'rgba(239,120,136,0.24)',
  },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  disabledPrimary: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.surfaceBorder,
  },
  disabledSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
  },
  disabledGhost: {
    borderColor: colors.surfaceBorder,
  },
  disabledDanger: {
    backgroundColor: 'rgba(239,120,136,0.04)',
    borderColor: 'rgba(239,120,136,0.12)',
  },
  content: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary, textAlign: 'center' },
  primaryLabel: { color: colors.textInverse },
  dangerLabel: { color: colors.danger },
  disabledLabel: { color: colors.textMuted },
});
