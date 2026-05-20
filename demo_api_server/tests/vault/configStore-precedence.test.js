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
const { ensureValidConfigDb, canUseSQLite } = require('./_ensureValidConfigDb');

// Skip entire suite when better-sqlite3 native addon is incompatible with this
// Node version (e.g. compiled for Node 20 but running under Node 18).
const describeSQLite = canUseSQLite() ? describe : describe.skip;

// Full-suite pollution guard: another suite can leave a non-SQLite stub at
// data/persistent/config.db; remove it so configStore recreates a valid DB.
beforeAll(() => { if (canUseSQLite()) ensureValidConfigDb(); });

function freshConfigStore() {
  const id = require.resolve('../../services/configStore');
  delete require.cache[id];
  // eslint-disable-next-line global-require
  return require('../../services/configStore');
}

describeSQLite('configStore provenance — vault is not clobbered by SQLite', () => {
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

describeSQLite('configStore key casing — UPPER-canonical regardless of caller/storage case', () => {
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

describeSQLite('configStore secret encrypt/decrypt round-trips regardless of key casing', () => {
  const SECRET_CASES = [
    'mcp_gw_client_secret',     // new lowercase secret (Task 1.5)
    'demo_password',            // pre-existing lowercase secret (regressed by UPPER-case change)
    'PINGONE_ADMIN_CLIENT_SECRET', // pre-existing UPPER secret (control — must still work)
  ];

  // Minimal cross-test row hygiene: freshConfigStore() resets the module
  // cache, NOT the shared on-disk config.db. Delete the specific rows for
  // these keys (UPPER-cased, matching the storage model) before each test
  // so a stale row from a sibling test cannot mask the assertion.
  beforeEach(() => {
    const dbPath = path.join(__dirname, '..', '..', 'data', 'persistent', 'config.db');
    const fs = require('node:fs');
    if (!fs.existsSync(dbPath)) return;
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      Database = require('node:sqlite').DatabaseSync;
    }
    const db = new Database(dbPath);
    for (const key of SECRET_CASES) {
      db.prepare('DELETE FROM config WHERE UPPER(key) = ?').run(key.toUpperCase());
    }
    db.close();
  });

  // freshConfigStore() relies on `delete require.cache[id]`, which is a
  // NO-OP under jest's module registry (it returns the SAME singleton, so
  // its in-memory cache still holds the plaintext from setConfig and the
  // SQLite reload never runs — masking this bug). jest.isolateModules
  // genuinely re-evaluates the module, giving a fresh ConfigStore whose
  // empty cache forces a real _loadFromSQLite + decrypt — a faithful
  // process-restart simulation.
  function reloadedConfigStore() {
    let mod;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      mod = require('../../services/configStore');
    });
    return mod;
  }

  for (const key of SECRET_CASES) {
    test(`${key}: set via setConfig, survives a reload as plaintext (not ciphertext)`, async () => {
      const c = reloadedConfigStore();
      await c.ensureInitialized();
      const plaintext = `RT-${key}-VALUE`;
      await c.setConfig({ [key]: plaintext });
      // Simulate process restart: fresh module re-reads SQLite + decrypts.
      const c2 = reloadedConfigStore();
      await c2.ensureInitialized();
      expect(c2.getEffective(key)).toBe(plaintext);
    });
  }
});

describeSQLite('getEffective precedence — Vault > SQLite > .env with bootstrap allowlist', () => {
  const SAVED = {};
  const ENVV = ['OLLAMA_MODEL', 'OLLAMA_BASE_URL', 'PINGONE_REGION', 'PINGONE_ENVIRONMENT_ID'];
  beforeEach(() => { for (const k of ENVV) SAVED[k] = process.env[k]; });
  afterEach(() => {
    for (const k of ENVV) {
      if (SAVED[k] === undefined) delete process.env[k];
      else process.env[k] = SAVED[k];
    }
  });

  // True fresh module (empty cache) — delete require.cache is a no-op under
  // jest, so use jest.isolateModules for a genuine re-evaluation.
  function reloadedConfigStore() {
    let mod;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      mod = require('../../services/configStore');
    });
    return mod;
  }

  test('non-bootstrap key: vault (persist:false) beats a conflicting .env value', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    process.env.OLLAMA_MODEL = 'env-model';
    await c.setRaw({ ollama_model: 'vault-model' }, { persist: false });
    expect(c.getEffective('ollama_model')).toBe('vault-model');
  });

  test('non-bootstrap key: SQLite (persist:true) beats a conflicting .env value', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    process.env.OLLAMA_BASE_URL = 'http://env:11434';
    await c.setRaw({ ollama_base_url: 'http://sqlite:11434' }, { persist: true });
    expect(c.getEffective('ollama_base_url')).toBe('http://sqlite:11434');
  });

  test('non-bootstrap key: .env used when neither vault nor SQLite set it', async () => {
    // Determinism: use a genuinely fresh module (empty cache) AND a key with
    // an envFallbackMap entry but NO FIELD_DEFS default and NO builtin /
    // pingoneBackendDefaults value, so .env is the only resolvable source.
    // demo_apikey_backend_service_key → ['DEMO_APIKEY_SERVICE_KEY'] is such a
    // key (Phase 266 Path A demo key, no FIELD_DEFS default). Clear any
    // persisted SQLite row first so the cache is truly empty for this key.
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
      db.prepare('DELETE FROM config WHERE UPPER(key) = ?').run('DEMO_APIKEY_BACKEND_SERVICE_KEY');
      db.close();
    }
    const saved = process.env.DEMO_APIKEY_SERVICE_KEY;
    const sentinel = 'env-fallback-proof-' + Date.now();
    process.env.DEMO_APIKEY_SERVICE_KEY = sentinel;
    try {
      const c = reloadedConfigStore();
      await c.ensureInitialized();
      expect(c.getEffective('demo_apikey_backend_service_key')).toBe(sentinel);
    } finally {
      if (saved === undefined) delete process.env.DEMO_APIKEY_SERVICE_KEY;
      else process.env.DEMO_APIKEY_SERVICE_KEY = saved;
    }
  });

  test('BOOTSTRAP key (pingone_region): .env wins even over a cache value', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    process.env.PINGONE_REGION = 'env-region';
    await c.setRaw({ pingone_region: 'vault-region' }, { persist: false });
    expect(c.getEffective('pingone_region')).toBe('env-region');
  });

  test('BOOTSTRAP key (pingone_environment_id): .env wins over a SQLite value', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    process.env.PINGONE_ENVIRONMENT_ID = 'env-eid';
    await c.setRaw({ pingone_environment_id: 'sqlite-eid' }, { persist: true });
    expect(c.getEffective('pingone_environment_id')).toBe('env-eid');
  });

  test('BOOTSTRAP key falls back to cache when .env is unset', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    delete process.env.PINGONE_REGION;
    await c.setRaw({ pingone_region: 'cache-region-fallback' }, { persist: false });
    expect(c.getEffective('pingone_region')).toBe('cache-region-fallback');
  });
});

describeSQLite('configStore FIELD_DEFS defaults reachable for UPPER keys', () => {
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
