import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { JobsScreen } from '../screens/JobsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TelegramScreen } from '../screens/TelegramScreen';
import { VideoPlayerScreen } from '../screens/VideoPlayerScreen';
import { Sidebar } from '../components/ui/Sidebar';
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
    background: '#060607',
    card: '#060607',
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

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {isAuthenticated ? (
        <>
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Main" component={MainTabs} />
            <RootStack.Screen name="Player" component={PlayerScreen} options={{ presentation: 'fullScreenModal' }} />
            <RootStack.Screen
              name="VideoPlayer"
              component={VideoPlayerScreen}
              options={{ presentation: 'fullScreenModal' }}
            />
            <RootStack.Screen name="Telegram" component={TelegramScreen} />
            <RootStack.Screen name="Jobs" component={JobsScreen} />
            <RootStack.Screen name="Settings" component={SettingsScreen} />
          </RootStack.Navigator>
          <Sidebar />
        </>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
