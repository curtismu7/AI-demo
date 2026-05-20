'use strict';
/**
 * bankingDb.integration.test.js
 * Integration tests for bankingDb — uses a real temporary SQLite file.
 * Covers: idempotency proven end-to-end (Test 8), seeded rows accessible (Test 9).
 *
 * Per CLAUDE.md two-tier test pattern: uses REAL SQLite; mocks only data/store
 * to provide stable seed data (avoiding dependency on PingOne / production accounts).
 *
 * NOTE: We do NOT call jest.resetModules() here because the mock hoisting for
 * data/store is at the module level and must persist across tests. Instead we use
 * _setDbPath() to point each test at a fresh tmp file, and the bankingDb module's
 * internal _db singleton is reset via _setDbPath() clearing it.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// bankingDb requires better-sqlite3 (or node:sqlite on Node 22.5+).
// On Node 18, better-sqlite3 native addon fails (NODE_MODULE_VERSION mismatch)
// and node:sqlite does not exist. Skip the entire suite in that case.
function hasSQLiteSupport() {
  // The native addon error surfaces at new Database() time, not require() time.
  let db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(':memory:');
    db.prepare('SELECT 1').get();
    return true;
  } catch (_e1) {
    try { if (db) db.close(); } catch { /* ignore */ }
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db2 = new DatabaseSync(':memory:');
      db2.exec('SELECT 1');
      return true;
    } catch (_e2) {
      return false;
    }
  }
}
const describeSQLite = hasSQLiteSupport() ? describe : describe.skip;

// ─── Seed data fixture ──────────────────────────────────────────────────────
const DEMO_USER = 'demo-user';
const DEMO_ACCOUNTS = [
  { id: 'acct-int-1', userId: DEMO_USER, accountType: 'checking', name: 'Test Checking',
    balance: 2000, currency: 'USD', status: 'active', accountNumber: '****0001' },
  { id: 'acct-int-2', userId: 'other-user', accountType: 'savings', name: 'Test Savings',
    balance: 500, currency: 'USD', status: 'active', accountNumber: '****0002' },
];
const DEMO_TRANSACTIONS = [
  { id: 'tx-int-1', userId: DEMO_USER, fromAccountId: 'acct-int-1', type: 'debit',
    amount: 10, description: 'Coffee', createdAt: new Date('2024-03-01T10:00:00Z') },
  { id: 'tx-int-2', userId: DEMO_USER, fromAccountId: 'acct-int-1', type: 'credit',
    amount: 100, description: 'Refund', createdAt: new Date('2024-03-02T10:00:00Z') },
  { id: 'tx-int-3', userId: 'other-user', fromAccountId: 'acct-int-2', type: 'credit',
    amount: 500, description: 'Salary', createdAt: new Date('2024-03-03T10:00:00Z') },
];

// ─── Top-level mock (hoisted by jest, must reference only in-scope vars) ─────
// mockGetAllAccounts / mockGetAllTransactions are declared with `var` to avoid
// the hoisting-timing issue (babel lifts jest.mock() to the top of the file,
// before const/let declarations).
/* eslint-disable no-var */
var mockGetAllAccounts    = jest.fn().mockReturnValue(DEMO_ACCOUNTS);
var mockGetAllTransactions = jest.fn().mockReturnValue(DEMO_TRANSACTIONS);
/* eslint-enable no-var */

jest.mock('../../data/store', () => ({
  getAllAccounts:     mockGetAllAccounts,
  getAllTransactions: mockGetAllTransactions,
}));

// Load bankingDb once (module-level) — _setDbPath() resets its singleton per test
const bankingDb = require('../../services/bankingDb');

// ─── Per-test setup ──────────────────────────────────────────────────────────

let dbPath;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `banking-rs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  // Reset the bankingDb singleton to point at the fresh tmp file
  bankingDb._setDbPath(dbPath);
  // Re-arm mock return values (in case a previous test cleared them)
  mockGetAllAccounts.mockReturnValue(DEMO_ACCOUNTS);
  mockGetAllTransactions.mockReturnValue(DEMO_TRANSACTIONS);
});

afterEach(() => {
  try { fs.unlinkSync(dbPath); } catch (_) { /* already deleted or never created */ }
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describeSQLite('bankingDb — integration tests', () => {
  // Test 8: Two consecutive initBankingDb() calls leave row count unchanged (idempotency)
  it('Test 8: two consecutive initBankingDb() calls leave accounts row count unchanged', () => {
    bankingDb.initBankingDb();
    bankingDb.initBankingDb(); // second call — file now exists, seed skipped

    // Verify idempotency via the bankingDb query API (no direct better-sqlite3 require needed)
    // All DEMO_ACCOUNTS rows should be present (seed ran exactly once)
    const allAccountRows = [
      ...bankingDb.getAccountsByUserId(DEMO_USER),
      ...bankingDb.getAccountsByUserId('other-user'),
    ];
    expect(allAccountRows.length).toBe(DEMO_ACCOUNTS.length);

    // Calling again should NOT add rows
    bankingDb.initBankingDb();
    const afterThirdCall = [
      ...bankingDb.getAccountsByUserId(DEMO_USER),
      ...bankingDb.getAccountsByUserId('other-user'),
    ];
    expect(afterThirdCall.length).toBe(DEMO_ACCOUNTS.length);
  });

  // Test 9: After init, getAccountsByUserId returns seeded rows for demo-user
  it('Test 9: getAccountsByUserId returns seeded accounts for demo-user after init', () => {
    bankingDb.initBankingDb();

    const rows = bankingDb.getAccountsByUserId(DEMO_USER);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('acct-int-1');
    // Should NOT return accounts for other-user
    const wrongRows = rows.filter((r) => r.userId !== DEMO_USER);
    expect(wrongRows.length).toBe(0);
  });
});
