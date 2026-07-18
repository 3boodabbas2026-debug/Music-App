import { ActivityIndicator, Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, controlLayers, glass, glassBlur, iconography, radii, shadows, spacing, typography } from '../../theme/tokens';
import { useTactileGlass } from '../../hooks/useTactileGlass';

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

/** A bright mint for text sitting on the teal-tinted primary glass pane. */
const PRIMARY_LABEL = '#E9FFF6';

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
  const tactile = useTactileGlass({ disabled: !!isDisabled });

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={loading ? `${label}, in progress` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPressIn={tactile.onPressIn}
      onPressOut={tactile.onPressOut}
      onHoverIn={tactile.onHoverIn}
      onHoverOut={tactile.onHoverOut}
      style={[
        styles.base,
        glassBlur,
        isPrimary && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDanger && styles.danger,
        isDisabled && isPrimary && styles.disabledPrimary,
        isDisabled && variant === 'secondary' && styles.disabledSecondary,
        isDisabled && variant === 'ghost' && styles.disabledGhost,
        isDisabled && isDanger && styles.disabledDanger,
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.pressedLayer, { opacity: tactile.highlight.interpolate({ inputRange: [0.92, 1], outputRange: [1, 0] }) }]}
      />
      <Animated.View style={[styles.content, { opacity: tactile.highlight, transform: [{ scale: tactile.scale }] }]}>
        {loading ? (
          <ActivityIndicator size="small" color={isDanger ? colors.danger : colors.cyan} />
        ) : icon ? (
          <Ionicons
            name={icon}
            size={iconography.size.md}
            color={isDisabled ? colors.textMuted : isPrimary ? colors.cyan : isDanger ? colors.danger : colors.textPrimary}
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
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.hoverBorder, { opacity: tactile.hoverBorder }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 52,
    borderRadius: radii.control,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pressedLayer: { ...(StyleSheet.absoluteFill as object), backgroundColor: glass.fillBright },
  // Every variant is a glass pane: translucent tint + luminous stroke, with
  // the shared backdrop blur applied inline so the sky reflects through.
  primary: {
    backgroundColor: glass.tintPrimary,
    borderColor: glass.tintPrimaryStroke,
    ...shadows.low,
  },
  secondary: {
    backgroundColor: glass.fillBright,
    borderColor: glass.strokeStrong,
  },
  ghost: {
    backgroundColor: glass.fillDeep,
    borderColor: glass.stroke,
  },
  danger: {
    backgroundColor: glass.tintDanger,
    borderColor: glass.tintDangerStroke,
  },
  hoverBorder: { ...(StyleSheet.absoluteFill as object), borderRadius: radii.control, borderWidth: 1, borderColor: glass.edgeModal },
  disabledPrimary: {
    backgroundColor: controlLayers.disabled.fill,
    borderColor: controlLayers.disabled.stroke,
    shadowOpacity: 0,
    elevation: 0,
  },
  disabledSecondary: {
    backgroundColor: controlLayers.disabled.fill,
    borderColor: controlLayers.disabled.stroke,
  },
  disabledGhost: {
    backgroundColor: controlLayers.disabled.fill,
    borderColor: controlLayers.disabled.stroke,
  },
  disabledDanger: {
    backgroundColor: 'rgba(240,131,140,0.05)',
    borderColor: 'rgba(240,131,140,0.14)',
  },
  content: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: iconography.labelGap.standard,
  },
  label: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary, textAlign: 'center' },
  primaryLabel: { color: PRIMARY_LABEL },
  dangerLabel: { color: colors.danger },
  disabledLabel: { color: colors.textMuted },
});
