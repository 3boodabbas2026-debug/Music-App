import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

function pngDimensions(relativePath: string): { width: number; height: number } {
  const bytes = fs.readFileSync(path.join(process.cwd(), relativePath));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('the shared icon source produces every required install surface', async () => {
  const expectedPngs: Record<string, number> = {
    'assets/icon.png': 1024,
    'assets/favicon.png': 196,
    'assets/android-icon-foreground.png': 1024,
    'assets/android-icon-background.png': 1024,
    'assets/android-icon-monochrome.png': 1024,
    'assets-capacitor/icon-only.png': 1024,
    'assets-capacitor/icon-foreground.png': 1024,
    'assets-capacitor/icon-background.png': 1024,
    'public/icons/icon-192.png': 192,
    'public/icons/icon-512.png': 512,
    'public/icons/icon-maskable-192.png': 192,
    'public/icons/icon-maskable-512.png': 512,
    'public/icons/apple-touch-icon.png': 180,
    'android/app/src/main/res/drawable-nodpi/ic_launcher_monochrome.png': 1024,
  };

  for (const [asset, size] of Object.entries(expectedPngs)) {
    expect(pngDimensions(asset), asset).toEqual({ width: size, height: size });
  }

  const vector = fs.readFileSync(path.join(process.cwd(), 'assets/starhollow-icon.svg'), 'utf8');
  expect(vector).toContain('viewBox="0 0 1024 1024"');
  expect(vector).toContain('id="sh-star"');

  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/manifest.json'), 'utf8'));
  expect(manifest.icons).toHaveLength(4);
  expect(manifest.share_target).toEqual({
    action: '/?share=1',
    method: 'GET',
    params: { title: 'title', text: 'text', url: 'url' },
  });
});
