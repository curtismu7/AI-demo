'use strict';

const fs = require('fs');
const path = require('path');
const { createBffClient } = require('../helpers/bffClient');

const VERTICAL = 'banking';
const STATIC_CONFIG = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, `../../../config/verticals/${VERTICAL}.json`), 'utf8')
);

describe(`Vertical manifest — ${VERTICAL} (real)`, () => {
  let client;
  let manifest;

  beforeAll(async () => {
    skipIfNoSession();
    client = createBffClient('enduser');
    const r = await client.get('/api/config/vertical');
    manifest = r.data;
  });

  it('GET /api/config/vertical returns activeVertical=banking', () => {
    expect(manifest.activeVertical).toBe(VERTICAL);
  });

  it('manifest terminology matches config/verticals/banking.json', () => {
    const term = manifest.manifest?.terminology;
    expect(term).toBeDefined();
    expect(term.account).toBe(STATIC_CONFIG.terminology.account);
    expect(term.accounts).toBe(STATIC_CONFIG.terminology.accounts);
    expect(term.transaction).toBe(STATIC_CONFIG.terminology.transaction);
  });

  it('manifest identity matches config/verticals/banking.json', () => {
    const id = manifest.manifest?.identity;
    expect(id).toBeDefined();
    expect(id.displayName).toBe(STATIC_CONFIG.identity.displayName);
  });
});
