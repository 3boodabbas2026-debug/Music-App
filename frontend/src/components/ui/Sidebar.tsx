import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL } from '../../config';
import { navigationRef } from '../../navigation/navigationRef';
import * as recognitionsApi from '../../services/api/recognitions';
import { watchJob } from '../../services/api/jobSocket';
import { useAuthStore } from '../../store/authStore';
import { useLibraryStore } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { toast } from '../../store/toastStore';
import { useUiStore } from '../../store/uiStore';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { MainTabParamList } from '../../navigation/types';

const PANEL_MAX = 320;

type NavItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tab: keyof MainTabParamList;
};

const NAV_ITEMS: NavItem[] = [
  { icon: 'home-outline', label: 'Home', tab: 'Home' },
  { icon: 'mic-outline', label: 'Scan a song', tab: 'Recognize' },
  { icon: 'albums-outline', label: 'Library', tab: 'Library' },
];

/** Slide-in glass drawer: profile, navigation, vault stats, tools, sign out. */
export function Sidebar() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const closeSidebar = useUiStore((s) => s.closeSidebar);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const items = useLibraryStore((s) => s.items);
  const upsertMedia = useLibraryStore((s) => s.upsert);
  const currentMedia = usePlayerStore((s) => s.currentMedia);

  const panelWidth = Math.min(PANEL_MAX, width * 0.82);
  const slide = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [naming, setNaming] = useState(false);

  useEffect(() => {
    if (sidebarOpen) {
      setRendered(true);
      Animated.timing(slide, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slide, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [sidebarOpen, slide]);

  // Ping the backend each time the drawer opens.
  useEffect(() => {
    if (!sidebarOpen) return;
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch(`${API_BASE_URL}/health`, { signal: controller.signal })
      .then((res) => alive && setBackendOnline(res.ok))
      .catch(() => alive && setBackendOnline(false))
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [sidebarOpen]);

  if (!rendered) return null;

  const goToTab = (tab: keyof MainTabParamList) => {
    closeSidebar();
    if (navigationRef.isReady()) {
      navigationRef.navigate('Main', { screen: tab });
    }
  };

  const goToPlayer = () => {
    closeSidebar();
    if (navigationRef.isReady()) {
      navigationRef.navigate('Player');
    }
  };

  async function nameLibrary() {
    if (naming) return;
    setNaming(true);
    try {
      const jobs = await recognitionsApi.recognizeWholeLibrary();
      if (jobs.length === 0) {
        toast('Every track already has a name', 'success');
        setNaming(false);
        return;
      }
      toast(`Naming ${jobs.length} track${jobs.length === 1 ? '' : 's'}…`, 'info');
      let done = 0;
      let named = 0;
      jobs.forEach((job) => {
        const unsubscribe = watchJob(job.id, (update) => {
          if (update.status === 'complete' || update.status === 'failed' || update.status === 'cancelled') {
            done += 1;
            if (update.stage_label === 'matched') {
              named += 1;
              if (update.result_media) upsertMedia(update.result_media);
            }
            unsubscribe();
            if (done === jobs.length) {
              setNaming(false);
              toast(`Named ${named} of ${jobs.length} tracks`, named > 0 ? 'success' : 'info');
            }
          }
        });
      });
    } catch {
      toast("Couldn't start library naming", 'error');
      setNaming(false);
    }
  }

  async function exportLibrary() {
    const payload = JSON.stringify(
      items.map((m) => ({
        title: m.title ?? m.recognized_title,
        artist: m.artist ?? m.recognized_artist,
        album: m.album,
        type: m.media_type,
        source: m.source,
        source_url: m.source_url,
        duration_seconds: m.duration_seconds,
        added: m.created_at,
      })),
      null,
      2,
    );
    if (Platform.OS === 'web') {
      const blob = new Blob([payload], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = 'supermedia-library.json';
      anchor.click();
      URL.revokeObjectURL(href);
      toast('Library exported', 'success');
    } else {
      await Clipboard.setStringAsync(payload);
      toast('Library JSON copied to clipboard', 'success');
    }
  }

  function openTelegram() {
    closeSidebar();
    if (navigationRef.isReady()) {
      navigationRef.navigate('Telegram');
    }
  }

  const audioCount = items.filter((m) => m.media_type === 'audio').length;
  const namedCount = items.filter((m) => m.recognized_title || m.recognized_artist).length;
  const videoCount = items.length - audioCount;
  const initial = (user?.display_name?.trim()?.[0] ?? user?.email?.[0] ?? '♪').toUpperCase();

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: slide }]}>
        <Pressable style={styles.backdrop} onPress={closeSidebar} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            width: panelWidth,
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            transform: [
              { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] }) },
            ],
          },
        ]}
      >
        <BlurView
          tint="dark"
          intensity={80}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.panelOverlay} />

        <View style={styles.panelContent}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>SUPERMEDIA</Text>
            <View style={[styles.statusPill, backendOnline === false && styles.statusPillOffline]}>
              <View style={[styles.statusDot, backendOnline === false && styles.statusDotOffline]} />
              <Text style={styles.statusLabel}>
                {backendOnline === null ? '…' : backendOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          <View style={styles.profileRow}>
            <LinearGradient
              colors={colors.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarInitial}>{initial}</Text>
            </LinearGradient>
            <View style={styles.profileText}>
              <Text numberOfLines={1} style={styles.profileName}>
                {user?.display_name ?? 'Explorer'}
              </Text>
              <Text numberOfLines={1} style={styles.profileEmail}>
                {user?.email ?? ''}
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statValue}>{items.length}</Text>
              <Text style={styles.statLabel}>tracks</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statValue}>{audioCount}</Text>
              <Text style={styles.statLabel}>audio</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statValue}>{videoCount}</Text>
              <Text style={styles.statLabel}>video</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statValue}>{namedCount}</Text>
              <Text style={styles.statLabel}>named</Text>
            </View>
          </View>

          <View style={styles.navList}>
            {NAV_ITEMS.map((item) => (
              <Pressable
                key={item.tab}
                onPress={() => goToTab(item.tab)}
                style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
              >
                <Ionicons name={item.icon} size={20} color={colors.textSecondary} />
                <Text style={styles.navLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}

            {currentMedia && (
              <Pressable
                onPress={goToPlayer}
                style={({ pressed }) => [styles.navRow, styles.nowPlayingRow, pressed && styles.navRowPressed]}
              >
                <Ionicons name="musical-notes" size={20} color={colors.cyan} />
                <View style={styles.nowPlayingText}>
                  <Text style={styles.navLabel} numberOfLines={1}>
                    {currentMedia.title ?? currentMedia.recognized_title ?? 'Now playing'}
                  </Text>
                  <Text style={styles.nowPlayingSub} numberOfLines={1}>
                    Now playing
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <Text style={styles.toolsHeading}>TOOLS</Text>
          <View style={styles.navList}>
            <Pressable
              onPress={nameLibrary}
              disabled={naming}
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed, naming && styles.navRowBusy]}
            >
              <Ionicons name="sparkles-outline" size={19} color={colors.cyan} />
              <Text style={styles.navLabel}>{naming ? 'Naming your tracks…' : 'Name untitled tracks'}</Text>
            </Pressable>
            <Pressable
              onPress={exportLibrary}
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
            >
              <Ionicons name="download-outline" size={19} color={colors.textSecondary} />
              <Text style={styles.navLabel}>Export library</Text>
            </Pressable>
            <Pressable
              onPress={openTelegram}
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
            >
              <Ionicons name="paper-plane-outline" size={19} color={colors.textSecondary} />
              <Text style={styles.navLabel}>Telegram import</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.spacer} />

          <Pressable
            onPress={() => {
              closeSidebar();
              logout();
            }}
            style={({ pressed }) => [styles.navRow, styles.signOutRow, pressed && styles.navRowPressed]}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.navLabel, styles.signOutLabel]}>Sign out</Text>
          </Pressable>

          <Text style={styles.footer}>Deep Space · v1.1</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,17,0.6)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    borderTopRightRadius: radii.lg + 8,
    borderBottomRightRadius: radii.lg + 8,
  },
  panelOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,16,32,0.82)',
  },
  panelContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  brand: {
    ...typography.eyebrow,
    color: colors.cyan,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(52,211,153,0.10)',
  },
  statusPillOffline: {
    backgroundColor: 'rgba(248,113,113,0.10)',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  statusDotOffline: {
    backgroundColor: colors.danger,
  },
  statusLabel: {
    ...typography.eyebrow,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...typography.title,
    fontSize: 24,
    color: '#0B1120',
  },
  profileText: { flex: 1 },
  profileName: { ...typography.title, fontSize: 20, lineHeight: 26, color: colors.textPrimary },
  profileEmail: { ...typography.caption, color: colors.textMuted },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: 'rgba(30,41,59,0.65)',
  },
  statValue: { ...typography.subtitle, color: colors.cyan },
  statLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  navList: { gap: 2 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md - 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  navRowPressed: { backgroundColor: 'rgba(56,189,248,0.10)' },
  navRowBusy: { opacity: 0.6 },
  navLabel: { ...typography.subtitle, fontSize: 16, color: colors.textPrimary, flex: 1 },
  nowPlayingRow: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(56,189,248,0.08)',
  },
  nowPlayingText: { flex: 1 },
  nowPlayingSub: { ...typography.caption, fontSize: 11, color: colors.cyan },
  toolsHeading: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  spacer: { flex: 1 },
  signOutRow: {
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  signOutLabel: { color: colors.danger },
  footer: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
