'use strict';
/**
 * migrate.js — one-shot SQLite → LMDB migration.
 *
 * Run once (while server is stopped) to copy all live data into LMDB:
 *   node demo_api_server/services/lmdb/migrate.js
 *
 * Idempotent: re-running overwrites LMDB with current SQLite state.
 * Does not modify any SQLite files.
 *
 * Reports counts for each database on completion.
 */
const path     = require('node:path');
const fs       = require('node:fs');
const Database = require('better-sqlite3');

const { openEnv, closeEnv }                         = require('./openEnv');
const configLmdb                                     = require('./configStore.lmdb');
const { upsertAccount, upsertTransaction }           = require('./bankingDb.lmdb');
const { persistTransaction }                         = require('./transactionStore.lmdb');

const DATA_DIR  = path.join(__dirname, '../../data/persistent');
const SESS_PATH = path.join(__dirname, '../../data/sessions.db');

function openSqlite(dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true });
}

function migrateConfig() {
  const db = openSqlite(path.join(DATA_DIR, 'config.db'));
  if (!db) { console.log('[migrate] config.db not found — skipping'); return 0; }
  const rows = db.prepare('SELECT key, value FROM config').all();
  db.close();
  for (const { key, value } of rows) configLmdb.upsert(key, value);
  console.log(`[migrate] config: ${rows.length} rows`);
  return rows.length;
}

function migrateSessions() {
  const db = openSqlite(SESS_PATH);
  if (!db) { console.log('[migrate] sessions.db not found — skipping'); return 0; }
  const sessDb = openEnv().openDB('sessions', { encoding: 'json' });
  const now = Date.now();
  const rows = db.prepare('SELECT sid, sess, expire FROM sessions WHERE expire > ?').all(now);
  db.close();
  let count = 0;
  for (const { sid, sess, expire } of rows) {
    try {
      const parsed = JSON.parse(sess);
      sessDb.putSync(sid, { sess: parsed, expire });
      count++;
    } catch (_) {}
  }
  console.log(`[migrate] sessions: ${count} active sessions`);
  return count;
}

function migrateBankingResourceServer() {
  const db = openSqlite(path.join(DATA_DIR, 'banking-resource-server.db'));
  if (!db) { console.log('[migrate] banking-resource-server.db not found — skipping'); return { accounts: 0, txns: 0 }; }
  const accounts = db.prepare('SELECT * FROM accounts').all();
  const txns     = db.prepare('SELECT * FROM transactions').all();
  db.close();
  for (const a of accounts) upsertAccount(a);
  for (const t of txns)     upsertTransaction(t);
  console.log(`[migrate] banking-resource-server: ${accounts.length} accounts, ${txns.length} transactions`);
  return { accounts: accounts.length, txns: txns.length };
}

function migrateBankingDb() {
  const dbPath = path.join(DATA_DIR, 'banking.db');
  let db;
  try {
    db = openSqlite(dbPath);
  } catch (e) {
    console.log(`[migrate] banking.db could not be opened (${e.message}) — skipping`);
    return 0;
  }
  if (!db) { console.log('[migrate] banking.db not found — skipping'); return 0; }
  let rows;
  try {
    rows = db.prepare('SELECT * FROM transactions').all();
  } catch (e) {
    console.log(`[migrate] banking.db read failed (${e.message}) — skipping`);
    db.close();
    return 0;
  }
  db.close();
  for (const tx of rows) persistTransaction(tx);
  console.log(`[migrate] banking.db transactions: ${rows.length} rows`);
  return rows.length;
}

function migrateDelegations() {
  const db = openSqlite(path.join(DATA_DIR, 'delegations.db'));
  if (!db) { console.log('[migrate] delegations.db not found — skipping'); return 0; }
  const rows = db.prepare('SELECT * FROM delegations').all();
  db.close();
  const lmdbDb = openEnv().openDB('delegations', { encoding: 'json' });
  for (const row of rows) {
    const record = { ...row, scopes: JSON.parse(row.scopes || '[]') };
    lmdbDb.putSync(record.id, record);
  }
  console.log(`[migrate] delegations: ${rows.length} rows`);
  return rows.length;
}

function migrateDemoAccounts() {
  const dbPath = path.join(DATA_DIR, 'demoAccounts.db');
  const db = openSqlite(dbPath);
  if (!db) { console.log('[migrate] demoAccounts.db not found — skipping'); return 0; }
  const rows = db.prepare('SELECT * FROM demo_accounts').all();
  db.close();
  const lmdbDb = openEnv().openDB('demo_accounts', { encoding: 'json' });
  for (const row of rows) lmdbDb.putSync(row.id, row);
  console.log(`[migrate] demo_accounts: ${rows.length} rows`);
  return rows.length;
}

async function main() {
  console.log('[migrate] Starting SQLite → LMDB migration...');
  migrateConfig();
  migrateSessions();
  migrateBankingResourceServer();
  migrateBankingDb();
  migrateDelegations();
  migrateDemoAccounts();
  closeEnv();
  console.log('[migrate] Done. LMDB data at demo_api_server/data/persistent/lmdb/');
}

main().catch(e => { console.error('[migrate] FAILED:', e); process.exit(1); });
