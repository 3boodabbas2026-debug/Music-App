import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radii, shadows, spacing, typography } from '../../theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const isDisabled = disabled || loading;

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.primaryShadow,
          { opacity: isDisabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
          style,
        ]}
      >
        <LinearGradient
          colors={colors.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.primary}
        >
          {loading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.primaryLabel}>{label}</Text>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.ghost,
        variant === 'danger' && styles.dangerSurface,
        { opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.cyan} />
      ) : (
        <Text style={[styles.ghostLabel, variant === 'danger' && styles.dangerLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primaryShadow: {
    borderRadius: radii.md,
    ...shadows.glowPrimary,
  },
  primary: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    ...typography.subtitle,
    color: colors.bg,
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  ghost: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ghostLabel: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  dangerSurface: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  dangerLabel: {
    color: colors.danger,
  },
});
