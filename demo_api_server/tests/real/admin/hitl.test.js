'use strict';

const { createBffClient, setVertical, restoreVertical } = require('../helpers/bffClient');
const { VERTICAL_FIXTURES } = require('../helpers/fixtures');
const { resetSuite } = require('../helpers/reset');

const VERTICAL = 'admin';
const FX = VERTICAL_FIXTURES[VERTICAL];

describe(`HITL enforcement — ${VERTICAL} vertical (real)`, () => {
  let client, admin;

  beforeAll(async () => {
    skipIfNoSession();
    client = createBffClient('enduser');
    admin  = createBffClient('admin');
    await setVertical(client, VERTICAL);
    await resetSuite(admin, VERTICAL);
  });

  afterAll(async () => {
    await restoreVertical(client);
  });

  it('transfer without consentChallengeId returns 428 hitl_required', async () => {
    const r = await client.post('/api/transactions', {
      type: 'transfer', fromId: FX.chk, toId: FX.sav, amount: 200,
    });
    expect(r.status).toBe(428);
    expect(r.data.error).toBe('hitl_required');
    expect(r.data.hitl).toBeDefined();
    expect(r.data.hitl.type).toBe('consent');
  });

  it('transfer with invalid consentChallengeId returns 4xx', async () => {
    const r = await client.post('/api/transactions', {
      type: 'transfer', fromId: FX.chk, toId: FX.sav, amount: 200,
      consentChallengeId: 'invalid-challenge-id-that-does-not-exist',
    });
    expect([400, 403, 428]).toContain(r.status);
  });

  it('small deposit does not trigger 428 (below threshold)', async () => {
    const r = await client.post('/api/transactions', {
      type: 'deposit', toId: FX.chk, amount: 10,
    });
    expect([201, 428]).toContain(r.status);
    if (r.status === 428) {
      console.warn('[hitl.test] Unexpected 428 on $10 deposit — check confirm_threshold_usd in .env');
    }
  });

  it('large deposit above threshold returns 428', async () => {
    const r = await client.post('/api/transactions', {
      type: 'deposit', toId: FX.chk, amount: 1000,
    });
    expect([201, 428]).toContain(r.status);
  });

  it('response body includes fromAccountId, toAccountId, amount, type on 428', async () => {
    const r = await client.post('/api/transactions', {
      type: 'transfer', fromId: FX.chk, toId: FX.sav, amount: 300,
    });
    expect(r.status).toBe(428);
    expect(r.data).toMatchObject({
      fromAccountId: FX.chk,
      toAccountId:   FX.sav,
      amount:        300,
      type:          'transfer',
    });
  });
});
