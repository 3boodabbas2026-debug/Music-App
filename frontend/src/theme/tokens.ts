import { gradients, layout, palette, typeScale } from './theme';

/**
 * Legacy token surface, remapped onto the "Deep Space" design system in
 * `theme.ts`. Existing components keep importing the same names and pick up
 * the new palette for free.
 */
export const colors = {
  bg: palette.background,
  bgElevated: palette.surface,
  surface: palette.surface,
  surfaceBright: palette.surfaceBright,
  surfaceBorder: 'rgba(148,163,184,0.14)',
  textPrimary: palette.textPrimary,
  textSecondary: palette.textSecondary,
  textMuted: palette.textMuted,

  // Accent slots: `violet` now carries the soft-indigo secondary accent and
  // `cyan` the neon-cyan primary accent, so old call sites stay on-palette.
  violet: palette.secondary,
  cyan: palette.primary,
  pink: '#F472B6',
  coral: palette.danger,

  success: palette.success,
  danger: palette.danger,

  gradientPrimary: gradients.accent,
  gradientHero: gradients.heroCard,
  gradientIdleScreen: gradients.screenIdle,
  gradientListeningScreen: gradients.screenListening,
  gradientWarm: ['#F472B6', '#F87171'] as const,
  gradientOrb: [palette.primary, palette.secondary, '#F472B6'] as const,
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
  sm: layout.radiusCover, // 12 — cover art
  md: layout.radius, // 16 — buttons, inputs
  lg: layout.radius, // 16 — cards (every card and button shares one radius)
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

export { gradients, layout, shadows } from './theme';

export { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
