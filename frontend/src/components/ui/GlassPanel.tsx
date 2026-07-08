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

/** Raised stone-surface container: a hint of blur + warm tint + soft shadow. */
export function GlassPanel({ children, style, intensity = 40, overlayColor = 'rgba(23,24,27,0.72)' }: Props) {
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
    borderWidth: 1,
    borderColor: 'rgba(233,229,220,0.08)',
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
