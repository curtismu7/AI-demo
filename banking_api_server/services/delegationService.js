'use strict';

const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const axios   = require('axios');
const configStore = require('./configStore');
const { getManagementToken } = require('./pingOneClientService');
const { fetchPingOneUserByUsername } = require('./pingOneUserLookupService');
const { fetchFirstPopulationId } = require('./pingoneBootstrapService');

// ---------------------------------------------------------------------------
// Storage — SQLite locally, in-memory on Vercel
// ---------------------------------------------------------------------------

const VALID_SCOPES = [
  'view_accounts',
  'view_balances',
  'create_deposit',
  'create_withdrawal',
  'create_transfer',
];

let _db = null;       // SQLite instance (non-Vercel)
let _mem = null;      // Map (Vercel / test)

const IS_VERCEL = process.env.VERCEL === '1';

function getStorage() {
  if (IS_VERCEL) {
    if (!_mem) _mem = new Map();
    return { type: 'memory', map: _mem };
  }
  if (!_db) {
    const dbDir = path.join(__dirname, '../data/persistent');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const Database = require('better-sqlite3');
    _db = new Database(path.join(dbDir, 'delegations.db'));
    _db.exec(`
      CREATE TABLE IF NOT EXISTS delegations (
        id TEXT PRIMARY KEY,
        delegator_user_id TEXT NOT NULL,
        delegate_user_id TEXT,
        delegate_email TEXT NOT NULL,
        delegator_email TEXT,
        scopes TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        granted_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_del_delegator ON delegations(delegator_user_id);
    `);
  }
  return { type: 'sqlite', db: _db };
}

