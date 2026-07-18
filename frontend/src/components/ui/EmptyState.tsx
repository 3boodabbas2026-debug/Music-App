import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, motion, radii, spacing, typography } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Button } from './Button';
import { Reveal } from './Reveal';

type Props = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  motif?: 'record' | 'shelf' | 'signal' | 'offline' | 'locked';
  minHeight?: ViewStyle['minHeight'];
};

const MOTIF_ICON: Record<NonNullable<Props['motif']>, keyof typeof Ionicons.glyphMap> = {
  record: 'musical-note',
  shelf: 'albums-outline',
  signal: 'radio-outline',
  offline: 'cloud-offline-outline',
  locked: 'lock-closed-outline',
};

function StateIllustration({ motif, icon, compact }: { motif: NonNullable<Props['motif']>; icon: keyof typeof Ionicons.glyphMap; compact: boolean }) {
  const size = compact ? 62 : 82;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.iconWell, compact && styles.compactIcon, { width: size, height: size }]}
    >
      <View pointerEvents="none" style={styles.iconGlow} />
      <View pointerEvents="none" style={styles.orbitOuter} />
      <View pointerEvents="none" style={styles.orbitInner} />
      {motif === 'shelf' ? (
        <View pointerEvents="none" style={styles.shelfRule}>
          <View style={[styles.shelfBook, styles.shelfBookTall]} />
          <View style={styles.shelfBook} />
          <View style={[styles.shelfBook, styles.shelfBookShort]} />
        </View>
      ) : null}
      {motif === 'signal' ? <View pointerEvents="none" style={styles.signalRule} /> : null}
      {motif === 'offline' ? (
        <View pointerEvents="none" style={styles.offlineDots}>
          <View style={styles.offlineDot} /><View style={styles.offlineDot} /><View style={styles.offlineDot} />
        </View>
      ) : null}
      {motif === 'locked' ? <View pointerEvents="none" style={styles.horizonRule} /> : null}
      <View style={[styles.glyphWell, compact && styles.glyphWellCompact]}>
        <Ionicons name={icon} size={compact ? 20 : 24} color={colors.cyan} />
      </View>
      {motif === 'record' ? <View pointerEvents="none" style={styles.recordNotch} /> : null}
    </View>
  );
}

/** Stable state footprint that softly resolves as empty/loading content becomes real content. */
export function ContinuityFrame({ children, stateKey, minHeight, style }: { children: ReactNode; stateKey: string; minHeight?: ViewStyle['minHeight']; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const previousKey = useRef(stateKey);
  useEffect(() => {
    if (previousKey.current === stateKey) return;
    previousKey.current = stateKey;
    progress.stopAnimation();
    if (reduceMotion) { progress.setValue(1); return; }
    progress.setValue(0.38);
    Animated.timing(progress, { toValue: 1, duration: motion.duration.slow, easing: Easing.bezier(...motion.easing.decelerate), useNativeDriver: true }).start();
  }, [progress, reduceMotion, stateKey]);
  return (
    <Animated.View style={[styles.continuity, minHeight != null && { minHeight }, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0.38, 1], outputRange: [4, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

export function EmptyState({
  title,
  subtitle,
  icon,
  actionLabel,
  onAction,
  compact = false,
  motif = 'record',
  minHeight,
}: Props) {
  const resolvedIcon = icon ?? MOTIF_ICON[motif];
  return (
    <Reveal distance={compact ? 4 : 8} style={styles.reveal}>
      <View style={[styles.wrap, compact && styles.compact, minHeight != null && { minHeight }]}>
        <StateIllustration motif={motif} icon={resolvedIcon} compact={compact} />
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} /> : null}
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  reveal: { width: '100%' },
  continuity: { width: '100%' },
  wrap: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  compact: { paddingVertical: spacing.lg },
  iconWell: {
    borderRadius: radii.hero,
    backgroundColor: 'rgba(99,214,181,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99,214,181,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconGlow: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(99,214,181,0.10)',
    transform: [{ scale: 1.55 }],
  },
  compactIcon: { borderRadius: radii.lg },
  orbitOuter: { position: 'absolute', width: '76%', height: '76%', borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(99,214,181,0.14)' },
  orbitInner: { position: 'absolute', width: '52%', height: '52%', borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(233,205,126,0.12)' },
  glyphWell: { width: 42, height: 42, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,18,22,0.72)', borderWidth: 1, borderColor: 'rgba(194,232,217,0.22)' },
  glyphWellCompact: { width: 36, height: 36 },
  shelfRule: { position: 'absolute', left: 11, right: 11, bottom: 12, height: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, borderBottomWidth: 1, borderBottomColor: 'rgba(233,205,126,0.34)' },
  shelfBook: { width: 4, height: 9, borderRadius: 2, backgroundColor: 'rgba(233,205,126,0.30)' },
  shelfBookTall: { height: 13 },
  shelfBookShort: { height: 6 },
  signalRule: { position: 'absolute', left: 8, right: 8, top: '50%', height: 1, backgroundColor: 'rgba(169,155,219,0.28)' },
  offlineDots: { position: 'absolute', left: 13, bottom: 12, flexDirection: 'row', gap: 4 },
  offlineDot: { width: 3, height: 3, borderRadius: radii.pill, backgroundColor: colors.warning },
  horizonRule: { position: 'absolute', left: 9, right: 9, bottom: 13, height: 7, borderTopWidth: 1, borderTopColor: 'rgba(99,214,181,0.24)', borderRadius: radii.pill },
  recordNotch: { position: 'absolute', bottom: 10, width: 12, height: 3, borderRadius: radii.pill, backgroundColor: colors.gold },
  copy: { width: '100%', alignItems: 'center', gap: spacing.xs },
  title: { ...typography.subtitle, color: colors.textPrimary, textAlign: 'center', maxWidth: 320 },
  subtitle: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: { minWidth: 160, marginTop: spacing.xs },
});
