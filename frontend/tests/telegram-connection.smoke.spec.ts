import { expect, test, type Page } from '@playwright/test';

const user = {
  id: 'telegram-user', email: 'telegram@starhollow.test', display_name: 'Telegram Listener',
  storage_preference: 'auto', is_admin: false, cloud_storage_available: false,
};

async function mockApi(page: Page, authorized: boolean) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/login')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'telegram-access', refresh_token: 'telegram-refresh', token_type: 'bearer', user }),
      });
      return;
    }
    if (path.endsWith('/auth/me')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    if (path.endsWith('/telegram/status')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, authorized, phone: '+905551234567' }),
      });
      return;
    }
    if (path.endsWith('/telegram/send-code')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'code_sent' }) });
      return;
    }
    if (path.endsWith('/telegram/connection') && request.method() === 'DELETE') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, authorized: false, phone: '+905551234567' }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
  });
}

async function loginAndOpenTelegram(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('telegram-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'Telegram', exact: true }).click();
}

test('saved Telegram settings can resend a code without re-entering API keys', async ({ page }) => {
  await mockApi(page, false);
  await loginAndOpenTelegram(page);

  await expect(page.getByText('Reconnect your saved account', { exact: true })).toBeVisible();
  await expect(page.getByLabel('API ID', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Send a new login code' }).click();
  await expect(page.getByText('Enter the code', { exact: true })).toBeVisible();
});

test('disconnecting Telegram requires confirmation and returns to saved reconnect', async ({ page }) => {
  await mockApi(page, true);
  await loginAndOpenTelegram(page);

  await page.getByRole('button', { name: 'Disconnect Telegram' }).click();
  await page.getByRole('button', { name: 'Disconnect and revoke session' }).click();
  await expect(page.getByText('Reconnect your saved account', { exact: true })).toBeVisible();
});
