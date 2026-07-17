import { expect, test } from '@playwright/test';

const user = {
  id: 'smoke-user',
  email: 'smoke@starhollow.test',
  display_name: 'Smoke Test',
  storage_preference: 'default',
  is_admin: false,
  cloud_storage_available: false,
  created_at: new Date().toISOString(),
};

function videoFixture(id: string, title: string, createdAt: string) {
  return {
    id,
    media_type: 'video',
    source: 'other_url',
    source_url: null,
    title,
    artist: 'Star Hollow Studio',
    album: null,
    thumbnail_url: null,
    recognized_title: null,
    recognized_artist: null,
    genre: null,
    release_year: null,
    is_remix: null,
    fade_in_ms: null,
    fade_out_ms: null,
    duration_seconds: 120,
    created_at: createdAt,
  };
}

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

test('remembered account profiles prefill sign-in without persisting credentials', async ({ page }) => {
  const remembered = [{
    user: { ...user, id: 'remembered-user', email: 'remembered@starhollow.test', display_name: 'Remembered Listener' },
    lastUsedAt: new Date().toISOString(),
  }];
  await page.addInitScript((accounts) => {
    localStorage.setItem('sma.rememberedAccounts.v1', JSON.stringify(accounts));
  }, remembered);

  await page.goto('/');
  await expect(page.getByText('ACCOUNTS ON THIS DEVICE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in as Remembered Listener' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('remembered@starhollow.test');
  const stored = await page.evaluate(() => localStorage.getItem('sma.rememberedAccounts.v1') ?? '');
  expect(stored).not.toContain('password');
  expect(stored).not.toContain('access_token');
  expect(stored).not.toContain('refresh_token');
});

test('the 390px mobile shell navigates across every primary destination without errors or overflow', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await mockApi(page);
  await login(page);

  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });

  await expect(page.getByTestId('forest-backdrop-app')).toBeVisible();
  const atmosphere = page.getByTestId('forest-atmosphere');
  await expect(atmosphere).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const opaqueAtmosphereCover = await atmosphere.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [...element.children].some((child) => {
      const childBounds = child.getBoundingClientRect();
      const style = window.getComputedStyle(child);
      const coversScreen = childBounds.width >= bounds.width * 0.95 && childBounds.height >= bounds.height * 0.95;
      return coversScreen && style.backgroundImage !== 'none' && Number.parseFloat(style.opacity) > 0.9;
    });
  });
  expect(opaqueAtmosphereCover).toBe(false);
  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Media link' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await expect
    .poll(() =>
      page.getByRole('tab', { name: 'Today' }).evaluate((element) => {
        let current: Element | null = element;
        while (current) {
          if (Number.parseFloat(window.getComputedStyle(current).opacity) === 0) return true;
          current = current.parentElement;
        }
        return false;
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Expand navigation' }).click();
  await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible();

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
    media_type: index === 519 ? 'video' : 'audio',
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
  const durationBadge = targetCard.getByText('11:39', { exact: true });
  await expect(targetCard).toHaveCount(1);
  await expect(targetCard).toBeVisible();
  await expect(durationBadge).toBeVisible();
  await page.getByRole('button', { name: 'Select tracks' }).click();
  await targetCard.click();
  await expect(targetCard).toHaveAttribute('aria-selected', 'true');
  await expect(durationBadge).toHaveCount(0);
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();

  // A Library search is screen-local: it must not replace the canonical
  // collection consumed by Today (or the persisted offline library cache).
  await page.getByRole('tab', { name: 'Today' }).click();
  await expect(page.getByText('Track 0', { exact: true })).toBeVisible();
});

test('video minimizes into fixed chrome above the mobile dock and Library bulk actions', async ({ page }) => {
  await mockApi(page, [
    videoFixture('video-first', 'First Light', '2026-07-13T12:00:00Z'),
    videoFixture('video-second', 'Second Light', '2026-07-13T11:00:00Z'),
  ]);
  await login(page);
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'First Light, Star Hollow Studio' }).click();

  await expect(page.getByTestId('video-cinema-stage')).toBeVisible();
  await expect(page.getByText('VIDEO 1 OF 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show video controls' }).click();
  await expect(page.getByRole('button', { name: 'Minimize video' })).toBeVisible();
  await page.getByRole('button', { name: 'Minimize video' }).click();

  const strip = page.getByTestId('video-mini-strip');
  await expect(strip).toBeVisible();
  await expect(page.getByTestId('video-mini-thumbnail')).toBeVisible();
  await expect(strip.getByText('First Light', { exact: true })).toBeVisible();

  const libraryTab = page.getByRole('tab', { name: 'Library' });
  await expect
    .poll(async () => {
      const [stripBox, dockBox] = await Promise.all([strip.boundingBox(), libraryTab.boundingBox()]);
      return !!stripBox && !!dockBox && stripBox.y + stripBox.height <= dockBox.y;
    })
    .toBe(true);

  await page.getByRole('button', { name: 'Select tracks' }).click();
  const bulkBar = page.getByTestId('library-bulk-bar');
  await expect(bulkBar).toBeVisible();
  await expect
    .poll(async () => {
      const [stripBox, bulkBox] = await Promise.all([strip.boundingBox(), bulkBar.boundingBox()]);
      return !!stripBox && !!bulkBox && stripBox.y + stripBox.height <= bulkBox.y;
    })
    .toBe(true);

  await page.getByRole('button', { name: 'Close video' }).click();
  await expect(strip).toHaveCount(0);
});

test('desktop video uses a framed 16:9 cinema stage and rail-aware mini strip', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, [videoFixture('video-desktop', 'Night Signal', '2026-07-13T12:00:00Z')]);
  await login(page);
  await page.getByRole('button', { name: 'Library', exact: true }).last().click();
  await page.getByRole('button', { name: 'Night Signal, Star Hollow Studio' }).click();

  const stage = page.getByTestId('video-cinema-stage');
  await expect(stage).toBeVisible();
  await expect
    .poll(async () => {
      const box = await stage.boundingBox();
      return box ? box.width / box.height : 0;
    })
    .toBeCloseTo(16 / 9, 1);

  await page.getByRole('button', { name: 'Show video controls' }).click();
  await page.getByRole('button', { name: 'Minimize video' }).click();
  const stripBox = await page.getByTestId('video-mini-strip-content').boundingBox();
  expect(stripBox).not.toBeNull();
  expect(stripBox!.x).toBeGreaterThanOrEqual(260);
  expect(stripBox!.width).toBeLessThanOrEqual(640);
});
