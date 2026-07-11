import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RAIL_WIDTH } from '../../hooks/useResponsive';
import { navigationRef } from '../../navigation/navigationRef';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { colors, radii, shadows, spacing, typography } from '../../theme/tokens';

export function AccountPopover() {
  const open = useUiStore((state) => state.accountMenuOpen);
  const close = useUiStore((state) => state.closeAccountMenu);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  if (!open) return null;

  function navigate(route: 'Settings' | 'Replay') {
    close();
    if (navigationRef.isReady()) navigationRef.navigate(route);
  }

  return (
    <>
      <Pressable
        style={styles.backdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close account menu"
      />
      <View style={styles.card} accessibilityViewIsModal>
        <View style={styles.overlay} />
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.name}>
            {user?.display_name ?? 'Listener'}
          </Text>
          <Text numberOfLines={1} style={styles.email}>
            {user?.email ?? ''}
          </Text>
        </View>
        <Pressable
          onPress={() => navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Settings</Text>
        </Pressable>
        <Pressable
          onPress={() => navigate('Replay')}
          accessibilityRole="button"
          accessibilityLabel="Replay"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Ionicons name="sparkles-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Replay</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            close();
            void logout();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={({ pressed }) => [styles.row, styles.signOutRow, pressed && styles.rowPressed]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={[styles.rowLabel, styles.signOutLabel]}>Sign out</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...(StyleSheet.absoluteFill as object) },
  card: {
    position: 'absolute',
    left: spacing.lg,
    bottom: 88,
    width: RAIL_WIDTH - spacing.lg * 2,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(174,165,192,0.16)',
    ...shadows.card,
  },
  overlay: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(16,11,24,0.98)' },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(174,165,192,0.1)',
    marginBottom: spacing.xs,
  },
  name: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  email: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: 'rgba(174,165,192,0.08)' },
  rowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
  signOutRow: { marginBottom: spacing.xs },
  signOutLabel: { color: colors.danger },
});
