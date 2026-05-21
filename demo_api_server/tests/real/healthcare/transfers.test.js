'use strict';

const { createBffClient, setVertical, restoreVertical } = require('../helpers/bffClient');
const { VERTICAL_FIXTURES, CHECKING_BALANCE, SAVINGS_BALANCE } = require('../helpers/fixtures');
const { resetSuite } = require('../helpers/reset');

const VERTICAL = 'healthcare';
const FX = VERTICAL_FIXTURES[VERTICAL];

describe(`Transfers — ${VERTICAL} vertical (real)`, () => {
  let client, admin;

  beforeAll(async () => {
    skipIfNoSession();
    client = createBffClient('enduser');
    admin = createBffClient('admin');
    await setVertical(client, VERTICAL);
    await resetSuite(admin, VERTICAL);
  });

  afterAll(async () => {
    await restoreVertical(client);
  });

  afterEach(async () => {
    await admin.put(`/api/accounts/${FX.chk}`, { balance: CHECKING_BALANCE });
    await admin.put(`/api/accounts/${FX.sav}`, { balance: SAVINGS_BALANCE });
  });

  describe('Deposit', () => {
    it('POST /api/transactions deposit increases balance', async () => {
      const before = (await client.get(`/api/accounts/${FX.chk}/balance`)).data.balance;
      const r = await client.post('/api/transactions', {
        type: 'deposit',
        toId: FX.chk,
        amount: 500,
      });
      if (r.status === 428) {
        expect(r.data.error).toBe('hitl_required');
        return;
      }
      expect(r.status).toBe(201);
      const after = (await client.get(`/api/accounts/${FX.chk}/balance`)).data.balance;
      expect(after).toBe(before + 500);
    });
  });

  describe('Withdrawal', () => {
    it('POST /api/transactions withdrawal decreases balance', async () => {
      const before = (await client.get(`/api/accounts/${FX.chk}/balance`)).data.balance;
      const r = await client.post('/api/transactions', {
        type: 'withdraw',
        fromId: FX.chk,
        amount: 100,
      });
      if (r.status === 428) {
        expect(r.data.error).toBe('hitl_required');
        return;
      }
      expect(r.status).toBe(201);
      const after = (await client.get(`/api/accounts/${FX.chk}/balance`)).data.balance;
      expect(after).toBe(before - 100);
    });
  });

  describe('Transfer', () => {
    it('POST /api/transactions transfer ALWAYS returns 428 (Phase 170 invariant)', async () => {
      const r = await client.post('/api/transactions', {
        type: 'transfer',
        fromId: FX.chk,
        toId: FX.sav,
        amount: 200,
      });
      expect(r.status).toBe(428);
      expect(r.data.error).toBe('hitl_required');
    });

    it('returns 400 for withdraw with insufficient funds', async () => {
      const r = await client.post('/api/transactions', {
        type: 'withdraw',
        fromId: FX.chk,
        amount: CHECKING_BALANCE + 1,
      });
      expect([400, 428]).toContain(r.status);
    });
  });
});
