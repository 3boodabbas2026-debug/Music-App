import { gradients, layout, palette, typeScale } from './theme';

/**
 * Legacy token surface, remapped onto the "Wavecairn" design system in
 * `theme.ts`. Existing components keep importing the same names and pick up
 * the new palette for free.
 */
export const colors = {
  bg: palette.background,
  bgElevated: palette.surface,
  surface: palette.surface,
  surfaceBright: palette.surfaceBright,
  surfaceBorder: 'rgba(233,229,220,0.08)',
  textPrimary: palette.textPrimary,
  textSecondary: palette.textSecondary,
  textMuted: palette.textMuted,

  // Accent slots: `violet` now carries the teal "wave" secondary accent and
  // `cyan` the copper "signal" primary accent, so old call sites stay on-palette.
  violet: palette.secondary,
  cyan: palette.primary,
  pink: '#E0708C',
  coral: palette.danger,

  success: palette.success,
  danger: palette.danger,

  gradientPrimary: gradients.accent,
  gradientHero: gradients.heroCard,
  gradientIdleScreen: gradients.screenIdle,
  gradientListeningScreen: gradients.screenListening,
  gradientWarm: [palette.bloom, palette.danger] as const,
  gradientOrb: [palette.primary, palette.secondary, palette.bloom] as const,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: layout.screenPadding, // 20 — generous main-container padding
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: layout.radiusCover, // 8 — cover art, deliberately sharper than cards
  md: layout.radiusControl, // 12 — buttons, inputs
  lg: layout.radius, // 14 — cards
  pill: 999,
} as const;

export const typography = {
  mega: typeScale.mega,
  display: typeScale.hero,
  title: typeScale.heading,
  eyebrow: typeScale.eyebrow,
  subtitle: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: 'System', fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: 'System', fontSize: 13, lineHeight: 18 },
} as const;

export { gradients, layout, shadows, motion } from './theme';

export { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
