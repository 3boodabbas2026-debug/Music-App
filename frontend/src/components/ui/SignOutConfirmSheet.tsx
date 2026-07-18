import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useSignOutStore } from '../../store/signOutStore';
import { colors, glass, radii, spacing, typography } from '../../theme/tokens';
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
    <CompactGlassSheet visible={visible} onClose={cancel} accessibilityLabel="Confirm sign out" closeAccessibilityLabel="Cancel sign out" maxWidth={440} header={<Text style={styles.title}>Sign out of Starhollow?</Text>}>
      <View style={styles.body}>
        <View style={styles.warning}>
          <Ionicons name="cloud-offline-outline" size={22} color={colors.warning} />
          <View style={styles.warningCopy}>
            <Text style={styles.warningTitle}>{countLabel} will be removed</Text>
            <Text style={styles.copy}>Signing out clears music saved only on this device. Your cloud library and account stay intact.</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button label="Keep me signed in" variant="secondary" onPress={cancel} disabled={loading} style={styles.action} />
          <Button label="Remove downloads & sign out" variant="danger" onPress={() => void confirm()} loading={loading} style={styles.action} />
        </View>
      </View>
    </CompactGlassSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  body: { gap: spacing.md },
  warning: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: glass.tintDangerStroke, backgroundColor: glass.tintDanger },
  warningCopy: { flex: 1, gap: spacing.xs },
  warningTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  copy: { ...typography.caption, color: colors.textSecondary },
  actions: { gap: spacing.sm },
  action: { minHeight: 48 },
});
