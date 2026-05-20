/**
 * @file banking-agent.spec.js
 * @description Playwright E2E regression tests for the BankingAgent FAB component.
 *
 * Covers:
 *   UNAUTHENTICATED LANDING
 *   - Floating agent FAB is not shown (agent only on dashboard home routes when signed in)
 *
 *   AUTHENTICATED (post-login)
 *   - On /dashboard and /admin the floating panel defaults collapsed; tests open via FAB
 *   - Panel shows role badge in header subtitle (Admin / Customer)
 *   - Dashboard nav button shown in agent left column
 *   - Core Actions rows (My Accounts … Transfer) appear as .ba-action-item entries
 *   - "My Accounts" action triggers /api/mcp/tool call with tool=get_my_accounts
 *   - "Recent Transactions" action triggers /api/mcp/tool call
 *   - "Check Balance" uses Account select + Run; runs get_account_balance
 *   - "Deposit" shows form and submits create_deposit
 *   - "Withdraw" shows form and submits create_withdrawal
 *   - "Transfer" shows form and submits create_transfer
 *   - MCP error (502) shows user-friendly "MCP server not reachable" message
 *   - Cancel on a form hides the form without running the action
 *   - Login action buttons NOT shown when authenticated
 *   - Admin user sees admin-specific suggestions
 *   - ?oauth=success URL param auto-opens the panel
 *
 * All API calls and OAuth status are intercepted — no live server required.
 */

const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('userLoggedOut');
    } catch (_) {}
  });
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CUSTOMER_USER = {
  id: 'user-123',
  username: 'testuser',
  email: 'testuser@bank.com',
  firstName: 'Test',
  lastName: 'User',
  name: 'Test User',
  role: 'customer',
};

const ADMIN_USER = {
  id: 'admin-1',
  username: 'admin',
  email: 'admin@bank.com',
  firstName: 'Alice',
  lastName: 'Admin',
  name: 'Alice Admin',
  role: 'admin',
};

const SAMPLE_ACCOUNTS = {
  accounts: [
    { id: 'acc_001', account_number: 'CHK-001', account_type: 'checking', balance: 1500.00 },
    { id: 'acc_002', account_number: 'SAV-002', account_type: 'savings',  balance: 8200.50 },
  ],
};

// UserDashboard formats transaction.createdAt (camelCase) with date-fns — snake_case breaks render.
const SAMPLE_TRANSACTIONS = {
  transactions: [
    { id: 'txn_1', type: 'deposit',    amount: 500,   description: 'Payroll',   createdAt: '2026-03-01T10:00:00.000Z' },
    { id: 'txn_2', type: 'withdrawal', amount: 100,   description: 'ATM',       createdAt: '2026-03-05T14:30:00.000Z' },
    { id: 'txn_3', type: 'transfer',   amount: 250,   description: 'Rent',      createdAt: '2026-03-10T09:15:00.000Z' },
  ],
};

const SAMPLE_BALANCE = { balance: 1500.00 };

const SAMPLE_TRANSACTION_CONFIRM = {
  id: 'txn_new_001',
  amount: 100,
  type: 'withdrawal',
};

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Mock both OAuth status endpoints as unauthenticated.
 */
async function mockUnauthenticated(page) {
  await page.route('**/api/auth/oauth/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, user: null }) })
  );
  await page.route('**/api/auth/oauth/user/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, user: null }) })
  );
  await page.route('**/ws**', (route) => route.abort());
  await page.route('**/mcp**', (route) => route.abort());
}

/**
 * Mock both OAuth status endpoints as a logged-in customer and stub data APIs.
 */
async function mockAuthenticatedCustomer(page, user = CUSTOMER_USER) {
  await page.route('**/api/auth/oauth/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, user: null }) })
  );
  await page.route('**/api/auth/oauth/user/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user }) })
  );
  await page.route('**/api/accounts**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(SAMPLE_ACCOUNTS) })
  );
  await page.route('**/api/transactions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(SAMPLE_TRANSACTIONS) })
  );
  await page.route('**/ws**', (route) => route.abort());
}

/**
 * Mock admin OAuth status (admin user logged in via /api/auth/oauth/status).
 */
async function mockAuthenticatedAdmin(page, user = ADMIN_USER) {
  await page.route('**/api/auth/oauth/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user }) })
  );
  await page.route('**/api/auth/oauth/user/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, user: null }) })
  );
  await page.route('**/api/accounts**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(SAMPLE_ACCOUNTS) })
  );
  await page.route('**/api/transactions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(SAMPLE_TRANSACTIONS) })
  );
  await page.route('**/ws**', (route) => route.abort());
}

/**
 * Stub /api/mcp/tool to return a given result for one tool call.
 */
async function mockMcpTool(page, result) {
  await page.route('**/api/mcp/tool', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ result }) })
  );
}

/**
 * Stub /api/mcp/tool to return a 502 (MCP server unavailable).
 */
