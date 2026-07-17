import { expect, test } from '@playwright/test';

const user = {
  id: 'player-more-user',
  email: 'player-more@starhollow.test',
  display_name: 'Player Details Test',
  storage_preference: 'auto',
  is_admin: false,
  cloud_storage_available: false,
};

const track = {
  id: 'rich-track',
  media_type: 'audio',
  source: 'telegram',
  source_url: null,
  title: 'Midnight Signal',
  artist: 'The Hollow',
  album: 'Afterglow',
  thumbnail_url: null,
  recognized_title: null,
  recognized_artist: null,
  genre: 'Ambient',
  release_year: 2025,
  is_remix: true,
  fade_in_ms: null,
  fade_out_ms: null,
  duration_seconds: 245,
  file_size_bytes: 8 * 1024 * 1024,
  original_filename: 'midnight-signal.mp3',
  mime_type: 'audio/mpeg',
  created_at: '2026-07-13T10:30:00Z',
};

test('More exposes full track actions, rich details, and persisted playback settings', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/login')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'access', refresh_token: 'refresh', token_type: 'bearer', user }),
      });
      return;
    }
    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    if (url.pathname.endsWith('/library') && route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([track]) });
      return;
    }
    if (url.pathname.endsWith('/stream')) {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: /Midnight Signal, The Hollow/ }).click();

  await expect(page.getByText('NOW PLAYING', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More player options' }).last().click();

  await expect(page.getByRole('tab', { name: 'Track' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Play next for Midnight Signal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to playlist for Midnight Signal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to favorites for Midnight Signal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete for Midnight Signal' })).toBeVisible();
  await expect(page.getByLabel('Album: Afterglow')).toBeVisible();
  await expect(page.getByLabel('Genre: Ambient')).toBeVisible();
  await expect(page.getByLabel('Released: 2025')).toBeVisible();
  await expect(page.getByLabel('Duration: 4:05')).toBeVisible();
  await expect(page.getByLabel('Source: Telegram')).toBeVisible();
  await expect(page.getByLabel('File: MP3 · 8.0 MB')).toBeVisible();
  await expect(page.getByText('Remix', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Playback' }).click();
  await expect(page.getByRole('tab', { name: 'Playback' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Smooth transitions')).toBeChecked();
  await expect(page.getByLabel('Keep the music going')).toBeChecked();
  await page.getByLabel('Smooth transitions').click();
  await expect(page.getByLabel('Smooth transitions')).not.toBeChecked();
});
