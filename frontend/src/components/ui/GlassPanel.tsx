import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { radii, shadows } from '../../theme/tokens';

type Props = PropsWithChildren<{
  style?: ViewStyle | ViewStyle[];
  /** Kept for call-site compatibility — the panel no longer blurs (see below). */
  intensity?: number;
  /** Tint layered over the surface so content stays legible. */
  overlayColor?: string;
  /** Color of the top edge-light — defaults to a neutral moonlight hair-line;
   * PlayerScreen passes the current track's accent color where available. */
  edgeColor?: string;
}>;

/**
 * Raised stone-surface container: layered tint + a whisper of gradient depth
 * + soft shadow + a moonlit top edge.
 *
 * Deliberately NOT real blur. This app ships as a web build inside a
 * Capacitor WebView, where `backdrop-filter: blur` re-rasterizes everything
 * behind the panel every frame — with 6–10 of these panels stacked on the
 * dashboard it was the single biggest reason the app felt heavy on phones.
 * On this dark palette the overlays are already 0.55–0.72 opaque, so a
 * gradient-lifted tint reads nearly identically at a tiny fraction of the
 * cost. (`intensity` is accepted and ignored so call sites didn't need a
 * breaking sweep.)
 */
export function GlassPanel({
  children,
  style,
  intensity: _intensity,
  overlayColor = 'rgba(18,28,24,0.88)',
  edgeColor = 'rgba(231,235,230,0.09)',
}: Props) {
  return (
    <View style={[styles.shell, style]}>
      <View style={[styles.overlay, { backgroundColor: overlayColor }]} />
      {/* Faint vertical light falloff — the depth cue the blur used to give. */}
      <LinearGradient
        colors={['rgba(231,235,230,0.05)', 'rgba(231,235,230,0.0)', 'rgba(5,8,5,0.10)']}
        style={styles.overlay}
        pointerEvents="none"
      />
      {/* Moonlight catching the top edge — a hair of light that makes the
          glass read as a surface instead of a flat tint. */}
      <View style={[styles.edgeLight, { backgroundColor: edgeColor }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,176,168,0.08)',
    ...shadows.card,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  edgeLight: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1,
  },
});
