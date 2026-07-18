import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { DevSettings, Platform, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from './BrandMark';
import { PressableScale } from './PressableScale';
import { Reveal } from './Reveal';
import { colors, glass, radii, shadows, spacing, stateLayers, typography } from '../../theme/tokens';

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
    console.error('Starhollow render failure', error, info.componentStack);
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
        <View pointerEvents="none" style={styles.horizon}>
          <View style={styles.ridgeBack} />
          <View style={styles.ridgeFront} />
          <View style={styles.horizonRule} />
        </View>
        <Reveal style={styles.content} distance={8}>
          <View style={styles.signalCard}>
            <View pointerEvents="none" style={styles.signalEdge} />
            <View style={styles.mark}><BrandMark size={58} /></View>
            <Text style={styles.eyebrow}>STARHOLLOW · RECOVERY SIGNAL</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.body}>The app hit an unexpected snag. Your library and downloads are safe.</Text>
            <PressableScale
              onPress={this.reload}
              accessibilityLabel="Reload Starhollow"
              scaleTo={0.98}
              hoverScaleTo={1.01}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Tap to reload</Text>
            </PressableScale>
          </View>
        </Reveal>
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
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255, 86, 86, 0.08)',
  },
  horizon: { ...StyleSheet.absoluteFill as object, top: '58%', overflow: 'hidden', opacity: 0.7 },
  ridgeBack: { position: 'absolute', left: '-8%', right: '-8%', top: 34, height: 160, borderTopLeftRadius: 220, borderTopRightRadius: 180, backgroundColor: 'rgba(10,32,39,0.52)', transform: [{ rotate: '-2deg' }] },
  ridgeFront: { position: 'absolute', left: '-12%', right: '-12%', top: 78, height: 180, borderTopLeftRadius: 260, borderTopRightRadius: 220, backgroundColor: 'rgba(6,17,25,0.82)', transform: [{ rotate: '2deg' }] },
  horizonRule: { position: 'absolute', top: 28, left: '14%', right: '14%', height: 1, backgroundColor: 'rgba(240,131,140,0.22)' },
  content: { width: '100%', maxWidth: 470, alignItems: 'center' },
  signalCard: { position: 'relative', overflow: 'hidden', width: '100%', alignItems: 'center', padding: spacing.xl, borderRadius: radii.sheet, backgroundColor: glass.fillHeavy, borderWidth: 1, borderColor: stateLayers.danger.stroke, ...shadows.modal },
  signalEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.danger },
  mark: { marginBottom: spacing.lg },
  eyebrow: { ...typography.eyebrow, color: colors.danger, textAlign: 'center', marginBottom: spacing.sm },
  title: { ...typography.sectionTitle, color: colors.textPrimary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 360, marginTop: spacing.sm },
  button: {
    minHeight: 48,
    marginTop: spacing.lg,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.tintDanger,
    borderWidth: 1,
    borderColor: glass.tintDangerStroke,
  },
  buttonText: { ...typography.label, color: colors.danger },
});
