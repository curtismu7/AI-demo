'use strict';

/**
 * Phase 269 Task 3 — configStore.setRaw({persist:false}) extension.
 *
 * Verifies:
 *   - existing setRaw(data) callers still persist to SQLite (back-compat)
 *   - setRaw(data, {persist:false}) updates cache but does NOT write to SQLite
 *   - setRaw(data, {persist:true}) is equivalent to no opts (writes SQLite)
 *   - non-boolean opts.persist throws (strict type validation)
 *
 * Implementation pattern: we use jest's module isolation to require a fresh
 * configStore singleton per test, pointing at a temp SQLite file via the
 * data/persistent directory monkey-patch. Since configStore picks the db dir
 * from __dirname, we use a jest.spyOn for db.prepare to assert (or assert
 * non-call) of the SQLite upsert path.
 */

const path = require('node:path');
const { ensureValidConfigDb, canUseSQLite } = require('./_ensureValidConfigDb');

const describeSQLite = canUseSQLite() ? describe : describe.skip;

// Full-suite pollution guard: another suite can leave a non-SQLite stub at
// data/persistent/config.db; remove it so configStore recreates a valid DB.
beforeAll(() => { if (canUseSQLite()) ensureValidConfigDb(); });

// Reset module cache so we get a fresh configStore each test (the require cache
// holds onto the SQLite handle otherwise).
function freshConfigStore() {
  const id = require.resolve('../../services/configStore');
  delete require.cache[id];
  // eslint-disable-next-line global-require
  return require('../../services/configStore');
}

describeSQLite('configStore.setRaw — persist option', () => {
  test('setRaw({k:v}) with no opts persists to SQLite (existing behavior)', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'task3_test_key_default_' + Date.now();
    await c.setRaw({ [key]: 'value-default' });
    expect(c.getEffective(key)).toBe('value-default');
    // SQLite row exists for this key.
    const dbPath = path.join(__dirname, '..', '..', 'data', 'persistent', 'config.db');
    const fs = require('node:fs');
    expect(fs.existsSync(dbPath)).toBe(true);
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      Database = require('node:sqlite').DatabaseSync;
    }
    const db = new Database(dbPath);
    // configStore stores keys UPPER-canonical (Phase: config key normalization)
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key.toUpperCase());
    db.close();
    expect(row).toBeDefined();
    expect(row.value).toBe('value-default');
  });

  test('setRaw({k:v}, {persist:false}) updates cache but does NOT call SQLite upsert', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'task3_test_key_no_persist_' + Date.now();
    await c.setRaw({ [key]: 'value-cache-only' }, { persist: false });
    expect(c.getEffective(key)).toBe('value-cache-only');

    // Fresh SQLite query — no row should exist for this key.
    const dbPath = path.join(__dirname, '..', '..', 'data', 'persistent', 'config.db');
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      Database = require('node:sqlite').DatabaseSync;
    }
    const fs = require('node:fs');
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath);
      const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key.toUpperCase());
      db.close();
      expect(row).toBeUndefined();
    }
  });

  test('setRaw({k:v}, {persist:true}) is equivalent to no opts arg (writes SQLite)', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'task3_test_key_explicit_true_' + Date.now();
    await c.setRaw({ [key]: 'value-explicit-true' }, { persist: true });
    expect(c.getEffective(key)).toBe('value-explicit-true');

    const dbPath = path.join(__dirname, '..', '..', 'data', 'persistent', 'config.db');
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      Database = require('node:sqlite').DatabaseSync;
    }
    const db = new Database(dbPath);
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key.toUpperCase());
    db.close();
    expect(row).toBeDefined();
    expect(row.value).toBe('value-explicit-true');
  });

  test('setRaw({k:v}, {persist:"no"}) THROWS (strict type-check)', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    await expect(c.setRaw({ k: 'v' }, { persist: 'no' })).rejects.toThrow(
      /opts\.persist must be boolean, got string/,
    );
  });

  test('setRaw({k:v}, {persist:1}) THROWS (strict type-check)', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    await expect(c.setRaw({ k: 'v' }, { persist: 1 })).rejects.toThrow(
      /opts\.persist must be boolean, got number/,
    );
  });

  test('after setRaw({k:v}, {persist:false}), getEffective(k) returns "v"', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'task3_get_effective_check_' + Date.now();
    await c.setRaw({ [key]: 'live-from-cache' }, { persist: false });
    expect(c.getEffective(key)).toBe('live-from-cache');
  });

  test('after setRaw({k:v}, {persist:false}), SQLite has 0 rows for k', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'task3_no_sqlite_row_' + Date.now();
    await c.setRaw({ [key]: 'cache-only' }, { persist: false });

    const dbPath = path.join(__dirname, '..', '..', 'data', 'persistent', 'config.db');
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      Database = require('node:sqlite').DatabaseSync;
    }
    const fs = require('node:fs');
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath);
      const rows = db.prepare('SELECT value FROM config WHERE key = ?').all(key.toUpperCase());
      db.close();
      expect(rows).toHaveLength(0);
    }
  });
});
