'use strict';
/**
 * bankingDb — thin better-sqlite3 wrapper for the SQLite-backed banking data.
 *
 * Schema (created on first boot only):
 *   accounts(id PK, userId, accountType, name, balance, currency, status, accountNumber)
 *   transactions(id PK, userId, accountId FK, type, amount, description, createdAt)
 *
 * Seeded idempotently from data/store.js on first boot. Subsequent boots leave
 * banking-resource-server.db untouched (fs.existsSync gate).
 *
 * Mirrors data/store.js accessor API:
 *   getAccountsByUserId(userId)
 *   getTransactionsByUserId(userId, limit?)
 *
 * Pattern modeled on services/configStore.js _getSQLite() — same better-sqlite3
 * primary + node:sqlite fallback for Node 25 (per CLAUDE.md repository quirks).
 *
 * Per CONTEXT.md R2: file path is data/persistent/banking-resource-server.db
 * (NOT data/persistent/banking.db which is a separate, pre-existing
 * transaction-storage file used by data/store.js).
 */

const fs   = require('fs');
const path = require('path');

// B2 fix: filename is `banking-resource-server.db`, NOT `banking.db`.
// A different DB at `data/persistent/banking.db` already exists (used by
// data/store.js to persist transactions — see store.js:20). The dash-hyphen
// name is unambiguous: no executor will confuse it with the pre-existing file.
let DB_PATH = path.join(__dirname, '..', 'data', 'persistent', 'banking-resource-server.db');

const DEFAULT_TX_LIMIT = 50;

let _db = null;

/**
 * For testing only: override the DB file path and reset the singleton.
 * This is exported so integration tests can point at a tmp file.
 */
function _setDbPath(newPath) {
  DB_PATH = newPath;
  _db = null;
}

function _openDb() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  let db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
  } catch (_e) {
    // better-sqlite3 unavailable (e.g. Node 25) — fall back to built-in node:sqlite
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(DB_PATH);
  }
  _db = db;
  return db;
}

function _createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      accountType TEXT,
      name TEXT,
      balance REAL,
      currency TEXT,
      status TEXT,
      accountNumber TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      accountId TEXT,
      type TEXT,
      amount REAL,
      description TEXT,
      createdAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_userId ON transactions(userId);
    CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions(createdAt);
  `);
}

function _seed(db) {
  // Source of truth for the initial seed: the in-memory dataStore singleton.
  // Per CONTEXT.md the existing data/store.js is NOT modified — we only READ from it.
  const dataStore = require('../data/store');
  if (typeof dataStore.getAllAccounts !== 'function' || typeof dataStore.getAllTransactions !== 'function') {
    throw new Error(
      '[bankingDb] data/store.js does not expose getAllAccounts() / getAllTransactions(); ' +
      'cannot seed banking-resource-server.db. Either restore the helpers in store.js or ' +
      'update bankingDb._seed() to iterate the new store API.'
    );
  }
  const allAccounts = dataStore.getAllAccounts();
  const allTransactions = dataStore.getAllTransactions();
  if (allAccounts.length === 0 && allTransactions.length === 0) {
    console.warn('[bankingDb] data/store.js returned 0 accounts AND 0 transactions; ' +
      'banking-resource-server.db will be empty. Confirm sampleData is loaded before initBankingDb() runs.');
  }

  const accountsInsert = db.prepare(
    'INSERT INTO accounts (id, userId, accountType, name, balance, currency, status, accountNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const txInsert = db.prepare(
    'INSERT INTO transactions (id, userId, accountId, type, amount, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  // Single transaction wraps both inserts so a partial failure rolls back cleanly.
  // better-sqlite3 supports db.transaction(fn)(). node:sqlite does NOT have db.transaction()
  // but supports db.exec('BEGIN') / db.exec('COMMIT') / db.exec('ROLLBACK').
  const _runInserts = () => {
    for (const a of allAccounts) {
      accountsInsert.run(
        a.id,
        a.userId,
        a.accountType || null,
        a.name || null,
        a.balance != null ? Number(a.balance) : null,
        a.currency || 'USD',
        a.status || 'active',
        a.accountNumber || (a.accountNumberFull ? '****' + String(a.accountNumberFull).slice(-4) : null)
      );
    }
    for (const t of allTransactions) {
      txInsert.run(
        t.id,
        t.userId,
        t.fromAccountId || t.toAccountId || t.accountId || null,
        t.type || null,
        t.amount != null ? Number(t.amount) : null,
        t.description || t.merchant || t.type || null,
        t.createdAt instanceof Date ? t.createdAt.toISOString() : (t.createdAt || null)
      );
    }
  };
  if (typeof db.transaction === 'function') {
    // better-sqlite3 — uses the built-in transaction wrapper
    db.transaction(_runInserts)();
  } else {
    // node:sqlite fallback — explicit BEGIN/COMMIT
    db.exec('BEGIN');
    try {
      _runInserts();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/**
 * Idempotent initializer. Call once on BFF boot before app.listen.
 * If banking-resource-server.db does not exist, create + seed. If it exists, leave it alone.
 */
function initBankingDb() {
  const alreadyInitialized = fs.existsSync(DB_PATH);
  const db = _openDb();
  _createSchema(db);
  if (!alreadyInitialized) {
    try {
      _seed(db);
      console.log('[bankingDb] Seeded banking-resource-server.db from data/store.js');
    } catch (err) {
      console.error('[bankingDb] Seed failed:', err.message);
      // Schema is in place even if seed throws; on next boot fs.existsSync is true,
      // so we won't retry. Recovery: delete banking-resource-server.db and restart.
    }
  } else {
    console.log('[bankingDb] banking-resource-server.db already exists; skipping seed');
  }
  return db;
}

/**
 * Returns accounts for a user. Parameterized query — userId is bound, not concatenated.
 * Response shape mirrors data/store.js getAccountsByUserId for drop-in compatibility.
 *
 * @param {string} userId
 * @returns {Array<object>}
 */
function getAccountsByUserId(userId) {
  const db = _openDb();
  const stmt = db.prepare('SELECT * FROM accounts WHERE userId = ?');
  return stmt.all(userId);
}

/**
 * Returns the user's most recent transactions, newest first. Parameterized query.
 *
 * @param {string} userId
 * @param {number} [limit=50] defaults to 50 to match the existing /summary slice semantics
 * @returns {Array<object>}
 */
function getTransactionsByUserId(userId, limit) {
  const db = _openDb();
  const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_TX_LIMIT;
  const stmt = db.prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT ?');
  return stmt.all(userId, cap);
}

module.exports = {
  initBankingDb,
  getAccountsByUserId,
  getTransactionsByUserId,
  DB_PATH,
  _setDbPath,
};
