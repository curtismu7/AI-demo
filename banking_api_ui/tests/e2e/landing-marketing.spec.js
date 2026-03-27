/**
 * @file landing-marketing.spec.js
 * Unauthenticated marketing landing (LandingPage): hero, features, sign-in affordances.
 * API mocked — no server required.
 */

const { test, expect } = require('@playwright/test');

async function mockUnauthenticatedLanding(page) {
  await page.route('**/api/auth/oauth/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, user: null }),
    }),
  );
  await page.route('**/api/auth/oauth/user/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, user: null }),
    }),
  );
  await page.route('**/api/admin/config**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config: {} }),
    }),
  );
  await page.route('**/ws**', (route) => route.abort());
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('userLoggedOut');
    } catch (_) {}
  });
});

test.describe('Marketing landing (unauthenticated)', () => {
  test('shows BX Finance brand and AI-Powered Banking section', async ({ page }) => {
    await mockUnauthenticatedLanding(page);
    await page.goto('/');

    await expect(page.locator('.landing-page')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.brand-name').first()).toHaveText('BX Finance');
    await expect(page.getByText('AI-Powered Banking')).toBeVisible();
  });

  test('Customer sign-in uses OAuth user login path when clicked', async ({ page }) => {
    await mockUnauthenticatedLanding(page);
    await page.route('**/api/auth/oauth/user/login**', (route) =>
      route.fulfill({ status: 302, headers: { Location: '/' }, body: '' }),
    );

    await page.goto('/');

    const customerBtn = page.getByRole('button', { name: /Customer sign in/i }).first();
    await expect(customerBtn).toBeVisible({ timeout: 15000 });

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/auth/oauth/user/login')),
      customerBtn.click(),
    ]);
    expect(req.method()).toBe('GET');
  });

  test('/config route loads configuration page heading', async ({ page }) => {
    await mockUnauthenticatedLanding(page);
    await page.goto('/config');

    await expect(page.getByRole('heading', { name: /Application Configuration/i })).toBeVisible({ timeout: 15000 });
  });
});
