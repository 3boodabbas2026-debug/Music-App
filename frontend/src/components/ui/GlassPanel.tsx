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
}>;

/** Frosted-glass container: blur + slate tint + soft shadow, radius 16. */
export function GlassPanel({ children, style, intensity = 70, overlayColor = 'rgba(30,41,59,0.5)' }: Props) {
  return (
    <View style={[styles.shell, style]}>
      <BlurView
        tint="dark"
        intensity={intensity}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.overlay, { backgroundColor: overlayColor }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
