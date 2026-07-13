import { expect, test } from '@playwright/test';

import {
  colorContrastRatio,
  ensureTrackAccentContrast,
  TRACK_ACCENT_CONTRAST_SURFACE,
  TRACK_ACCENT_MIN_CONTRAST,
} from '../src/utils/accentContrast';

function hue(color: string): number {
  const value = Number.parseInt(color.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => channel / 255);
  const [red, green, blue] = channels;
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const delta = max - min;
  if (delta === 0) return 0;
  if (max === red) return ((((green - blue) / delta) % 6) * 60 + 360) % 360;
  if (max === green) return ((blue - red) / delta + 2) * 60;
  return ((red - green) / delta + 4) * 60;
}

test('raises a dark artwork accent to the UI contrast floor', () => {
  const adjusted = ensureTrackAccentContrast('#35101f');

  expect(adjusted).not.toBe('#35101f');
  expect(colorContrastRatio(adjusted, TRACK_ACCENT_CONTRAST_SURFACE)).toBeGreaterThanOrEqual(
    TRACK_ACCENT_MIN_CONTRAST,
  );
});

test('preserves the sampled hue while raising lightness', () => {
  const original = '#35101f';
  const adjusted = ensureTrackAccentContrast(original);
  const hueDistance = Math.abs(hue(original) - hue(adjusted));

  expect(Math.min(hueDistance, 360 - hueDistance)).toBeLessThan(1);
});

test('leaves an already-visible accent unchanged', () => {
  expect(ensureTrackAccentContrast('#63d6b5')).toBe('#63d6b5');
});

test('returns an unsupported color unchanged', () => {
  expect(ensureTrackAccentContrast('rgba(20, 30, 40, 0.8)')).toBe('rgba(20, 30, 40, 0.8)');
});
