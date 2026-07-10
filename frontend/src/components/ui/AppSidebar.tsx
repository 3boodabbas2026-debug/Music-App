import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { navigationRef } from '../../navigation/navigationRef';
import { useAuthStore } from '../../store/authStore';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useUiStore } from '../../store/uiStore';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { BrandMark } from './BrandMark';
import type { MainTabParamList } from '../../navigation/types';

type NavDestination =
  | { kind: 'tab'; tab: keyof MainTabParamList; icon: keyof typeof Ionicons.glyphMap; label: string; params?: MainTabParamList[keyof MainTabParamList] }
  | { kind: 'stack'; route: 'Jobs' | 'Telegram' | 'Settings' | 'Player' | 'Admin'; icon: keyof typeof Ionicons.glyphMap; label: string };

const BASE_NAV_ITEMS: NavDestination[] = [
  { kind: 'tab', tab: 'Home', icon: 'compass-outline', label: 'Dashboard' },
  { kind: 'tab', tab: 'Library', icon: 'albums-outline', label: 'Library', params: { tab: 'all' } },
  // A dedicated shortcut — playlists otherwise live one tap deeper as a tab
  // chip inside Library, easy to miss entirely on first use.
  { kind: 'tab', tab: 'Library', icon: 'list-outline', label: 'Playlists', params: { tab: 'playlists' } },
  { kind: 'tab', tab: 'Recognize', icon: 'mic-outline', label: 'Scan a song' },
  { kind: 'stack', route: 'Jobs', icon: 'download-outline', label: 'Downloads' },
  { kind: 'stack', route: 'Telegram', icon: 'paper-plane-outline', label: 'Telegram' },
  { kind: 'stack', route: 'Settings', icon: 'settings-outline', label: 'Settings' },
];

// Only ever present for the one account whose email matches the backend's
// configured admin email — every /admin/* call is independently rejected
// server-side regardless, this just keeps the entry itself out of sight.
const ADMIN_NAV_ITEM: NavDestination = { kind: 'stack', route: 'Admin', icon: 'shield-checkmark-outline', label: 'Admin' };

function destKey(dest: NavDestination): string {
  return dest.kind === 'tab' ? `${dest.tab}:${dest.label}` : dest.route;
}

/**
 * THE single sidebar — its content is identical whether it's presented as the
 * persistent desktop rail or the mobile slide-in drawer. Nothing here opens a
 * second, differently-organised nav surface: the account row opens a small
 * compact popover on desktop (Settings shortcut + sign out), and on mobile
 * the drawer itself already carries an explicit sign-out row, since it's the
 * one and only "open the menu" surface there.
 */
