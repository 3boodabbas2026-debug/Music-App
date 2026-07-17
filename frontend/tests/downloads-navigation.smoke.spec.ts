import { expect, test, type Page } from '@playwright/test';

const user = {
  id: 'navigation-download-user',
  email: 'paging@starhollow.test',
  display_name: 'Paging Listener',
  storage_preference: 'auto',
  is_admin: false,
  cloud_storage_available: false,
};

function job(id: string, sourceUrl: string, status: 'complete' | 'failed' = 'complete') {
  const now = new Date().toISOString();
  return {
    id,
    job_type: 'download',
    status,
    progress_pct: status === 'complete' ? 100 : 38,
    stage_label: status === 'complete' ? 'Added to library' : 'Download failed',
    source_url: sourceUrl,
    error_message: status === 'failed' ? 'This source is unavailable' : null,
    result_media: null,
    match_title: null,
    match_artist: null,
    match_thumbnail_url: null,
    batch_total: null,
    batch_processed: null,
    batch_matched: null,
    batch_failed: null,
    created_at: now,
    updated_at: now,
  };
}

async function mockApi(
  page: Page,
  submittedBodies: Array<Record<string, unknown>> = [],
  library: Array<Record<string, unknown>> = [],
) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
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
    if (url.pathname.endsWith('/library') && request.method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(library) });
      return;
    }
    if (url.pathname.endsWith('/stream')) {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' });
      return;
    }
    if (url.pathname.endsWith('/downloads/inspect') && request.method() === 'POST') {
      const body = request.postDataJSON() as { url: string };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ url: body.url, is_playlist: true, playlist_title: 'Night Drive', entry_count: 18 }),
      });
      return;
    }
    if (url.pathname.endsWith('/downloads') && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown> & { urls: string[] };
      submittedBodies.push(body);
      const jobs = body.urls.map((sourceUrl, index) =>
        job(`download-${submittedBodies.length}-${index}`, sourceUrl, body.urls.length > 1 && index === 1 ? 'failed' : 'complete'),
      );
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(jobs) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
}

async function login(page: Page, path = '/') {
  await page.goto(path);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('gesture-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewport;
      }),
    )
    .toBeLessThanOrEqual(1);
}

test('mobile swipes page tabs, preserve vertical scrolling, and prioritize the left edge drawer', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await drag(page, { x: 205, y: 190 }, { x: 214, y: 430 });
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');

  await drag(page, { x: 320, y: 190 }, { x: 70, y: 190 });
  await expect(page.getByRole('tab', { name: 'Library' })).toHaveAttribute('aria-selected', 'true');

  await drag(page, { x: 80, y: 190 }, { x: 320, y: 190 });
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');

  await drag(page, { x: 90, y: 190 }, { x: 330, y: 190 });
  await expect(page.getByText('Settings', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();

  await drag(page, { x: 5, y: 190 }, { x: 220, y: 190 });
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible();
});

test('shared multi-link input queues per-link jobs and keeps full-playlist expansion opt-in', async ({ page }) => {
  const submittedBodies: Array<Record<string, unknown>> = [];
  await mockApi(page, submittedBodies);
  const first = 'https://example.com/watch/first';
  const second = 'https://example.com/watch/second';
  const sharePath = `/?share=1&url=${encodeURIComponent(first)}&url=${encodeURIComponent(second)}`;
  await login(page, sharePath);

  const input = page.getByRole('textbox', { name: 'Media link' });
  await expect(input).toHaveValue(`${first}\n${second}`);
  await page.getByRole('button', { name: 'Add 2 links to library' }).click();

  await expect.poll(() => submittedBodies.length).toBe(1);
  expect(submittedBodies[0]).toMatchObject({ urls: [first, second], media_type: 'audio' });
  await expect(page.getByText('LATEST IMPORT', { exact: true })).toBeVisible();
  await expect(page.getByText('1/2 added', { exact: true })).toBeVisible();
  await expect(page.getByText('This source is unavailable', { exact: true })).toBeVisible();

  const playlistUrl = 'https://www.youtube.com/watch?v=track&list=PL-night-drive';
  await input.fill(playlistUrl);
  const playlistToggle = page.getByLabel('Download full playlist', { exact: true });
  await expect(playlistToggle).toBeVisible();
  await expect(playlistToggle).not.toBeChecked();
  await playlistToggle.click();
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();

  await expect.poll(() => submittedBodies.length).toBe(2);
  expect(submittedBodies[1]).toMatchObject({ urls: [playlistUrl], download_playlist: true });
});

test('Home import, Settings, and Player actions stay reachable on compact phone viewports', async ({ page }) => {
  const track = {
    id: 'compact-player-track',
    media_type: 'audio',
    source: 'telegram',
    source_url: null,
    title: 'Small Screen Signal',
    artist: 'The Hollow',
    album: null,
    thumbnail_url: null,
    recognized_title: null,
    recognized_artist: null,
    genre: null,
    release_year: null,
    is_remix: null,
    fade_in_ms: null,
    fade_out_ms: null,
    duration_seconds: 180,
    file_size_bytes: 4_000_000,
    original_filename: 'small-screen.mp3',
    mime_type: 'audio/mpeg',
    created_at: new Date().toISOString(),
  };
  await page.setViewportSize({ width: 360, height: 640 });
  await mockApi(page, [], [track]);
  await login(page);

  await expect(page.getByRole('textbox', { name: 'Media link' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Settings', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const settingsButtonsFit = await page.getByRole('button').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1;
      }),
  );
  expect(settingsButtonsFit).toBe(true);

  await page.getByRole('button', { name: 'Go back' }).click();
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: /Small Screen Signal, The Hollow/ }).click();
  await expect(page.getByText('NOW PLAYING', { exact: true })).toBeVisible();

  for (const label of ['Open queue', 'Open lyrics', 'Enter Sanctuary Mode'] as const) {
    const action = page.getByRole('button', { name: label });
    await action.scrollIntoViewIfNeeded();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(361);
  }
  const more = page.getByRole('button', { name: 'More player options' }).last();
  await more.scrollIntoViewIfNeeded();
  const moreBox = await more.boundingBox();
  expect(moreBox).not.toBeNull();
  expect(moreBox!.x + moreBox!.width).toBeLessThanOrEqual(361);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole('button', { name: 'Open queue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More player options' }).last()).toBeVisible();
});
