import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSidebar } from '../components/ui/AppSidebar';
import { useResponsive, RAIL_WIDTH } from '../hooks/useResponsive';
import { HomeScreen } from '../screens/HomeScreen';
import { JobsScreen } from '../screens/JobsScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { RecognitionScreen } from '../screens/RecognitionScreen';
import { colors, layout, radii, shadows, spacing, typography } from '../theme/tokens';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabPresentation = {
  active: keyof typeof Ionicons.glyphMap;
  inactive: keyof typeof Ionicons.glyphMap;
  label: string;
};

const TAB_PRESENTATION: Record<keyof MainTabParamList, TabPresentation> = {
  Home: { active: 'home', inactive: 'home-outline', label: 'Today' },
  Library: { active: 'albums', inactive: 'albums-outline', label: 'Library' },
  Recognize: { active: 'mic', inactive: 'mic-outline', label: 'Identify' },
  Activity: { active: 'pulse', inactive: 'pulse-outline', label: 'Activity' },
};

function DockItem({
  presentation,
  focused,
  onPress,
  onLongPress,
}: {
  presentation: TabPresentation;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const focus = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(focus, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      speed: 26,
      bounciness: 4,
    }).start();
  }, [focus, focused]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityLabel={presentation.label}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      style={({ pressed }) => [styles.dockItem, pressed && styles.dockItemPressed]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.activePill,
          {
            opacity: focus,
            transform: [{ scale: focus.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.dockItemContent,
          {
            transform: [{ translateY: focus.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) }],
          },
        ]}
      >
        <Ionicons
          name={focused ? presentation.active : presentation.inactive}
          size={21}
          color={focused ? colors.cyan : colors.textMuted}
        />
        <Text style={[styles.dockLabel, focused && styles.dockLabelActive]}>{presentation.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function CompactDock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  function pressRoute(index: number) {
    const route = state.routes[index];
    const focused = state.index === index;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
  }

  function longPressRoute(index: number) {
    navigation.emit({ type: 'tabLongPress', target: state.routes[index].key });
  }

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { paddingBottom: insets.bottom + layout.dockBottomGap }]}>
      <View style={styles.dockSurface}>
        <View pointerEvents="none" style={styles.dockHighlight} />
        {state.routes.map((route, index) => (
          <DockItem
            key={route.key}
            presentation={TAB_PRESENTATION[route.name as keyof MainTabParamList]}
            focused={state.index === index}
            onPress={() => pressRoute(index)}
            onLongPress={() => longPressRoute(index)}
          />
        ))}
      </View>
    </View>
  );
}

/** The tab-hosted Activity screen has shell chrome; the legacy root Jobs route stays header-backed. */
function ActivityTabScreen() {
  return <JobsScreen embedded />;
}

function NavRail({ state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeTab = state.routes[state.index]?.name as keyof MainTabParamList | undefined;

  return (
    <View style={[styles.rail, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.railOverlay} />
      <AppSidebar variant="rail" activeTab={activeTab} />
    </View>
  );
}

export function MainTabs() {
  const { isDesktop } = useResponsive();

  return (
    <Tab.Navigator
      tabBar={(props) => (isDesktop ? <NavRail {...props} /> : <CompactDock {...props} />)}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        sceneStyle: isDesktop ? { paddingLeft: RAIL_WIDTH } : undefined,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Today' }} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Recognize" component={RecognitionScreen} options={{ title: 'Identify' }} />
      <Tab.Screen name="Activity" component={ActivityTabScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  dockWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
    alignItems: 'center',
  },
  dockSurface: {
    width: '100%',
    maxWidth: 440,
    height: 68,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 5,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(174,165,192,0.16)',
    backgroundColor: 'rgba(16,11,24,0.96)',
    ...shadows.card,
  },
  dockHighlight: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    right: spacing.md,
    height: 1,
    backgroundColor: 'rgba(241,237,247,0.12)',
  },
  dockItem: {
    flex: 1,
    minWidth: 44,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  dockItemPressed: { opacity: 0.72 },
  activePill: {
    ...(StyleSheet.absoluteFill as object),
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,138,92,0.12)',
  },
  dockItemContent: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  dockLabel: {
    ...typography.caption,
    fontFamily: 'Sora_500Medium',
    fontSize: 10,
    lineHeight: 13,
    color: colors.textMuted,
  },
  dockLabelActive: { color: colors.textPrimary },
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: RAIL_WIDTH,
    paddingHorizontal: spacing.md,
    borderRightWidth: 1,
    borderRightColor: 'rgba(174,165,192,0.12)',
    overflow: 'hidden',
  },
  railOverlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(9,6,15,0.9)',
  },
});
