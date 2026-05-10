#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * setupFresh.js — one-command setup for both fresh installs and migrations.
 *
 * Two paths, one command:
 *
 *   npm run setup:fresh                              # brand-new user
 *   npm run setup:fresh -- /path/to/archive.tar.gz   # migrating from another machine
 *
 * Behavior:
 *   - Pre-flights Node version (matches export/import scripts).
 *   - With a tar arg: runs scripts/importMigrationBundle.js, then runs
 *     scripts/bootstrapPingOne.js IFF the imported .env is missing
 *     MCP_GW_CLIENT_ID / AGENT_CLIENT_ID (older archives don't have these).
 *   - Without a tar arg: ensures banking_api_server/.env exists with a real
 *     SESSION_SECRET (so configStore can derive its config.db encryption key),
 *     then runs scripts/bootstrapPingOne.js.
 *   - The bootstrap script preserves SESSION_SECRET / CONFIG_ENCRYPTION_KEY
 *     from any pre-existing .env, so the encrypted config.db stays decryptable
 *     across reruns.
 *
 * Flags forwarded to bootstrapPingOne.js:
 *   --no-browser        terminal prompts only (skip the localhost form)
 *   --non-interactive   read PINGONE_BOOTSTRAP_* env vars (CI / scripted runs)
 *
 * Exit codes:
 *   0  setup completed; ./run-bank.sh ready to start
 *   1  fatal error (import failed, bootstrap failed, validation, etc.)
 *   2  user aborted at bootstrap confirmation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// ── Step 0 — Node version pre-flight ─────────────────────────────────────────
function checkNodeVersion() {
  const ROOT_PKG = path.resolve(__dirname, '..', '..', 'package.json');
  let required = '20';
  try {
    const engines = JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8')).engines;
    const m = engines && engines.node && String(engines.node).match(/(\d+)/);
    if (m) required = m[1];
  } catch (_e) { /* fall back */ }

  const actual = String(process.versions.node || '').split('.')[0];
  if (!actual || actual === required) return;

  console.error(`Node major ${required} required, but this shell is using Node ${process.version}.`);
  console.error('');
  console.error('Fix (zsh/bash) — load nvm into THIS shell, then switch:');
  console.error('  export NVM_DIR="$HOME/.nvm"');
  console.error('  [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"');
  console.error(`  nvm install ${required} && nvm use ${required}`);
  process.exit(1);
}

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Banking demo setup — fresh install or migration

Usage:
  npm run setup:fresh                              Brand-new user (no tar archive)
  npm run setup:fresh -- /path/to/archive.tar.gz   Migrating from another machine

Both paths converge on the same end state: a working banking_api_server/.env with
all PingOne credentials, restored data files (if a tar was provided), and the
demo ready for ./run-bank.sh.

What runs in each case:
  Without tar:  setupFresh -> bootstrapPingOne  (creates apps + writes .env)
  With tar:     setupFresh -> data:import -> bootstrapPingOne (only if needed)

Flags forwarded to bootstrapPingOne.js:
  --no-browser        Skip the localhost form; prompt in terminal only.
  --non-interactive   Read PINGONE_BOOTSTRAP_* env vars (CI).

Step 1 (you): Create a PingOne worker app with "Identity Data Admin" role.
Step 2:       Run this command. The browser pops a form for your worker creds.
Step 3:       ./run-bank.sh

Exit codes:
  0  Setup completed successfully
  1  Fatal error (import or bootstrap failed)
  2  User aborted at bootstrap confirmation
`);
  process.exit(0);
}

checkNodeVersion();

// First non-flag argument is the tar archive path (if any).
const tarArg = args.find(a => !a.startsWith('--'));
const passthroughFlags = args.filter(a => a.startsWith('--'));

const SERVER_ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(SERVER_ROOT, '.env');

// ── Helpers ──────────────────────────────────────────────────────────────────

function runChild(label, scriptArgs) {
  console.log('');
  console.log(`── ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}`);
  console.log('');
  const result = spawnSync('node', scriptArgs, {
    stdio: 'inherit',
    cwd: SERVER_ROOT,
  });
  if (result.error) {
    console.error(`Failed to spawn child: ${result.error.message}`);
    process.exit(1);
  }
  return result.status; // null if killed by signal
}

function envHas(envText, key) {
  return new RegExp(`^${key}=\\S`, 'm').test(envText);
}

function readEnvSafely() {
  try { return fs.readFileSync(ENV_FILE, 'utf8'); }
  catch (_e) { return null; }
}

function ensureEnvForFreshInstall() {
  const existing = readEnvSafely();
  if (existing && envHas(existing, 'SESSION_SECRET')) {
    return { created: false, existed: true };
  }

  // Write a minimal stub so configStore can derive its encryption key. The
  // bootstrap step will rewrite this file with full PingOne credentials and
  // preserve the SESSION_SECRET we generate here.
  const sessionSecret = crypto.randomBytes(32).toString('hex');
  const stub = [
    '# Bootstrap stub — generated by setup:fresh',
    '# bootstrapPingOne preserves SESSION_SECRET on rewrite (so config.db stays decryptable).',
    `SESSION_SECRET=${sessionSecret}`,
    '',
  ].join('\n');

  if (existing) {
    // Existing .env is missing SESSION_SECRET — append rather than overwrite.
    fs.writeFileSync(ENV_FILE, `${existing.replace(/\n*$/, '\n')}${stub}`, 'utf8');
    return { created: false, appended: true };
  }
  fs.writeFileSync(ENV_FILE, stub, 'utf8');
  return { created: true };
}

function importedEnvNeedsBootstrap() {
  const envText = readEnvSafely();
  if (!envText) return true;            // nothing to read; bootstrap is needed
  return !envHas(envText, 'MCP_GW_CLIENT_ID') ||
         !envHas(envText, 'AGENT_CLIENT_ID') ||
         !envHas(envText, 'PINGONE_ENVIRONMENT_ID');
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('Banking demo setup');
  console.log('==================');
  if (tarArg) {
    console.log(`Mode:   migration (importing ${path.basename(tarArg)})`);
  } else {
    console.log('Mode:   fresh install');
  }
  console.log(`Target: ${SERVER_ROOT}`);
  console.log('');

  // Step 1 — import path (tar arg)
  if (tarArg) {
    if (!fs.existsSync(path.resolve(tarArg))) {
      console.error(`Archive not found: ${tarArg}`);
      process.exit(1);
    }
    const importStatus = runChild('Step 1 of 2 — Importing data archive', [
      'scripts/importMigrationBundle.js',
      tarArg,
    ]);
    if (importStatus !== 0) {
      console.error('');
      console.error(`Import failed (exit ${importStatus}). Stopping before bootstrap.`);
      process.exit(1);
    }
    if (!importedEnvNeedsBootstrap()) {
      console.log('');
      console.log('Imported .env already has full PingOne config — skipping bootstrap.');
      printDone({ ranBootstrap: false, fromTar: true });
      return;
    }
    console.log('');
    console.log('Imported .env is missing PingOne config (or older archive without MCP_GW / AGENT vars).');
    console.log('Continuing to bootstrap to provision missing PingOne resources.');
  } else {
    const r = ensureEnvForFreshInstall();
    if (r.created) console.log('Wrote stub banking_api_server/.env with a generated SESSION_SECRET.');
    else if (r.appended) console.log('Appended a generated SESSION_SECRET to existing .env.');
  }

  // Step 2 — bootstrap
  const bootstrapStatus = runChild(
    tarArg ? 'Step 2 of 2 — Provisioning missing PingOne resources' : 'Step 1 of 1 — Provisioning PingOne',
    ['scripts/bootstrapPingOne.js', ...passthroughFlags]
  );

  if (bootstrapStatus === 2) {
    // User aborted at the [y/N] confirm — surface that exit code as-is.
    process.exit(2);
  }
  if (bootstrapStatus !== 0) {
    console.error('');
    console.error(`Bootstrap failed (exit ${bootstrapStatus}).`);
    process.exit(1);
  }

  printDone({ ranBootstrap: true, fromTar: !!tarArg });
}

function printDone({ ranBootstrap, fromTar }) {
  console.log('');
  console.log('================');
  console.log('Setup complete.');
  console.log('================');
  console.log('');
  if (fromTar && !ranBootstrap) {
    console.log('Imported existing config from archive — no PingOne provisioning needed.');
  } else if (fromTar && ranBootstrap) {
    console.log('Imported data archive and provisioned missing PingOne resources.');
  } else {
    console.log('Provisioned PingOne resources for a fresh install.');
  }
  console.log('');
  console.log('Next: start the demo from the repo root:');
  console.log('  ./run-bank.sh');
  console.log('');
  console.log('Then visit:');
  console.log('  https://api.pingdemo.com:4000/configure   (verify config)');
  console.log('  https://api.pingdemo.com:4000/dashboard   (end-user)');
  console.log('  https://api.pingdemo.com:4000/admin       (admin)');
  console.log('');
}

main();
