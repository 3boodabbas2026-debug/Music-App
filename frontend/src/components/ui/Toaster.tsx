import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useToastStore, type Toast } from '../../store/toastStore';
import { colors, glass, radii, shadows, spacing, typography } from '../../theme/tokens';

const TONE_META = {
  info: { icon: 'information-circle' as const, color: colors.cyan },
  success: { icon: 'checkmark-circle' as const, color: colors.success },
  error: { icon: 'alert-circle' as const, color: colors.danger },
};

function ToastCard({ toast }: { toast: Toast }) {
  const anim = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    const animation = Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 });
    animation.start();
    return () => animation.stop();
  }, [anim, reduceMotion]);

  const meta = TONE_META[toast.tone];
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <Animated.View
      role={toast.tone === 'error' ? 'alert' : 'status'}
      accessibilityLiveRegion={toast.tone === 'error' ? 'assertive' : 'polite'}
      accessibilityLabel={`${toast.tone}: ${toast.message}`}
      style={[
        styles.card,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        },
      ]}
    >
      <Ionicons name={meta.icon} size={18} color={meta.color} />
      <Text numberOfLines={2} style={styles.message}>
        {toast.message}
      </Text>
      <Pressable
        onPress={() => dismiss(toast.id)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        hitSlop={8}
        style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

/** Global toast overlay — render once at the app root. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.holder, { top: insets.top + spacing.sm }]}>
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  holder: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: glass.fillHeavy,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    maxWidth: 420,
    ...shadows.card,
  },
  message: {
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  dismiss: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  dismissPressed: { backgroundColor: glass.fillBright },
});
