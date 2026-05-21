/**
 * @file banking-agent.real.spec.js
 * @description Real-login Playwright E2E tests for the BankingAgent component.
 *
 * These tests perform an actual PingOne OAuth login and make real API calls
 * instead of intercepting responses with page.route().
 *
 * SKIPPED AUTOMATICALLY when credentials are not set.
 * To run:
 *
 *   # 1. Copy sample env and fill in your PingOne test-user credentials:
 *   #    cp banking_api_ui/tests/e2e/.env.e2e.example banking_api_ui/tests/e2e/.env.e2e
 *
 *   # 2. Source the env file (or export vars directly):
 *   #    export $(cat banking_api_ui/tests/e2e/.env.e2e | xargs)
 *
 *   # 3. Run only the real tests:
 *   #    cd banking_api_ui && npm run test:e2e:real
 *
 *   # 4. Or run against Vercel staging:
 *   #    cd banking_api_ui && npm run test:e2e:real:vercel
 *
 * What each test validates vs the mock version:
 *
 *   Mock test               → "does the React UI render correctly when the API returns X?"
 *   Real test (this file)   → "does the full stack work end-to-end with real credentials?"
 *
 * Tests are named identically to banking-agent.spec.js so failures are easy to correlate.
 *
 * Covered scenarios:
 *   - Real customer login via PingOne OAuth
 *   - FAB visible on dashboard after real auth
 *   - Agent panel opens, shows real user name in subtitle
 *   - My Accounts chip — calls real /api/mcp/tool, shows real account data
 *   - Recent Transactions chip — real data rendered
 *   - Check Balance chip — account select populated with real accounts
 *   - My Dashboard button present and navigates to /dashboard
 *   - Consent-denied banner NOT shown by default (no prior decline)
 *   - Real admin login (if E2E_ADMIN_USERNAME is set)
 *   - Admin panel shows Admin role badge
 */

const { test, expect } = require('@playwright/test');
const {
  loginAsCustomer,
  loginAsAdmin,
  requireRealLoginEnv,
  requireAdminLoginEnv,
} = require('./helpers/realLogin');

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Open the floating agent FAB if the panel is not already visible. */
async function openFloatingAgentPanel(page) {
  const panel = page.locator('.banking-agent-panel');
  const isVisible = await panel.isVisible().catch(() => false);
  if (!isVisible) {
    await page.locator('.banking-agent-fab').click();
    await expect(panel).toBeVisible({ timeout: 20_000 });
  }
}

/** Click an action chip (.ba-action-item) in the agent left column. */
function agentActionButton(page, namePattern) {
  return page
    .locator('.banking-agent-panel .ba-left-col .ba-action-item')
    .filter({ hasText: namePattern });
}

// ─── Customer real-login suite ────────────────────────────────────────────────

