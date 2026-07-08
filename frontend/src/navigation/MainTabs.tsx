import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { RecognitionScreen } from '../screens/RecognitionScreen';
import { BrandMark } from '../components/ui/BrandMark';
import { PressableScale } from '../components/ui/PressableScale';
import { RAIL_WIDTH, useResponsive } from '../hooks/useResponsive';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { colors, layout, radii, shadows, spacing, typography } from '../theme/tokens';
import { navigationRef } from './navigationRef';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const SCAN_SIZE = 64;

type SideIcon = { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; label: string };

const SIDE_ICONS: Partial<Record<keyof MainTabParamList, SideIcon>> = {
  Home: { active: 'home', inactive: 'home-outline', label: 'Home' },
  Library: { active: 'albums', inactive: 'albums-outline', label: 'Library' },
};

const RAIL_ICONS: Record<keyof MainTabParamList, SideIcon> = {
  Home: { active: 'home', inactive: 'home-outline', label: 'Home' },
  Recognize: { active: 'mic', inactive: 'mic-outline', label: 'Scan a song' },
  Library: { active: 'albums', inactive: 'albums-outline', label: 'Library' },
};

function DockItem({
  icon,
  focused,
  onPress,
}: {
  icon: SideIcon;
  focused: boolean;
  onPress: () => void;
}) {
  const pop = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
  }, [focused, pop]);

  return (
    <Pressable onPress={onPress} style={styles.dockItem}>
      <Animated.View
        style={{
          alignItems: 'center',
          gap: 3,
          transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }],
        }}
      >
        <Ionicons
          name={focused ? icon.active : icon.inactive}
          size={22}
          color={focused ? colors.cyan : colors.textMuted}
        />
        <Text style={[styles.dockLabel, focused && styles.dockLabelActive]}>{icon.label}</Text>
        <Animated.View style={[styles.dockDot, { opacity: pop }]} />
      </Animated.View>
    </Pressable>
  );
}

function GlassDock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const scanPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1600),
        Animated.timing(scanPulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(scanPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanPulse]);

  const pressRoute = (index: number) => {
    const route = state.routes[index];
    const focused = state.index === index;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name as never);
    }
  };

  const scanIndex = state.routes.findIndex((route) => route.name === 'Recognize');
  const scanFocused = state.index === scanIndex;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dockWrap, { paddingBottom: insets.bottom + layout.dockBottomGap }]}
    >
      <View pointerEvents="box-none" style={styles.dockFrame}>
        <View style={styles.pill}>
          <BlurView
            tint="dark"
            intensity={70}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.pillOverlay} />
          <View style={styles.pillRow}>
            {state.routes.map((route, index) => {
              const icon = SIDE_ICONS[route.name as keyof MainTabParamList];
              if (!icon) return <View key={route.key} style={styles.scanGap} />;
              return (
                <DockItem
                  key={route.key}
                  icon={icon}
                  focused={state.index === index}
                  onPress={() => pressRoute(index)}
                />
              );
            })}
          </View>
        </View>

        <View pointerEvents="box-none" style={styles.scanHolder}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.scanPulseRing,
              {
                opacity: scanPulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] }),
                transform: [{ scale: scanPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
              },
            ]}
          />
          <PressableScale onPress={() => pressRoute(scanIndex)} scaleTo={0.9}>
            <View style={[styles.scanShadow, scanFocused && styles.scanShadowActive]}>
              <LinearGradient
                colors={colors.gradientPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.scanButton}
              >
                <Ionicons name="mic" size={26} color="#0C0D10" />
              </LinearGradient>
            </View>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

/** A single desktop rail destination: icon + label with a cyan accent bar when active. */
function RailItem({
  icon,
  focused,
  onPress,
}: {
  icon: SideIcon;
  focused: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.railItem, hovered && styles.railItemHovered, focused && styles.railItemActive]}
    >
      <View style={[styles.railAccent, focused && styles.railAccentActive]} />
      <Ionicons
        name={focused ? icon.active : icon.inactive}
        size={20}
        color={focused ? colors.cyan : hovered ? colors.textSecondary : colors.textMuted}
      />
      <Text style={[styles.railLabel, (hovered || focused) && styles.railLabelHovered, focused && styles.railLabelActive]}>
        {icon.label}
      </Text>
    </Pressable>
  );
}