function toRecord(row) {
  if (!row) return null;
  return {
    ...row,
    scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : (row.scopes || []),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _sendDelegationEmail(delegateUserId, type, delegatorEmail) {
  if (!delegateUserId) return;
  try {
    const token  = await getManagementToken();
    const envId  = configStore.getEffective('pingone_environment_id') || '';
    const region = configStore.getEffective('pingone_region') || 'com';
    if (!envId) return;

    const subject = type === 'grant'
      ? 'Super Banking \u2014 You have been granted account access'
      : 'Super Banking \u2014 Account access revoked';

    const body = type === 'grant'
      ? `<html><body style="font-family:sans-serif;background:#f9fafb;padding:32px">
          <div style="max-width:480px;margin:auto;background:#fff;border-radius:10px;padding:32px;border:1px solid #e5e7eb">
            <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;padding:20px 24px;margin-bottom:24px">
              <h2 style="color:#fff;margin:0;font-size:20px">Super Banking</h2>
            </div>
            <h3 style="color:#1e40af">Account Access Granted</h3>
            <p style="color:#374151">${delegatorEmail || 'A Super Banking user'} has granted you access to their accounts.</p>
            <p style="color:#374151">Log in to Super Banking to view the delegated accounts.</p>
          </div>
        </body></html>`
      : `<html><body style="font-family:sans-serif;background:#f9fafb;padding:32px">
          <div style="max-width:480px;margin:auto;background:#fff;border-radius:10px;padding:32px;border:1px solid #e5e7eb">
            <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px;padding:20px 24px;margin-bottom:24px">
              <h2 style="color:#fff;margin:0;font-size:20px">Super Banking</h2>
            </div>
            <h3 style="color:#dc2626">Account Access Revoked</h3>
            <p style="color:#374151">Your access to ${delegatorEmail ? `${delegatorEmail}'s` : "the delegated"} accounts has been revoked.</p>
          </div>
        </body></html>`;

    await axios.post(
      `https://api.pingone.${region}/v1/environments/${envId}/users/${delegateUserId}/messages`,
      { content: [{ deliveryMethod: 'Email', subject, body, charset: 'UTF-8' }] },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 },
    );
  } catch (err) {
    console.error('[delegationService] email send failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// grantDelegation
// ---------------------------------------------------------------------------

async function grantDelegation({ delegatorUserId, delegatorEmail, delegateEmail, scopes }) {
  // Validate input
  if (!delegateEmail) {
    return { ok: false, error: 'validation_error', message: 'delegateEmail is required.' };
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return { ok: false, error: 'validation_error', message: 'At least one scope is required.' };
  }
  const invalidScopes = scopes.filter(s => !VALID_SCOPES.includes(s));
  if (invalidScopes.length > 0) {
    return { ok: false, error: 'validation_error', message: `Invalid scopes: ${invalidScopes.join(', ')}` };
  }

  // Prevent self-delegation
  if (delegatorEmail && delegatorEmail.toLowerCase() === delegateEmail.toLowerCase()) {
    return { ok: false, error: 'self_delegation', message: 'Cannot delegate to yourself.' };
  }

  const storage = getStorage();

  // Prevent duplicate active delegation
  if (storage.type === 'sqlite') {
    const existing = storage.db.prepare(
      'SELECT id FROM delegations WHERE delegator_user_id = ? AND delegate_email = ? AND status = ?'
    ).get(delegatorUserId, delegateEmail.toLowerCase(), 'active');
    if (existing) {
      return { ok: false, error: 'duplicate_delegation', message: 'Active delegation already exists for this email.' };
    }
  } else {
    for (const rec of storage.map.values()) {
      if (rec.delegator_user_id === delegatorUserId &&
          rec.delegate_email.toLowerCase() === delegateEmail.toLowerCase() &&
          rec.status === 'active') {
        return { ok: false, error: 'duplicate_delegation', message: 'Active delegation already exists for this email.' };
      }
    }
  }

  // Look up delegate in PingOne
  let delegateUserId = null;
  const { user: existingUser } = await fetchPingOneUserByUsername(delegateEmail).catch(() => ({ user: null }));

  if (existingUser) {
    delegateUserId = existingUser.id;
  } else {
    // Provision new user via Management API
    try {
      const token   = await getManagementToken();
      const envId   = configStore.getEffective('pingone_environment_id') || '';
      const region  = configStore.getEffective('pingone_region') || 'com';
      const apiRoot = `https://api.pingone.${region}/v1/environments/${envId}`;
      const popId   = await fetchFirstPopulationId(token, apiRoot);

      const userRes = await axios.post(
        `${apiRoot}/users`,
        {
          email: delegateEmail,
          username: delegateEmail,
          name: { given: 'Family', family: 'Member' },
          population: { id: popId },
          lifecycle: { status: 'ACCOUNT_OK' },
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 },
      );
      delegateUserId = userRes.data.id;
    } catch (err) {
      return {
        ok: false,
        error: 'provisioning_failed',
        message: err.response?.data?.message || err.message,
      };
    }
  }

  // Build record
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    delegator_user_id: delegatorUserId,
    delegator_email: delegatorEmail || '',
    delegate_email: delegateEmail.toLowerCase(),
    delegate_user_id: delegateUserId,
    scopes: JSON.stringify(scopes),
    status: 'active',
    granted_at: now,
    revoked_at: null,
  };

  // Persist
  if (storage.type === 'sqlite') {
    storage.db.prepare(`
      INSERT INTO delegations (id, delegator_user_id, delegator_email, delegate_email, delegate_user_id, scopes, status, granted_at, revoked_at)
      VALUES (@id, @delegator_user_id, @delegator_email, @delegate_email, @delegate_user_id, @scopes, @status, @granted_at, @revoked_at)
    `).run(record);
  } else {
    storage.map.set(record.id, record);
  }

  // Send grant email (best-effort, non-blocking)
  setImmediate(() =>
    _sendDelegationEmail(delegateUserId, 'grant', delegatorEmail).catch(() => {})
  );

  return { ok: true, delegation: toRecord(record) };
}

// ---------------------------------------------------------------------------
// revokeDelegation
// ---------------------------------------------------------------------------

async function revokeDelegation(id, delegatorUserId) {
  const storage = getStorage();
  const now = new Date().toISOString();

  if (storage.type === 'sqlite') {
    const row = storage.db.prepare(
      'SELECT * FROM delegations WHERE id = ? AND delegator_user_id = ?'
    ).get(id, delegatorUserId);
    if (!row || row.status === 'revoked') {
      return { ok: false, error: 'not_found' };
    }
    storage.db.prepare(
      'UPDATE delegations SET status = ?, revoked_at = ? WHERE id = ?'
    ).run('revoked', now, id);

    // Send revoke email (best-effort)
    const delegateUserId = row.delegate_user_id;
    const delegatorEmail = row.delegator_email;
    setImmediate(() =>
      _sendDelegationEmail(delegateUserId, 'revoke', delegatorEmail).catch(() => {})
    );
  } else {
    const rec = storage.map.get(id);
    if (!rec || rec.delegator_user_id !== delegatorUserId || rec.status === 'revoked') {
      return { ok: false, error: 'not_found' };
    }
    rec.status = 'revoked';
    rec.revoked_at = now;
    storage.map.set(id, rec);

    setImmediate(() =>
      _sendDelegationEmail(rec.delegate_user_id, 'revoke', rec.delegator_email).catch(() => {})
    );
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// listDelegations
// ---------------------------------------------------------------------------

async function listDelegations(delegatorUserId) {
  const storage = getStorage();
  if (storage.type === 'sqlite') {
    const rows = storage.db.prepare(
      'SELECT * FROM delegations WHERE delegator_user_id = ? AND status = ? ORDER BY granted_at DESC'
    ).all(delegatorUserId, 'active');
    return rows.map(toRecord);
  }
  const result = [];
  for (const rec of storage.map.values()) {
    if (rec.delegator_user_id === delegatorUserId && rec.status === 'active') {
      result.push(toRecord(rec));
    }
  }
  return result.sort((a, b) => b.granted_at.localeCompare(a.granted_at));
}

// ---------------------------------------------------------------------------
// getDelegationHistory
// ---------------------------------------------------------------------------

async function getDelegationHistory(delegatorUserId) {
  const storage = getStorage();
  if (storage.type === 'sqlite') {
    const rows = storage.db.prepare(
      'SELECT * FROM delegations WHERE delegator_user_id = ? ORDER BY granted_at DESC'
    ).all(delegatorUserId);
    return rows.map(toRecord);
  }
  const result = [];
  for (const rec of storage.map.values()) {
    if (rec.delegator_user_id === delegatorUserId) {
      result.push(toRecord(rec));
    }
  }
  return result.sort((a, b) => b.granted_at.localeCompare(a.granted_at));
}

module.exports = { grantDelegation, revokeDelegation, listDelegations, getDelegationHistory };
