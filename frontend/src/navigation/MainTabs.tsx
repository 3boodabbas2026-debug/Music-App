import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSidebar } from '../components/ui/AppSidebar';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useResponsive, RAIL_WIDTH } from '../hooks/useResponsive';
import { HomeScreen } from '../screens/HomeScreen';
import { JobsScreen } from '../screens/JobsScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { RecognitionScreen } from '../screens/RecognitionScreen';
import { useUiStore } from '../store/uiStore';
import { colors, glass, layout, motion, radii, shadows, spacing, typography } from '../theme/tokens';
import type { MainTabParamList, RootStackParamList } from './types';

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

const TAB_ROUTES: Array<keyof MainTabParamList> = ['Home', 'Library', 'Recognize', 'Activity'];

function DockItem({
  presentation,
  focused,
  onPress,
  onLongPress,
  reduceMotion,
}: {
  presentation: TabPresentation;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  reduceMotion: boolean;
}) {
  const focus = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    focus.stopAnimation();
    if (reduceMotion) {
      focus.setValue(focused ? 1 : 0);
      return;
    }
    const animation = Animated.spring(focus, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      speed: 26,
      bounciness: 4,
    });
    animation.start();
    return () => animation.stop();
  }, [focus, focused, reduceMotion]);

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
  const dockCollapsed = useUiStore((store) => store.dockCollapsed);
  const toggleDockCollapsed = useUiStore((store) => store.toggleDockCollapsed);
  const visibility = useRef(new Animated.Value(dockCollapsed ? 0 : 1)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    visibility.stopAnimation();
    const animation = Animated.timing(visibility, {
      toValue: dockCollapsed ? 0 : 1,
      duration: reduceMotion ? 0 : motion.duration.base,
      easing: dockCollapsed
        ? Easing.bezier(...motion.easing.accelerate)
        : Easing.bezier(...motion.easing.decelerate),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [dockCollapsed, reduceMotion, visibility]);

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
      <Animated.View
        pointerEvents={dockCollapsed ? 'none' : 'auto'}
        accessibilityElementsHidden={dockCollapsed}
        importantForAccessibility={dockCollapsed ? 'no-hide-descendants' : 'auto'}
        style={[
          styles.dockChrome,
          {
            opacity: visibility,
            transform: [{ translateY: visibility.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
          },
        ]}
      >
        <View style={styles.dockSurface}>
          <View pointerEvents="none" style={styles.dockHighlight} />
          {state.routes.map((route, index) => (
            <DockItem
              key={route.key}
              presentation={TAB_PRESENTATION[route.name as keyof MainTabParamList]}
              focused={state.index === index}
              onPress={() => pressRoute(index)}
              onLongPress={() => longPressRoute(index)}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
        <Pressable
          onPress={toggleDockCollapsed}
          accessibilityRole="button"
          accessibilityLabel="Collapse navigation"
          style={({ pressed }) => [styles.dockToggle, pressed && styles.dockItemPressed]}
        >
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>
      </Animated.View>

      <Animated.View
        pointerEvents={dockCollapsed ? 'auto' : 'none'}
        accessibilityElementsHidden={!dockCollapsed}
        importantForAccessibility={dockCollapsed ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.expandWrap,
          { bottom: insets.bottom + layout.dockBottomGap },
          {
            opacity: visibility.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ translateY: visibility.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) }],
          },
        ]}
      >
        <Pressable
          onPress={toggleDockCollapsed}
          accessibilityRole="button"
          accessibilityLabel="Expand navigation"
          style={({ pressed }) => [styles.expandButton, pressed && styles.dockItemPressed]}
        >
          <Ionicons name="chevron-up" size={22} color={colors.cyan} />
        </Pressable>
      </Animated.View>
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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width, isDesktop } = useResponsive();
  const reduceMotion = useReducedMotion();
  const openSidebar = useUiStore((store) => store.openSidebar);
  const activeIndex = useRef(0);
  const gestureStartX = useRef(Number.POSITIVE_INFINITY);

  const pagingGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isDesktop)
        // A vertical scroll wins if it moves first. A deliberate horizontal
        // movement must clear this dead zone before tab paging activates.
        .activeOffsetX([-22, 22])
        .failOffsetY([-14, 14])
        .averageTouches(true)
        .runOnJS(true)
        .onBegin((event) => {
          gestureStartX.current = event.absoluteX;
        })
        .onEnd((event) => {
          const horizontalDistance = Math.abs(event.translationX);
          const verticalDistance = Math.abs(event.translationY);
          const deliberate = horizontalDistance >= 64 || Math.abs(event.velocityX) >= 650;
          if (!deliberate || horizontalDistance <= verticalDistance * 1.25) return;

          const swipingRight = event.translationX > 0;
          const edgeWidth = Math.max(28, Math.min(40, width * 0.08));
          if (swipingRight && gestureStartX.current <= edgeWidth) {
            openSidebar();
            return;
          }

          const current = activeIndex.current;
          if (swipingRight) {
            if (current === 0) {
              navigation.navigate('Settings');
              return;
            }
            navigation.navigate('Main', { screen: TAB_ROUTES[current - 1] });
            return;
          }

          if (current < TAB_ROUTES.length - 1) {
            navigation.navigate('Main', { screen: TAB_ROUTES[current + 1] });
          }
        }),
    [isDesktop, navigation, openSidebar, width],
  );

  const tabs = (
    <Tab.Navigator
      tabBar={(props) => (isDesktop ? <NavRail {...props} /> : <CompactDock {...props} />)}
      screenListeners={{
        state: (event) => {
          activeIndex.current = event.data.state.index ?? 0;
        },
      }}
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? 'none' : 'shift',
        transitionSpec: {
          animation: 'timing',
          config: { duration: reduceMotion ? 0 : motion.duration.base },
        },
        sceneStyle: isDesktop
          ? { paddingLeft: RAIL_WIDTH, backgroundColor: 'transparent' }
          : { backgroundColor: 'transparent' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Today' }} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Recognize" component={RecognitionScreen} options={{ title: 'Identify' }} />
      <Tab.Screen name="Activity" component={ActivityTabScreen} />
    </Tab.Navigator>
  );

  if (isDesktop) return tabs;

  return (
    <GestureDetector gesture={pagingGesture}>
      <View style={styles.gestureSurface}>{tabs}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  gestureSurface: { flex: 1 },
  dockWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
    alignItems: 'center',
  },
  dockChrome: {
    width: '100%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  dockSurface: {
    flex: 1,
    height: 68,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 5,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: glass.stroke,
    backgroundColor: glass.fillHeavy,
    ...shadows.card,
  },
  dockToggle: {
    width: 44,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: glass.stroke,
    backgroundColor: glass.fillHeavy,
    ...shadows.card,
  },
  expandWrap: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
  },
  expandButton: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
    backgroundColor: glass.fillHeavy,
    ...shadows.card,
  },
  dockHighlight: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    right: spacing.md,
    height: 1,
    backgroundColor: glass.edge,
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
    backgroundColor: glass.tintPrimary,
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
    borderRightColor: glass.stroke,
    overflow: 'hidden',
  },
  railOverlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: glass.fillHeavy,
  },
});
