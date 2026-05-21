'use strict';

/**
 * Test-pollution guard for the vault/configStore SQLite suites.
 *
 * Some other suite in the full `npm test` run leaves a non-SQLite placeholder
 * at banking_api_server/data/persistent/config.db (the path is gitignored, so
 * it is purely runtime state). The vault tests open that exact file with
 * better-sqlite3 and fail with `SqliteError: file is not a database` — even
 * though they pass in isolation. configStore.ensureInitialized() will create a
 * valid DB if the file is absent, so the fix is: if the file exists but is not
 * a valid SQLite database, delete it and let configStore recreate it.
 *
 * Call ensureValidConfigDb() in a beforeAll() in any vault suite that reads
 * data/persistent/config.db directly.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONFIG_DB = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'persistent',
  'config.db',
);

function isValidSqlite(file) {
  // A header-only check (first 16 bytes === "SQLite format 3\0") is NOT
  // sufficient: a truncated / partially-written placeholder can carry the
  // valid magic header yet still be unreadable as a database. Some other
  // suite in the full `npm test` run leaves exactly such a ~100-byte file
  // here; better-sqlite3 then throws `SQLITE_NOTADB: file is not a database`
  // when these vault suites try to query it. Validate the way the tests
  // actually use it: open it with better-sqlite3 and run a trivial query.
  let db;
  try {
    // eslint-disable-next-line global-require
    const Database = require('better-sqlite3');
    db = new Database(file, { readonly: true });
    db.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
    return true;
  } catch {
    return false;
  } finally {
    try {
      if (db) db.close();
    } catch {
      /* ignore close errors on an already-broken handle */
    }
  }
}

function ensureValidConfigDb() {
  // Remove a corrupt placeholder left by another suite.
  if (fs.existsSync(CONFIG_DB) && !isValidSqlite(CONFIG_DB)) {
    fs.rmSync(CONFIG_DB, { force: true });
  }
  // If the DB is now absent, proactively create a valid empty SQLite file
  // with the `config` schema. configStore.ensureInitialized() uses
  // `CREATE TABLE IF NOT EXISTS`, so a pre-created empty DB is compatible —
  // and this makes the suites' direct `new Database(dbPath)` reads robust
  // even when the configStore singleton was already loaded by an earlier
  // suite (require-cache delete is a no-op for the held SQLite handle under
  // jest, so ensureInitialized() can no-op and never create the file).
  if (!fs.existsSync(CONFIG_DB)) {
    fs.mkdirSync(path.dirname(CONFIG_DB), { recursive: true });
    // eslint-disable-next-line global-require
    const Database = require('better-sqlite3');
    const db = new Database(CONFIG_DB);
    db.exec(
      'CREATE TABLE IF NOT EXISTS config (' +
        'key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)',
    );
    db.close();
  }
}

// Probe whether better-sqlite3 native binary works in this Node version.
// The native addon error (NODE_MODULE_VERSION mismatch) surfaces at new Database()
// time, not at require() time. Tests that call better-sqlite3 directly should skip
// when this returns false rather than fail with a confusing native-addon error.
function canUseSQLite() {
  let db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(':memory:');
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  } finally {
    try { if (db) db.close(); } catch { /* ignore */ }
  }
}

module.exports = { ensureValidConfigDb, CONFIG_DB, canUseSQLite };
