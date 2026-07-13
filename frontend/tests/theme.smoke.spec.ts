import { expect, test, type Page } from '@playwright/test';

const user = {
  id: 'theme-user',
  email: 'theme@starhollow.test',
  display_name: 'Theme Listener',
  storage_preference: 'auto',
  is_admin: false,
  cloud_storage_available: false,
};

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/login')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'theme-access', refresh_token: 'theme-refresh', token_type: 'bearer', user }),
      });
      return;
    }
    if (path.endsWith('/auth/me')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });
}

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('theme-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();
}

async function openAppearance(page: Page) {
  await page.getByRole('button', { name: 'Customize dashboard' }).click();
  await expect(page.getByText('Arrange your hollow', { exact: true })).toBeVisible();
}

test('daylight is a real persisted theme across every primary screen', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openAppearance(page);
  await page.getByRole('tab', { name: 'Daylight' }).click();

  await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('light');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sh-palette-background').trim()))
    .toBe('#EAF1EB');
  await expect
    .poll(() => page.getByText('Bring a track home.', { exact: true }).evaluate((element) => getComputedStyle(element).color))
    .toBe('rgb(19, 37, 27)');

  await page.getByRole('button', { name: 'Done customizing' }).last().click();
  for (const destination of ['Library', 'Identify', 'Activity', 'Today'] as const) {
    await page.getByRole('tab', { name: destination }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();
});

test('system appearance follows live browser color-scheme changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await mockApi(page);
  await login(page);
  await openAppearance(page);
  await page.getByRole('tab', { name: 'System' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the living forest moves gently and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);

  const drift = page.getByTestId('forest-drift-layer');
  const fireflies = page.getByTestId('forest-fireflies');
  await expect(drift).toBeVisible();
  await expect(fireflies).toBeAttached();

  const movingStart = await drift.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(700);
  const movingEnd = await drift.evaluate((element) => getComputedStyle(element).transform);
  expect(movingEnd).not.toBe(movingStart);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.getByText('Bring a track home.', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  const stillStart = await drift.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(700);
  const stillEnd = await drift.evaluate((element) => getComputedStyle(element).transform);
  expect(stillEnd).toBe(stillStart);
});
