// demo_api_server/tests/real/shared/bootstrap.test.js
'use strict';

const { createBffClient } = require('../helpers/bffClient');

const EXPECTED_VERTICALS = ['banking', 'retail', 'sporting-goods', 'healthcare', 'workforce', 'admin'];

describe('Bootstrap contract (real)', () => {
  let client;

  beforeAll(() => {
    skipIfNoSession();
    client = createBffClient('enduser');
  });

  it('GET /api/health returns 200', async () => {
    const r = await client.get('/api/health');
    expect(r.status).toBe(200);
  });

  it('GET /api/config/verticals/list returns all 6 verticals', async () => {
    const r = await client.get('/api/config/verticals/list');
    expect(r.status).toBe(200);
    const ids = (r.data.verticals || []).map(v => v.id || v);
    for (const v of EXPECTED_VERTICALS) {
      expect(ids).toContain(v);
    }
  });

  it.each(EXPECTED_VERTICALS)('vertical %s: PUT → GET returns correct id', async (verticalId) => {
    const put = await client.put('/api/config/vertical', { verticalId });
    expect(put.status).toBe(200);
    expect(put.data.activeVertical).toBe(verticalId);
    const get = await client.get('/api/config/vertical');
    expect(get.status).toBe(200);
    expect(get.data.activeVertical).toBe(verticalId);
  });

  afterAll(async () => {
    if (client) await client.put('/api/config/vertical', { verticalId: 'banking' });
  });

  it('GET /api/auth/oauth/status returns authenticated: true', async () => {
    const r = await client.get('/api/auth/oauth/status');
    expect(r.status).toBe(200);
    expect(r.data.authenticated).toBe(true);
    expect(r.data.user).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
    });
  });

  it('GET /api/accounts/my returns accounts array', async () => {
    const r = await client.get('/api/accounts/my');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.accounts)).toBe(true);
    expect(r.data.accounts.length).toBeGreaterThan(0);
  });
});
