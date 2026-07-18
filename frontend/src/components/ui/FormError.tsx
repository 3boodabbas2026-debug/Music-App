import { AccessibilityInfo, findNodeHandle, Platform, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';

import { colors, glass, radii, spacing, typography } from '../../theme/tokens';

type Props = {
  message: string | null;
};

/** Shared request-error surface that is announced and receives focus after a failed submit. */
export function FormError({ message }: Props) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      if (Platform.OS === 'web') {
        (ref.current as unknown as HTMLElement | null)?.focus?.();
        return;
      }
      const node = findNodeHandle(ref.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 50);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <View
      ref={ref}
      role="alert"
      tabIndex={-1}
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`Error: ${message}`}
      style={styles.root}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: glass.tintDangerStroke,
    backgroundColor: glass.tintDanger,
  },
  text: { ...typography.caption, color: colors.danger, textAlign: 'center' },
});
