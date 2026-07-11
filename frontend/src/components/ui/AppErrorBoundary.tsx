import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { DevSettings, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from './BrandMark';
import { colors } from '../../theme/tokens';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Last-resort protection against a permanent white screen after a render crash. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep diagnostics available in browser/native logs without exposing them in the UI.
    console.error('Duskglen render failure', error, info.componentStack);
  }

  private reload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    try {
      DevSettings.reload();
    } catch {
      this.setState({ hasError: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.root} accessibilityRole="alert">
        <View style={styles.glow} />
        <View style={styles.mark}><BrandMark size={58} /></View>
        <Text style={styles.eyebrow}>DUSKGLEN</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>The app hit an unexpected snag. Your library and downloads are safe.</Text>
        <Pressable
          onPress={this.reload}
          accessibilityRole="button"
          accessibilityLabel="Reload Duskglen"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Tap to reload</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 420,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255, 86, 86, 0.08)',
  },
  mark: { marginBottom: 22 },
  eyebrow: { color: colors.textMuted, fontSize: 11, letterSpacing: 4, marginBottom: 14 },
  title: { color: colors.textPrimary, fontSize: 25, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 360, marginTop: 12 },
  button: {
    minHeight: 48,
    marginTop: 26,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  buttonText: { color: colors.textInverse, fontSize: 14, fontWeight: '700' },
});
