import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RAIL_WIDTH } from '../../hooks/useResponsive';
import { navigationRef } from '../../navigation/navigationRef';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { colors, radii, shadows, spacing, typography } from '../../theme/tokens';

/**
 * The ONLY thing the desktop rail's account row opens — a small anchored
 * menu, not a second copy of the sidebar. Rendered globally (see
 * RootNavigator) so its outside-tap-to-dismiss backdrop covers the whole
 * screen rather than being clipped by the rail's own overflow:hidden.
 */
export function AccountPopover() {
  const open = useUiStore((s) => s.accountMenuOpen);
  const close = useUiStore((s) => s.closeAccountMenu);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!open) return null;

  function goSettings() {
    close();
    if (navigationRef.isReady()) navigationRef.navigate('Settings');
  }

  return (
    <>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.card}>
        <View style={styles.overlay} />
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.name}>
            {user?.display_name ?? 'Explorer'}
          </Text>
          <Text numberOfLines={1} style={styles.email}>
            {user?.email ?? ''}
          </Text>
        </View>
        <Pressable onPress={goSettings} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          <Ionicons name="settings-outline" size={17} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Settings</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            close();
            logout();
          }}
          style={({ pressed }) => [styles.row, styles.signOutRow, pressed && styles.rowPressed]}
        >
          <Ionicons name="log-out-outline" size={17} color={colors.danger} />
          <Text style={[styles.rowLabel, { color: colors.danger }]}>Sign out</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    position: 'absolute',
    left: spacing.lg,
    bottom: 88,
    width: RAIL_WIDTH - spacing.lg * 2,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,176,168,0.14)',
    ...shadows.card,
  },
  overlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(10,15,13,0.97)',
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,176,168,0.10)',
    marginBottom: spacing.xs,
  },
  name: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  email: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: 'rgba(167,176,168,0.08)' },
  rowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
  signOutRow: { marginBottom: spacing.xs },
});