/** Secondary rail action (not a tab): Telegram import, tools, etc. */
function RailAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.railItem, hovered && styles.railItemHovered]}
    >
      <View style={styles.railAccent} />
      <Ionicons name={icon} size={19} color={hovered ? colors.textSecondary : colors.textMuted} />
      <Text style={[styles.railLabel, hovered && styles.railLabelHovered]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Desktop shell: a persistent glass rail pinned to the left edge — brand up
 * top, destinations in the middle, and the signed-in profile anchored at the
 * bottom (which opens the full drawer with tools and sign-out).
 */
function NavRail({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const openSidebar = useUiStore((s) => s.openSidebar);
  const [profileHovered, setProfileHovered] = useState(false);
  const initial = (user?.display_name?.trim()?.[0] ?? user?.email?.[0] ?? '♪').toUpperCase();

  const pressRoute = (index: number) => {
    const route = state.routes[index];
    const focused = state.index === index;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name as never);
    }
  };

  return (
    <View style={[styles.rail, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.md }]}>
      <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
      <View style={styles.railOverlay} />

      <View style={styles.railBrandRow}>
        <View style={styles.railBrandDot}>
          <BrandMark size={22} />
        </View>
        <View>
          <Text style={styles.railBrand}>WAVECAIRN</Text>
          <Text style={styles.railBrandSub}>Private signal archive</Text>
        </View>
      </View>

      <View style={styles.railNav}>
        {state.routes.map((route, index) => (
          <RailItem
            key={route.key}
            icon={RAIL_ICONS[route.name as keyof MainTabParamList]}
            focused={state.index === index}
            onPress={() => pressRoute(index)}
          />
        ))}
      </View>

      <Text style={styles.railHeading}>SOURCES</Text>
      <RailAction
        icon="paper-plane-outline"
        label="Telegram import"
        onPress={() => {
          if (navigationRef.isReady()) navigationRef.navigate('Telegram');
        }}
      />

      <Text style={styles.railHeading}>SYSTEM</Text>
      <RailAction
        icon="pulse-outline"
        label="Activity"
        onPress={() => {
          if (navigationRef.isReady()) navigationRef.navigate('Jobs');
        }}
      />
      <RailAction
        icon="settings-outline"
        label="Settings"
        onPress={() => {
          if (navigationRef.isReady()) navigationRef.navigate('Settings');
        }}
      />

      <View style={styles.railSpacer} />

      <Text style={styles.railHint}>Space play · ←→ seek · M mute</Text>

      <Pressable
        onPress={openSidebar}
        onHoverIn={() => setProfileHovered(true)}
        onHoverOut={() => setProfileHovered(false)}
        style={[styles.railProfile, profileHovered && styles.railProfileHovered]}
      >
        <LinearGradient
          colors={colors.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.railAvatar}
        >
          <Text style={styles.railAvatarInitial}>{initial}</Text>
        </LinearGradient>
        <View style={styles.railProfileText}>
          <Text numberOfLines={1} style={styles.railProfileName}>
            {user?.display_name ?? 'Explorer'}
          </Text>
          <Text numberOfLines={1} style={styles.railProfileEmail}>
            {user?.email ?? ''}
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

export function MainTabs() {
  const { isDesktop } = useResponsive();

  return (
    <Tab.Navigator
      tabBar={(props) => (isDesktop ? <NavRail {...props} /> : <GlassDock {...props} />)}
      screenOptions={{
        headerShown: false,
        sceneStyle: isDesktop ? { paddingLeft: RAIL_WIDTH } : undefined,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Recognize" component={RecognitionScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  dockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  dockFrame: {
    width: '88%',
    maxWidth: 420,
  },
  pill: {
    height: layout.dockHeight,
    borderRadius: layout.dockHeight / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(233,229,220,0.14)',
    ...shadows.card,
  },
  pillOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,13,16,0.6)',
  },
  pillRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dockItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  dockLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
  dockLabelActive: {
    color: colors.cyan,
  },
  dockDot: {
    width: 3,
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
  },
  scanGap: {
    width: SCAN_SIZE + spacing.lg,
  },
  scanHolder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -layout.dockScanOverhang,
    alignItems: 'center',
  },
  scanPulseRing: {
    position: 'absolute',
    top: 0,
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: SCAN_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.cyan,
  },
  scanShadow: {
    borderRadius: SCAN_SIZE / 2,
    shadowColor: colors.cyan,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  scanShadowActive: {
    shadowOpacity: 0.7,
    shadowRadius: 26,
  },
  scanButton: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: SCAN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ----- Desktop rail -----
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: RAIL_WIDTH,
    paddingHorizontal: spacing.md,
    borderRightWidth: 1,
    borderRightColor: 'rgba(233,229,220,0.12)',
    overflow: 'hidden',
  },
  railOverlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(6,6,7,0.72)',
  },
  railBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xl,
  },
  railBrandDot: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224,149,79,0.12)',
  },
  railBrand: {
    ...typography.eyebrow,
    fontSize: 13,
    letterSpacing: 3,
    color: colors.textPrimary,
  },
  railBrandSub: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  railNav: { gap: 4 },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    paddingVertical: spacing.md - 4,
    paddingLeft: spacing.md - 4,
    paddingRight: spacing.sm,
    borderRadius: radii.md - 4,
  },
  railItemHovered: {
    backgroundColor: 'rgba(233,229,220,0.08)',
  },
  railItemActive: {
    backgroundColor: 'rgba(224,149,79,0.10)',
  },
  railAccent: {
    position: 'absolute',
    left: 0,
    top: '22%',
    bottom: '22%',
    width: 3,
    borderRadius: radii.pill,
    backgroundColor: 'transparent',
  },
  railAccentActive: {
    backgroundColor: colors.cyan,
  },
  railLabel: {
    ...typography.subtitle,
    fontSize: 15,
    color: colors.textMuted,
    flex: 1,
  },
  railLabelHovered: {
    color: colors.textSecondary,
  },
  railLabelActive: {
    color: colors.textPrimary,
  },
  railHeading: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textMuted,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md - 4,
  },
  railSpacer: { flex: 1 },
  railHint: {
    ...typography.caption,
    fontSize: 11,
    color: 'rgba(233,229,220,0.55)',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  railProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(233,229,220,0.12)',
    backgroundColor: 'rgba(23,24,27,0.45)',
  },
  railProfileHovered: {
    backgroundColor: 'rgba(23,24,27,0.8)',
    borderColor: 'rgba(224,149,79,0.35)',
  },
  railAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railAvatarInitial: {
    ...typography.title,
    fontSize: 16,
    color: '#0C0D10',
  },
  railProfileText: { flex: 1 },
  railProfileName: {
    ...typography.subtitle,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  railProfileEmail: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
});
