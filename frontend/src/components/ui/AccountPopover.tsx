import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { RAIL_WIDTH, useResponsive } from '../../hooks/useResponsive';
import { navigationRef } from '../../navigation/navigationRef';
import { useAuthStore } from '../../store/authStore';
import { requestSignOut } from '../../store/signOutStore';
import { useUiStore } from '../../store/uiStore';
import { colors, glass, motion, radii, spacing, typography } from '../../theme/tokens';
import { GlassPanel } from './GlassPanel';

export function AccountPopover() {
  const open = useUiStore((state) => state.accountMenuOpen);
  const close = useUiStore((state) => state.closeAccountMenu);
  const user = useAuthStore((state) => state.user);
  const rememberedAccounts = useAuthStore((state) => state.rememberedAccounts);
  const startAccountSwitch = useAuthStore((state) => state.startAccountSwitch);
  const forgetAccount = useAuthStore((state) => state.forgetAccount);
  const { isDesktop } = useResponsive();
  const [rendered, setRendered] = useState(open);
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEscapeToClose(open, close);

  useEffect(() => {
    if (open) setRendered(true);

    if (reducedMotion) {
      progress.setValue(open ? 1 : 0);
      if (!open) setRendered(false);
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? motion.duration.base : motion.duration.fast,
      easing: open
        ? Easing.bezier(...motion.easing.decelerate)
        : Easing.bezier(...motion.easing.accelerate),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !open) setRendered(false);
    });
    return () => animation.stop();
  }, [open, progress, reducedMotion]);

  if (!rendered) return null;

  const otherAccounts = rememberedAccounts.filter((account) => account.user.id !== user?.id);

  function navigate(route: 'Settings' | 'Replay') {
    close();
    if (navigationRef.isReady()) navigationRef.navigate(route);
  }

  return (
    <>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close account menu"
        />
      </Animated.View>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[
          styles.cardPosition,
          !isDesktop && styles.cardPositionMobile,
          {
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
            ],
          },
        ]}
        accessibilityViewIsModal
      >
        <GlassPanel style={styles.card} overlayColor={glass.fillHeavy}>
          <View style={styles.header}>
            <Text numberOfLines={1} style={styles.name}>
              {user?.display_name ?? 'Listener'}
            </Text>
            <Text numberOfLines={1} style={styles.email}>
              {user?.email ?? ''}
            </Text>
          </View>
          {otherAccounts.length > 0 ? (
            <View style={styles.accountSection}>
              <Text style={styles.sectionLabel}>SWITCH ACCOUNT</Text>
              {otherAccounts.map((account) => (
                <View key={account.user.id} style={styles.savedAccountRow}>
                  <Pressable
                    onPress={() => {
                      close();
                      void startAccountSwitch(account.user.email);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to ${account.user.display_name}`}
                    style={({ pressed }) => [styles.savedAccountMain, pressed && styles.rowPressed]}
                  >
                    <View style={styles.savedAvatar}>
                      <Text style={styles.savedAvatarText}>{account.user.display_name.trim().charAt(0).toUpperCase() || '?'}</Text>
                    </View>
                    <View style={styles.savedCopy}>
                      <Text numberOfLines={1} style={styles.savedName}>{account.user.display_name}</Text>
                      <Text numberOfLines={1} style={styles.email}>{account.user.email}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => void forgetAccount(account.user.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Forget ${account.user.display_name} on this device`}
                    hitSlop={8}
                    style={({ pressed }) => [styles.forgetButton, pressed && styles.rowPressed]}
                  >
                    <Ionicons name="close" size={17} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              close();
              void startAccountSwitch();
            }}
            accessibilityRole="button"
            accessibilityLabel="Add another account"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Ionicons name="person-add-outline" size={18} color={colors.cyan} />
            <Text style={styles.rowLabel}>Add account</Text>
          </Pressable>
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
              void requestSignOut();
            }}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={({ pressed }) => [styles.row, styles.signOutRow, pressed && styles.rowPressed]}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={[styles.rowLabel, styles.signOutLabel]}>Sign out</Text>
          </Pressable>
        </GlassPanel>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...(StyleSheet.absoluteFill as object) },
  cardPosition: {
    position: 'absolute',
    left: spacing.lg,
    bottom: 88,
    width: RAIL_WIDTH - spacing.lg * 2,
    zIndex: 50,
  },
  cardPositionMobile: { left: spacing.lg, right: spacing.lg, bottom: spacing.xl, width: 'auto' },
  card: {
    borderRadius: radii.lg,
    borderColor: glass.strokeStrong,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: glass.stroke,
    marginBottom: spacing.xs,
  },
  name: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  email: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  accountSection: { paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: glass.stroke },
  sectionLabel: { ...typography.eyebrow, fontSize: 9, color: colors.textMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  savedAccountRow: { flexDirection: 'row', alignItems: 'center' },
  savedAccountMain: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  savedAvatar: { width: 30, height: 30, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  savedAvatarText: { ...typography.caption, color: colors.cyan },
  savedCopy: { flex: 1, minWidth: 0 },
  savedName: { ...typography.body, fontSize: 13, color: colors.textPrimary },
  forgetButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, marginRight: spacing.xs },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: glass.fillBright },
  rowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
  signOutRow: { marginBottom: spacing.xs },
  signOutLabel: { color: colors.danger },
});