export function AppSidebar({
  variant,
  activeTab,
  onNavigate,
}: {
  variant: 'rail' | 'drawer';
  /** Only meaningful for tab destinations — passed down from the tab bar's own state. */
  activeTab?: keyof MainTabParamList;
  /** Called after every navigation (drawer variant closes itself; rail variant ignores it). */
  onNavigate?: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const currentMedia = usePlayerStore((s) => s.currentMedia);
  const items = useLibraryStore((s) => s.items);
  const { backendOnline, networkOnline } = useOnlineStatus();
  const accountMenuOpen = useUiStore((s) => s.accountMenuOpen);
  const toggleAccountMenu = useUiStore((s) => s.toggleAccountMenu);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const isRail = variant === 'rail';
  const offline = !networkOnline || backendOnline === false;
  const initial = (user?.display_name?.trim()?.[0] ?? user?.email?.[0] ?? '♪').toUpperCase();
  const navItems = user?.is_admin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;

  function go(dest: NavDestination) {
    if (!navigationRef.isReady()) return;
    if (dest.kind === 'tab') {
      navigationRef.navigate('Main', { screen: dest.tab, params: dest.params } as never);
    } else {
      navigationRef.navigate(dest.route);
    }
    onNavigate?.();
  }

  function goPlayer() {
    if (navigationRef.isReady()) navigationRef.navigate('Player');
    onNavigate?.();
  }

  return (
    <View style={styles.root}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <BrandMark size={22} />
        </View>
        <View>
          <Text style={styles.brand}>DUSKGLEN</Text>
          <Text style={styles.brandSub}>A hollow after dark</Text>
        </View>
      </View>

      <View style={styles.navList}>
        {navItems.map((dest) => {
          const key = destKey(dest);
          // The Playlists shortcut shares the Library tab route but isn't
          // itself a distinct nav state we can detect from here — only the
          // plain Library entry reflects the tab bar's active state.
          const focused = dest.kind === 'tab' && dest.tab === activeTab && dest.label !== 'Playlists';
          const hovered = hoveredKey === key;
          return (
            <Pressable
              key={key}
              onPress={() => go(dest)}
              onHoverIn={() => setHoveredKey(key)}
              onHoverOut={() => setHoveredKey((k) => (k === key ? null : k))}
              style={[styles.navRow, hovered && styles.navRowHovered, focused && styles.navRowActive]}
            >
              <View style={[styles.navAccent, focused && styles.navAccentActive]} />
              <Ionicons
                name={dest.icon}
                size={19}
                color={focused ? colors.cyan : hovered ? colors.textSecondary : colors.textMuted}
              />
              <Text style={[styles.navLabel, (hovered || focused) && styles.navLabelHovered, focused && styles.navLabelActive]}>
                {dest.label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={goPlayer}
          onHoverIn={() => setHoveredKey('Player')}
          onHoverOut={() => setHoveredKey((k) => (k === 'Player' ? null : k))}
          style={[styles.navRow, hoveredKey === 'Player' && styles.navRowHovered, currentMedia && styles.nowPlayingRow]}
        >
          <View style={styles.navAccent} />
          <Ionicons name="musical-notes-outline" size={19} color={currentMedia ? colors.cyan : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.navLabel, hoveredKey === 'Player' && styles.navLabelHovered]} numberOfLines={1}>
              {currentMedia ? currentMedia.title ?? currentMedia.recognized_title ?? 'Player' : 'Player'}
            </Text>
            {currentMedia && <Text style={styles.nowPlayingSub}>Now playing</Text>}
          </View>
        </Pressable>
      </View>

      <View style={styles.spacer} />

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, offline && styles.statusDotOffline]} />
        <Text style={styles.statusLabel}>
          {backendOnline === null ? 'Checking…' : offline ? 'Offline · cached data' : 'Online'}
        </Text>
        <Text style={styles.libraryChip}>{items.length} kept</Text>
      </View>

      <Pressable
        onPress={() => isRail && toggleAccountMenu()}
        style={[styles.accountRow, isRail && accountMenuOpen && styles.accountRowActive]}
      >
        <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </LinearGradient>
        <View style={styles.accountText}>
          <Text numberOfLines={1} style={styles.accountName}>
            {user?.display_name ?? 'Explorer'}
          </Text>
          <Text numberOfLines={1} style={styles.accountEmail}>
            {user?.email ?? ''}
          </Text>
        </View>
        {isRail && <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />}
      </Pressable>

      {!isRail && (
        <Pressable
          onPress={() => {
            onNavigate?.();
            logout();
          }}
          style={({ pressed }) => [styles.signOutRow, pressed && styles.navRowHovered]}
        >
          <Ionicons name="log-out-outline" size={19} color={colors.danger} />
          <Text style={[styles.navLabel, { color: colors.danger }]}>Sign out</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.xl,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(47,191,170,0.12)',
  },
  brand: { ...typography.eyebrow, fontSize: 13, letterSpacing: 3, color: colors.textPrimary },
  brandSub: { ...typography.caption, fontSize: 11, color: colors.textMuted },

  navList: { gap: 3 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    paddingVertical: spacing.md - 4,
    paddingLeft: spacing.md - 4,
    paddingRight: spacing.sm,
    borderRadius: radii.md - 4,
  },
  navRowHovered: { backgroundColor: 'rgba(167,176,168,0.08)' },
  navRowActive: { backgroundColor: 'rgba(47,191,170,0.10)' },
  nowPlayingRow: { backgroundColor: 'rgba(47,191,170,0.08)' },
  navAccent: {
    position: 'absolute',
    left: 0,
    top: '22%',
    bottom: '22%',
    width: 3,
    borderRadius: radii.pill,
    backgroundColor: 'transparent',
  },
  navAccentActive: { backgroundColor: colors.cyan },
  navLabel: { ...typography.subtitle, fontSize: 15, color: colors.textMuted, flex: 1 },
  navLabelHovered: { color: colors.textSecondary },
  navLabelActive: { color: colors.textPrimary },
  nowPlayingSub: { ...typography.caption, fontSize: 11, color: colors.cyan },

  spacer: { flex: 1, minHeight: spacing.lg },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    marginBottom: spacing.sm,
  },
  statusDot: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: colors.success },
  statusDotOffline: { backgroundColor: colors.danger },
  statusLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted, flex: 1 },
  libraryChip: { ...typography.caption, fontSize: 11, color: colors.textMuted },

  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(167,176,168,0.12)',
    backgroundColor: 'rgba(18,28,24,0.45)',
  },
  accountRowActive: {
    backgroundColor: 'rgba(18,28,24,0.85)',
    borderColor: 'rgba(47,191,170,0.35)',
  },
  avatar: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { ...typography.title, fontSize: 16, color: '#0A0F0D' },
  accountText: { flex: 1 },
  accountName: { ...typography.subtitle, fontSize: 14, lineHeight: 18, color: colors.textPrimary },
  accountEmail: { ...typography.caption, fontSize: 11, color: colors.textMuted },

  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md - 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(224,104,95,0.08)',
  },
});
