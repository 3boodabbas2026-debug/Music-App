import { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { radii, shadows } from '../../theme/tokens';

type Props = PropsWithChildren<{
  style?: ViewStyle | ViewStyle[];
  /** Blur strength. */
  intensity?: number;
  /** Tint layered over the blur so content stays legible. */
  overlayColor?: string;
  /** Color of the top edge-light — defaults to a neutral moonlight hair-line;
   * PlayerScreen passes the current track's accent color where available. */
  edgeColor?: string;
}>;

/** Raised stone-surface container: a hint of blur + warm tint + soft shadow. */
export function GlassPanel({
  children,
  style,
  intensity = 40,
  overlayColor = 'rgba(18,28,24,0.72)',
  edgeColor = 'rgba(231,235,230,0.09)',
}: Props) {
  return (
    <View style={[styles.shell, style]}>
      <BlurView
        tint="dark"
        intensity={intensity}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.overlay, { backgroundColor: overlayColor }]} />
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
