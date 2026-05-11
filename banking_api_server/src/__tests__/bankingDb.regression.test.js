'use strict';
/**
 * bankingDb.regression.test.js
 * Regression tests (mocked better-sqlite3 + fs) for bankingDb service.
 * Covers: schema creation, idempotent seed gate, transactional seed, parameterized queries.
 *
 * Per CLAUDE.md two-tier test pattern: mock everything external.
 */

// ─── Mocks (must be declared before require of bankingDb) ───────────────────

// Prepare a reusable mock stmt and db instance
const mockPrepareStmt = {
  all: jest.fn().mockReturnValue([]),
  run: jest.fn(),
};
const mockTransaction = jest.fn((fn) => () => fn());
const mockDb = {
  exec: jest.fn(),
  prepare: jest.fn().mockReturnValue(mockPrepareStmt),
  transaction: mockTransaction,
};
jest.mock('better-sqlite3', () => jest.fn(() => mockDb), { virtual: true });

// Mock fs so we can control existsSync
const mockExistsSync = jest.fn().mockReturnValue(false);
const mockMkdirSync  = jest.fn();
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: mockExistsSync,
  mkdirSync:  mockMkdirSync,
}));

// Mock data/store to provide stable seed data
const mockAccounts = [
  { id: 'acc-1', userId: 'user-1', accountType: 'checking', name: 'Checking', balance: 1000, currency: 'USD', status: 'active', accountNumber: '****1234' },
  { id: 'acc-2', userId: 'user-2', accountType: 'savings',  name: 'Savings',  balance: 500,  currency: 'USD', status: 'active', accountNumber: '****5678' },
];
const mockTransactions = [
  { id: 'tx-1', userId: 'user-1', fromAccountId: 'acc-1', type: 'debit',  amount: 50,  description: 'Coffee', createdAt: new Date('2024-01-01') },
  { id: 'tx-2', userId: 'user-2', fromAccountId: 'acc-2', type: 'credit', amount: 200, description: 'Salary', createdAt: new Date('2024-01-02') },
];

jest.mock('../../data/store', () => ({
  getAllAccounts:      jest.fn().mockReturnValue(mockAccounts),
  getAllTransactions:  jest.fn().mockReturnValue(mockTransactions),
}));

// ─── Load module under test AFTER mocks are in place ───────────────────────
// Use jest.isolateModules to get a fresh require each test (module caches _db singleton)
let bankingDb;

beforeEach(() => {
  jest.isolateModules(() => {
    bankingDb = require('../../services/bankingDb');
  });
  // Reset mock states
  mockExistsSync.mockReturnValue(false);
  mockDb.exec.mockClear();
  mockDb.prepare.mockClear();
  mockDb.transaction.mockClear();
  mockPrepareStmt.all.mockClear();
  mockPrepareStmt.run.mockClear();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('bankingDb — regression tests', () => {
  // Test 1: initBankingDb() on first run creates db with both tables and seeds
  it('Test 1: initBankingDb() on first run calls db.exec (schema) and runs seed transaction', () => {
    mockExistsSync.mockReturnValue(false);
    bankingDb.initBankingDb();
    expect(mockDb.exec).toHaveBeenCalled();
    const execCall = mockDb.exec.mock.calls[0][0];
    expect(execCall).toMatch(/CREATE TABLE IF NOT EXISTS accounts/);
    expect(execCall).toMatch(/CREATE TABLE IF NOT EXISTS transactions/);
    // seed transaction was invoked
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  // Test 2: initBankingDb() on second run (file exists) does NOT re-seed
  it('Test 2: initBankingDb() when file already exists does NOT call seed transaction', () => {
    mockExistsSync.mockReturnValue(true);
    bankingDb.initBankingDb();
    // schema still runs (idempotent CREATE TABLE IF NOT EXISTS)
    expect(mockDb.exec).toHaveBeenCalled();
    // but seed transaction factory should NOT have been called
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  // Test 3: seed runs inside a single transaction
  it('Test 3: seed wraps all inserts in a single db.transaction call', () => {
    mockExistsSync.mockReturnValue(false);
    bankingDb.initBankingDb();
    // db.transaction should have been called exactly once (seed transaction factory)
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  // Test 4: getAccountsByUserId filters by userId
  it('Test 4: getAccountsByUserId returns accounts for the given userId', () => {
    const rows = [{ id: 'acc-1', userId: 'user-1' }];
    mockPrepareStmt.all.mockReturnValue(rows);
    const result = bankingDb.getAccountsByUserId('user-1');
    expect(result).toEqual(rows);
    // prepare was called
    expect(mockDb.prepare).toHaveBeenCalled();
  });

  // Test 5: getAccountsByUserId uses a parameterized query (WHERE userId = ?)
  it('Test 5: getAccountsByUserId uses parameterized query with ? placeholder', () => {
    bankingDb.getAccountsByUserId('user-1');
    // At least one prepare() call should include a ? in the SQL
    const allQueries = mockDb.prepare.mock.calls.map((c) => c[0]);
    const hasParam = allQueries.some((q) => q.includes('?'));
    expect(hasParam).toBe(true);
    // must NOT contain direct string concat pattern
    const noConcat = allQueries.every((q) => !q.match(/userId\s*=\s*['"`]/));
    expect(noConcat).toBe(true);
  });

  // Test 6: getTransactionsByUserId returns <= limit transactions, parameterized
  it('Test 6: getTransactionsByUserId returns at most `limit` transactions, query is parameterized', () => {
    const rows = [{ id: 'tx-1' }, { id: 'tx-2' }];
    mockPrepareStmt.all.mockReturnValue(rows);
    const result = bankingDb.getTransactionsByUserId('user-1', 5);
    expect(result).toEqual(rows);
    const allQueries = mockDb.prepare.mock.calls.map((c) => c[0]);
    const hasLimit = allQueries.some((q) => q.toUpperCase().includes('LIMIT'));
    expect(hasLimit).toBe(true);
    const hasParam = allQueries.some((q) => q.includes('?'));
    expect(hasParam).toBe(true);
  });

  // Test 7: getTransactionsByUserId without limit uses a default
  it('Test 7: getTransactionsByUserId without limit arg uses a default limit (parameterized)', () => {
    mockPrepareStmt.all.mockReturnValue([]);
    bankingDb.getTransactionsByUserId('user-1'); // no limit
    // .all() should have been called with positional args including a positive integer default
    const callArgs = mockPrepareStmt.all.mock.calls;
    expect(callArgs.length).toBeGreaterThan(0);
    // second argument to .all() should be a positive integer (the default limit)
    const lastCall = callArgs[callArgs.length - 1];
    const limitArg = lastCall[1];
    expect(typeof limitArg).toBe('number');
    expect(limitArg).toBeGreaterThan(0);
  });
});
