import { useMemo } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import { AdminScreen } from '../screens/admin/AdminScreen';
import { JobsScreen } from '../screens/JobsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ReplayScreen } from '../screens/ReplayScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TelegramScreen } from '../screens/TelegramScreen';
import { AccountPopover } from '../components/ui/AccountPopover';
import { DesktopSecondaryRail } from '../components/ui/DesktopSecondaryRail';
import { GlobalNoticeStack } from '../components/ui/GlobalNoticeStack';
import { Sidebar } from '../components/ui/Sidebar';
import { GlobalVideoStage } from '../components/video/GlobalVideoStage';
import { ForestBackdrop } from '../components/ui/ForestBackdrop';
import { RAIL_WIDTH, useResponsive } from '../hooks/useResponsive';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { MainTabs } from './MainTabs';
import { navigationRef } from './navigationRef';
import type { AuthStackParamList, RootStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['starhollow://'],
  config: {
    screens: {
      Main: {
        initialRouteName: 'Home',
        screens: { Home: '', Library: 'library', Recognize: 'identify', Activity: 'activity' },
      },
      Player: 'player',
      Telegram: 'telegram',
      Jobs: 'jobs',
      Settings: 'settings',
      Replay: 'replay',
      Admin: 'admin',
    },
  },
};

function AuthNavigator() {
  const reduceMotion = useReducedMotion();
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? 'none' : 'fade_from_bottom',
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { isDesktop } = useResponsive();
  const reduceMotion = useReducedMotion();
  const { scheme, theme } = useTheme();
  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: 'transparent',
        card: 'transparent',
        border: theme.palette.border,
        primary: theme.palette.primary,
        text: theme.palette.textPrimary,
      },
    };
  }, [scheme, theme]);

  // On desktop the secondary routes render beside the persistent rail, so
  // their content is inset by the rail width. Phones keep the full width.
  const railInset = isDesktop
    ? { contentStyle: { paddingLeft: RAIL_WIDTH, backgroundColor: 'transparent' } }
    : undefined;

  return (
    <View style={styles.root}>
      <ForestBackdrop />
      <GlobalNoticeStack />
      <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking}>
        {isAuthenticated ? (
          <>
            <RootStack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: styles.transparent,
                animation: reduceMotion ? 'none' : 'slide_from_right',
              }}
            >
              <RootStack.Screen name="Main" component={MainTabs} />
              <RootStack.Screen
                name="Player"
                component={PlayerScreen}
                options={{
                  presentation: 'fullScreenModal',
                  animation: reduceMotion ? 'none' : 'slide_from_bottom',
                  gestureDirection: 'vertical',
                }}
              />
              <RootStack.Screen name="Telegram" component={TelegramScreen} options={railInset} />
              <RootStack.Screen name="Jobs" component={JobsScreen} options={railInset} />
              <RootStack.Screen name="Settings" component={SettingsScreen} options={railInset} />
              <RootStack.Screen name="Replay" component={ReplayScreen} options={railInset} />
              <RootStack.Screen name="Admin" component={AdminScreen} options={railInset} />
            </RootStack.Navigator>
            <DesktopSecondaryRail />
            <Sidebar />
            <AccountPopover />
            <GlobalVideoStage />
          </>
        ) : (
          <AuthNavigator />
        )}
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  transparent: { backgroundColor: 'transparent' },
});
