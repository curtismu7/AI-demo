/**
 * @file customerDashboardMocks.js
 * Shared route mocks for customer (end-user) dashboard Playwright specs.
 * No live API server required.
 */

const DEFAULT_CUSTOMER = {
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
    {
      id: 'acc_001',
      name: 'Primary Checking',
      accountNumber: 'CHK-001',
      accountType: 'checking',
      balance: 1500.0,
    },
    {
      id: 'acc_002',
      name: 'Savings',
      accountNumber: 'SAV-002',
      accountType: 'savings',
      balance: 8200.5,
    },
  ],
};

const SAMPLE_TRANSACTIONS = {
  transactions: [
    { id: 'txn_1', type: 'deposit', amount: 500, description: 'Payroll', createdAt: '2026-03-01T10:00:00.000Z', accountInfo: 'Checking', clientType: 'enduser', performedBy: 'Test User' },
    { id: 'txn_2', type: 'withdrawal', amount: 100, description: 'ATM', createdAt: '2026-03-05T14:30:00.000Z', accountInfo: 'Checking', clientType: 'enduser', performedBy: 'Test User' },
  ],
};

/**
 * Installs mocks for a signed-in customer: OAuth status, accounts/my, transactions/my, config, token preview.
 * @param {import('@playwright/test').Page} page
 * @param {{ accountsResponse?: object, transactionsHandler?: (route: import('@playwright/test').Route) => void, user?: object }} [opts]
 */
async function mockCustomerDashboard(page, opts = {}) {
  const user = opts.user || DEFAULT_CUSTOMER;
  const accountsBody = opts.accountsResponse || SAMPLE_ACCOUNTS;

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
      body: JSON.stringify({ authenticated: true, user }),
    }),
  );

  await page.route('**/api/accounts/my**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(accountsBody),
    }),
  );

  if (typeof opts.transactionsHandler === 'function') {
    await page.route('**/api/transactions/my**', opts.transactionsHandler);
  } else {
    await page.route('**/api/transactions/my**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(opts.transactionsResponse || SAMPLE_TRANSACTIONS),
      }),
    );
  }

  await page.route('**/api/admin/config**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config: {} }),
    }),
  );

  await page.route('**/api/tokens/session-preview**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tokenEvents: [] }),
    }),
  );

  await page.route('**/ws**', (route) => route.abort());
}

module.exports = {
  DEFAULT_CUSTOMER,
  SAMPLE_ACCOUNTS,
  SAMPLE_TRANSACTIONS,
  mockCustomerDashboard,
};
