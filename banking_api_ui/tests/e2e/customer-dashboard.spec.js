/**
 * @file customer-dashboard.spec.js
 * Playwright E2E tests for the end-user dashboard (UserDashboard): accounts, transactions,
 * scope-forbidden path, agent-result refresh, navigation. API is fully mocked — no banking_api_server.
 */

const { test, expect } = require('@playwright/test');
const {
  mockCustomerDashboard,
  SAMPLE_ACCOUNTS,
  SAMPLE_TRANSACTIONS,
} = require('./helpers/customerDashboardMocks');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('userLoggedOut');
    } catch (_) {}
  });
});

/** BankingAgent auto-opens after login and can cover header controls; optional collapse before clicks. */
async function dismissBankingAgentPanel(page) {
  const collapse = page.getByRole('button', { name: 'Collapse agent' });
  try {
    await collapse.click({ timeout: 4000 });
  } catch (_) {
    /* panel already collapsed or not floating */
  }
}

test.describe('Customer dashboard (UserDashboard)', () => {
  test('renders greeting, Your Accounts, and live API account rows', async ({ page }) => {
    await mockCustomerDashboard(page);
    await page.goto('/');
    await dismissBankingAgentPanel(page);

    await expect(page.getByText(/Hello,\s+Test/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Your Accounts' })).toBeVisible();
    await expect(page.getByText('Primary Checking')).toBeVisible();
    await expect(page.getByText('CHK-001')).toBeVisible();
    await expect(page.getByText('$1500.00')).toBeVisible();
  });

  test('shows Recent Transactions from API when /transactions/my returns 200', async ({ page }) => {
    await mockCustomerDashboard(page, { transactionsResponse: SAMPLE_TRANSACTIONS });
    await page.goto('/');
    await dismissBankingAgentPanel(page);

    await expect(page.getByRole('heading', { name: 'Recent Transactions' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Payroll')).toBeVisible();
    await expect(page.getByText('ATM')).toBeVisible();
  });

  test('when /transactions/my returns 403, dashboard still loads accounts and shows sample activity', async ({
    page,
  }) => {
    await mockCustomerDashboard(page, {
      transactionsHandler: (route) =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'insufficient_scope', requiredScopes: ['banking:transactions:read'] }),
        }),
    });
    await page.goto('/');
    await dismissBankingAgentPanel(page);

    await expect(page.getByRole('heading', { name: 'Your Accounts' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Primary Checking')).toBeVisible();
    // Sample demo rows from cloneDemoTransactions (Payroll deposit label in DEMO_TRANSACTIONS)
    await expect(page.getByText('Payroll deposit')).toBeVisible();
  });

  test('/dashboard route renders the same customer dashboard', async ({ page }) => {
    await mockCustomerDashboard(page);
    await page.goto('/dashboard');
    await dismissBankingAgentPanel(page);

    await expect(page.getByRole('heading', { name: 'Your Accounts' })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Log Out button navigates to unified /api/auth/logout', async ({ page }) => {
    await mockCustomerDashboard(page);
    await page.route('**/api/auth/logout**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' }),
    );

    await page.goto('/');
    await dismissBankingAgentPanel(page);
    const logoutBtn = page.locator('.user-dashboard .logout-btn');
    await expect(logoutBtn).toBeVisible({ timeout: 15000 });

    const logoutReq = page.waitForRequest(
      (r) => r.url().includes('/api/auth/logout') && r.method() === 'GET',
      { timeout: 15000 },
    );
    // Native click — Playwright pointer clicks can miss React handlers when overlays steal events.
    await logoutBtn.evaluate((el) => el.click());
    const req = await logoutReq;
    expect(req.url()).toMatch(/\/api\/auth\/logout/);
  });

  test('banking-agent-result (confirm) triggers silent data refresh (accounts/my)', async ({ page }) => {
    await mockCustomerDashboard(page);
    await page.goto('/');
    await dismissBankingAgentPanel(page);
    await expect(page.getByRole('heading', { name: 'Your Accounts' })).toBeVisible({ timeout: 15000 });

    const refreshReq = page.waitForRequest(
      (r) => r.url().includes('/api/accounts/my') && r.method() === 'GET',
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('banking-agent-result', { detail: { type: 'confirm' } }));
    });
    await refreshReq;
  });

  test('MCP Inspector link navigates in-app', async ({ page }) => {
    await mockCustomerDashboard(page);
    await page.route('**/api/mcp/inspector/context**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
    );
    await page.route('**/api/mcp/inspector/tools**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tools: [], _source: 'local_catalog' }),
      }),
    );
    await page.goto('/');
    await dismissBankingAgentPanel(page);

    await page.locator('a.dashboard-header-mcp-btn').evaluate((el) => el.click());
    await page.waitForURL(/\/mcp-inspector/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'MCP Inspector' })).toBeVisible({ timeout: 15000 });
  });
  test('redirects /admin to home for customer session', async ({ page }) => {
    await mockCustomerDashboard(page);
    await page.goto('/admin');
    await dismissBankingAgentPanel(page);

    await expect(page).not.toHaveURL(/\/admin$/);
  });
});
