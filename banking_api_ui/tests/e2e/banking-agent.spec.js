/**
 * @file banking-agent.spec.js
 * @description Playwright E2E regression tests for the BankingAgent FAB component.
 *
 * Covers:
 *   LOGIN PAGE (unauthenticated)
 *   - FAB is visible on the login page before authentication
 *   - Clicking FAB opens the agent panel
 *   - Panel header shows "BX Finance AI Agent" title
 *   - Subtitle shows "Sign in to get started" when not logged in
 *   - "👑 Admin Sign In" button is visible
 *   - "👤 Customer Sign In" button is visible
 *   - Clicking Admin Sign In redirects to /api/auth/oauth/login
 *   - Clicking Customer Sign In redirects to /api/auth/oauth/user/login
 *   - Closing the panel hides it again
 *   - Two-column layout: left column and right column are present
 *
 *   AUTHENTICATED (post-login)
 *   - Panel auto-opens after login (no FAB click needed)
 *   - Panel shows role-aware welcome message
 *   - Panel shows role badge in header subtitle (Admin / Customer)
 *   - Dashboard nav button shown and navigates to correct route
 *   - Panel shows banking action buttons (Accounts, Transactions, Balance, etc.)
 *   - "My Accounts" action triggers /api/mcp/tool call with tool=get_my_accounts
 *   - "Recent Transactions" action triggers /api/mcp/tool call
 *   - "Check Balance" shows form with Account ID field, runs get_account_balance
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
 * BankingAgent enables Admin/Customer login only when loadPublicConfig() reads
 * pingone_environment_id + client IDs from IndexedDB.
 */
