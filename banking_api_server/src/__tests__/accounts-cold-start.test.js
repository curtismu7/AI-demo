/**
 * @file accounts-cold-start.test.js
 * @description Tests for STAB-02: cold-start account restoration via KV snapshot.
 *
 * Covers GET /accounts/my when the in-memory dataStore is empty (Vercel cold-start),
 * verifying that stored snapshots are restored and provisioning falls back correctly.
 */

'use strict';

const request = require('supertest');
const express = require('express');

// ─── Mutable state shared across mocks ───────────────────────────────────────
const _state = {
  accounts: [],
  snapshot: null, // null = not configured, [] = empty, [...] = accounts to restore
};

// ─── Mock: data/store ─────────────────────────────────────────────────────────
jest.mock('../../data/store', () => ({
  getAccountsByUserId: jest.fn((userId) => _state.accounts.filter((a) => a.userId === userId)),
  getAccountById: jest.fn((id) => _state.accounts.find((a) => a.id === id) || null),
  createAccount: jest.fn(async (data) => {
    const acct = { ...data };
    _state.accounts.push(acct);
    return acct;
  }),
  deleteAccount: jest.fn(async (id) => {
    _state.accounts = _state.accounts.filter((a) => a.id !== id);
  }),
  getTransactionsByUserId: jest.fn(() => []),
  deleteTransaction: jest.fn(async () => {}),
  createTransaction: jest.fn(async (data) => data),
  getAllAccounts: jest.fn(() => _state.accounts),
}));

// ─── Mock: demoScenarioStore ──────────────────────────────────────────────────
jest.mock('../../services/demoScenarioStore', () => ({
  load: jest.fn(async () => ({
    accountSnapshot: _state.snapshot,
  })),
  save: jest.fn(async () => {}),
  isPersistenceConfigured: jest.fn(() => true),
}));

// ─── Mock: middleware/auth — bypass token verification ───────────────────────
jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireSession: (req, res, next) => next(),
  requireScopes: () => (req, res, next) => next(),
}));

// ─── Mock: middleware/demoMode ────────────────────────────────────────────────
jest.mock('../../middleware/demoMode', () => ({
  blockInDemoMode: (_label) => (req, res, next) => next(),
}));

// ─── SUT ──────────────────────────────────────────────────────────────────────
const dataStore = require('../../data/store');
const demoScenarioStore = require('../../services/demoScenarioStore');
const accountsRouter = require('../../routes/accounts');

const SNAPSHOT_3 = [
  { id: 'chk-001', accountType: 'checking',   accountNumber: '001', name: 'Checking',  balance: 5000, currency: 'USD', isActive: true },
  { id: 'sav-001', accountType: 'savings',    accountNumber: '002', name: 'Savings',   balance: 3000, currency: 'USD', isActive: true },
  { id: 'inv-001', accountType: 'investment', accountNumber: '003', name: 'Investments', balance: 10000, currency: 'USD', isActive: true },
];

function makeApp(userId = 'u1') {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: userId, role: 'customer', sub: userId };
    req.sessionID = 'sess-test';
    next();
  });
  app.use('/accounts', accountsRouter);
  return app;
}

beforeEach(() => {
  _state.accounts = [];
  _state.snapshot = null;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /accounts/my — cold-start account restoration (STAB-02)', () => {

  it('Test A: restores 3 accounts from snapshot when dataStore is empty', async () => {
    _state.snapshot = [...SNAPSHOT_3];
    // dataStore starts empty (cold-start)

    const res = await request(makeApp()).get('/accounts/my');

    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(3);
  });

  it('Test B: each snapshot account not in dataStore triggers createAccount (cold-start path)', async () => {
    _state.snapshot = [...SNAPSHOT_3];
    // getAccountById returns null for all (not yet in memory)

    await request(makeApp()).get('/accounts/my');

    // Should have called createAccount once per snapshot account
    expect(dataStore.createAccount).toHaveBeenCalledTimes(3);
  });

  it('Test C: no snapshot → provisionDemoAccounts called and snapshot is saved', async () => {
    _state.snapshot = []; // empty snapshot → falls through to provisioning

    const res = await request(makeApp()).get('/accounts/my');

    // After provisioning, demoScenarioStore.save should be called with accountSnapshot
    expect(demoScenarioStore.save).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        accountSnapshot: expect.any(Array),
      })
    );
    // Standard provisioning gives checking + savings
    expect(res.body.accounts.length).toBeGreaterThanOrEqual(2);
  });

  it('Test D: warm instance (non-empty dataStore) does NOT call demoScenarioStore.load', async () => {
    // Pre-populate in-memory store — simulates warm Lambda
    _state.accounts = [
      { id: 'chk-w1', userId: 'u1', accountType: 'checking', name: 'Checking', balance: 5000, currency: 'USD' },
      { id: 'sav-w1', userId: 'u1', accountType: 'savings',  name: 'Savings',  balance: 2000, currency: 'USD' },
    ];

    const res = await request(makeApp()).get('/accounts/my');

    // Warm path: dataStore already has accounts, snapshot load skipped
    expect(demoScenarioStore.load).not.toHaveBeenCalled();
    expect(res.body.accounts).toHaveLength(2);
  });

  it('Test E: snapshot with investment account re-creates it with accountType=investment', async () => {
    _state.snapshot = [
      { id: 'inv-001', accountType: 'investment', accountNumber: '003', name: 'Investments', balance: 10000, currency: 'USD', isActive: true },
    ];

    await request(makeApp()).get('/accounts/my');

    const investmentCreateCall = dataStore.createAccount.mock.calls.find(
      ([data]) => data.accountType === 'investment'
    );
    expect(investmentCreateCall).toBeDefined();
    expect(investmentCreateCall[0].id).toBe('inv-001');
  });
});
