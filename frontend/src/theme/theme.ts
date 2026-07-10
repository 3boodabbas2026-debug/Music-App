/**
 * "Duskglen" design system — the single source of truth for the app's look.
 *
 * Visual concept: a hollow in a night forest, lit by one glowing moon. Deep
 * pine-black and midnight-green grounds; moon-silver text; an aurora-teal
 * signal accent (the glow itself) with a soft-violet secondary and a rare
 * star-gold reserved for genuinely premium moments (Sanctuary Mode, starred
 * items) — not a UI colour, a highlight.
 */

export const palette = {
  /** Global app background — pine black, a hair warmer than pure black. */
  background: '#0A0F0D',
  /** Deepest background, behind ambient washes. */
  void: '#050805',
  /** Cards, sheets and other raised containers — midnight green-navy. */
  surface: '#121C18',
  /** A slightly brighter surface for pressed / highlighted states. */
  surfaceBright: '#1B2924',
  /** Primary accent — aurora teal. Interactive elements, progress, glow. */
  primary: '#2FBFAA',
  /** Secondary accent — soft violet. Secondary highlights, links. */
  secondary: '#9B8FD9',
  /** Rare premium accent — star gold. Sanctuary Mode, favourites, badges only. */
  gold: '#E8C468',
  /** Primary copy — moon silver. */
  textPrimary: '#E7EBE6',
  /** Secondary copy on dark surfaces. */
  textSecondary: '#A7B0A8',
  /** De-emphasised copy: captions, metadata, placeholders. */
  textMuted: '#6C766C',

  success: '#5FBF8E',
  danger: '#E0685F',
} as const;

export const gradients = {
  /** Signature accent sweep: aurora teal into soft violet. Used sparingly. */
  accent: [palette.primary, palette.secondary] as const,
  /** Full sweep incl. gold — reserved for Sanctuary Mode and one hero moment. */
  aurora: [palette.primary, palette.secondary, palette.gold] as const,
  /** Subtle card wash — barely-lifted midnight green, no loud colour. */
  heroCard: ['#121C18', '#152420', '#121C18'] as const,
  /** Ambient screen background at rest — night-sky navy warming into deep
   * forest green toward the horizon, so the sky has visible depth instead of
   * reading as one flat near-black. */
  screenIdle: ['#04080C', '#081411', '#0D1F17'] as const,
  /** Ambient screen background while the mic is hot — aurora drift. */
  screenListening: ['#08201B', '#0C2620', '#0A0F0D'] as const,
  /** Placeholder cover art wash. */
  coverFallback: ['#152420', '#121C18'] as const,
  /** Bottom-of-cover scrim so titles can sit on artwork. */
  coverScrim: ['rgba(5,8,5,0)', 'rgba(5,8,5,0.55)', 'rgba(5,8,5,0.92)'] as const,

  /** Ripple/aurora washes — soft, low-opacity light drifting behind content. */
  rippleSignal: ['rgba(47,191,170,0.16)', 'rgba(47,191,170,0)'] as const,
  rippleWave: ['rgba(155,143,217,0.14)', 'rgba(155,143,217,0)'] as const,
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

  /** Sidebar rail width on desktop. */
  sidebarWidth: 248,
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
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  /** Restrained aurora glow — reserved for the single active/primary control. */
  glowPrimary: {
    shadowColor: palette.primary,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  /** Rare gold glow — Sanctuary Mode, favourites, premium badges only. */
  glowGold: {
    shadowColor: palette.gold,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
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
