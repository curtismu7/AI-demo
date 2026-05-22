'use strict';
/**
 * bankingDb.lmdb.js — LMDB-backed banking resource server storage.
 *
 * Mirrors bankingDb.js public API:
 *   initBankingDb()                          → Promise<void>
 *   getAccountsByUserId(userId)              → account[]
 *   getTransactionsByUserId(userId, limit?)  → transaction[]
 *   upsertAccount(account)                   → void
 *   upsertTransaction(tx)                    → void
 *
 * Accounts keyed as `acct:<id>`, indexed by `acct_user:<userId>:<id>`.
 * Transactions keyed as `tx:<id>`, indexed by `tx_user:<userId>:<createdAt>:<id>`.
 *
 * NOT imported by bankingDb.js. Wire in by replacing bankingDb.js imports.
 */
const { openEnv } = require('./openEnv');

const ACCT_DB  = 'banking_accounts';
const TX_DB    = 'banking_transactions';

let _initialized = false;

function _accounts() { return openEnv().openDB(ACCT_DB, { encoding: 'json' }); }
function _txns()     { return openEnv().openDB(TX_DB,   { encoding: 'json' }); }

async function initBankingDb() {
  _initialized = true;
}

function getAccountsByUserId(userId) {
  const db = _accounts();
  const prefix = `user:${userId}:`;
  const results = [];
  for (const { key, value } of db.getRange({ start: prefix })) {
    if (!key.startsWith(prefix)) break;
    results.push(value);
  }
  return results;
}

function getTransactionsByUserId(userId, limit = 50) {
  const db = _txns();
  const prefix = `user:${userId}:`;
  const results = [];
  for (const { key, value } of db.getRange({ start: prefix })) {
    if (!key.startsWith(prefix)) break;
    if (results.length >= limit) break;
    results.push(value);
  }
  return results;
}

function upsertAccount(account) {
  const db = _accounts();
  db.putSync(`id:${account.id}`, account);
  db.putSync(`user:${account.userId}:${account.id}`, account);
}

function upsertTransaction(tx) {
  const db = _txns();
  db.putSync(`id:${tx.id}`, tx);
  const ts = tx.createdAt || new Date().toISOString();
  db.putSync(`user:${tx.userId}:${ts}:${tx.id}`, tx);
}

module.exports = { initBankingDb, getAccountsByUserId, getTransactionsByUserId, upsertAccount, upsertTransaction };
