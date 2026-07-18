import { AccessibilityInfo, findNodeHandle, Platform, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { colors, glass, radii, spacing, stateLayers, typography } from '../../theme/tokens';
import { Button } from './Button';

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
      <View pointerEvents="none" style={styles.edge} />
      <View style={styles.iconWell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="alert-outline" size={17} color={colors.danger} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Signal interrupted</Text>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

export function RecoverableError({
  title,
  message,
  actionLabel,
  onAction,
  icon = 'cloud-offline-outline',
  compact = false,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.recovery, compact && styles.recoveryCompact]}>
      <View pointerEvents="none" style={styles.edge} />
      <View style={styles.recoveryIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name={icon} size={20} color={colors.danger} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.recoveryTitle}>{title}</Text>
        <Text style={styles.recoveryText}>{message}</Text>
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} variant="ghost" onPress={onAction} style={styles.recoveryAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: stateLayers.danger.stroke,
    backgroundColor: glass.fillHeavy,
  },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: stateLayers.danger.edge },
  iconWell: { width: 30, height: 30, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: stateLayers.danger.fill, borderWidth: 1, borderColor: stateLayers.danger.stroke },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.eyebrow, fontSize: 9, lineHeight: 13, letterSpacing: 1.2, color: colors.danger },
  text: { ...typography.caption, color: colors.textSecondary },
  recovery: { position: 'relative', overflow: 'hidden', width: '100%', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md, padding: spacing.md, paddingLeft: spacing.md + spacing.xs, borderRadius: radii.lg, borderWidth: 1, borderColor: stateLayers.danger.stroke, backgroundColor: glass.fillHeavy },
  recoveryCompact: { paddingVertical: spacing.sm },
  recoveryIcon: { width: 40, height: 40, flexShrink: 0, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', backgroundColor: stateLayers.danger.fill, borderWidth: 1, borderColor: stateLayers.danger.stroke },
  recoveryTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  recoveryText: { ...typography.caption, color: colors.textMuted },
  recoveryAction: { minHeight: 42, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
