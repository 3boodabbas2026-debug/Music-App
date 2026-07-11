import { expect, test } from '@playwright/test';

const user = {
  id: 'smoke-user',
  email: 'smoke@duskglen.test',
  display_name: 'Smoke Test',
  storage_preference: 'default',
  is_admin: false,
  cloud_storage_available: false,
  created_at: new Date().toISOString(),
};

async function mockApi(page: import('@playwright/test').Page, library: unknown[] = []) {
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
      const query = (url.searchParams.get('q') ?? '').toLowerCase();
      const filtered = query
        ? library.filter((item: any) => `${item.title} ${item.artist}`.toLowerCase().includes(query))
        : library;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(filtered) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByText('Welcome back', { exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Log in' }).click();
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const contentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        return contentWidth - viewportWidth;
      }),
    )
    .toBeLessThanOrEqual(1);
}

test('the 390px mobile shell navigates across every primary destination without errors or overflow', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await mockApi(page);
  await login(page);

  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });

  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Media link' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  await expectNoHorizontalOverflow(page);

  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(page.getByText('YOUR MUSIC', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search title or artist')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('tab', { name: 'Identify' }).click();
  await expect(page.getByText('What’s playing?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start listening' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByText('YOUR IMPORTS', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing in motion', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('tab', { name: 'Today' }).click();
  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(pageErrors).toEqual([]);
});

test('an expired access token refreshes without logging the user out', async ({ page }) => {
  let refreshCalls = 0;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/login')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'expired-access', refresh_token: 'valid-refresh', token_type: 'bearer', user }),
      });
      return;
    }
    if (url.pathname.endsWith('/auth/refresh')) {
      refreshCalls += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'fresh-access', token_type: 'bearer' }),
      });
      return;
    }
    if (url.pathname.endsWith('/library') && route.request().headers().authorization === 'Bearer expired-access') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Expired token' }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });

  await login(page);
  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();
  await expect.poll(() => refreshCalls).toBe(1);
  await expect(page.getByText('Welcome back', { exact: true })).toHaveCount(0);
});

test('a 520-track library stays virtualized, searchable, and selectable', async ({ page }) => {
  const library = Array.from({ length: 520 }, (_, index) => ({
    id: `track-${index}`,
    media_type: 'audio',
    source: 'other_url',
    source_url: null,
    title: `Track ${index}`,
    artist: `Artist ${index % 20}`,
    album: `Album ${Math.floor(index / 10)}`,
    thumbnail_url: null,
    recognized_title: null,
    recognized_artist: null,
    genre: ['Ambient', 'Electronic', 'Jazz'][index % 3],
    release_year: 2000 + (index % 25),
    is_remix: index % 7 === 0,
    fade_in_ms: null,
    fade_out_ms: null,
    duration_seconds: 180 + index,
    created_at: new Date(Date.now() - index * 1000).toISOString(),
  }));

  await mockApi(page, library);
  await login(page);
  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(page.getByPlaceholder('Search title or artist')).toBeVisible();

  const renderedRows = await page.getByText(/^Track \d+$/).count();
  expect(renderedRows).toBeGreaterThan(0);
  expect(renderedRows).toBeLessThan(80);

  await page.getByPlaceholder('Search title or artist').fill('Track 519');
  const targetCard = page.getByRole('button', { name: /^Track 519, Artist 19, Ambient.*2019$/ });
  await expect(targetCard).toHaveCount(1);
  await expect(targetCard).toBeVisible();
  await page.getByRole('button', { name: 'Select tracks' }).click();
  await targetCard.click();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
});
