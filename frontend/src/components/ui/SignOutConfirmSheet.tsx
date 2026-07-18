import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';

import { useSignOutStore } from '../../store/signOutStore';
import { colors, glass, radii, spacing, stateLayers, typography } from '../../theme/tokens';
import { Button } from './Button';
import { CompactGlassSheet } from './CompactGlassSheet';

export function SignOutConfirmSheet() {
  const visible = useSignOutStore((state) => state.visible);
  const offlineCount = useSignOutStore((state) => state.offlineCount);
  const loading = useSignOutStore((state) => state.loading);
  const cancel = useSignOutStore((state) => state.cancel);
  const confirm = useSignOutStore((state) => state.confirm);
  const countLabel = `${offlineCount} offline download${offlineCount === 1 ? '' : 's'}`;

  return (
    <CompactGlassSheet visible={visible} onClose={cancel} accessibilityLabel="Confirm sign out" closeAccessibilityLabel="Cancel sign out" maxWidth={440} eyebrow="Protected action" header={<Text style={styles.title}>Sign out of Starhollow?</Text>}>
      <ConfirmationPanel
        icon="cloud-offline-outline"
        affectedLabel={`${countLabel} will be removed`}
        consequence="Signing out clears music saved only on this device. Your cloud library and account stay intact."
        safeAlternative="Keep me signed in"
        confirmLabel="Remove downloads & sign out"
        onCancel={cancel}
        onConfirm={() => void confirm()}
        loading={loading}
      />
    </CompactGlassSheet>
  );
}

export function ConfirmationPanel({
  affectedLabel,
  consequence,
  safeAlternative,
  confirmLabel,
  onCancel,
  onConfirm,
  loading = false,
  confirmDisabled = false,
  icon = 'warning-outline',
  children,
}: {
  affectedLabel: string;
  consequence: string;
  safeAlternative: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  confirmDisabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  children?: ReactNode;
}) {
  return (
    <View style={styles.body}>
      <View style={styles.warning}>
        <View pointerEvents="none" style={styles.warningEdge} />
        <View style={styles.iconWell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name={icon} size={20} color={colors.danger} />
        </View>
        <View style={styles.warningCopy}>
          <Text style={styles.warningTitle}>{affectedLabel}</Text>
          <Text style={styles.copy}>{consequence}</Text>
        </View>
      </View>
      {children}
      <View style={styles.safeRail}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.cyan} />
        <Text style={styles.safeText}>Safe alternative: {safeAlternative}</Text>
      </View>
      <View style={styles.actions}>
        <Button label={safeAlternative} variant="ghost" onPress={onCancel} disabled={loading} style={styles.action} />
        <Button label={confirmLabel} variant="danger" onPress={onConfirm} disabled={confirmDisabled} loading={loading} style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  body: { gap: spacing.md },
  warning: { position: 'relative', overflow: 'hidden', flexDirection: 'row', gap: spacing.md, padding: spacing.md, paddingLeft: spacing.md + spacing.xs, borderRadius: radii.md, borderWidth: 1, borderColor: stateLayers.danger.stroke, backgroundColor: glass.fillHeavy },
  warningEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.danger },
  iconWell: { width: 40, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, backgroundColor: stateLayers.danger.fill, borderWidth: 1, borderColor: stateLayers.danger.stroke },
  warningCopy: { flex: 1, gap: spacing.xs },
  warningTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  copy: { ...typography.caption, color: colors.textSecondary },
  safeRail: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.control, backgroundColor: glass.fillDeep, borderWidth: 1, borderColor: glass.stroke },
  safeText: { ...typography.caption, flex: 1, color: colors.textMuted },
  actions: { gap: spacing.sm },
  action: { minHeight: 48 },
});
