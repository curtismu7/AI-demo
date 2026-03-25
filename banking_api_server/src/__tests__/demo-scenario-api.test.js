/**
 * @file demo-scenario-api.test.js
 * @description Tests for PUT /api/demo-scenario account create + update (demo config).
 */

const request = require('supertest');
const express = require('express');

// Mutable in-memory store toggled before each test
global.__demoScenarioAccountTest = { rows: [] };

jest.mock('../../data/store', () => {
  const g = () => global.__demoScenarioAccountTest;
  return {
    getAccountsByUserId: (uid) => g().rows.filter((r) => r.userId === uid),
    getAccountById: (id) => g().rows.find((r) => r.id === id) || null,
    createAccount: jest.fn(async (data) => {
      g().rows.push({ ...data });
      return data;
    }),
    updateAccount: jest.fn(async (id, updates) => {
      const i = g().rows.findIndex((r) => r.id === id);
      if (i === -1) return null;
      g().rows[i] = { ...g().rows[i], ...updates };
      return g().rows[i];
    }),
    getUserById: (id) => ({
      id,
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      role: 'customer',
    }),
    updateUser: jest.fn(async () => {}),
  };
});

jest.mock('../../services/demoScenarioStore', () => ({
  load: jest.fn(async () => ({ stepUpAmountThreshold: null })),
  save: jest.fn(async () => {}),
}));

jest.mock('../../config/runtimeSettings', () => ({
  get: jest.fn(() => 250),
}));

jest.mock('../../routes/accounts', () => ({}));

const dataStore = require('../../data/store');
const demoScenarioStore = require('../../services/demoScenarioStore');
const demoScenarioRouter = require('../../routes/demoScenario');

function makeApp(userId = 'u1') {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: userId, role: 'user' };
    next();
  });
  app.use('/', demoScenarioRouter);
  return app;
}

describe('Demo scenario API — account create/update', () => {
  beforeEach(() => {
    global.__demoScenarioAccountTest.rows = [
      {
        id: 'a-existing',
        userId: 'u1',
        accountNumber: '1001',
        accountType: 'checking',
        balance: 50,
        name: 'Main Checking',
        currency: 'USD',
      },
    ];
    jest.clearAllMocks();
  });

  it('PUT creates an account when a row has no id', async () => {
    const app = makeApp();
    const res = await request(app)
      .put('/')
      .send({
        accounts: [
          { id: 'a-existing', name: 'Main Checking', balance: 50 },
          { accountType: 'savings', name: 'Vacation Fund', balance: 99.5 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(dataStore.createAccount).toHaveBeenCalledTimes(1);
    const created = res.body.accounts.find((a) => a.name === 'Vacation Fund');
    expect(created).toBeDefined();
    expect(created.accountType).toBe('savings');
    expect(created.balance).toBe(99.5);
    expect(String(created.accountNumber || '')).toMatch(/^SAV-/);
  });

  it('PUT defaults checking name when new row name is empty', async () => {
    const app = makeApp();
    const res = await request(app)
      .put('/')
      .send({
        accounts: [
          { id: 'a-existing', name: 'Main Checking', balance: 50 },
          { accountType: 'checking', balance: 0 },
        ],
      });

    expect(res.status).toBe(200);
    const created = res.body.accounts.find((a) => a.name === 'Checking Account' && a.id !== 'a-existing');
    expect(created).toBeDefined();
  });

  it('PUT returns 400 for invalid balance on a new account row', async () => {
    const app = makeApp();
    const res = await request(app)
      .put('/')
      .send({
        accounts: [{ accountType: 'checking', name: 'X', balance: -1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_balance');
  });

  it('PUT returns 400 when adding accounts would exceed the per-user cap', async () => {
    global.__demoScenarioAccountTest.rows = Array.from({ length: 24 }, (_, i) => ({
      id: `fill-${i}`,
      userId: 'u1',
      accountNumber: `N${i}`,
      accountType: 'checking',
      balance: 0,
      name: `A${i}`,
      currency: 'USD',
    }));

    const app = makeApp();
    const res = await request(app)
      .put('/')
      .send({
        accounts: [{ accountType: 'savings', name: 'One too many', balance: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('max_accounts');
  });

  it('PUT updates an existing account by id', async () => {
    const app = makeApp();
    const res = await request(app)
      .put('/')
      .send({
        accounts: [{ id: 'a-existing', name: 'Renamed', balance: 123.45 }],
      });

    expect(res.status).toBe(200);
    expect(dataStore.updateAccount).toHaveBeenCalled();
    const row = res.body.accounts.find((a) => a.id === 'a-existing');
    expect(row.name).toBe('Renamed');
    expect(row.balance).toBe(123.45);
  });

  it('PUT returns 403 when updating another user account id', async () => {
    global.__demoScenarioAccountTest.rows.push({
      id: 'other-user-acct',
      userId: 'other',
      accountNumber: '999',
      accountType: 'checking',
      balance: 1,
      name: 'Nope',
      currency: 'USD',
    });

    const app = makeApp();
    const res = await request(app)
      .put('/')
      .send({
        accounts: [{ id: 'other-user-acct', name: 'Hax', balance: 999 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden_account');
  });

  it('GET includes settings.bankingAgentUiMode when store has it', async () => {
    demoScenarioStore.load.mockResolvedValueOnce({
      stepUpAmountThreshold: null,
      bankingAgentUiMode: 'embedded',
    });
    const app = makeApp();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.settings.bankingAgentUiMode).toBe('embedded');
  });

  it('PUT persists bankingAgentUiMode', async () => {
    const app = makeApp();
    const res = await request(app).put('/').send({ bankingAgentUiMode: 'floating' });
    expect(res.status).toBe(200);
    expect(demoScenarioStore.save).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ bankingAgentUiMode: 'floating' }),
    );
  });

  it('PUT returns 400 for invalid bankingAgentUiMode', async () => {
    const app = makeApp();
    const res = await request(app).put('/').send({ bankingAgentUiMode: 'sidebar' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_banking_agent_ui_mode');
  });
});
