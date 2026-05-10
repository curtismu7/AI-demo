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

Flags:
  --yes               Skip the install-directory confirmation prompt.
  --clean             Wipe stale state (.env, data/persistent, certs) WITHOUT prompting.
  --no-clean          Keep stale state without prompting (skip cleanup).
  --from-installer    (Internal — set by install.sh; skips dir confirm.)
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
// Strip flags we consume locally; everything else passes through to bootstrap.
const LOCAL_FLAGS = new Set(['--from-installer', '--yes', '--clean', '--no-clean']);
const passthroughFlags = args.filter(a => a.startsWith('--') && !LOCAL_FLAGS.has(a));

// `--from-installer` is set by install.sh, which already confirmed the install
// directory with the user — skip our own dir-confirm prompt to avoid double-asking.
// `--yes` skips the dir-confirm prompt (for advanced users / scripted runs).
const FROM_INSTALLER = args.includes('--from-installer');
const SKIP_CONFIRM = FROM_INSTALLER || args.includes('--yes');
// Cleanup mode: --clean = wipe without asking, --no-clean = skip wipe without
// asking, neither = prompt (default behavior, only fires when prior state exists).
const FORCE_CLEAN = args.includes('--clean');
const SKIP_CLEAN = args.includes('--no-clean');

const SERVER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
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

// ── Cleanup of prior installation state ─────────────────────────────────────
//
// A re-run of setup:fresh against a partial install (or stale config) can fail
// in confusing ways:
//   - existing config.db encrypted with an old key won't decrypt against a
//     freshly generated SESSION_SECRET
//   - certs from a prior hostname (api.pingdemo.com+2.pem) get picked up by
//     run-bank.sh and confuse mkcert detection
//   - leftover sessions.db carries logged-in state from another tenant
//
// We detect those, list them to the user, and ask once whether to wipe before
// continuing. Default: skip cleanup (so reruns against intentionally-preserved
// state, like a partial bootstrap, don't lose work). Wipe always backs up .env
// to .env.pre-cleanup-<timestamp> first so the user can recover.

const CLEANUP_TARGETS = [
  // path-relative-to-SERVER_ROOT, label, optional description
  { p: '.env',                                label: 'Server env file' },
  { p: 'data/persistent',                     label: 'Persistent data dir', isDir: true },
  { p: 'data/sessions.db',                    label: 'Active sessions DB' },
  { p: 'data/backups',                        label: 'Pre-import backups',  isDir: true },
];
// Cert dir is sibling of SERVER_ROOT; handled separately.

function findExistingState() {
  const found = [];
  for (const t of CLEANUP_TARGETS) {
    const abs = path.join(SERVER_ROOT, t.p);
    if (fs.existsSync(abs)) {
      // For dirs, only count as "existing state" if non-empty.
      if (t.isDir) {
        try {
          const entries = fs.readdirSync(abs);
          if (entries.length > 0) found.push({ ...t, abs, count: entries.length });
        } catch (_e) { /* unreadable — skip */ }
      } else {
        found.push({ ...t, abs });
      }
    }
  }
  // Certs: detect any *.pem in the certs dir
  const certsDir = path.join(REPO_ROOT, 'certs');
  if (fs.existsSync(certsDir)) {
    try {
      const pems = fs.readdirSync(certsDir).filter(f => f.endsWith('.pem'));
      if (pems.length > 0) found.push({ p: '../certs', label: 'TLS certs', isDir: true, abs: certsDir, count: pems.length });
    } catch (_e) { /* skip */ }
  }
  return found;
}

