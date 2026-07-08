/**
 * "Wavecairn" design system — the single source of truth for the app's look.
 *
 * Visual concept: ripple & stack. A cairn is a marker built stone-by-stone by
 * whoever passed before you; a wave is the signal that reaches you from far
 * away. The product is both — a private archive you build one track at a
 * time, and a live signal (downloads, imports, recognition) arriving into it.
 * That pairing shows up as a warm "signal" accent (the beacon atop the
 * cairn) and a cool "wave" accent (the ripple), on a quiet stone-dark base —
 * not a neon dashboard.
 *
 * Screens should consume these values through `theme/tokens.ts`, which maps
 * legacy token names onto this palette so existing components stay wired up.
 */

export const palette = {
  /** Global app background — warm near-black stone, not blue-black. */
  background: '#0C0D10',
  /** Deepest background, behind ambient washes. */
  void: '#060607',
  /** Cards, sheets and other raised containers. */
  surface: '#17181B',
  /** A slightly brighter surface for pressed / highlighted states. */
  surfaceBright: '#202226',
  /** Primary accent — copper-amber "signal". CTAs, active states, progress. */
  primary: '#E0954F',
  /** Secondary accent — deep teal "wave". Links, secondary highlights. */
  secondary: '#46A69C',
  /** Rare tertiary wash, background ripples only — never used for text/UI. */
  bloom: '#B8735C',
  /** Primary copy. */
  textPrimary: '#F5F2EA',
  /** Secondary copy on dark surfaces. */
  textSecondary: '#B7B2A6',
  /** De-emphasised copy: captions, metadata, placeholders. */
  textMuted: '#7A7568',

  success: '#6FBF8B',
  danger: '#E2685A',
} as const;

export const gradients = {
  /** Signature accent sweep: copper signal into teal wave. Used sparingly. */
  accent: [palette.primary, palette.secondary] as const,
  /** Full sweep incl. bloom — reserved for one hero moment, not everywhere. */
  aurora: [palette.primary, palette.bloom, palette.secondary] as const,
  /** Subtle card wash — barely-lifted neutral stone, no colour tint. */
  heroCard: ['#17181B', '#1B1C20', '#17181B'] as const,
  /** Ambient screen background at rest — neutral, no colour undertone. */
  screenIdle: ['#060607', '#0C0D10', '#0A0B0D'] as const,
  /** Ambient screen background while the mic is hot — quiet teal drift. */
  screenListening: ['#0A1615', '#0F1B19', '#0C0D10'] as const,
  /** Placeholder cover art wash. */
  coverFallback: ['#1B1C20', '#17181B'] as const,
  /** Bottom-of-cover scrim so titles can sit on artwork. */
  coverScrim: ['rgba(6,6,7,0)', 'rgba(6,6,7,0.55)', 'rgba(6,6,7,0.92)'] as const,

  /** Ripple washes — soft, low-opacity rings drifting behind content. */
  rippleSignal: ['rgba(224,149,79,0.16)', 'rgba(224,149,79,0)'] as const,
  rippleWave: ['rgba(70,166,156,0.14)', 'rgba(70,166,156,0)'] as const,
} as const;

export const layout = {
  /** Generous padding for main screen containers. */
  screenPadding: 20,
  /** Cards and sheets. */
  radius: 14,
  /** Buttons and inputs — slightly tighter than cards. */
  radiusControl: 12,
  /** Cover art thumbnails — sharper, archival rather than "app icon" round. */
  radiusCover: 8,

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
  /** Restrained signal glow — reserved for the single active/primary control. */
  glowPrimary: {
    shadowColor: palette.primary,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
} as const;

/** Shared motion timing — every animation should reach for one of these. */
export const motion = {
  duration: {
    fast: 120,
    base: 200,
    slow: 360,
  },
  easing: {
    standard: [0.4, 0, 0.2, 1] as const,
    decelerate: [0, 0, 0.2, 1] as const,
    accelerate: [0.4, 0, 1, 1] as const,
  },
} as const;

export const theme = { palette, gradients, layout, typeScale, shadows, motion } as const;
export default theme;
