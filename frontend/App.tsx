import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';

import { BrandMark } from './src/components/ui/BrandMark';
import { Toaster } from './src/components/ui/Toaster';

// Browser-only chrome: themed scrollbars, selection color and font smoothing.
// Injected once at module load so even the boot screen benefits.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('duskglen-web-css')) {
  const style = document.createElement('style');
  style.id = 'duskglen-web-css';
  style.textContent = `
    html, body { background: #0F0B10; }
    * { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    ::selection { background: rgba(242,139,99,0.32); }
    * { scrollbar-width: thin; scrollbar-color: rgba(196,185,193,0.24) transparent; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(196,185,193,0.24); border-radius: 99px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(196,185,193,0.38); }
    input, textarea { outline: none; }
    /* Ease hover/press colour changes everywhere — transform/opacity stay
       untouched so RN Animated-driven motion isn't slowed down. */
    [role="button"], [role="link"], [role="tab"] {
      transition: background-color 160ms ease, border-color 160ms ease, box-shadow 220ms ease;
    }
    input, textarea { transition: border-color 160ms ease, box-shadow 220ms ease; }
    :focus-visible { outline: 2px solid #F28B63; outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  `;
  document.head.appendChild(style);
}
import { RootNavigator } from './src/navigation/RootNavigator';
import { configureAudioSession } from './src/services/audio/PlayerService';
import { useAuthStore } from './src/store/authStore';
import { useFavoritesStore } from './src/store/favoritesStore';
import { useLibraryStore } from './src/store/libraryStore';
import { usePinStore } from './src/store/pinStore';
import { usePlayerStore } from './src/store/playerStore';
import { usePlayHistoryStore } from './src/store/playHistoryStore';
import { useScanHistoryStore } from './src/store/scanHistoryStore';
import { colors } from './src/theme/tokens';

/** Quiet branded boot while fonts, auth and audio settle. */
function BootScreen() {
  return (
    <View style={bootStyles.root}>
      <View style={bootStyles.core}>
        <BrandMark size={56} />
      </View>
      <Text style={bootStyles.wordmark}>DUSKGLEN</Text>
      <Text style={bootStyles.tagline}>Preparing your library…</Text>
    </View>
  );
}

const bootStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0B10',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  core: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#171218',
    borderWidth: 1,
    borderColor: '#332A34',
  },
  wordmark: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
    letterSpacing: 6,
    color: colors.textPrimary,
  },
  tagline: {
    fontFamily: 'Sora_400Regular',
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
  const [fontsLoaded] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const hydrateFavorites = useFavoritesStore((s) => s.hydrate);
  const hydrateScans = useScanHistoryStore((s) => s.hydrate);
  const [audioReady, setAudioReady] = useState(false);
  // Font initialization should never hold the whole app hostage. If a device
  // cannot load the bundled assets, open with the system fallback after a
  // short grace period rather than leaving the user at boot indefinitely.
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
    usePinStore.getState().hydrate();
    usePlayHistoryStore.getState().hydrate();
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
