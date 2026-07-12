/**
 * Starhollow's visual foundation — forest night under deep space.
 *
 * The canvas is midnight pine: a near-black green-navy that reads as a
 * clearing after dark. Surfaces are solid tonal steps of the same wood.
 * One aurora-teal signal colour carries every action; soft violet is the
 * cosmic counterpoint and star gold appears only as a rare celebratory
 * glint. Decorative gradients and glow are for moments, never hierarchy.
 */
export const palette = {
  background: '#0B1411',
  void: '#050A0B',
  surface: '#121F1A',
  surfaceBright: '#192B23',
  surfaceElevated: '#20362C',
  border: '#2A4336',
  borderStrong: '#3B5A48',

  primary: '#63D6B5',
  primaryPressed: '#4CBB9C',
  secondary: '#A99BDB',
  gold: '#E9CD7E',

  textPrimary: '#EFF5F1',
  textSecondary: '#B9CAC1',
  textMuted: '#7E948A',
  textInverse: '#07120D',

  success: '#71CE9C',
  warning: '#E9CD7E',
  danger: '#F0838C',
} as const;

/** Paint-only colors for the shared ambient canvas behind screen content. */
export const ambient = {
  ridgeBack: '#0A2027',
  ridgeFront: '#061119',
} as const;

export const gradients = {
  /** A restrained, single-family accent reserved for primary hero moments. */
  accent: [palette.primary, '#8FE3C8'] as const,
  /** The night-sky sweep: aurora teal drifting through violet — rare moments only. */
  aurora: ['#5BD3B0', '#7FB6D9', palette.secondary] as const,
  heroCard: [palette.surfaceBright, palette.surface] as const,
  screenIdle: ['#050911', '#08131A', '#0B191F'] as const,
  screenListening: ['#0E2019', '#0A1512', palette.background] as const,
  coverFallback: ['#16281F', '#0D1512'] as const,
  coverScrim: ['rgba(5,10,11,0)', 'rgba(5,10,11,0.52)', 'rgba(5,10,11,0.94)'] as const,
  rippleSignal: ['rgba(99,214,181,0.10)', 'rgba(99,214,181,0)'] as const,
  rippleWave: ['rgba(169,155,219,0.07)', 'rgba(169,155,219,0)'] as const,
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

export const theme = { palette, ambient, gradients, layout, typeScale, shadows, motion } as const;
export default theme;
