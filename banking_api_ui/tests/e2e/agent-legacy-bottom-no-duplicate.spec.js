/**
 * @file agent-legacy-bottom-no-duplicate.spec.js
 * @description Regression: a user with the RETIRED `bottom` dock placement
 *   persisted in localStorage (banking_agent_ui_v2 = {placement:'bottom'})
 *   used to get TWO BankingAgent instances on /dashboard. Each instance has
 *   its own per-instance `autoLoadedRef` guard for the once-per-session
 *   "Your Accounts" auto-load (BankingAgent.js ~line 2454). Two instances
 *   racing the shared sessionStorage guard both appended the auto-load, so
 *   the account list rendered twice as two identical assistant bubbles.
 *
 *   Phase 4b-4d retired 'bottom' and consolidated to a single instance
 *   (middle + float). AgentUiModeContext.readState() now coerces a persisted
 *   'bottom' to {placement:'middle'} (one autoLoadedRef → one bubble).
 *
 *   This test locks that in: with the legacy value set, there must be
 *   exactly ONE agent instance and the "Your Accounts" auto-load bubble
 *   must appear exactly ONCE.
 *
 *   All API calls intercepted — no live server required.
 */

const { test, expect } = require('@playwright/test');

const CUSTOMER_USER = {
  id: 'user-123',
  username: 'testuser',
  email: 'testuser@bank.com',
  firstName: 'Test',
  lastName: 'User',
  name: 'Test User',
  role: 'customer',
};

const SAMPLE_ACCOUNTS = {
  accounts: [
    { id: 'acc_001', account_number: 'CHK-001', account_type: 'checking', name: 'Checking Account', balance: 1500.0 },
    { id: 'acc_002', account_number: 'SAV-002', account_type: 'savings', name: 'Savings Account', balance: 8200.5 },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('userLoggedOut');
      // The bug trigger: a persisted RETIRED 'bottom' placement from an
      // older build. Must coerce to a single middle instance, not spawn two.
      localStorage.setItem(
        'banking_agent_ui_v2',
        JSON.stringify({ placement: 'bottom', fab: true })
      );
    } catch (_) {}
  });
});

async function mockAuthenticatedCustomer(page) {
  await page.route('**/api/auth/oauth/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, user: null }) }));
  await page.route('**/api/auth/oauth/user/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: CUSTOMER_USER }) }));
  await page.route('**/api/accounts**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(SAMPLE_ACCOUNTS) }));
  await page.route('**/api/transactions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ transactions: [] }) }));
  await page.route('**/ws**', (route) => route.abort());
  await page.route('**/api/mcp/tool', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ result: SAMPLE_ACCOUNTS }) }));
}

test('legacy "bottom" placement → single agent, accounts auto-load renders once', async ({ page }) => {
  await mockAuthenticatedCustomer(page);
  await page.goto('/dashboard');

  // Single-instance guard: the retired 'bottom' value must not spawn two
  // BankingAgent components (the root cause of the duplicate render).
  await page.waitForTimeout(3000);
  expect(await page.locator('.banking-agent-panel').count(),
    'exactly one BankingAgent panel').toBe(1);
  expect(await page.locator('.ba-input').count(),
    'exactly one chat input').toBe(1);

  // Open the panel. Middle placement collapses to an "Open AI Banking
  // Assistant" control; float uses .banking-agent-fab. Try both.
  const openBtn = page.getByRole('button', { name: /Open AI Banking Assistant/i });
  if (await openBtn.count()) {
    await openBtn.first().click();
  } else {
    const fab = page.locator('.banking-agent-fab');
    if (await fab.count()) await fab.first().click();
  }

  // The once-per-session "Your Accounts" auto-load must land exactly once.
  await expect(page.locator('.banking-agent-messages').first())
    .toContainText('Your Accounts', { timeout: 20000 });
  await page.waitForTimeout(1500);

  const acctBubbles = page.locator('.banking-agent-msg.assistant', { hasText: 'Your Accounts' });
  expect(await acctBubbles.count(),
    'accounts auto-load renders exactly once (no duplicate bubble)').toBe(1);
});
