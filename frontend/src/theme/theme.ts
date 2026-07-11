/**
 * Duskglen's visual foundation.
 *
 * The palette is intentionally quiet: a near-black plum canvas, solid tonal
 * surfaces, warm paper-like type and one ember signal colour. Decorative
 * gradients and glow are available for rare moments, not used as hierarchy.
 */
export const palette = {
  background: '#0F0B10',
  void: '#080608',
  surface: '#171218',
  surfaceBright: '#211A22',
  surfaceElevated: '#29212A',
  border: '#332A34',
  borderStrong: '#493C48',

  primary: '#F28B63',
  primaryPressed: '#D97852',
  secondary: '#B5A7BA',
  gold: '#D9B76E',

  textPrimary: '#F7F2F5',
  textSecondary: '#C4B9C1',
  textMuted: '#8C8089',
  textInverse: '#1A0E0A',

  success: '#72C69B',
  warning: '#D9B76E',
  danger: '#EF7888',
} as const;

export const gradients = {
  /** A restrained, single-family accent reserved for primary hero moments. */
  accent: [palette.primary, '#E49A79'] as const,
  /** Kept for compatibility; intentionally low-chroma rather than rainbow. */
  aurora: [palette.textPrimary, '#DECED6', palette.primary] as const,
  heroCard: [palette.surfaceBright, palette.surface] as const,
  screenIdle: [palette.void, palette.background, '#130D14'] as const,
  screenListening: ['#211218', '#160E14', palette.background] as const,
  coverFallback: ['#251B23', '#141015'] as const,
  coverScrim: ['rgba(8,6,8,0)', 'rgba(8,6,8,0.52)', 'rgba(8,6,8,0.94)'] as const,
  rippleSignal: ['rgba(242,139,99,0.10)', 'rgba(242,139,99,0)'] as const,
  rippleWave: ['rgba(181,167,186,0.07)', 'rgba(181,167,186,0)'] as const,
} as const;

export const layout = {
  screenPadding: 20,
  radius: 18,
  radiusControl: 13,
  radiusCover: 10,

  dockHeight: 64,
  dockBottomGap: 12,
  dockScanOverhang: 26,
  dockClearance: 102,
  tabBarClearance: 200,
  sidebarWidth: 248,
} as const;

export const typeScale = {
  mega: {
    fontFamily: 'Sora_700Bold',
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -1.35,
  },
  hero: {
    fontFamily: 'Sora_700Bold',
    fontSize: 32,
    lineHeight: 39,
    letterSpacing: -1,
  },
  heading: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.45,
  },
  eyebrow: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
} as const;

export const shadows = {
  /** Low, tight elevation. Borders do most of the separation work. */
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  glowPrimary: {
    shadowColor: palette.primary,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  glowGold: {
    shadowColor: palette.gold,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

export const motion = {
  duration: {
    instant: 80,
    fast: 120,
    base: 200,
    slow: 320,
  },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.4, 0, 1, 1] as const,
  },
} as const;

export const theme = { palette, gradients, layout, typeScale, shadows, motion } as const;
export default theme;
