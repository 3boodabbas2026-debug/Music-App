import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
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
import { useReducedMotion } from './src/hooks/useReducedMotion';
import { getInitialWebTheme, ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { applyWebTheme } from './src/theme/theme';

// Apply the persisted web preference before React paints. This avoids a dark
// flash when the installed PWA/Capacitor shell was last left in daylight mode.
applyWebTheme(getInitialWebTheme());

// Browser-only chrome: themed scrollbars, selection color and font smoothing.
// Injected once at module load so even the boot screen benefits.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('starhollow-web-css')) {
  const style = document.createElement('style');
  style.id = 'starhollow-web-css';
  style.textContent = `
    html, body { background: var(--sh-palette-background, #0B1411); }
    * { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    ::selection { background: var(--sh-glass-tintPrimaryStroke, rgba(99,214,181,0.32)); }
    * { scrollbar-width: thin; scrollbar-color: var(--sh-palette-borderStrong, rgba(158,181,170,0.24)) transparent; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--sh-palette-border, rgba(158,181,170,0.24)); border-radius: 99px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--sh-palette-borderStrong, rgba(158,181,170,0.38)); }
    input, textarea { outline: none; }
    /* Ease hover/press colour changes everywhere — transform/opacity stay
       untouched so RN Animated-driven motion isn't slowed down. */
    [role="button"], [role="link"], [role="tab"] {
      transition: background-color 160ms ease, border-color 160ms ease, box-shadow 220ms ease;
    }
    input, textarea { transition: border-color 160ms ease, box-shadow 220ms ease; }
    :focus-visible { outline: 2px solid var(--sh-palette-primary, #63D6B5); outline-offset: 3px; }
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
import { colors, motion } from './src/theme/tokens';

/** Quiet branded boot while fonts, auth and audio settle. */
function BootScreen() {
  const reduceMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      breath.setValue(0);
      return;
    }

    const reveal = Animated.timing(entrance, {
      toValue: 1,
      duration: motion.duration.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    reveal.start();
    breathe.start();
    return () => {
      reveal.stop();
      breathe.stop();
    };
  }, [breath, entrance, reduceMotion]);

  return (
    <Animated.View
      style={[
        bootStyles.root,
        {
          opacity: entrance,
          transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      <Animated.View
        style={[
          bootStyles.core,
          { transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) }] },
        ]}
      >
        <BrandMark size={56} />
      </Animated.View>
      <Text style={bootStyles.wordmark}>STARHOLLOW</Text>
      <Text style={bootStyles.tagline}>Preparing your library…</Text>
    </Animated.View>
  );
}

const bootStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#2A4336',
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

function AppContent() {
  const [fontsLoaded] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [audioReady, setAudioReady] = useState(false);
  // Font initialization should never hold the whole app hostage. If a device
  // cannot load the bundled assets, open with the system fallback after a
  // short grace period rather than leaving the user at boot indefinitely.
  const [fontTimedOut, setFontTimedOut] = useState(false);
  const { scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const readyEntrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const ready = (fontsLoaded || fontTimedOut) && !isBootstrapping && audioReady;

  useKeyboardShortcuts();

  useEffect(() => {
    const timer = setTimeout(() => setFontTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Authentication chooses the account before any private cache hydrates.
    void bootstrap();
    configureAudioSession().finally(() => setAudioReady(true));
  }, [bootstrap]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Hydrate account-owned caches only after auth has selected the current
    // user. This reruns after an account switch and prevents a rejected
    // session's in-flight hydration from restoring the previous user's data.
    void Promise.all([
      usePlayerStore.getState().hydrate(),
      useLibraryStore.getState().hydrate(),
      usePinStore.getState().hydrate(),
      usePlayHistoryStore.getState().hydrate(),
      useFavoritesStore.getState().hydrate(),
      useScanHistoryStore.getState().hydrate(),
    ]);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!ready) {
      readyEntrance.setValue(0);
      return;
    }
    if (reduceMotion) {
      readyEntrance.setValue(1);
      return;
    }
    const animation = Animated.timing(readyEntrance, {
      toValue: 1,
      duration: motion.duration.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [ready, readyEntrance, reduceMotion]);

  if (!ready) {
    return <BootScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: readyEntrance,
          transform: [{ scale: readyEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.995, 1] }) }],
        }}
      >
        <SafeAreaProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <RootNavigator />
          <Toaster />
        </SafeAreaProvider>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