async function offerCleanup() {
  const found = findExistingState();
  if (found.length === 0) return;     // nothing to clean — silent

  console.log('');
  console.log('Existing state detected');
  console.log('───────────────────────');
  for (const item of found) {
    const desc = item.count != null ? ` (${item.count} item${item.count === 1 ? '' : 's'})` : '';
    console.log(`  • ${item.label}: ${item.abs}${desc}`);
  }
  console.log('');
  console.log('Wiping these gives you a clean slate. Recommended if:');
  console.log('  - this is a re-run after a failed install');
  console.log('  - you changed the PingOne tenant since last setup');
  console.log('  - run-bank.sh is reporting decrypt or hostname errors');
  console.log('');
  console.log('Skip cleanup if you want to preserve current data and only re-run bootstrap.');
  console.log('');

  let wipe;
  if (FORCE_CLEAN) {
    console.log('--clean flag set — wiping without prompting.');
    wipe = true;
  } else if (SKIP_CLEAN) {
    console.log('--no-clean flag set — skipping cleanup.');
    wipe = false;
  } else {
    wipe = await readlineQuestion('Wipe and start fresh?', /* defaultYes */ false);
  }

  if (!wipe) {
    console.log('Continuing without cleanup. Existing state preserved.');
    console.log('');
    return;
  }

  // Backup .env first if it exists, so the user has a recovery path.
  const envPath = path.join(SERVER_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${envPath}.pre-cleanup-${ts}`;
    fs.copyFileSync(envPath, backup);
    console.log(`Backed up .env to ${path.basename(backup)}`);
  }

  for (const item of found) {
    try {
      if (item.isDir) {
        fs.rmSync(item.abs, { recursive: true, force: true });
        // Recreate empty dir for the persistent data path so import scripts find it
        if (item.p === 'data/persistent') fs.mkdirSync(item.abs, { recursive: true });
        console.log(`Removed ${item.label}: ${item.abs}`);
      } else {
        fs.unlinkSync(item.abs);
        console.log(`Removed ${item.label}: ${item.abs}`);
      }
    } catch (err) {
      console.error(`Failed to remove ${item.abs}: ${err.message}`);
      console.error('Continuing anyway — bootstrap may fail. Re-run with --no-clean to skip this prompt.');
    }
  }
  console.log('');
}

// ── Install-directory confirmation ──────────────────────────────────────────
//
// Tell the user where setup will land and let them abort if it's the wrong
// place. Default is "yes" — typing nothing or "y" proceeds; anything else
// aborts cleanly (so the user can `cd` somewhere else and re-run).
// Skipped under --from-installer (install.sh already confirmed) and --yes.

async function confirmInstallDirectory() {
  if (SKIP_CONFIRM) return true;

  console.log('');
  console.log('Install location');
  console.log('────────────────');
  console.log(`  Repo root:  ${REPO_ROOT}`);
  console.log(`  Will write to:`);
  console.log(`    - ${path.join(SERVER_ROOT, '.env')}`);
  console.log(`    - ${path.join(SERVER_ROOT, 'data/persistent/')}*`);
  console.log(`    - ${path.join(REPO_ROOT, 'certs/')}* (if missing)`);
  console.log('');

  const ok = await readlineQuestion('Proceed in this directory?', /* defaultYes */ true);
  if (!ok) {
    console.log('');
    console.log('Aborted. To install elsewhere:');
    console.log('  1. cd to the directory you want');
    console.log('  2. git clone https://github.com/curtismu7/banking-demo.git');
    console.log('  3. cd banking-demo && npm run setup:fresh');
    console.log('');
    console.log('Or use the standalone installer:');
    console.log('  curl -fsSL https://raw.githubusercontent.com/curtismu7/banking-demo/main/install.sh | bash');
    process.exit(2);
  }
  return true;
}

// ── /etc/hosts pre-check ─────────────────────────────────────────────────────
//
// The demo serves on api.ping.demo (loopback). Without the matching /etc/hosts
// entry, the browser fails to load https://api.ping.demo:4000 after setup
// completes — confusing because the bootstrap (which binds 127.0.0.1) succeeds.
// We check upfront, prompt to fix, and on macOS open Terminal.app with the
// sudo command pre-typed so the user runs it without leaving the flow.

const APP_HOST = 'api.ping.demo';
const HOSTS_FILE = '/etc/hosts';
const HOSTS_LINE = `127.0.0.1  ${APP_HOST}`;

function hostsEntryPresent() {
  try {
    const txt = fs.readFileSync(HOSTS_FILE, 'utf8');
    // Match any line that maps a 127.x address to APP_HOST.
    const re = new RegExp(`^\\s*127\\.[0-9.]+\\s+(?:[^\\s#]+\\s+)*${APP_HOST.replace(/\./g, '\\.')}(?:\\s|$)`, 'm');
    return re.test(txt);
  } catch (_e) { return false; }
}

function readlineQuestion(question, defaultYes = true) {
  return new Promise((resolve) => {
    const readline = require('readline');

    // Under `curl ... | bash`, stdin is the HTTP body — not the keyboard. The
    // bash that spawned us inherits that closed/exhausted stdin to node, so
    // process.stdin.isTTY is false and rl.question would resolve immediately
    // with empty input. The user's keyboard is at /dev/tty in that case.
    let input = process.stdin;
    let inputFd = null;
    if (!process.stdin.isTTY) {
      try {
        inputFd = fs.openSync('/dev/tty', 'r');
        input = fs.createReadStream('', { fd: inputFd });
      } catch (_e) {
        // No /dev/tty (CI, headless) — fall back to the default and warn.
        console.log(`(no TTY available — using default ${defaultYes ? 'Yes' : 'No'})`);
        return resolve(defaultYes);
      }
    }

    const rl = readline.createInterface({ input, output: process.stdout, terminal: true });
    const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
    rl.question(question + suffix, (answer) => {
      rl.close();
      // Closing the stream we opened ensures the process can exit cleanly.
      if (inputFd != null) { try { fs.closeSync(inputFd); } catch (_e) {} }
      const s = String(answer || '').trim().toLowerCase();
      if (!s) return resolve(defaultYes);
      resolve(/^y(es)?$/.test(s));
    });
  });
}

function openTerminalWithCommand(command) {
  if (process.platform !== 'darwin') return false;
  // osascript: open Terminal.app, run a new tab, send keystrokes (so the user
  // sees the command pre-typed and just hits Enter / types their password).
  // We use 'do script' which both opens a window AND types the text. The user
  // still has to press Enter — gives them a chance to read what's about to run.
  const escaped = command.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  const script = `tell application "Terminal" to do script "${escaped}"
tell application "Terminal" to activate`;
  try {
    const result = spawnSync('osascript', ['-e', script], { stdio: 'ignore' });
    return result.status === 0;
  } catch (_e) { return false; }
}

async function ensureHostsEntry() {
  if (hostsEntryPresent()) return true;

  console.log('');
  console.log(`The ${APP_HOST} loopback entry is missing from /etc/hosts.`);
  console.log('');
  console.log('Why this matters: the demo serves on https://api.ping.demo:4000. Without the');
  console.log(`/etc/hosts entry your browser will fail to reach it after setup completes.`);
  console.log('');
  console.log('Required line:');
  console.log(`  ${HOSTS_LINE}`);
  console.log('');

  const proceed = await readlineQuestion('Add it now via sudo?', /* defaultYes */ true);
  if (!proceed) {
    console.log('');
    console.log('Skipping. Add it yourself before opening the browser:');
    console.log(`  echo '${HOSTS_LINE}' | sudo tee -a /etc/hosts`);
    console.log('');
    return false;
  }

  const sudoCmd = `echo '${HOSTS_LINE}' | sudo tee -a /etc/hosts`;

  if (process.platform === 'darwin') {
    console.log('');
    console.log('Opening Terminal.app with the sudo command pre-typed.');
    console.log('Press Enter in that window, then your sudo password.');
    const opened = openTerminalWithCommand(sudoCmd);
    if (!opened) {
      console.log('');
      console.log('Could not open Terminal.app. Run this command yourself:');
      console.log(`  ${sudoCmd}`);
    }
  } else {
    console.log('');
    console.log('Run this in another terminal (or here, then re-run setup:fresh):');
    console.log(`  ${sudoCmd}`);
    console.log('');
  }

  // Poll /etc/hosts every 2 seconds for up to 2 minutes.
  console.log('Waiting for /etc/hosts to be updated (Ctrl-C to skip)...');
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    if (hostsEntryPresent()) {
      console.log(`✅ ${APP_HOST} entry found.`);
      console.log('');
      return true;
    }
    process.stdout.write('.');
  }
  console.log('');
  console.log('Timed out waiting. Continuing setup — re-run setup:fresh after adding the entry.');
  console.log('');
  return false;
}

function importedEnvNeedsBootstrap() {
  const envText = readEnvSafely();
  if (!envText) return true;            // nothing to read; bootstrap is needed
  return !envHas(envText, 'MCP_GW_CLIENT_ID') ||
         !envHas(envText, 'AGENT_CLIENT_ID') ||
         !envHas(envText, 'PINGONE_ENVIRONMENT_ID');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
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

  // Step 0 — confirm install directory (skipped when called from install.sh).
  await confirmInstallDirectory();

  // Step 0b — offer to wipe stale state from a previous run. Only fires when
  // existing state is detected; --clean / --no-clean override the prompt.
  await offerCleanup();

  // Step 0c — verify /etc/hosts has the loopback entry (browser needs this).
  // We check before doing any work so the user can fix it once.
  await ensureHostsEntry();

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
  console.log('  https://api.ping.demo:4000/configure   (verify config)');
  console.log('  https://api.ping.demo:4000/dashboard   (end-user)');
  console.log('  https://api.ping.demo:4000/admin       (admin)');
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error(`setup:fresh failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
