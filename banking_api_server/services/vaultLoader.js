'use strict';

/**
 * Vault loader for BFF startup (Phase 269 Plan 03).
 *
 * Reads a secrets.vault file (Plan 01 lib/vault) and copies every entry into
 * configStore via setRaw(data, {persist: false}) — the in-memory cache only,
 * never SQLite. Subsequent configStore.getEffective(name) calls see the
 * vault-supplied values; restarting the process without the vault password
 * causes them to disappear (which is the security property the vault offers).
 *
 * Trust model:
 *   - Vault file is encrypted at rest; safe in `ls -la`, safe in `git diff`.
 *   - VAULT_PASSWORD env var is the auth factor; deleted immediately after
 *     vault.close() to shrink the /proc/<pid>/environ leak window (T-269-06).
 *   - KEK + DEKs are zeroed in vault.close() (T-269-08).
 *
 * Vercel: when process.env.VERCEL === '1', this loader is bypassed entirely
 * (Vercel uses Encrypted Environment Variables — see RESEARCH.md "Serverless
 * treatment" and REQ-VAULT-11).
 *
 * Errors:
 *   - VAULT_PASSWORD missing → throws (fail-fast; caller should exit 1).
 *   - VaultAuthError / VaultIntegrityError → rethrown (no oracle).
 *   - Only err.message is logged — never err.stack (no argon/kek/dek leak).
 *
 * DI shape — every dependency is overridable for tests:
 *   loadVaultIntoConfigStore({
 *     vaultPath,    // default: process.env.VAULT_PATH || REPO_ROOT/secrets.vault
 *     password,     // default: process.env.VAULT_PASSWORD
 *     configStore,  // default: require('./configStore')
 *     vaultLib,     // default: require('../lib/vault')
 *     logger,       // default: console
 *     isVercel,     // default: process.env.VERCEL === '1'
 *   }) → { loaded: boolean, entries: number, reason?: string }
 */

const path = require('node:path');
const fs = require('node:fs');

// REPO_ROOT = banking_api_server's parent directory.
// Default vault path is REPO_ROOT/secrets.vault — single source of truth
// shared with Plan 04 (docs) and Plan 05 (setupFresh wiring).
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_VAULT_PATH = path.join(REPO_ROOT, 'secrets.vault');

async function loadVaultIntoConfigStore(opts = {}) {
  const vaultPath  = opts.vaultPath   ?? process.env.VAULT_PATH ?? DEFAULT_VAULT_PATH;
  const password   = opts.password    ?? process.env.VAULT_PASSWORD;
  const configStore = opts.configStore ?? require('./configStore');
  const vaultLib    = opts.vaultLib    ?? require('../lib/vault');
  const logger      = opts.logger      ?? console;
  const isVercel    = opts.isVercel    ?? (process.env.VERCEL === '1');

  // 1. Vercel bypass — Encrypted Environment Variables are the source of truth there.
  if (isVercel) {
    logger.log('[vault] Vercel environment detected — skipping vault load (use Encrypted Environment Variables)');
    return { loaded: false, entries: 0, reason: 'vercel' };
  }

  // 2. No vault file → silent no-op (env-var + configStore values still resolve).
  if (!fs.existsSync(vaultPath)) {
    logger.log('[vault] no vault file at ' + vaultPath + ' — skipping (env-var + configStore values will be used)');
    return { loaded: false, entries: 0, reason: 'no_vault_file' };
  }

  // 3. Vault file exists but no password → fail-fast.
  //    NEVER silently fall through to env-only mode (T-269-14): operator must resolve.
  if (!password) {
    const msg = '[vault] secrets.vault exists but VAULT_PASSWORD not set — refusing to start';
    logger.error(msg);
    const err = new Error(msg);
    err.code = 'VAULT_PASSWORD_MISSING';
    throw err;
  }

  // 4. Open the vault. lib/vault returns the same opaque error for wrong-password
  //    and tampered-file — we log only err.message (no err.stack — no argon2 names).
  let vault;
  try {
    vault = await vaultLib.openVault(vaultPath, password);
  } catch (err) {
    logger.error('[vault] open failed:', err.message);
    throw err;
  }

  // 5. Copy entries into configStore in a single setRaw batch + 6. close in finally.
  let entryCount = 0;
  try {
    const data = {};
    for (const name of vault.list()) {
      data[name.toLowerCase()] = vault.read(name);
      entryCount++;
    }
    if (entryCount > 0) {
      await configStore.setRaw(data, { persist: false });
    }
  } finally {
    // KEK + DEKs get zeroed even if the read loop threw partway through —
    // a leaked-key process is worse than a partially-cached one.
    try { vault.close(); } catch (_) { /* ignore */ }
    // 7. Shrink the /proc/<pid>/environ leak window (T-269-06).
    //    Idempotent: delete on an unset var is a no-op.
    delete process.env.VAULT_PASSWORD;
  }

  logger.log('[vault] loaded ' + entryCount + ' entries from ' + vaultPath);
  return { loaded: true, entries: entryCount };
}

module.exports = { loadVaultIntoConfigStore, DEFAULT_VAULT_PATH };
