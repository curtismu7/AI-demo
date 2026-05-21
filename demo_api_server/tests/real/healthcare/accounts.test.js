'use strict';

const { createBffClient, setVertical, restoreVertical } = require('../helpers/bffClient');
const { VERTICAL_FIXTURES } = require('../helpers/fixtures');

const VERTICAL = 'healthcare';
const FX = VERTICAL_FIXTURES[VERTICAL];

describe(`Accounts — ${VERTICAL} vertical (real)`, () => {
  let client;

  beforeAll(async () => {
    skipIfNoSession();
    client = createBffClient('enduser');
    await setVertical(client, VERTICAL);
  });

  afterAll(async () => {
    await restoreVertical(client);
  });

  it('GET /api/accounts/my returns 200 with accounts', async () => {
    const r = await client.get('/api/accounts/my');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length).toBeGreaterThan(0);
  });

  it('GET /api/config/vertical shows healthcare terminology', async () => {
    const r = await client.get('/api/config/vertical');
    expect(r.status).toBe(200);
    expect(r.data.activeVertical).toBe('healthcare');
    expect(r.data.manifest.terminology.account).toBeDefined();
  });

  it('fixture checking account balance is readable', async () => {
    const r = await client.get(`/api/accounts/${FX.chk}/balance`);
    expect(r.status).toBe(200);
    expect(typeof r.data.balance).toBe('number');
  });
});