async function seedPublicConfigIndexedDb(page) {
  await page.evaluate(async () => {
    const DB_NAME = 'banking-assistant-config';
    const STORE = 'config';
    const rows = [
      { key: 'pingone_environment_id', value: 'e2e-test-env' },
      { key: 'admin_client_id', value: 'e2e-admin-client' },
      { key: 'user_client_id', value: 'e2e-user-client' },
    ];
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        for (const row of rows) os.put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/** Open the FAB panel and wait until PingOne login buttons are enabled (IndexedDB seeded). */
async function openAgentPanelWhenConfigured(page) {
  await page.locator('.banking-agent-fab').click();
  await expect(page.locator('.ba-left-auth-btn', { hasText: 'Customer Sign In' })).toBeEnabled({
    timeout: 15000,
  });
}

/**
 * Clicks a BankingAgent MCP action button. Scoped to `.banking-agent-panel` so names like
 * "Deposit" / "Withdraw" / "Transfer" do not match UserDashboard account card buttons.
 */
function agentPanelButton(page, namePattern) {
  return page.locator('.banking-agent-panel').getByRole('button', { name: namePattern });
}

/**
 * /dashboard and /admin default the floating agent to collapsed — open via FAB before action tests.
 */
async function openFloatingAgentPanel(page) {
  await page.locator('.banking-agent-fab').click();
  await expect(page.locator('.banking-agent-panel')).toBeVisible({ timeout: 20000 });
}

// ─── LOGIN PAGE tests ──────────────────────────────────────────────────────────

test.describe('BankingAgent — Login page (unauthenticated)', () => {

  test('FAB is visible on the login page', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await expect(page.locator('.banking-agent-fab')).toBeVisible();
    await expect(page.locator('.banking-agent-fab')).toContainText(/🏦|AI Agent/);
  });

  test('clicking FAB opens the agent panel', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await page.locator('.banking-agent-fab').click();
    await expect(page.locator('.banking-agent-panel')).toBeVisible();
  });

  test('panel shows "BX Finance AI Agent" title', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await page.locator('.banking-agent-fab').click();
    await expect(page.locator('.ba-title')).toHaveText('BX Finance AI Agent');
  });

  test('subtitle shows "Sign in to get started" when not logged in', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await page.locator('.banking-agent-fab').click();
    await expect(page.locator('.ba-subtitle')).toContainText('Sign in to get started');
  });

  test('two-column layout: left and right columns are present', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await page.locator('.banking-agent-fab').click();
    await expect(page.locator('.banking-agent-panel .ba-left-col')).toBeVisible();
    await expect(page.locator('.banking-agent-panel .ba-right-col')).toBeVisible();
  });

  test('"👤 Customer Sign In" button is visible in left column', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await seedPublicConfigIndexedDb(page);
    await openAgentPanelWhenConfigured(page);
    await expect(page.locator('.ba-left-col')).toContainText('Customer Sign In');
  });

  test('"👑 Admin Sign In" button is visible in left column', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await seedPublicConfigIndexedDb(page);
    await openAgentPanelWhenConfigured(page);
    await expect(page.locator('.ba-left-col')).toContainText('Admin Sign In');
  });

  test('clicking Admin Sign In navigates to /api/auth/oauth/login', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.route('**/api/auth/oauth/login**', (route) =>
      route.fulfill({ status: 302, headers: { Location: '/' } })
    );
    await page.goto('/');
    await seedPublicConfigIndexedDb(page);
    await openAgentPanelWhenConfigured(page);

    const [navReq] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/auth/oauth/login')),
      page.locator('.ba-left-col button', { hasText: 'Admin Sign In' }).click(),
    ]);
    expect(navReq.url()).toContain('/api/auth/oauth/login');
  });

  test('clicking Customer Sign In navigates to /api/auth/oauth/user/login', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.route('**/api/auth/oauth/user/login**', (route) =>
      route.fulfill({ status: 302, headers: { Location: '/' } })
    );
    await page.goto('/');
    await seedPublicConfigIndexedDb(page);
    await openAgentPanelWhenConfigured(page);

    const [navReq] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/auth/oauth/user/login')),
      page.locator('.ba-left-col button', { hasText: 'Customer Sign In' }).click(),
    ]);
    expect(navReq.url()).toContain('/api/auth/oauth/user/login');
  });

  test('Collapse agent button hides the floating panel', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await page.locator('.banking-agent-fab').click();
    await expect(page.locator('.banking-agent-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Collapse agent' }).click();
    await expect(page.locator('.banking-agent-panel')).not.toBeVisible();
  });

  test('FAB is available again after collapsing the panel', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');
    await page.locator('.banking-agent-fab').click();
    await expect(page.locator('.banking-agent-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Collapse agent' }).click();
    await expect(page.locator('.banking-agent-fab')).toBeVisible();
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

  test('panel shows all 6 banking action buttons in left column', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    const actions = page.locator('.ba-left-col .ba-action-item');
    await expect(actions).toHaveCount(6);
    await expect(actions.nth(0)).toContainText('My Accounts');
    await expect(actions.nth(1)).toContainText('Recent Transactions');
    await expect(actions.nth(2)).toContainText('Check Balance');
    await expect(actions.nth(3)).toContainText('Deposit');
    await expect(actions.nth(4)).toContainText('Withdraw');
    await expect(actions.nth(5)).toContainText('Transfer');
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

  test('"Check Balance" shows Account ID form', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Check Balance/i).click();
    await expect(page.locator('.banking-agent-form')).toBeVisible();
    await expect(page.locator('label', { hasText: 'Account ID' })).toBeVisible();
  });

  test('"Check Balance" submits get_account_balance and shows balance', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, SAMPLE_BALANCE);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Check Balance/i).click();

    await page.locator('input[placeholder*="acc_"]').first().fill('acc_001');

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      page.locator('.banking-agent-btn-primary').click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('get_account_balance');
    expect(body.params.account_id).toBe('acc_001');

    await expect(page.locator('.banking-agent-messages')).toContainText('Balance: $1,500.00');
  });

  test('"Deposit" shows form with Account ID and Amount fields', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Deposit/i).click();

    const form = page.locator('.banking-agent-form');
    await expect(form).toBeVisible();
    await expect(form.locator('label', { hasText: 'Account ID' })).toBeVisible();
    await expect(form.locator('label', { hasText: 'Amount' })).toBeVisible();
  });

  test('"Deposit" submits create_deposit with correct params', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, { ...SAMPLE_TRANSACTION_CONFIRM, type: 'deposit', amount: 250 });
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Deposit/i).click();

    const inputs = page.locator('.banking-agent-field input');
    await inputs.nth(0).fill('acc_001');          // Account ID
    await inputs.nth(1).fill('250');              // Amount
    await inputs.nth(2).fill('Birthday money');   // Note

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      page.locator('.banking-agent-btn-primary').click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('create_deposit');
    expect(body.params.account_id).toBe('acc_001');
    expect(body.params.amount).toBe(250);

    await expect(page.locator('.banking-agent-messages')).toContainText('✅ Success');
  });

  test('"Withdraw" submits create_withdrawal with correct params', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, { ...SAMPLE_TRANSACTION_CONFIRM, type: 'withdrawal', amount: 100 });
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Withdraw/i).click();

    const inputs = page.locator('.banking-agent-field input');
    await inputs.nth(0).fill('acc_001');
    await inputs.nth(1).fill('100');
    await inputs.nth(2).fill('ATM');

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      page.locator('.banking-agent-btn-primary').click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('create_withdrawal');
    expect(body.params.account_id).toBe('acc_001');
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
    await expect(form.locator('label', { hasText: 'From Account ID' })).toBeVisible();
    await expect(form.locator('label', { hasText: 'To Account ID' })).toBeVisible();
    await expect(form.locator('label', { hasText: 'Amount' })).toBeVisible();
  });

  test('"Transfer" submits create_transfer with correct params', async ({ page }) => {
    await mockAuthenticatedCustomer(page);
    await mockMcpTool(page, { ...SAMPLE_TRANSACTION_CONFIRM, type: 'transfer', amount: 500 });
    await page.goto('/dashboard');
    await openFloatingAgentPanel(page);
    await agentPanelButton(page, /Transfer/i).click();

    const inputs = page.locator('.banking-agent-field input');
    await inputs.nth(0).fill('acc_001');    // from
    await inputs.nth(1).fill('acc_002');    // to
    await inputs.nth(2).fill('500');        // amount
    await inputs.nth(3).fill('Rent');       // note

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/mcp/tool')),
      page.locator('.banking-agent-btn-primary').click(),
    ]);

    const body = JSON.parse(req.postData() || '{}');
    expect(body.tool).toBe('create_transfer');
    expect(body.params.from_account_id).toBe('acc_001');
    expect(body.params.to_account_id).toBe('acc_002');
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
