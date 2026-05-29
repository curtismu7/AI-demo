/**
 * @file verticals.live-switch.real.spec.js
 * @description End-to-end test for SSE-driven live vertical switching.
 *
 * SKIPPED automatically when E2E env vars are not set.
 *
 * Scenario:
 *   1. Customer logs in to tab A; lands on /dashboard.
 *   2. Admin logs in to tab B; navigates to /admin/verticals.
 *   3. Admin switches the active vertical from whatever it currently is to
 *      'healthcare' via POST /api/verticals/active.
 *   4. Tab A (customer) must update within 2 seconds with NO full page reload:
 *      - document.title contains the new vertical's displayName
 *      - CSS variable --theme-accent reflects the new manifest
 *      - the page did not unload and reload (location stays at /dashboard,
 *        and a sentinel injected on the page survives).
 */

const { test, expect, chromium } = require('@playwright/test');
const {
  loginAsCustomer,
  loginAsAdmin,
  requireRealLoginEnv,
  requireAdminLoginEnv,
} = require('./helpers/realLogin');

test.describe('verticals live switch', () => {
  test.beforeAll(() => {
    test.skip(
      !requireRealLoginEnv() || !requireAdminLoginEnv(),
      'Skipped: E2E_CUSTOMER_USERNAME and E2E_ADMIN_USERNAME both required'
    );
  });

  test('admin switches active vertical; customer tab updates without reload', async () => {
    const browser = await chromium.launch();

    // Separate browser contexts so each session is independent.
    const customerCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const adminCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const customerPage = await customerCtx.newPage();
    const adminPage = await adminCtx.newPage();

    try {
      // 1. Log in both users.
      await loginAsCustomer(customerPage);
      await loginAsAdmin(adminPage);

      // 2. Customer lands on /dashboard. Wait for first paint (the
      //    VerticalProvider blocks render until /api/verticals/me hydrates).
      await customerPage.goto('https://api.ping.demo:4000/dashboard');
      await customerPage.waitForLoadState('networkidle');

      // Inject a sentinel on window so we can detect a full reload (it would
      // be cleared on navigation).
      await customerPage.evaluate(() => { window.__VERTICAL_LIVE_SWITCH_SENTINEL__ = 'present'; });

      // Capture the starting title and accent so we can assert change.
      const startTitle = await customerPage.title();
      const startAccent = await customerPage.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()
      );

      // 3. Admin switches to healthcare via the API. We use page.evaluate so
      //    the cookies travel automatically (no need to forge headers).
      const switchTo = startTitle.toLowerCase().includes('care')
        ? 'banking'   // already on healthcare; switch to banking instead
        : 'healthcare';
      const switchStatus = await adminPage.evaluate(async (id) => {
        const res = await fetch('/api/verticals/active', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        return res.status;
      }, switchTo);
      expect(switchStatus).toBe(204);

      // 4. Customer tab must update within 2 seconds.
      await customerPage.waitForFunction(
        ({ start }) => document.title !== start,
        { start: startTitle },
        { timeout: 2000 }
      );

      // Sentinel survived → no full page reload.
      const sentinel = await customerPage.evaluate(() => window.__VERTICAL_LIVE_SWITCH_SENTINEL__);
      expect(sentinel).toBe('present');

      // Title changed.
      const newTitle = await customerPage.title();
      expect(newTitle).not.toBe(startTitle);

      // CSS variable changed (or at least, is non-empty — different verticals
      // have different accent tokens; if startAccent was empty the assertion
      // is still meaningful because we now expect something).
      const newAccent = await customerPage.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()
      );
      expect(newAccent).not.toBe('');
      expect(newAccent).not.toBe(startAccent);
    } finally {
      await browser.close();
    }
  });
});
