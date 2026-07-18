import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useToastStore, type Toast } from '../../store/toastStore';
import { colors, glass, radii, shadows, spacing, typography } from '../../theme/tokens';

const TONE_META = {
  info: { icon: 'information-circle' as const, color: colors.cyan },
  success: { icon: 'checkmark-circle' as const, color: colors.success },
  error: { icon: 'alert-circle' as const, color: colors.danger },
};

export function Toaster({ toast }: { toast: Toast }) {
  const anim = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    if (reduceMotion) { anim.setValue(1); return; }
    const animation = Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 });
    animation.start();
    return () => animation.stop();
  }, [anim, reduceMotion]);

  useEffect(() => {
    // Start the lifetime only once the coordinator actually renders this
    // queued toast. Errors remain until the user dismisses them.
    if (toast.tone === 'error') return undefined;
    const timer = setTimeout(() => dismiss(toast.id), toast.tone === 'success' ? 5000 : 6500);
    return () => clearTimeout(timer);
  }, [dismiss, toast.id, toast.tone]);

  const meta = TONE_META[toast.tone];
  return (
    <Animated.View
      role={toast.tone === 'error' ? 'alert' : 'status'}
      accessibilityLiveRegion={toast.tone === 'error' ? 'assertive' : 'polite'}
      accessibilityLabel={`${toast.tone}: ${toast.message}`}
      style={[styles.card, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}
    >
      <Ionicons name={meta.icon} size={18} color={meta.color} />
      <Text numberOfLines={2} style={styles.message}>{toast.message}</Text>
      <Pressable onPress={() => dismiss(toast.id)} accessibilityRole="button" accessibilityLabel="Dismiss notification" hitSlop={8} style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}>
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: glass.fillHeavy, borderRadius: radii.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, ...shadows.card },
  message: { ...typography.body, fontSize: 14, color: colors.textPrimary, flex: 1 },
  dismiss: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  dismissPressed: { backgroundColor: glass.fillBright },
});
