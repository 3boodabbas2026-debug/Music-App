import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, glass, glassBlur, motion, radii, spacing, typography } from '../../theme/tokens';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  credentialType?: 'username' | 'current-password' | 'new-password' | 'name' | 'one-time-code';
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

const CREDENTIAL_META = {
  username: { autoComplete: 'username', textContentType: 'username' },
  'current-password': { autoComplete: 'current-password', textContentType: 'password' },
  'new-password': { autoComplete: 'new-password', textContentType: 'newPassword' },
  name: { autoComplete: 'name', textContentType: 'name' },
  'one-time-code': { autoComplete: 'one-time-code', textContentType: 'oneTimeCode' },
} as const;

export function TextField({
  label,
  error,
  hint,
  style,
  onFocus,
  onBlur,
  secureTextEntry,
  accessibilityLabel,
  credentialType,
  autoComplete,
  textContentType,
  leadingIcon,
  compact = false,
  containerStyle,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const reduceMotion = useReducedMotion();
  const focusProgress = useRef(new Animated.Value(0)).current;
  const isSecure = !!secureTextEntry;
  const credentialMeta = credentialType ? CREDENTIAL_META[credentialType] : undefined;

  useEffect(() => {
    if (reduceMotion) {
      focusProgress.setValue(0);
      return;
    }
    const animation = Animated.timing(focusProgress, {
      toValue: focused ? 1 : 0,
      duration: motion.duration.fast,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [focusProgress, focused, reduceMotion]);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text> : null}
      <Animated.View
        style={{
          transform: [
            { scale: focusProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.008] }) },
            { translateY: focusProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
          ],
        }}
      >
        {leadingIcon ? (
          <View pointerEvents="none" style={styles.leadingIcon}>
            <Ionicons name={leadingIcon} size={18} color={focused ? colors.cyan : colors.textMuted} />
          </View>
        ) : null}
        <TextInput
          {...rest}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled: rest.editable === false }}
          autoComplete={credentialMeta?.autoComplete ?? autoComplete}
          textContentType={credentialMeta?.textContentType ?? textContentType}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.cyan}
          secureTextEntry={isSecure && !revealed}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            compact && styles.inputCompact,
            glassBlur,
            focused && styles.inputFocused,
            error && styles.inputError,
            isSecure && styles.inputSecure,
            leadingIcon && styles.inputWithLeading,
            style,
          ]}
        />
        {isSecure ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={4}
            style={({ pressed }) => [styles.eye, pressed && styles.eyePressed]}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityState={{ expanded: revealed }}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={revealed ? colors.cyan : colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: {
    fontFamily: 'Sora_500Medium',
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  labelFocused: { color: colors.cyan },
  input: {
    ...typography.body,
    minHeight: 52,
    color: colors.textPrimary,
    backgroundColor: glass.fillDeep,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  inputFocused: {
    borderColor: colors.cyan,
    backgroundColor: glass.fillBright,
  },
  inputCompact: { minHeight: 44, paddingVertical: 10 },
  inputWithLeading: { paddingLeft: 44 },
  leadingIcon: { position: 'absolute', zIndex: 1, left: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  inputSecure: { paddingRight: 52 },
  inputError: {
    backgroundColor: 'rgba(239,120,136,0.07)',
    borderColor: 'rgba(239,120,136,0.72)',
  },
  eye: {
    position: 'absolute',
    right: 4,
    top: 4,
    bottom: 4,
    width: 44,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePressed: { backgroundColor: colors.surfaceElevated },
  error: { ...typography.caption, color: colors.danger },
  hint: { ...typography.caption, color: colors.textMuted },
});
