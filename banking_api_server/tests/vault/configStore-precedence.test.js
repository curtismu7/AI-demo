'use strict';

/**
 * Config precedence — Vault > SQLite > .env with a bootstrap allowlist.
 *
 * Pattern mirrors tests/vault/configStore-persistFalse.test.js: fresh
 * configStore singleton per test via require-cache reset. We simulate the
 * three tiers with the public API:
 *   - vault tier   → setRaw(data, {persist:false})  (in-memory, provenance=vault)
 *   - sqlite tier  → setRaw(data, {persist:true})   (provenance=sqlite)
 *   - env tier     → process.env[ENV_NAME]
 */

const path = require('node:path');

function freshConfigStore() {
  const id = require.resolve('../../services/configStore');
  delete require.cache[id];
  // eslint-disable-next-line global-require
  return require('../../services/configStore');
}

describe('configStore provenance — vault is not clobbered by SQLite', () => {
  test('SQLite write of a vault-owned key does NOT overwrite the vault value', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'ollama_model';

    // 1. Vault tier sets the value (persist:false → provenance=vault)
    await c.setRaw({ [key]: 'VAULT-VALUE' }, { persist: false });
    expect(c.getEffective(key)).toBe('VAULT-VALUE');

    // 2. A later SQLite-tier write of the SAME key must NOT clobber the
    //    vault value in the resolved result (vault outranks sqlite).
    await c.setRaw({ [key]: 'SQLITE-VALUE' }, { persist: true });
    expect(c.getEffective(key)).toBe('VAULT-VALUE');
  });

  test('SQLite value is used when the vault did NOT supply that key', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'ollama_base_url';
    await c.setRaw({ [key]: 'http://sqlite-only:11434' }, { persist: true });
    expect(c.getEffective(key)).toBe('http://sqlite-only:11434');
  });
});

describe('configStore key casing — UPPER-canonical regardless of caller/storage case', () => {
  test('setConfig with an UPPER FIELD_DEFS key is readable via getEffective (both cases)', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    delete process.env.PINGONE_ENVIRONMENT_ID;
    await c.setConfig({ PINGONE_ENVIRONMENT_ID: 'cfg-env-id' });
    expect(c.getEffective('PINGONE_ENVIRONMENT_ID')).toBe('cfg-env-id');
    expect(c.getEffective('pingone_environment_id')).toBe('cfg-env-id');
  });

  test('get() resolves regardless of the case the caller passes', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    await c.setRaw({ ff_authorize_fail_open: 'true' }, { persist: false });
    expect(c.get('ff_authorize_fail_open')).toBe('true');
    expect(c.get('FF_AUTHORIZE_FAIL_OPEN')).toBe('true');
  });

  test('vault value still outranks a later SQLite write (provenance preserved) with UPPER keys', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    await c.setRaw({ Pingone_Region: 'vault-region' }, { persist: false });
    await c.setRaw({ pingone_region: 'sqlite-region' }, { persist: true });
    expect(c.get('PINGONE_REGION')).toBe('vault-region');
  });
});

describe('configStore FIELD_DEFS defaults reachable for UPPER keys', () => {
  test('getEffective(UPPER key) returns FIELD_DEFS default when nothing else set', async () => {
    // "nothing else set" must also mean no stale SQLite row from a sibling
    // test (freshConfigStore resets the module cache, not the shared
    // on-disk config.db). Clear any persisted PINGONE_REGION so the
    // FIELD_DEFS default is the genuine last resort.
    const dbPath = path.join(__dirname, '..', '..', 'data', 'persistent', 'config.db');
    const fs = require('node:fs');
    if (fs.existsSync(dbPath)) {
      let Database;
      try {
        Database = require('better-sqlite3');
      } catch {
        Database = require('node:sqlite').DatabaseSync;
      }
      const db = new Database(dbPath);
      db.prepare('DELETE FROM config WHERE UPPER(key) = ?').run('PINGONE_REGION');
      db.close();
    }
    const c2 = freshConfigStore();
    await c2.ensureInitialized();
    // PINGONE_REGION has FIELD_DEFS default 'com'. Ensure no env override.
    const saved = process.env.PINGONE_REGION;
    delete process.env.PINGONE_REGION;
    try {
      expect(c2.getEffective('PINGONE_REGION')).toBe('com');
      expect(c2.getEffective('pingone_region')).toBe('com');
    } finally {
      if (saved === undefined) delete process.env.PINGONE_REGION;
      else process.env.PINGONE_REGION = saved;
    }
  });
});
