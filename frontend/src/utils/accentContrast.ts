import { palette } from '../theme/theme';

type Rgb = { r: number; g: number; b: number };

/** WCAG's minimum non-text contrast for meaningful UI controls. */
export const TRACK_ACCENT_MIN_CONTRAST = 3;

/**
 * The brightest solid surface an artwork-derived accent is placed against.
 * Glass panes remain darker than this after compositing over the night sky,
 * so clearing this surface also keeps the accent visible on glass.
 */
export const TRACK_ACCENT_CONTRAST_SURFACE = palette.surfaceElevated;

function hexToRgb(color: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;

  return { h: ((h * 60) + 360) % 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = h / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green] = [chroma, secondary];
  else if (segment < 2) [red, green] = [secondary, chroma];
  else if (segment < 3) [green, blue] = [chroma, secondary];
  else if (segment < 4) [green, blue] = [secondary, chroma];
  else if (segment < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];

  const offset = l - chroma / 2;
  return {
    r: (red + offset) * 255,
    g: (green + offset) * 255,
    b: (blue + offset) * 255,
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function colorContrastRatio(foreground: string, background: string): number {
  const foregroundRgb = hexToRgb(foreground);
  const backgroundRgb = hexToRgb(background);
  if (!foregroundRgb || !backgroundRgb) return 1;
  const light = Math.max(relativeLuminance(foregroundRgb), relativeLuminance(backgroundRgb));
  const dark = Math.min(relativeLuminance(foregroundRgb), relativeLuminance(backgroundRgb));
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Raises only HSL lightness until an artwork color is visible on Star Hollow's
 * brightest dark surface. Hue and saturation stay intact, so the result still
 * belongs to the cover instead of falling back to a generic brand color.
 */
export function ensureTrackAccentContrast(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  if (colorContrastRatio(color, TRACK_ACCENT_CONTRAST_SURFACE) >= TRACK_ACCENT_MIN_CONTRAST) return color;

  const { h, s, l } = rgbToHsl(rgb);
  let low = l;
  let high = 1;
  let best = '#ffffff';

  // Binary search keeps the adjustment as small as possible. Compare the
  // rounded hex result on each pass so the returned color always clears the
  // floor after channel quantization.
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    const candidate = rgbToHex(hslToRgb(h, s, mid));
    if (colorContrastRatio(candidate, TRACK_ACCENT_CONTRAST_SURFACE) >= TRACK_ACCENT_MIN_CONTRAST) {
      best = candidate;
      high = mid;
    } else {
      low = mid;
    }
  }

  return best;
}
