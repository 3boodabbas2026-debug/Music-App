import { Platform, type ViewStyle } from 'react-native';

import { glass, gradients, layout, palette, shadows, typeScale } from './theme';

/**
 * Backdrop blur for glass panes. Real CSS backdrop-filter on web — which is
 * what the shipped APK runs, inside its Capacitor WebView — and a no-op on
 * native, where the translucent glass fills still read correctly on their own.
 * Spread inline (`style={[styles.x, glassBlur]}`), never inside
 * StyleSheet.create, so native style validation never sees the web-only keys.
 */
export const glassBlur: ViewStyle =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(16px) saturate(150%)',
        WebkitBackdropFilter: 'blur(16px) saturate(150%)',
      } as unknown as ViewStyle)
    : {};

function webBackdrop(blur: number, saturation: number): ViewStyle {
  if (Platform.OS !== 'web') return {};
  const value = `blur(${blur}px) saturate(${saturation}%)`;
  return { backdropFilter: value, WebkitBackdropFilter: value } as unknown as ViewStyle;
}

export const glassBackdrops = {
  quiet: webBackdrop(10, 125),
  raised: webBackdrop(16, 145),
  modal: webBackdrop(24, 155),
} as const;

/** The only three depth recipes for frosted surfaces. */
export const glassRecipes = {
  quiet: { fill: glass.fillDeep, stroke: glass.stroke, topEdge: glass.edgeQuiet, backdrop: glassBackdrops.quiet, shadow: shadows.low },
  raised: { fill: glass.fill, stroke: glass.strokeStrong, topEdge: glass.edgeRaised, backdrop: glassBackdrops.raised, shadow: shadows.card },
  modal: { fill: glass.fillHeavy, stroke: glass.strokeModal, topEdge: glass.edgeModal, backdrop: glassBackdrops.modal, shadow: shadows.modal },
} as const;

export { glass };

/** Color is meaning: mint acts, gold treasures, violet atmospherically supports, coral fails. */
export const accents = {
  action: palette.primary,
  live: palette.primary,
  treasured: palette.gold,
  celebratory: palette.gold,
  atmosphere: palette.secondary,
  destructive: palette.danger,
  failed: palette.danger,
} as const;

/** Compatibility surface used throughout the app. New work should still use
 * these semantic names so palette changes remain centralized. */
export const colors = {
  bg: palette.background,
  bgElevated: palette.surface,
  surface: palette.surface,
  surfaceBright: palette.surfaceBright,
  surfaceElevated: palette.surfaceElevated,
  surfaceBorder: palette.border,
  surfaceBorderStrong: palette.borderStrong,
  textPrimary: palette.textPrimary,
  textSecondary: palette.textSecondary,
  textMuted: palette.textMuted,
  textInverse: palette.textInverse,

  violet: accents.atmosphere,
  cyan: accents.action,
  gold: accents.treasured,
  pink: accents.treasured,
  coral: accents.destructive,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,

  gradientPrimary: gradients.liveProgress,
  gradientHero: gradients.heroGlass,
  gradientIdleScreen: gradients.screenHorizon,
  gradientListeningScreen: gradients.screenListening,
  gradientWarm: [palette.gold, palette.primary] as const,
  gradientOrb: [palette.primary, '#8FE3C8', palette.gold] as const,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: layout.screenPadding,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

/** Semantic cadence built on the 4 / 8 / 16 rhythm. */
export const space = {
  inset: { compact: spacing.sm, control: spacing.md, panel: spacing.lg, hero: spacing.xl },
  stack: { tight: spacing.xs, compact: spacing.sm, default: spacing.md, relaxed: spacing.lg },
  section: { compact: spacing.lg, default: spacing.xl, chapter: spacing.xxl, feature: spacing.xxxl },
  cluster: { tight: spacing.xs, default: spacing.sm, relaxed: spacing.md },
} as const;

export const radii = {
  xs: 6,
  sm: layout.radiusCover,
  md: layout.radiusControl,
  lg: layout.radius,
  xl: 24,
  pill: 999,
  cover: layout.radiusCover,
  control: layout.radiusControl,
  card: layout.radius,
  hero: 24,
  sheet: 28,
} as const;

export const typography = {
  display: typeScale.display,
  screenTitle: typeScale.screenTitle,
  sectionTitle: typeScale.sectionTitle,
  cardTitle: typeScale.cardTitle,
  body: typeScale.body,
  label: typeScale.label,
  metadata: typeScale.metadata,
  numeric: typeScale.numeric,
  mega: typeScale.display,
  title: typeScale.sectionTitle,
  eyebrow: typeScale.eyebrow,
  subtitle: typeScale.cardTitle,
  caption: typeScale.metadata,
} as const;

export const numericTypography = {
  time: { ...typeScale.numeric, fontSize: 11, lineHeight: 16 },
  percent: { ...typeScale.numeric, fontSize: 11, lineHeight: 16 },
  rank: { ...typeScale.numeric, fontSize: 16, lineHeight: 22 },
  total: { ...typeScale.numeric, fontSize: 21, lineHeight: 28, letterSpacing: -0.25 },
} as const;

export const iconography = {
  size: { sm: 16, md: 20, lg: 24 },
  well: { compact: 36, standard: 44, hero: 56 },
  labelGap: { compact: spacing.xs, standard: spacing.sm },
  treatment: { inactive: 'outline', active: 'filled' },
} as const;

/** Shared visual grammar for loading, connection, error, and control states. */
export const stateLayers = {
  skeleton: {
    base: glass.fillDeep,
    raised: glass.fill,
    sweep: glass.edgeQuiet,
  },
  info: { fill: glass.tintPrimary, stroke: glass.tintPrimaryStroke, edge: palette.primary },
  success: { fill: glass.tintSuccess, stroke: glass.tintSuccessStroke, edge: palette.success },
  warning: { fill: glass.tintWarning, stroke: glass.tintWarningStroke, edge: palette.warning },
  danger: { fill: glass.tintDanger, stroke: glass.tintDangerStroke, edge: palette.danger },
} as const;

export const controlLayers = {
  primary: { fill: glass.tintPrimary, stroke: glass.tintPrimaryStroke, icon: palette.primary },
  surface: { fill: glass.fillBright, stroke: glass.strokeStrong, icon: palette.textPrimary },
  ghost: { fill: glass.fillDeep, stroke: glass.stroke, icon: palette.textSecondary },
  selected: { fill: glass.tintPrimary, stroke: glass.tintPrimaryStroke, icon: palette.primary },
  disabled: { fill: glass.fillDeep, stroke: glass.stroke, icon: palette.textMuted },
  destructive: { fill: glass.tintDanger, stroke: glass.tintDangerStroke, icon: palette.danger },
} as const;

export const contentGrid = layout.grid;

export { gradients, layout, shadows, motion } from './theme';
export { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
export { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
export { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
export { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
