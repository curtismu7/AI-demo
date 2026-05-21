'use strict';

const fs = require('fs');
const path = require('path');
const { createBffClient, setVertical, restoreVertical } = require('../helpers/bffClient');

const VERTICAL = 'healthcare';
const STATIC_CONFIG = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, `../../../config/verticals/${VERTICAL}.json`), 'utf8')
);

describe(`Vertical manifest — ${VERTICAL} (real)`, () => {
  let client;

  beforeAll(async () => {
    skipIfNoSession();
    client = createBffClient('enduser');
    await setVertical(client, VERTICAL);
  });

  afterAll(async () => {
    await restoreVertical(client);
  });

  it('GET /api/config/vertical returns activeVertical=healthcare', async () => {
    const r = await client.get('/api/config/vertical');
    expect(r.status).toBe(200);
    expect(r.data.activeVertical).toBe(VERTICAL);
  });

  it('manifest terminology matches config/verticals/healthcare.json', async () => {
    const r = await client.get('/api/config/vertical');
    const term = r.data.manifest?.terminology;
    expect(term).toBeDefined();
    expect(term.account).toBe(STATIC_CONFIG.terminology.account);
    expect(term.accounts).toBe(STATIC_CONFIG.terminology.accounts);
    expect(term.transaction).toBe(STATIC_CONFIG.terminology.transaction);
  });

  it('manifest identity matches config/verticals/healthcare.json', async () => {
    const r = await client.get('/api/config/vertical');
    const id = r.data.manifest?.identity;
    expect(id).toBeDefined();
    expect(id.displayName).toBe(STATIC_CONFIG.identity.displayName);
  });
});
