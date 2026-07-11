import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radii, shadows } from '../../theme/tokens';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  /** Retained for API compatibility. Solid tonal panels avoid blur cost. */
  intensity?: number;
  overlayColor?: string;
  edgeColor?: string;
}>;

/**
 * Duskglen's default raised surface. A solid fill and quiet border provide
 * hierarchy without stacking blur, gradients and glow on every card.
 */
export function GlassPanel({
  children,
  style,
  intensity: _intensity,
  overlayColor = colors.surface,
  edgeColor = 'rgba(247,242,245,0.06)',
}: Props) {
  return (
    <View style={[styles.panel, { backgroundColor: overlayColor }, style]}>
      <View pointerEvents="none" style={[styles.edge, { backgroundColor: edgeColor }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'relative',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
    ...shadows.card,
  },
  edge: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
  },
});
