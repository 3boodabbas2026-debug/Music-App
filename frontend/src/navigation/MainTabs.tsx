import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { RecognitionScreen } from '../screens/RecognitionScreen';
import { PressableScale } from '../components/ui/PressableScale';
import { colors, layout, radii, shadows, spacing } from '../theme/tokens';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const SCAN_SIZE = 64;

type SideIcon = { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; label: string };

const SIDE_ICONS: Partial<Record<keyof MainTabParamList, SideIcon>> = {
  Home: { active: 'home', inactive: 'home-outline', label: 'Home' },
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
                <Ionicons name="mic" size={26} color="#0B1120" />
              </LinearGradient>
            </View>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <GlassDock {...props} />}
      screenOptions={{ headerShown: false }}
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
    ...shadows.card,
  },
  pillOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.6)',
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
});