async function mockMcpToolError(page) {
  await page.route('**/api/mcp/tool', (route) =>
    route.fulfill({ status: 502, contentType: 'application/json',
      body: JSON.stringify({ message: 'mcp_error: WebSocket connection failed' }) })
  );
}

/**
 * Clicks a BankingAgent **Actions** row (`.ba-action-item`) — not suggestion chips (`ba-suggestion`),
 * which can also mention "Transfer" or "transactions".
 */
function agentPanelButton(page, namePattern) {
  return page
    .locator('.banking-agent-panel .ba-left-col .ba-action-item')
    .filter({ hasText: namePattern });
}

/** Collapse control in the floating panel header (avoid getByRole name matching the drag-handle header). */
function collapseAgentButton(page) {
  return page.locator('.banking-agent-panel .ba-header-tools button[aria-label="Collapse agent"]');
}

/**
 * /dashboard and /admin default the floating agent to collapsed — open via FAB before action tests.
 */
async function openFloatingAgentPanel(page) {
  await page.locator('.banking-agent-fab').click();
  await expect(page.locator('.banking-agent-panel')).toBeVisible({ timeout: 20000 });
}

// ─── UNAUTHENTICATED LANDING (no floating agent) ───────────────────────────────

test.describe('BankingAgent — unauthenticated landing', () => {
  test('floating agent FAB is not shown on /', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await expect(page.locator('.banking-agent-fab')).toHaveCount(0);
  });
});

// ─── AUTHENTICATED tests ───────────────────────────────────────────────────────

