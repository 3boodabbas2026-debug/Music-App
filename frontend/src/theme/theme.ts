import type { TextStyle } from 'react-native';

import { initialThemeScheme, supportsCssVariables } from './themePlatform';

export type ThemeScheme = 'light' | 'dark';

type ColorScale<T extends Record<string, string>> = { readonly [K in keyof T]: string };

const darkPaletteSeed = {
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

const darkAmbientSeed = {
  ridgeBack: '#0A2027',
  ridgeFront: '#061119',
} as const;

const darkGlassSeed = {
  fill: 'rgba(13, 26, 36, 0.45)',
  fillBright: 'rgba(24, 44, 58, 0.5)',
  fillDeep: 'rgba(5, 12, 19, 0.5)',
  fillHeavy: 'rgba(10, 21, 30, 0.68)',
  stroke: 'rgba(148, 186, 210, 0.16)',
  strokeStrong: 'rgba(170, 206, 229, 0.30)',
  strokeModal: 'rgba(188, 218, 236, 0.38)',
  edge: 'rgba(255, 255, 255, 0.16)',
  edgeQuiet: 'rgba(255, 255, 255, 0.08)',
  edgeRaised: 'rgba(255, 255, 255, 0.16)',
  edgeModal: 'rgba(255, 255, 255, 0.24)',
  tintPrimary: 'rgba(99, 214, 181, 0.18)',
  tintPrimaryStroke: 'rgba(99, 214, 181, 0.44)',
  tintWarning: 'rgba(233, 205, 126, 0.10)',
  tintWarningStroke: 'rgba(233, 205, 126, 0.34)',
  tintSuccess: 'rgba(113, 206, 156, 0.10)',
  tintSuccessStroke: 'rgba(113, 206, 156, 0.34)',
  tintDanger: 'rgba(240, 131, 140, 0.12)',
  tintDangerStroke: 'rgba(240, 131, 140, 0.30)',
} as const;

const lightPaletteSeed: ColorScale<typeof darkPaletteSeed> = {
  background: '#EAF1EB',
  void: '#D7E3DA',
  surface: '#F3F8F4',
  surfaceBright: '#FAFCFA',
  surfaceElevated: '#DCE8DF',
  border: '#B6CABB',
  borderStrong: '#88A492',
  primary: '#176F59',
  primaryPressed: '#105846',
  secondary: '#71678F',
  gold: '#7B6328',
  textPrimary: '#13251B',
  textSecondary: '#385143',
  textMuted: '#65796D',
  textInverse: '#F4FFF8',
  success: '#267749',
  warning: '#856515',
  danger: '#B63D4C',
};

const lightAmbientSeed: ColorScale<typeof darkAmbientSeed> = {
  ridgeBack: '#B5CABD',
  ridgeFront: '#8DA995',
};

const lightGlassSeed: ColorScale<typeof darkGlassSeed> = {
  fill: 'rgba(244, 249, 245, 0.64)',
  fillBright: 'rgba(250, 252, 250, 0.78)',
  fillDeep: 'rgba(219, 232, 222, 0.68)',
  fillHeavy: 'rgba(241, 247, 242, 0.90)',
  stroke: 'rgba(35, 75, 53, 0.15)',
  strokeStrong: 'rgba(28, 67, 46, 0.27)',
  strokeModal: 'rgba(24, 62, 42, 0.34)',
  edge: 'rgba(255, 255, 255, 0.84)',
  edgeQuiet: 'rgba(255, 255, 255, 0.54)',
  edgeRaised: 'rgba(255, 255, 255, 0.84)',
  edgeModal: 'rgba(255, 255, 255, 0.96)',
  tintPrimary: 'rgba(23, 111, 89, 0.13)',
  tintPrimaryStroke: 'rgba(23, 111, 89, 0.38)',
  tintWarning: 'rgba(133, 101, 21, 0.09)',
  tintWarningStroke: 'rgba(133, 101, 21, 0.30)',
  tintSuccess: 'rgba(38, 119, 73, 0.09)',
  tintSuccessStroke: 'rgba(38, 119, 73, 0.30)',
  tintDanger: 'rgba(182, 61, 76, 0.09)',
  tintDangerStroke: 'rgba(182, 61, 76, 0.28)',
};

function themedColor(group: string, key: string, darkFallback: string, lightFallback = darkFallback): string {
  if (supportsCssVariables) return `var(--sh-${group}-${key}, ${darkFallback})`;
  return initialThemeScheme === 'light' ? lightFallback : darkFallback;
}

function themedScale<T extends Record<string, string>>(group: string, dark: T, light: ColorScale<T>): ColorScale<T> {
  return Object.fromEntries(
    Object.entries(dark).map(([key, value]) => [key, themedColor(group, key, value, light[key])]),
  ) as ColorScale<T>;
}

/**
 * Semantic colors intentionally resolve through CSS custom properties on web.
 * The shipped Capacitor app runs this web build, so every existing StyleSheet
 * consumer updates immediately without leaving static dark islands behind.
 */
export const palette = themedScale('palette', darkPaletteSeed, lightPaletteSeed);
export const ambient = themedScale('ambient', darkAmbientSeed, lightAmbientSeed);
export const glass = themedScale('glass', darkGlassSeed, lightGlassSeed);

const darkGradients = {
  accent: [darkPaletteSeed.primary, '#8FE3C8'] as const,
  aurora: ['#5BD3B0', '#7FB6D9', darkPaletteSeed.secondary] as const,
  heroCard: [darkPaletteSeed.surfaceBright, darkPaletteSeed.surface] as const,
  screenIdle: ['#050911', '#08131A', '#0B191F'] as const,
  screenListening: ['#0E2019', '#0A1512', darkPaletteSeed.background] as const,
  coverFallback: ['#16281F', '#0D1512'] as const,
  coverScrim: ['rgba(5,10,11,0)', 'rgba(5,10,11,0.52)', 'rgba(5,10,11,0.94)'] as const,
  rippleSignal: ['rgba(99,214,181,0.10)', 'rgba(99,214,181,0)'] as const,
  rippleWave: ['rgba(169,155,219,0.07)', 'rgba(169,155,219,0)'] as const,
  screenHorizon: ['#050911', '#08131A', '#0B191F'] as const,
  heroGlass: ['rgba(32,54,44,0.72)', 'rgba(13,26,36,0.42)'] as const,
  artworkScrim: ['rgba(5,10,11,0)', 'rgba(5,10,11,0.52)', 'rgba(5,10,11,0.94)'] as const,
  playerScrim: ['rgba(5,10,11,0.08)', 'rgba(5,10,11,0.72)', 'rgba(5,10,11,0.96)'] as const,
  liveProgress: [darkPaletteSeed.primary, '#8FE3C8'] as const,
  celebratorySheen: ['rgba(233,205,126,0.12)', 'rgba(99,214,181,0.06)', 'rgba(233,205,126,0)'] as const,
};

type GradientScale<T extends Record<string, readonly string[]>> = {
  readonly [K in keyof T]: readonly string[];
};

const lightGradients: GradientScale<typeof darkGradients> = {
  accent: ['#176F59', '#2A8C70'],
  aurora: ['#4AA88D', '#79AFC4', '#8270B9'],
  heroCard: ['#FFFFFF', '#EEF5EF'],
  screenIdle: ['#F4F8F4', '#E7F0E9', '#DDE9E1'],
  screenListening: ['#E2EEE6', '#F2F7F3', '#EAF1EB'],
  coverFallback: ['#C8DBCE', '#9DB7A7'],
  // Artwork scrims stay dark so white overlay labels remain legible.
  coverScrim: ['rgba(5,10,11,0)', 'rgba(5,10,11,0.42)', 'rgba(5,10,11,0.88)'],
  rippleSignal: ['rgba(23,111,89,0.12)', 'rgba(23,111,89,0)'],
  rippleWave: ['rgba(104,86,163,0.08)', 'rgba(104,86,163,0)'],
  screenHorizon: ['#F2F7F3', '#E7F0E9', '#DDE9E1'],
  heroGlass: ['rgba(250,252,250,0.86)', 'rgba(220,232,223,0.62)'],
  artworkScrim: ['rgba(5,10,11,0)', 'rgba(5,10,11,0.42)', 'rgba(5,10,11,0.88)'],
  playerScrim: ['rgba(234,241,235,0.10)', 'rgba(234,241,235,0.76)', 'rgba(234,241,235,0.96)'],
  liveProgress: ['#176F59', '#2A8C70'],
  celebratorySheen: ['rgba(123,99,40,0.12)', 'rgba(23,111,89,0.05)', 'rgba(123,99,40,0)'],
};

function themedGradient<K extends keyof typeof darkGradients>(key: K): typeof darkGradients[K] {
  return darkGradients[key].map((value, index) =>
    themedColor(`gradient-${key}`, String(index), value, lightGradients[key][index] ?? value),
  ) as unknown as typeof darkGradients[K];
}

export const gradients = {
  accent: themedGradient('accent'),
  aurora: themedGradient('aurora'),
  heroCard: themedGradient('heroCard'),
  screenIdle: themedGradient('screenIdle'),
  screenListening: themedGradient('screenListening'),
  coverFallback: themedGradient('coverFallback'),
  coverScrim: themedGradient('coverScrim'),
  rippleSignal: themedGradient('rippleSignal'),
  rippleWave: themedGradient('rippleWave'),
  screenHorizon: themedGradient('screenHorizon'),
  heroGlass: themedGradient('heroGlass'),
  artworkScrim: themedGradient('artworkScrim'),
  playerScrim: themedGradient('playerScrim'),
  liveProgress: themedGradient('liveProgress'),
  celebratorySheen: themedGradient('celebratorySheen'),
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
  grid: {
    phone: { columns: 4, gutter: 16, inset: 20 },
    tablet: { columns: 8, gutter: 24, inset: 32 },
    desktop: { columns: 12, gutter: 24, inset: 32 },
    maxWidth: { reading: 720, standard: 1100, wide: 1280 },
  },
} as const;

export const typeScale = {
  display: { fontFamily: 'Sora_700Bold', fontSize: 38, lineHeight: 44, letterSpacing: -1.35 },
  screenTitle: { fontFamily: 'Sora_700Bold', fontSize: 32, lineHeight: 39, letterSpacing: -1 },
  sectionTitle: { fontFamily: 'Sora_600SemiBold', fontSize: 23, lineHeight: 30, letterSpacing: -0.45 },
  cardTitle: { fontFamily: 'Sora_600SemiBold', fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: 'Sora_400Regular', fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  label: { fontFamily: 'Sora_600SemiBold', fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  metadata: { fontFamily: 'Sora_400Regular', fontSize: 12, lineHeight: 18, letterSpacing: 0.1 },
  numeric: {
    fontFamily: 'Sora_600SemiBold', fontSize: 13, lineHeight: 18, letterSpacing: 0.1,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  },
  // Legacy role aliases remain while screens migrate incrementally.
  mega: { fontFamily: 'Sora_700Bold', fontSize: 38, lineHeight: 44, letterSpacing: -1.35 },
  hero: { fontFamily: 'Sora_700Bold', fontSize: 32, lineHeight: 39, letterSpacing: -1 },
  heading: { fontFamily: 'Sora_600SemiBold', fontSize: 23, lineHeight: 30, letterSpacing: -0.45 },
  eyebrow: {
    fontFamily: 'Sora_600SemiBold', fontSize: 11, lineHeight: 16, letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
} as const;

const shadowColors = {
  dark: { low: '#000000', card: '#000000', floating: '#020807', modal: '#020706' },
  light: { low: '#557060', card: '#496553', floating: '#3C5846', modal: '#304B3A' },
} as const;

export const shadows = {
  low: {
    shadowColor: themedColor('shadow', 'low', shadowColors.dark.low, shadowColors.light.low), shadowOpacity: 0.12, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  card: {
    shadowColor: themedColor('shadow', 'card', shadowColors.dark.card, shadowColors.light.card), shadowOpacity: 0.2, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  floating: {
    shadowColor: themedColor('shadow', 'floating', shadowColors.dark.floating, shadowColors.light.floating), shadowOpacity: 0.24, shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 }, elevation: 9,
  },
  modal: {
    shadowColor: themedColor('shadow', 'modal', shadowColors.dark.modal, shadowColors.light.modal), shadowOpacity: 0.32, shadowRadius: 34,
    shadowOffset: { width: 0, height: 18 }, elevation: 16,
  },
  glowPrimary: {
    shadowColor: palette.primary, shadowOpacity: 0.16, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  glowGold: {
    shadowColor: palette.gold, shadowOpacity: 0.2, shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
} as const;

export const motion = {
  duration: { instant: 80, fast: 120, base: 200, slow: 320, continuous: 2600 },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.4, 0, 1, 1] as const,
  },
  stagger: { item: 36, chapter: 64, max: 220 },
  spring: { pressSpeed: 42, returnSpeed: 34 },
} as const;

export const literalThemes = {
  dark: {
    palette: darkPaletteSeed,
    ambient: darkAmbientSeed,
    glass: darkGlassSeed,
    gradients: darkGradients,
  },
  light: {
    palette: lightPaletteSeed,
    ambient: lightAmbientSeed,
    glass: lightGlassSeed,
    gradients: lightGradients,
  },
} as const;

export function applyWebTheme(scheme: ThemeScheme): void {
  if (!supportsCssVariables || typeof document === 'undefined') return;
  const selected = literalThemes[scheme];
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
  for (const [key, value] of Object.entries(selected.palette)) root.style.setProperty(`--sh-palette-${key}`, value);
  for (const [key, value] of Object.entries(selected.ambient)) root.style.setProperty(`--sh-ambient-${key}`, value);
  for (const [key, value] of Object.entries(selected.glass)) root.style.setProperty(`--sh-glass-${key}`, value);
  for (const [name, stops] of Object.entries(selected.gradients)) {
    stops.forEach((value, index) => root.style.setProperty(`--sh-gradient-${name}-${index}`, value));
  }
  for (const [key, value] of Object.entries(shadowColors[scheme])) root.style.setProperty(`--sh-shadow-${key}`, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', selected.palette.background);
}

export const theme = { palette, ambient, glass, gradients, layout, typeScale, shadows, motion } as const;
export default theme;
