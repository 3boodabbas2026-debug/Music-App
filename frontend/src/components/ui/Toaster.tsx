import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore, type Toast } from '../../store/toastStore';
import { colors, radii, shadows, spacing, typography } from '../../theme/tokens';

const TONE_META = {
  info: { icon: 'information-circle' as const, color: colors.cyan },
  success: { icon: 'checkmark-circle' as const, color: colors.success },
  error: { icon: 'alert-circle' as const, color: colors.danger },
};

function ToastCard({ toast }: { toast: Toast }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }, [anim]);

  const meta = TONE_META[toast.tone];

  return (
    <Animated.View
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
    </Animated.View>
  );
}

/** Global toast overlay — render once at the app root. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="none" style={[styles.holder, { top: insets.top + spacing.sm }]}>
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
    backgroundColor: 'rgba(15,23,42,0.92)',
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
    flexShrink: 1,
  },
});
