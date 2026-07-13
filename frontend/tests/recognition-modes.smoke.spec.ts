import { expect, test, type Page } from '@playwright/test';

const user = {
  id: 'recognition-user', email: 'recognition@starhollow.test', display_name: 'Melody Listener',
  storage_preference: 'auto', is_admin: false, cloud_storage_available: false,
};

async function mockApi(page: Page, humming: boolean) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/login')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'recognition-access', refresh_token: 'recognition-refresh', token_type: 'bearer', user }),
      });
      return;
    }
    if (path.endsWith('/auth/me')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    if (path.endsWith('/recognitions/capabilities')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ recording: true, humming, humming_provider: humming ? 'acrcloud' : null }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });
}

async function loginAndOpenIdentify(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('melody-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('tab', { name: 'Identify' }).click();
}

test('configured melody recognition exposes a distinct hum-or-sing mode', async ({ page }) => {
  await mockApi(page, true);
  await loginAndOpenIdentify(page);
  await page.getByRole('tab', { name: 'Hum or sing' }).click();

  await expect(page.getByText('Hum a melody', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start recording a hummed melody' })).toBeVisible();
});

test('unconfigured melody recognition is visibly capability-gated', async ({ page }) => {
  await mockApi(page, false);
  await loginAndOpenIdentify(page);

  await expect(page.getByRole('tab', { name: 'Hum or sing' })).toBeDisabled();
  await expect(page.getByText(/becomes available when ACRCloud is connected/)).toBeVisible();
});
