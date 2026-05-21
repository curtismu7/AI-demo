// demo_api_server/tests/real/shared/config.test.js
'use strict';

const { createBffClient } = require('../helpers/bffClient');

const VERTICALS = ['banking', 'retail', 'sporting-goods', 'healthcare', 'workforce', 'admin'];

describe('Vertical config endpoints (real)', () => {
  let client;

  beforeAll(() => {
    skipIfNoSession();
    client = createBffClient('enduser');
  });

  afterAll(async () => {
    await client.put('/api/config/vertical', { verticalId: 'banking' });
  });

  it('GET /api/config/verticals/list lists all 6 verticals', async () => {
    const r = await client.get('/api/config/verticals/list');
    expect(r.status).toBe(200);
    const ids = (r.data.verticals || []).map(v => v.id || v);
    for (const v of VERTICALS) expect(ids).toContain(v);
  });

  it.each(VERTICALS)('PUT /api/config/vertical sets %s and GET reflects it', async (verticalId) => {
    const r = await client.put('/api/config/vertical', { verticalId });
    expect(r.status).toBe(200);
    expect(r.data.activeVertical).toBe(verticalId);
    const g = await client.get('/api/config/vertical');
    expect(g.data.activeVertical).toBe(verticalId);
    expect(g.data.manifest).toBeDefined();
    expect(g.data.manifest.terminology).toBeDefined();
  });

  it('PUT with unknown verticalId returns 400', async () => {
    const r = await client.put('/api/config/vertical', { verticalId: 'nonexistent' });
    expect(r.status).toBe(400);
  });

  it('PUT without verticalId returns 400', async () => {
    const r = await client.put('/api/config/vertical', {});
    expect(r.status).toBe(400);
  });
});
