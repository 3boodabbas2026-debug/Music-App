import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { navigationRef } from '../../navigation/navigationRef';
import type { MainTabParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { requestSignOut } from '../../store/signOutStore';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useUiStore } from '../../store/uiStore';
import { colors, glass, motion, radii, spacing, typography } from '../../theme/tokens';
import { displayTitle } from '../../utils/mediaDisplay';
import { BrandMark } from './BrandMark';
import { GlassPanel } from './GlassPanel';

type DestinationBase = {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
  label: string;
};

type NavDestination =
  | (DestinationBase & {
      kind: 'tab';
      tab: keyof MainTabParamList;
      params?: MainTabParamList[keyof MainTabParamList];
    })
  | (DestinationBase & {
      kind: 'stack';
      route: 'Telegram' | 'Settings' | 'Replay' | 'Player' | 'Admin';
    });

const PRIMARY_NAV_ITEMS: NavDestination[] = [
  { kind: 'tab', tab: 'Home', icon: 'home-outline', activeIcon: 'home', label: 'Today' },
  { kind: 'tab', tab: 'Library', icon: 'albums-outline', activeIcon: 'albums', label: 'Library', params: { tab: 'all' } },
  { kind: 'tab', tab: 'Recognize', icon: 'mic-outline', activeIcon: 'mic', label: 'Identify' },
  { kind: 'tab', tab: 'Activity', icon: 'pulse-outline', activeIcon: 'pulse', label: 'Activity' },
];

const SECONDARY_NAV_ITEMS: NavDestination[] = [
  { kind: 'tab', tab: 'Library', icon: 'list-outline', label: 'Playlists', params: { tab: 'playlists' } },
  { kind: 'stack', route: 'Telegram', icon: 'paper-plane-outline', label: 'Telegram' },
  { kind: 'stack', route: 'Replay', icon: 'sparkles-outline', label: 'Replay' },
  { kind: 'stack', route: 'Settings', icon: 'settings-outline', label: 'Settings' },
];

const ADMIN_NAV_ITEM: NavDestination = {
  kind: 'stack',
  route: 'Admin',
  icon: 'shield-checkmark-outline',
  label: 'Admin',
};

function destinationKey(destination: NavDestination): string {
  return destination.kind === 'tab' ? `${destination.tab}:${destination.label}` : destination.route;
}