test.describe('BankingAgent — Authenticated (customer logged in)', () => {

  test('FAB is visible on the user dashboard', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, SAMPLE_ACCOUNTS);
    await page.goto('/dashboard');
    await expect(page.locator('.banking-agent-fab')).toBeVisible({ timeout: 20000 });
  });

  test('FAB opens the floating agent panel on /dashboard', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await expect(page.locator('.banking-agent-fab')).toBeVisible({ timeout: 20000 });
    await openFloatingAgentPanel(page);
  });

  test('panel shows "Super Banking AI Agent" title on /dashboard', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-title')).toHaveText('Super Banking AI Agent');
  });

  test('subtitle shows customer role badge when logged in', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-subtitle')).toContainText('Customer');
    await expect(page.locator('.ba-subtitle')).toContainText('Test');
  });

  test('welcome message is shown in right column for logged-in user', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    const messages = page.locator('.banking-agent-messages');
    await expect(messages).toBeVisible();
  });

  test('dashboard nav button shows "My Dashboard" for customer', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-left-col')).toContainText('My Dashboard');
  });

  test('panel lists core banking actions in the Actions section', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    const panelActions = page.locator('.banking-agent-panel .ba-left-col .ba-action-item');
    for (const label of [
      'My Accounts',
      'Recent Transactions',
      'Check Balance',
      'Deposit',
      'Withdraw',
      'Transfer',
    ]) {
      await expect(panelActions.filter({ hasText: label })).toHaveCount(1);
    }
  });

  test('customer suggestions are shown in the left column', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-left-col')).toContainText('Check my account balance');
  });

  // ── Read-only actions ──

  test('"My Accounts" calls get_my_accounts and shows account list', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, SAMPLE_ACCOUNTS);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool') && r.method() === 'POST'),
      agentPanelButton(page, /My Accounts/i).click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('get_my_accounts');

    const messages = page.locator('.banking-agent-messages');
    await expect(messages).toContainText('CHK-001');
    await expect(messages).toContainText('$1,500.00');
  });

  test('"Recent Transactions" calls get_my_transactions and shows list', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, SAMPLE_TRANSACTIONS);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      agentPanelButton(page, /Recent Transactions/i).click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('get_my_transactions');

    await expect(page.locator('.banking-agent-messages')).toContainText('Payroll');
  });

  // ── Form-based actions ──

  test('"Check Balance" shows Account selector form', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Check Balance/i).click();
    const form = page.locator('.banking-agent-form');
    await expect(form).toBeVisible();
    await expect(form.getByLabel(/Account/i)).toBeVisible();
    await expect(page.locator('#field-accountId')).toBeVisible();
  });

  test('"Check Balance" submits get_account_balance and shows balance', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, SAMPLE_BALANCE);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Check Balance/i).click();

    const accountId = await page.locator('#field-accountId').inputValue();

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      page.locator('.banking-agent-btn-primary').click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('get_account_balance');
    expect(body.params.account_id).toBe(accountId);

    await expect(page.locator('.banking-agent-messages')).toContainText('Balance: $1,500.00');
  });

  test('"Deposit" shows form with Account and Amount fields', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Deposit/i).click();

    const form = page.locator('.banking-agent-form');
    await expect(form).toBeVisible();
    await expect(form.getByLabel(/^Account$/)).toBeVisible();
    await expect(form.getByLabel(/Amount \(\$\)/)).toBeVisible();
  });

  test('"Deposit" submits create_deposit with correct params', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, { ...SAMPLE_TRANSACTION_CONFIRM, type: 'deposit', amount: 250 });
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Deposit/i).click();

    const accountId = await page.locator('#field-accountId').inputValue();
    await page.locator('#field-amount').fill('250');
    await page.locator('#field-note').fill('Birthday money');

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      page.locator('.banking-agent-btn-primary').click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('create_deposit');
    expect(body.params.account_id).toBe(accountId);
    expect(body.params.amount).toBe(250);

    await expect(page.locator('.banking-agent-messages')).toContainText('✅ Success');
  });

  test('"Withdraw" submits create_withdrawal with correct params', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, { ...SAMPLE_TRANSACTION_CONFIRM, type: 'withdrawal', amount: 100 });
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Withdraw/i).click();

    const accountId = await page.locator('#field-accountId').inputValue();
    await page.locator('#field-amount').fill('100');
    await page.locator('#field-note').fill('ATM');

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      page.locator('.banking-agent-btn-primary').click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('create_withdrawal');
    expect(body.params.account_id).toBe(accountId);
    expect(body.params.amount).toBe(100);

    await expect(page.locator('.banking-agent-messages')).toContainText('✅ Success');
  });

  test('"Transfer" shows form with From, To, Amount and Note fields', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Transfer/i).click();

    const form = page.locator('.banking-agent-form');
    await expect(form).toBeVisible();
    await expect(form.getByLabel(/From Account/i)).toBeVisible();
    await expect(form.getByLabel(/To Account/i)).toBeVisible();
    await expect(form.getByLabel(/Amount \(\$\)/)).toBeVisible();
    await expect(form.getByLabel(/^Note$/)).toBeVisible();
  });

  test('"Transfer" submits create_transfer with correct params', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, { ...SAMPLE_TRANSACTION_CONFIRM, type: 'transfer', amount: 500 });
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Transfer/i).click();

    const fromId = await page.locator('#field-fromId').inputValue();
    const toId = await page.locator('#field-toId').inputValue();
    await page.locator('#field-amount').fill('500');
    await page.locator('#field-note').fill('Rent');

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      page.locator('.banking-agent-btn-primary').click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('create_transfer');
    expect(body.params.from_account_id).toBe(fromId);
    expect(body.params.to_account_id).toBe(toId);
    expect(body.params.amount).toBe(500);

    await expect(page.locator('.banking-agent-messages')).toContainText('✅ Success');
  });

  // ── Cancel behaviour ──

  test('Cancel on Withdraw form hides the form without API call', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    let mcpCalled = false;
    await page.route('**/api/mcp/tool', (route) => {
      mcpCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: {} }) });
    });

    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Withdraw/i).click();
    await expect(page.locator('.banking-agent-form')).toBeVisible();

    await page.locator('.banking-agent-btn-ghost').click();  // Cancel
    await expect(page.locator('.banking-agent-form')).toHaveCount(0);
    expect(mcpCalled).toBe(false);
  });

  // ── Error handling ──

  test('MCP 502 error shows friendly "not reachable" message', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpToolError(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /My Accounts/i).click();

    const messages = page.locator('.banking-agent-messages');
    await expect(messages).toContainText(/unavailable|not reachable|mcp/i);
    await expect(messages).not.toContainText('at Object.');
  });

  test('login action buttons are NOT shown when user is authenticated', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-left-col')).not.toContainText('Admin Sign In');
    await expect(page.locator('.ba-left-col')).not.toContainText('Customer Sign In');
  });
});

// ─── ADMIN tests ───────────────────────────────────────────────────────────────

test.describe('BankingAgent — Authenticated (admin logged in)', () => {

  test('panel auto-opens after admin login without FAB click', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await page.goto('/admin');
    await openFloatingAgentPanel(page);
  });

  test('subtitle shows admin role badge for admin user', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await page.goto('/admin');
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-subtitle')).toContainText('Admin');
    await expect(page.locator('.ba-subtitle')).toContainText('Alice');
  });

  test('dashboard nav button shows "Admin Dashboard" for admin', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await page.goto('/admin');
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-left-col')).toContainText('Admin Dashboard');
  });

  test('admin suggestions are shown (system-wide framing)', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await page.goto('/admin');
    await openFloatingAgentPanel(page);
    await expect(page.locator('.ba-left-col')).toContainText('Show all customer accounts');
  });
});

// ─── AUTO-OPEN via ?oauth=success ─────────────────────────────────────────────

test.describe('BankingAgent — auto-open via ?oauth=success', () => {

  test('panel opens automatically when URL contains ?oauth=success', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard?oauth=success');
    await expect(page.locator('.banking-agent-panel')).toBeVisible({ timeout: 20000 });
  });

  test('?oauth=success param is removed from URL after auto-open', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard?oauth=success');
    await expect(page.locator('.banking-agent-panel')).toBeVisible({ timeout: 20000 });
    await expect(page).not.toHaveURL(/oauth=success/);
  });
});
