import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';

import { Toaster } from './src/components/ui/Toaster';
import { RootNavigator } from './src/navigation/RootNavigator';
import { configureAudioSession } from './src/services/audio/PlayerService';
import { useAuthStore } from './src/store/authStore';
import { useFavoritesStore } from './src/store/favoritesStore';
import { usePlayerStore } from './src/store/playerStore';
import { useScanHistoryStore } from './src/store/scanHistoryStore';
import { colors } from './src/theme/tokens';

/** Branded boot: a breathing gradient core under the wordmark while fonts/auth/audio warm up. */
function BootScreen() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={bootStyles.root}>
      <Animated.View
        style={{
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) }],
        }}
      >
        <LinearGradient
          colors={['#38BDF8', '#818CF8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={bootStyles.core}
        />
      </Animated.View>
      <Text style={bootStyles.wordmark}>SUPERMEDIA</Text>
      <Text style={bootStyles.tagline}>warming up the vault…</Text>
    </View>
  );
}

const bootStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060B18',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  core: {
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#38BDF8',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  wordmark: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    letterSpacing: 6,
    color: colors.textPrimary,
  },
  tagline: {
    fontFamily: 'System',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -10,
  },
});

/** Desktop/web keyboard shortcuts: space play/pause, ←/→ seek, ↑/↓ volume, M mute. */
function useKeyboardShortcuts() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onKey = (event: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const player = usePlayerStore.getState();
      if (!player.currentMedia) return;

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          player.toggle();
          break;
        case 'ArrowRight':
          player.seek(Math.min(player.duration, player.currentTime + 10));
          break;
        case 'ArrowLeft':
          player.seek(Math.max(0, player.currentTime - 10));
          break;
        case 'ArrowUp':
          event.preventDefault();
          player.setVolume(player.volume + 0.1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          player.setVolume(player.volume - 0.1);
          break;
        case 'KeyM':
          player.toggleMute();
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const hydrateFavorites = useFavoritesStore((s) => s.hydrate);
  const hydrateScans = useScanHistoryStore((s) => s.hydrate);
  const [audioReady, setAudioReady] = useState(false);

  useKeyboardShortcuts();

  useEffect(() => {
    bootstrap();
    hydrateFavorites();
    hydrateScans();
    configureAudioSession().finally(() => setAudioReady(true));
  }, [bootstrap, hydrateFavorites, hydrateScans]);

  if (!fontsLoaded || isBootstrapping || !audioReady) {
    return <BootScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <RootNavigator />
        <Toaster />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
