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

// ── Status banners ──────────────────────────────────────────────────────────
//
// Visual structure for the multi-phase setup so the user always knows
// where in the flow they are. Each phase has a numbered banner; results
// (success/skip/fail) print on completion.

function banner(text) {
  const width = Math.max(60, text.length + 4);
  const line = '═'.repeat(width);
  console.log('');
  console.log(line);
  console.log(`  ${text}`);
  console.log(line);
  console.log('');
}

function phase(num, total, text) {
  console.log('');
  console.log(`▶ STEP ${num}/${total} — ${text}`);
  console.log(`  ${'─'.repeat(Math.max(0, 60 - 2))}`);
}

function ok(text)   { console.log(`✓ ${text}`); }
function skip(text) { console.log(`○ ${text}`); }
function fail(text) { console.log(`✗ ${text}`); }

// ── npm install pre-flight ──────────────────────────────────────────────────
//
// Without node_modules, bootstrapPingOne fails silently when it tries to
// require('axios') etc. importMigrationBundle has its own pre-flight; we
// add the same one to the fresh-install path so it doesn't matter which
// route the user came in on.

function ensureDependencies() {
  const nm = path.join(SERVER_ROOT, 'node_modules');
  if (fs.existsSync(nm)) return { installed: false };

  console.log('');
  console.log(`  banking_api_server/node_modules not found.`);
  console.log(`  Running npm install...`);
  console.log('');
  const result = spawnSync('npm', ['install'], { stdio: 'inherit', cwd: SERVER_ROOT });
  if (result.error) {
    fail(`Failed to spawn npm: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    fail(`npm install failed (exit ${result.status}). Fix the error above and retry.`);
    process.exit(1);
  }
  return { installed: true };
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
  banner('Banking demo setup');
  if (tarArg) {
    console.log(`  Mode:   migration (importing ${path.basename(tarArg)})`);
  } else {
    console.log(`  Mode:   fresh install`);
  }
  console.log(`  Target: ${SERVER_ROOT}`);

  // We number phases dynamically — only count what'll actually run for THIS
  // user, so "step 3 of 5" reflects reality instead of a fixed 6-step count
  // that includes phases we'll skip.
  const phases = ['confirm-dir', 'cleanup', 'deps', 'hosts'];
  if (tarArg) phases.push('import');
  phases.push('bootstrap');
  const total = phases.length;
  let n = 0;

  // Phase: confirm install directory (skipped under --from-installer)
  n++;
  if (!SKIP_CONFIRM) {
    phase(n, total, 'Confirm install directory');
    await confirmInstallDirectory();
    ok(`Installing into ${SERVER_ROOT}`);
  } else {
    phase(n, total, 'Install directory (auto-confirmed by installer)');
    skip(`Using ${SERVER_ROOT}`);
  }

  // Phase: cleanup prior state (silent if nothing to clean)
  n++;
  phase(n, total, 'Clean up prior installation state');
  await offerCleanup();
  // offerCleanup() prints its own status; we don't add an explicit ok here.

  // Phase: install dependencies if missing
  n++;
  phase(n, total, 'Install banking_api_server dependencies');
  const deps = ensureDependencies();
  if (deps.installed) ok('npm install complete');
  else                skip('node_modules already present');

  // Phase: /etc/hosts loopback entry
  n++;
  phase(n, total, 'Verify /etc/hosts entry for api.ping.demo');
  const hostsOk = await ensureHostsEntry();
  if (hostsOk) ok('/etc/hosts entry present');
  else         fail('/etc/hosts entry missing — browser will fail until you add it');

  // Phase: import archive (only when tar arg given)
  let skipBootstrap = false;
  if (tarArg) {
    n++;
    phase(n, total, `Import data archive (${path.basename(tarArg)})`);
    if (!fs.existsSync(path.resolve(tarArg))) {
      fail(`Archive not found: ${tarArg}`);
      process.exit(1);
    }
    const importStatus = runChild('Importing', [
      'scripts/importMigrationBundle.js',
      tarArg,
    ]);
    if (importStatus !== 0) {
      fail(`Import failed (exit ${importStatus}). Stopping before bootstrap.`);
      process.exit(1);
    }
    ok('Archive imported');
    if (!importedEnvNeedsBootstrap()) {
      console.log('');
      console.log('  Imported .env already has full PingOne config — skipping bootstrap.');
      skipBootstrap = true;
    } else {
      console.log('');
      console.log('  Imported .env is missing some PingOne config — continuing to bootstrap.');
    }
  } else {
    const r = ensureEnvForFreshInstall();
    if (r.created)       ok('Wrote stub banking_api_server/.env with generated SESSION_SECRET');
    else if (r.appended) ok('Appended generated SESSION_SECRET to existing .env');
    else                 skip('.env already has SESSION_SECRET');
  }

  // Phase: bootstrap PingOne
  n++;
  if (skipBootstrap) {
    phase(n, total, 'Provision PingOne (skipped — already configured)');
    skip('Imported config covers all required PingOne resources');
    printDone({ ranBootstrap: false, fromTar: true });
    return;
  }

  phase(n, total, 'Provision PingOne resources');
  console.log('  This step opens a browser form for your worker creds, then');
  console.log('  creates resource servers, scopes, applications, users, and writes .env.');
  console.log('');
  const bootstrapStatus = runChild('Bootstrap', [
    'scripts/bootstrapPingOne.js',
    ...passthroughFlags,
  ]);

  if (bootstrapStatus === 2) {
    fail('User aborted bootstrap at the confirmation prompt');
    process.exit(2);
  }
  if (bootstrapStatus !== 0) {
    fail(`Bootstrap failed (exit ${bootstrapStatus})`);
    process.exit(1);
  }
  ok('PingOne resources provisioned');

  printDone({ ranBootstrap: true, fromTar: !!tarArg });
}

function printDone({ ranBootstrap, fromTar }) {
  banner('Setup complete');

  if (fromTar && !ranBootstrap) {
    console.log('  Mode:  migration (archive imported, PingOne already configured)');
  } else if (fromTar && ranBootstrap) {
    console.log('  Mode:  migration + bootstrap (archive imported, missing apps provisioned)');
  } else {
    console.log('  Mode:  fresh install');
  }
  console.log('');

  // Summary of what's actually on disk now.
  console.log('  What was set up:');
  const envKeys = readEnvKeys();
  if (envKeys.length > 0) {
    console.log(`    ✓ banking_api_server/.env  (${envKeys.length} keys)`);
    const groups = groupEnvKeys(envKeys);
    for (const [label, keys] of groups) {
      if (keys.length > 0) console.log(`        - ${label.padEnd(26)} ${keys.join(', ')}`);
    }
  }
  if (fs.existsSync(path.join(SERVER_ROOT, 'data', 'persistent'))) {
    const files = fs.readdirSync(path.join(SERVER_ROOT, 'data', 'persistent'));
    if (files.length > 0) console.log(`    ✓ data/persistent/         ${files.length} file(s)`);
  }
  const certsDir = path.join(REPO_ROOT, 'certs');
  if (fs.existsSync(certsDir) && fs.readdirSync(certsDir).filter(f => f.endsWith('.pem')).length > 0) {
    console.log(`    ✓ certs/                    TLS certificates present`);
  } else {
    console.log(`    ○ certs/                    not yet generated (run-bank.sh will create on first start)`);
  }
  console.log('');

  console.log('  Next steps:');
  console.log(`    1. Start the demo:    cd ${REPO_ROOT} && ./run-bank.sh`);
  console.log('    2. Open in browser:');
  console.log('        https://api.ping.demo:4000/configure   verify config');
  console.log('        https://api.ping.demo:4000/dashboard   end-user portal');
  console.log('        https://api.ping.demo:4000/admin       admin portal');
  console.log('');
  console.log('  If you forgot the demo passwords, see the bootstrap output above');
  console.log('  (or look in banking_api_server/.env at DEMO_USER_PASSWORD / DEMO_ADMIN_PASSWORD).');
  console.log('');
}

function readEnvKeys() {
  const text = readEnvSafely();
  if (!text) return [];
  return Array.from(new Set(
    text.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => l.split('=')[0])
      .filter(Boolean)
  ));
}

function groupEnvKeys(keys) {
  const groups = new Map([
    ['PingOne env',       keys.filter(k => k.startsWith('PINGONE_ENVIRONMENT_ID') || k === 'PINGONE_REGION')],
    ['OAuth clients',     keys.filter(k => /CLIENT_ID|CLIENT_SECRET|REDIRECT_URI/.test(k))],
    ['MCP gateway/agent', keys.filter(k => /^MCP_GW_|^AGENT_/.test(k))],
    ['Resource server',   keys.filter(k => /^MCP_RESOURCE|^ENDUSER_AUDIENCE/.test(k))],
    ['Demo users',        keys.filter(k => /^DEMO_/.test(k))],
    ['Session/encryption',keys.filter(k => /^SESSION_SECRET|^CONFIG_ENCRYPTION_KEY/.test(k))],
  ]);
  return Array.from(groups.entries());
}

main().catch((err) => {
  console.error('');
  console.error(`setup:fresh failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
