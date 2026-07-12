import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AdminScreen } from '../screens/admin/AdminScreen';
import { JobsScreen } from '../screens/JobsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ReplayScreen } from '../screens/ReplayScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TelegramScreen } from '../screens/TelegramScreen';
import { AccountPopover } from '../components/ui/AccountPopover';
import { AnnouncementBanner } from '../components/ui/AnnouncementBanner';
import { DesktopSecondaryRail } from '../components/ui/DesktopSecondaryRail';
import { Sidebar } from '../components/ui/Sidebar';
import { UpdateBanner } from '../components/ui/UpdateBanner';
import { GlobalVideoStage } from '../components/video/GlobalVideoStage';
import { RAIL_WIDTH, useResponsive } from '../hooks/useResponsive';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/tokens';
import { MainTabs } from './MainTabs';
import { navigationRef } from './navigationRef';
import type { AuthStackParamList, RootStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    border: colors.surfaceBorder,
    primary: colors.cyan,
    text: colors.textPrimary,
  },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { isDesktop } = useResponsive();

  // On desktop the secondary routes render beside the persistent rail, so
  // their content is inset by the rail width. Phones keep the full width.
  const railInset = isDesktop ? { contentStyle: { paddingLeft: RAIL_WIDTH } } : undefined;

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {isAuthenticated ? (
        <>
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Main" component={MainTabs} />
            <RootStack.Screen name="Player" component={PlayerScreen} options={{ presentation: 'fullScreenModal' }} />
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
          <AnnouncementBanner />
        </>
      ) : (
        <AuthNavigator />
      )}
      {/* Available before login too — a stale bundle affects the auth
          screens just as much as the rest of the app. */}
      <UpdateBanner />
    </NavigationContainer>
  );
}