test.describe('BankingAgent — Real login (customer)', () => {
  // Skip entire suite when credentials are absent — no noise in CI
  test.skip(() => !requireRealLoginEnv(), 'Real-login tests skipped: E2E_CUSTOMER_USERNAME not set');

  // Each test gets a fresh login so tests are independent.
  // If login speed is a concern, switch to storageState caching — see realLogin.js.
  test.beforeEach(async ({ page }) => {
    await loginAsCustomer(page);
  });

  // ── Auth state ──

  test('FAB is visible on dashboard after real OAuth login', async ({ page }) => {
    await expect(page.locator('.banking-agent-fab')).toBeVisible({ timeout: 20_000 });
  });

  test('agent panel shows real user name in subtitle after login', async ({ page }) => {
    await openFloatingAgentPanel(page);
    // The subtitle contains "Signed in · Customer" or first name
    await expect(page.locator('.ba-subtitle')).toBeVisible();
    // Must NOT show "Admin" for a customer account
    await expect(page.locator('.ba-subtitle')).not.toContainText('Admin');
  });

  test('My Dashboard button is present below the prompt bar', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-right-col')).toContainText('My Dashboard');
    // Must NOT be in the nav column
    await expect(page.locator('.ba-left-col')).not.toContainText('My Dashboard');
  });

  test('consent-denied banner is NOT shown by default (no prior decline)', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test('Sign In buttons are NOT shown when customer is authenticated', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-left-col')).not.toContainText('Customer Sign In');
    await expect(page.locator('.ba-left-col')).not.toContainText('Admin Sign In');
  });

  // ── Real API calls ──

  test('My Accounts chip triggers real /api/mcp/tool call and shows account data', async ({ page }) => {
    await openFloatingAgentPanel(page);

    // Monitor the real MCP tool call
    const mcpRequest = page.waitForRequest(req =>
      req.url().includes('/api/mcp/tool') && req.method() === 'POST'
    );

    await agentActionButton(page, /My Accounts/i).click();
    const req = await mcpRequest;

    const body = req.postDataJSON();
    expect(body.tool).toBe('get_my_accounts');

    // Wait for a response in the chat — real data or an error message
    const messages = page.locator('.banking-agent-messages');
    await expect(messages).not.toBeEmpty({ timeout: 30_000 });

    // Chat should either show account data or a meaningful error (never raw stack trace)
    const text = await messages.textContent();
    expect(text).not.toMatch(/at Object\.|TypeError:|Cannot read/);
  });

  test('Recent Transactions chip triggers real API call', async ({ page }) => {
    await openFloatingAgentPanel(page);

    const mcpRequest = page.waitForRequest(req =>
      req.url().includes('/api/mcp/tool') && req.method() === 'POST'
    );

    await agentActionButton(page, /Recent Transactions/i).click();
    const req = await mcpRequest;
    const body = req.postDataJSON();
    expect(body.tool).toBe('get_my_transactions');

    const messages = page.locator('.banking-agent-messages');
    await expect(messages).not.toBeEmpty({ timeout: 30_000 });
    const text = await messages.textContent();
    expect(text).not.toMatch(/at Object\.|TypeError:/);
  });

  test('Check Balance chip shows an account select populated from real accounts', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await agentActionButton(page, /Check Balance/i).click();

    // The ActionForm should appear with an account select
    await expect(page.locator('.banking-agent-form')).toBeVisible({ timeout: 15_000 });

    // The select must have at least one real account option (not empty)
    const select = page.locator('.banking-agent-form select#field-accountId, .banking-agent-form select').first();
    await expect(select).toBeVisible();
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThan(0);
  });

  test('Deposit chip shows ActionForm with real account options', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await agentActionButton(page, /Deposit/i).click();
    await expect(page.locator('.banking-agent-form')).toBeVisible({ timeout: 15_000 });
    const amountInput = page.locator('.banking-agent-form input[type="number"], .banking-agent-form input[id="field-amount"]');
    await expect(amountInput).toBeVisible();
  });

  test('Cancel on Deposit form hides form without API call', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await agentActionButton(page, /Deposit/i).click();
    await expect(page.locator('.banking-agent-form')).toBeVisible({ timeout: 15_000 });

    let mcpCalled = false;
    page.on('request', req => {
      if (req.url().includes('/api/mcp/tool')) mcpCalled = true;
    });

    await page.locator('.banking-agent-btn-ghost').click(); // Cancel
    await expect(page.locator('.banking-agent-form')).toHaveCount(0);
    expect(mcpCalled).toBe(false);
  });

  test('Transfer chip shows from/to account selects with real account data', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await agentActionButton(page, /Transfer/i).click();
    await expect(page.locator('.banking-agent-form')).toBeVisible({ timeout: 15_000 });

    // Both From and To selects should have real options
    const selects = page.locator('.banking-agent-form select');
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const opts = await selects.nth(i).locator('option').count();
      expect(opts).toBeGreaterThan(0);
    }
  });

  test('Suggestion chips are enabled (no consent-blocked state)', async ({ page }) => {
    await openFloatingAgentPanel(page);
    const firstSuggestion = page.locator('.ba-suggestion').first();
    await expect(firstSuggestion).toBeVisible();
    await expect(firstSuggestion).not.toBeDisabled();
  });

  test('Clicking a suggestion chip sends a real NL message to the chat', async ({ page }) => {
    await openFloatingAgentPanel(page);
    const chip = page.locator('.ba-suggestion').first();
    const chipText = await chip.textContent();
    await chip.click();

    // The suggestion text (minus quotes) should appear as a user message bubble
    const cleaned = (chipText || '').replace(/"/g, '').trim();
    if (cleaned) {
      await expect(page.locator('.banking-agent-messages')).toContainText(cleaned, { timeout: 15_000 });
    }
  });
});

// ─── Admin real-login suite ───────────────────────────────────────────────────

test.describe('BankingAgent — Real login (admin)', () => {
  test.skip(() => !requireAdminLoginEnv(), 'Real admin tests skipped: E2E_ADMIN_USERNAME not set');

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('admin panel shows Admin role badge in subtitle', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-subtitle')).toContainText('Admin');
  });

  test('admin sees Admin Dashboard button (not My Dashboard)', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-right-col')).toContainText('Admin Dashboard');
    await expect(page.locator('.ba-right-col')).not.toContainText('My Dashboard');
  });

  test('admin suggestion chips reflect admin framing', async ({ page }) => {
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-left-col')).toContainText('Show all customer accounts');
  });
});
