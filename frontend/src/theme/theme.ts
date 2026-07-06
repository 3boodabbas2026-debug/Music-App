/**
 * "Deep Space" design system — the single source of truth for the app's look.
 *
 * Screens should consume these values through `theme/tokens.ts`, which maps the
 * legacy token names onto this palette so every existing component picks up the
 * new aesthetic without code changes.
 */

export const palette = {
  /** Global app background. */
  background: '#0F172A',
  /** Near-black space behind the aurora. */
  void: '#060B18',
  /** Cards, sheets and other raised containers. */
  surface: '#1E293B',
  /** A slightly brighter surface for pressed / highlighted states. */
  surfaceBright: '#27364B',
  /** Primary accent — neon cyan. Interactive elements, progress, sliders. */
  primary: '#38BDF8',
  /** Secondary accent — soft indigo. Gradients, secondary highlights. */
  secondary: '#818CF8',
  /** Tertiary accent for the aurora — magenta bloom. */
  bloom: '#C084FC',
  /** Primary copy. */
  textPrimary: '#F8FAFC',
  /** Secondary copy on dark surfaces. */
  textSecondary: '#CBD5E1',
  /** De-emphasised copy: captions, metadata, placeholders. */
  textMuted: '#94A3B8',

  success: '#34D399',
  danger: '#F87171',
} as const;

export const gradients = {
  /** Signature accent sweep: neon cyan into soft indigo. */
  accent: [palette.primary, palette.secondary] as const,
  /** Extended sweep with the magenta bloom — hero text and halo rings. */
  aurora: [palette.primary, palette.secondary, palette.bloom] as const,
  /** Subtle card wash — barely-lifted slate with an indigo undertone. */
  heroCard: ['#1E293B', '#233052', '#1E2A47'] as const,
  /** Ambient screen background at rest. */
  screenIdle: ['#060B18', '#0F172A', '#0B1120'] as const,
  /** Ambient screen background while the mic is hot — cool cyan drift. */
  screenListening: ['#082032', '#123147', '#101B3D'] as const,
  /** Placeholder cover art wash. */
  coverFallback: ['#233052', '#1E293B'] as const,
  /** Bottom-of-cover scrim so titles can sit on artwork. */
  coverScrim: ['rgba(6,11,24,0)', 'rgba(6,11,24,0.55)', 'rgba(6,11,24,0.92)'] as const,

  /** Aurora blob washes — huge, blurred-looking drifting orbs. */
  blobCyan: ['rgba(56,189,248,0.28)', 'rgba(56,189,248,0)'] as const,
  blobIndigo: ['rgba(129,140,248,0.26)', 'rgba(129,140,248,0)'] as const,
  blobBloom: ['rgba(192,132,252,0.20)', 'rgba(192,132,252,0)'] as const,
} as const;

export const layout = {
  /** Generous padding for main screen containers. */
  screenPadding: 20,
  /** ALL buttons and cards share this radius. */
  radius: 16,
  /** Cover art thumbnails. */
  radiusCover: 12,

  /** Floating glass dock (custom tab bar) geometry. */
  dockHeight: 64,
  dockBottomGap: 12,
  /** How far the raised center scan button pokes above the dock pill. */
  dockScanOverhang: 26,
  /** Vertical space the dock occupies above the safe-area inset. */
  dockClearance: 64 + 12 + 26,

  /** Clearance scroll content needs so it can float up from behind the glass dock + mini player. */
  tabBarClearance: 200,
} as const;

export const typeScale = {
  /** Oversized editorial headline. */
  mega: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.5,
  },
  /** Large screen headers: big, bold, tracked slightly tight. */
  hero: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
  },
  heading: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  /** Tiny letterspaced all-caps eyebrow label. */
  eyebrow: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.5,
  },
} as const;

export const shadows = {
  /** Soft ambient card shadow — depth without hard lines. */
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  /** Neon glow for primary interactive elements. */
  glowPrimary: {
    shadowColor: palette.primary,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
} as const;

export const theme = { palette, gradients, layout, typeScale, shadows } as const;
export default theme;