function SidebarNavRow({
  destination,
  focused,
  reducedMotion,
  onPress,
}: {
  destination: NavDestination;
  focused: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeProgress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const hoverProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      activeProgress.setValue(focused ? 1 : 0);
      return;
    }
    const animation = Animated.timing(activeProgress, {
      toValue: focused ? 1 : 0,
      duration: motion.duration.base,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [activeProgress, focused, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      hoverProgress.setValue(hovered ? 1 : 0);
      return;
    }
    const animation = Animated.timing(hoverProgress, {
      toValue: hovered ? 1 : 0,
      duration: motion.duration.fast,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [hoverProgress, hovered, reducedMotion]);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={destination.label}
      accessibilityState={{ selected: focused }}
      style={({ pressed }) => [styles.navPressable, pressed && styles.navRowPressed]}
    >
      <Animated.View
        style={[
          styles.navRow,
          {
            transform: [
              {
                translateX: hoverProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }),
              },
            ],
          },
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.navHoverFill, { opacity: hoverProgress }]} />
        <Animated.View pointerEvents="none" style={[styles.navActiveFill, { opacity: activeProgress }]} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.navAccent,
            {
              opacity: activeProgress,
              transform: [{ scaleY: activeProgress }],
            },
          ]}
        />
        <Ionicons
          name={focused && destination.activeIcon ? destination.activeIcon : destination.icon}
          size={20}
          color={focused ? colors.cyan : hovered ? colors.textSecondary : colors.textMuted}
        />
        <Text style={[styles.navLabel, (hovered || focused) && styles.navLabelHovered, focused && styles.navLabelActive]}>
          {destination.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function AppSidebar({
  variant,
  activeTab,
  onNavigate,
}: {
  variant: 'rail' | 'drawer';
  activeTab?: keyof MainTabParamList;
  onNavigate?: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const currentMedia = usePlayerStore((state) => state.currentMedia);
  const libraryItems = useLibraryStore((state) => state.items);
  const { backendOnline, networkOnline } = useOnlineStatus();
  const accountMenuOpen = useUiStore((state) => state.accountMenuOpen);
  const toggleAccountMenu = useUiStore((state) => state.toggleAccountMenu);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const accountProgress = useRef(new Animated.Value(accountMenuOpen ? 1 : 0)).current;

  const isRail = variant === 'rail';
  const offline = !networkOnline || backendOnline === false;
  const initial = (user?.display_name?.trim()?.[0] ?? user?.email?.[0] ?? '♪').toUpperCase();
  const currentRoute = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
  const resolvedActiveTab = activeTab ?? (currentRoute && currentRoute in TAB_ROUTE_NAMES ? (currentRoute as keyof MainTabParamList) : undefined);
  const secondaryItems = user?.is_admin ? [...SECONDARY_NAV_ITEMS, ADMIN_NAV_ITEM] : SECONDARY_NAV_ITEMS;

  useEffect(() => {
    if (reducedMotion) {
      accountProgress.setValue(accountMenuOpen ? 1 : 0);
      return;
    }
    const animation = Animated.timing(accountProgress, {
      toValue: accountMenuOpen ? 1 : 0,
      duration: motion.duration.base,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [accountMenuOpen, accountProgress, reducedMotion]);

  function go(destination: NavDestination) {
    if (!navigationRef.isReady()) return;
    if (destination.kind === 'tab') {
      navigationRef.navigate('Main', { screen: destination.tab, params: destination.params } as never);
    } else {
      navigationRef.navigate(destination.route);
    }
    onNavigate?.();
  }

  function renderDestination(destination: NavDestination) {
    const key = destinationKey(destination);
    const focused =
      destination.kind === 'tab'
        ? destination.tab === resolvedActiveTab && destination.label !== 'Playlists'
        : destination.route === currentRoute;
    return (
      <SidebarNavRow
        key={key}
        destination={destination}
        focused={focused}
        reducedMotion={reducedMotion}
        onPress={() => go(destination)}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.brandRow} accessibilityRole="header">
        <View style={styles.brandMark}>
          <BrandMark size={22} />
        </View>
        <View>
          <Text style={styles.brand}>STARHOLLOW</Text>
          <Text style={styles.brandSub}>Your quiet place under the stars</Text>
        </View>
      </View>

      <GlassPanel style={styles.navigationPanel} overlayColor={glass.fillDeep}>
        <Text style={styles.sectionLabel}>LISTEN</Text>
        <View style={styles.navList}>{PRIMARY_NAV_ITEMS.map(renderDestination)}</View>

        <View style={styles.sectionDivider} />
        <Text style={styles.sectionLabel}>MORE</Text>
        <View style={styles.navList}>{secondaryItems.map(renderDestination)}</View>
      </GlassPanel>

      {currentMedia ? (
        <Pressable
          onPress={() => go({ kind: 'stack', route: 'Player', icon: 'musical-notes-outline', label: 'Player' })}
          onHoverIn={() => setHoveredKey('Player')}
          onHoverOut={() => setHoveredKey((value) => (value === 'Player' ? null : value))}
          accessibilityRole="button"
          accessibilityLabel={`Now playing, ${displayTitle(currentMedia)}`}
          style={({ pressed }) => [styles.nowPlayingRow, (pressed || hoveredKey === 'Player') && styles.navRowHovered]}
        >
          <View style={styles.nowPlayingIcon}>
            <Ionicons name="musical-notes" size={17} color={colors.cyan} />
          </View>
          <View style={styles.nowPlayingText}>
            <Text style={styles.nowPlayingEyebrow}>NOW PLAYING</Text>
            <Text numberOfLines={1} style={styles.nowPlayingTitle}>
              {displayTitle(currentMedia)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <View style={styles.spacer} />

      <View style={styles.statusRow} accessibilityLabel={offline ? 'Offline, cached data available' : 'Online'}>
        <View style={[styles.statusDot, offline && styles.statusDotOffline]} />
        <Text style={styles.statusLabel}>
          {backendOnline === null ? 'Checking…' : offline ? 'Offline · cached data' : 'Online'}
        </Text>
        <Text style={styles.libraryChip}>{libraryItems.length} tracks</Text>
      </View>

      <Pressable
        onPress={() => {
          if (!isRail) onNavigate?.();
          toggleAccountMenu();
        }}
        onHoverIn={() => setHoveredKey('Account')}
        onHoverOut={() => setHoveredKey((value) => (value === 'Account' ? null : value))}
        accessibilityRole="button"
        accessibilityLabel="Open account menu"
        accessibilityState={{ expanded: accountMenuOpen }}
        style={({ pressed }) => [
          styles.accountRow,
          isRail && (hoveredKey === 'Account' || pressed) && styles.accountRowHovered,
          isRail && accountMenuOpen && styles.accountRowActive,
        ]}
      >
        <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </LinearGradient>
        <View style={styles.accountText}>
          <Text numberOfLines={1} style={styles.accountName}>
            {user?.display_name ?? 'Listener'}
          </Text>
          <Text numberOfLines={1} style={styles.accountEmail}>
            {user?.email ?? ''}
          </Text>
        </View>
        {isRail ? (
          <Animated.View
            style={{
              transform: [
                {
                  rotate: accountProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }),
                },
              ],
            }}
          >
            <Ionicons name="chevron-up" size={17} color={accountMenuOpen ? colors.cyan : colors.textMuted} />
          </Animated.View>
        ) : null}
      </Pressable>

      {!isRail ? (
        <Pressable
          onPress={() => {
            onNavigate?.();
            void requestSignOut();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={({ pressed }) => [styles.signOutRow, pressed && styles.navRowHovered]}
        >
          <Ionicons name="log-out-outline" size={19} color={colors.danger} />
          <Text style={[styles.navLabel, styles.signOutLabel]}>Sign out</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const TAB_ROUTE_NAMES: Record<keyof MainTabParamList, true> = {
  Home: true,
  Library: true,
  Recognize: true,
  Activity: true,
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.tintPrimary,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
  },
  brand: { ...typography.eyebrow, fontSize: 13, letterSpacing: 3, color: colors.textPrimary },
  brandSub: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  sectionLabel: {
    ...typography.eyebrow,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    paddingLeft: spacing.sm,
  },
  navigationPanel: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderColor: glass.stroke,
    borderRadius: radii.lg,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.sm,
    marginVertical: spacing.sm,
    backgroundColor: glass.stroke,
  },
  navList: { gap: 2 },
  navPressable: { borderRadius: radii.md },
  navRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md - 4,
    paddingRight: spacing.sm,
    borderRadius: radii.md - 4,
    overflow: 'hidden',
  },
  navRowPressed: { opacity: 0.78 },
  navHoverFill: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: glass.fillBright,
  },
  navActiveFill: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: glass.tintPrimary,
  },
  navRowHovered: { backgroundColor: glass.fillBright },
  navAccent: {
    position: 'absolute',
    left: 0,
    top: 11,
    bottom: 11,
    width: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
  },
  navLabel: { ...typography.subtitle, fontSize: 14, color: colors.textMuted, flex: 1 },
  navLabelHovered: { color: colors.textSecondary },
  navLabelActive: { color: colors.textPrimary },
  nowPlayingRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(99,214,181,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99,214,181,0.14)',
  },
  nowPlayingIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,214,181,0.12)',
  },
  nowPlayingText: { flex: 1 },
  nowPlayingEyebrow: { ...typography.eyebrow, fontSize: 8, lineHeight: 11, letterSpacing: 1.6, color: colors.cyan },
  nowPlayingTitle: { ...typography.caption, fontFamily: 'Sora_500Medium', color: colors.textPrimary },
  spacer: { flex: 1, minHeight: spacing.md },
  statusRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: glass.stroke,
    backgroundColor: glass.fillDeep,
  },
  statusDot: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: colors.success },
  statusDotOffline: { backgroundColor: colors.danger },
  statusLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted, flex: 1 },
  libraryChip: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: glass.fillBright,
  },
  accountRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: glass.stroke,
    backgroundColor: glass.fill,
  },
  accountRowActive: { backgroundColor: glass.fillHeavy, borderColor: glass.tintPrimaryStroke },
  accountRowHovered: { backgroundColor: glass.fillBright, borderColor: glass.strokeStrong },
  avatar: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { ...typography.title, fontSize: 16, color: colors.textInverse },
  accountText: { flex: 1 },
  accountName: { ...typography.subtitle, fontSize: 14, lineHeight: 18, color: colors.textPrimary },
  accountEmail: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  signOutRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  signOutLabel: { color: colors.danger },
});
