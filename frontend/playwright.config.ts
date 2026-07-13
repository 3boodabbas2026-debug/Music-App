import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Animated Expo screens are CPU-heavy when many Chromium instances mount
  // together on Windows. Three workers keeps the suite parallel without
  // turning healthy interaction checks into scheduler-driven timeouts.
  timeout: 60_000,
  workers: 3,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    // Generic interaction checks do not need ambient motion. The dedicated
    // living-forest test explicitly opts back into no-preference.
    contextOptions: { reducedMotion: 'reduce' },
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'off',
  },
  webServer: {
    command: 'node scripts/serve-dist.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});
