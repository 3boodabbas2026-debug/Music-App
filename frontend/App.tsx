import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';

import { BrandMark } from './src/components/ui/BrandMark';
import { Toaster } from './src/components/ui/Toaster';

// Browser-only chrome: themed scrollbars, selection color and font smoothing.
// Injected once at module load so even the boot screen benefits.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('duskglen-web-css')) {
  const style = document.createElement('style');
  style.id = 'duskglen-web-css';
  style.textContent = `
    html, body { background: #0A0F0D; }
    * { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    ::selection { background: rgba(47,191,170,0.35); }
    * { scrollbar-width: thin; scrollbar-color: rgba(167,176,168,0.28) transparent; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(167,176,168,0.28); border-radius: 99px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(167,176,168,0.45); }
    input, textarea { outline: none; }
    /* Ease hover/press colour changes everywhere — transform/opacity stay
       untouched so RN Animated-driven motion isn't slowed down. */
    [role="button"], [role="link"], [role="tab"] {
      transition: background-color 160ms ease, border-color 160ms ease, box-shadow 220ms ease;
    }
    input, textarea { transition: border-color 160ms ease, box-shadow 220ms ease; }
    :focus-visible { outline: 2px solid rgba(47,191,170,0.55); outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}
import { RootNavigator } from './src/navigation/RootNavigator';
import { configureAudioSession } from './src/services/audio/PlayerService';
import { useAuthStore } from './src/store/authStore';
import { useDashboardStore } from './src/store/dashboardStore';
import { useFavoritesStore } from './src/store/favoritesStore';
import { useLibraryStore } from './src/store/libraryStore';
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
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] }) }],
        }}
      >
        <View style={bootStyles.core}>
          <BrandMark size={56} />
        </View>
      </Animated.View>
      <Text style={bootStyles.wordmark}>DUSKGLEN</Text>
      <Text style={bootStyles.tagline}>settling into the hollow…</Text>
    </View>
  );
}

const bootStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0F0D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  core: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2FBFAA',
    shadowOpacity: 0.4,
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
  // Font files are fetched over the network and aren't guaranteed to be cached
  // (especially offline, or on a flaky connection) — never let a stalled font
  // fetch hold the whole app hostage on the boot screen. Worst case it opens
  // with the system font and swaps in Space Grotesk if/when it lands.
  const [fontTimedOut, setFontTimedOut] = useState(false);

  useKeyboardShortcuts();

  useEffect(() => {
    const timer = setTimeout(() => setFontTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Restore the last listening session (paused, at the saved position) once
    // auth is settled — pressing play picks up exactly where the user left off.
    bootstrap().then(() => {
      if (useAuthStore.getState().isAuthenticated) {
        usePlayerStore.getState().hydrate();
      }
    });
    // Read the last-cached library list immediately so the app has something
    // to show the instant it opens offline, before (or instead of) any network
    // refresh resolves.
    useLibraryStore.getState().hydrate();
    useDashboardStore.getState().hydrate();
    hydrateFavorites();
    hydrateScans();
    configureAudioSession().finally(() => setAudioReady(true));
  }, [bootstrap, hydrateFavorites, hydrateScans]);

  if ((!fontsLoaded && !fontTimedOut) || isBootstrapping || !audioReady) {
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
