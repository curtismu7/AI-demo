'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

// ── Step 0a — Node version pre-flight ─────────────────────────────────────────
// Catch the common "ran in a shell where nvm isn't loaded" case before sqlite/tar
// errors mask the root cause. Reads required major from root package.json#engines.node.
function checkNodeVersion() {
  const ROOT_PKG = path.resolve(__dirname, '..', '..', 'package.json');
  let required = '20';
  try {
    const engines = JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8')).engines;
    const m = engines && engines.node && String(engines.node).match(/(\d+)/);
    if (m) required = m[1];
  } catch (_e) { /* fall back to default */ }

  const actual = String(process.versions.node || '').split('.')[0];
  if (!actual || actual === required) return;

  console.error(`Node major ${required} required, but this shell is using Node ${process.version}.`);
  console.error('');
  console.error('Fix (zsh/bash) — load nvm into THIS shell, then switch:');
  console.error('  export NVM_DIR="$HOME/.nvm"');
  console.error('  [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"');
  console.error(`  nvm install ${required} && nvm use ${required}`);
  console.error('');
  console.error('Persist for future shells: add the two export/source lines above to');
  console.error('  ~/.zshrc (zsh)   or   ~/.bashrc (bash)');
  console.error('');
  console.error('No nvm yet? Install: https://github.com/nvm-sh/nvm#installing-and-updating');
  console.error('');
  console.error('Then re-run this command from the banking-demo repo.');
  process.exit(1);
}
checkNodeVersion();

// ── Step 0b — package pre-flight ──────────────────────────────────────────────

const SERVER_ROOT = path.resolve(__dirname, '..');

// Check 1 — node_modules present
if (!fs.existsSync(path.join(SERVER_ROOT, 'node_modules'))) {
  console.log('node_modules not found. Running npm install...');
  const result = spawnSync('npm', ['install'], { stdio: 'inherit', cwd: SERVER_ROOT });
  if (result.status !== 0) {
    console.error('npm install failed. Fix the error above and retry.');
    process.exit(1);
  }
}

// Check 2 — tar loadable
let tar;
try {
  tar = require('tar');
} catch (_e) {
  console.error('Required package "tar" is not installed.');
  console.error('Run:  cd banking_api_server && npm install');
  console.error('Then retry the import.');
  process.exit(1);
}

// Checks 3 & 4 — sqlite driver available and native binary usable
// The import script needs configStore (which uses better-sqlite3 or node:sqlite internally).
// Here we just verify at least one driver works so we can give an early, clear error.
function checkSqliteDriver() {
  let Db = null;
  let loadMsg = '';
  try {
    Db = require('better-sqlite3');
  } catch (loadErr) {
    loadMsg = (loadErr && loadErr.message) || String(loadErr);
  }

  if (Db) {
    let probeOk = false;
    let probeMismatch = false;
    try {
      const probe = new Db(':memory:');
      probe.close();
      probeOk = true;
    } catch (probeErr) {
      const msg = probeErr?.message || '';
      probeMismatch =
        msg.includes('NODE_MODULE_VERSION') ||
        msg.includes('wrong architecture') ||
        msg.includes('invalid ELF') ||
        probeErr?.code === 'ERR_DLOPEN_FAILED';
      if (!probeMismatch) {
        console.error(`SQLite driver error: ${msg}`);
        process.exit(1);
      }
    }
    if (probeOk) { return; }
    loadMsg = 'binary mismatch';
  }

  // better-sqlite3 unavailable — check node:sqlite built-in (Node 22.5+)
  let nodeSqliteOk = false;
  try { require('node:sqlite'); nodeSqliteOk = true; } catch (_nsErr) { nodeSqliteOk = false; }

  if (nodeSqliteOk) {
    if (loadMsg) {
      console.warn(`better-sqlite3 unavailable (${loadMsg}) — node:sqlite built-in will be used by configStore.`);
    }
    return;
  }

  if (loadMsg === 'binary mismatch') {
    console.error('better-sqlite3 binary mismatch and node:sqlite unavailable.');
    console.error('Run:  cd banking_api_server && npm rebuild better-sqlite3');
  } else {
    console.error(`Neither better-sqlite3 nor node:sqlite is available. ${loadMsg}`);
    console.error('Run:  cd banking_api_server && npm install && npm rebuild better-sqlite3');
  }
  process.exit(1);
}

checkSqliteDriver();

console.log('Package pre-flight passed');

// ── --preflight-only flag ─────────────────────────────────────────────────────

if (process.argv.includes('--preflight-only')) {
  console.log('All package checks passed. Machine is ready for import.');
  process.exit(0);
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const DATA_PERSISTENT = path.join(SERVER_ROOT, 'data', 'persistent');
const DATA_BACKUPS = path.join(SERVER_ROOT, 'data', 'backups');
const ENV_FILE = path.join(SERVER_ROOT, '.env');

// Mirror the export's SKIP_PERSISTENT so an old archive that accidentally
// included one of these (e.g. sessions.db from a pre-deny-list export) doesn't
// clobber the destination machine's local state.
const SKIP_FILES = new Set([
  'sessions.db',
  'sessions.db-journal',
  'sessions.db-wal',
  'sessions.db-shm',
  'runtimeData.json',
  'runtimeData.json.bak',
]);

// ── Step 1 — validate arguments ───────────────────────────────────────────────

const archivePath = process.argv.slice(2).find(a => !a.startsWith('--'));

if (!archivePath) {
  console.error('Usage: npm run data:import -- <path-to-archive.tar.gz>');
  process.exit(1);
}

const resolvedArchive = path.resolve(archivePath);

if (!fs.existsSync(resolvedArchive)) {
  console.error(`Archive not found: ${resolvedArchive}`);
  process.exit(1);
}

// ── Step 2 — check server is stopped ─────────────────────────────────────────

function checkServer() {
  return new Promise((resolve) => {
    const port = process.env.PORT || 3001;
    const req = http.request(
      { hostname: 'localhost', port, path: '/api/health/live', method: 'GET', timeout: 2000 },
      (res) => resolve(res.statusCode === 200 ? 'up' : 'down')
    );
    req.on('error', () => resolve('down'));
    req.on('timeout', () => { req.destroy(); resolve('down'); });
    req.end();
  });
}

// ── Step 3 — extract manifest only ───────────────────────────────────────────

async function extractManifest(archivePath) {
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banking-import-manifest-'));
  try {
    await tar.extract({
      file: archivePath,
      cwd: tmpDir,
      filter: (p) => p === 'manifest.json' || p.endsWith('/manifest.json'),
    });
    const manifestPath = path.join(tmpDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json not found in archive');
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Sleep helper ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── mkcert availability ───────────────────────────────────────────────────────

function hasMkcert() {
  const which = spawnSync('mkcert', ['--version'], { encoding: 'utf8' });
  return which.status === 0;
}

// ── Run-summary table + Y/N confirm ───────────────────────────────────────────
//
// Same pattern as setupFresh.js: print what's about to happen and the recipes
// the user could run instead, then ask Y/N. Always asks when there's a TTY;
// auto-accepts when there isn't (CI / non-interactive). User aborts → exit 2.

function importRunSummaryText() {
  const sizeMB = (fs.statSync(resolvedArchive).size / 1024 / 1024).toFixed(2);
  return `═══════════════════════════════════════════════════════════════════════════
  data:import — what's about to happen
═══════════════════════════════════════════════════════════════════════════

This will:
  1. Verify the server isn't running (would corrupt config.db).
  2. Back up data/persistent/* and .env to data/backups/<timestamp>/.
  3. Extract the bundle into data/persistent/ and write .env.
  4. Rewrite legacy hostname (api.pingdemo.com → api.ping.demo) in text files.
  5. Re-init configStore against the imported .env to verify decryption works.

Archive:  ${resolvedArchive}
          ${sizeMB} MB

Defaults this script applies (override with the listed flag):

  Server-running check    ON (FATAL)   (no flag — abort if server is up)
  Backup before extract   ON           (no flag — always taken)
  Skip machine-bound      ON           (no flag — sessions.db, runtimeData)
  Bootstrap PingOne       OFF          (use setup:fresh wrapper to chain)
  Helix LLM config        OFF          (use setup:fresh wrapper to chain)

Other recipes you could run instead (Ctrl-C now and pick one):

  1) Import THIS bundle now (the default — what's about to run)
       npm run import -- <bundle>

  2) Import + provision PingOne + offer Helix (the full migration path)
       npm run setup:fresh -- <bundle>

  3) Full wipe + import (wipe local + PingOne, then load bundle)
       npm run reset:import -- <bundle>

  4) Just check this machine can import (don't actually do it)
       npm run import -- --preflight-only <bundle>

  5) Tear down everything instead (stop services, wipe PingOne, delete state)
       npm run uninstall

═══════════════════════════════════════════════════════════════════════════`;
}

// Return true only if we can actually open /dev/tty. fs.existsSync('/dev/tty')
// is true on macOS even with no controlling terminal — and in that state,
// opening it throws ENXIO. Probe the open here so callers don't crash.
function isInteractiveStdin() {
  if (process.stdin.isTTY) return true;
  try {
    const fd = fs.openSync('/dev/tty', 'r');
    fs.closeSync(fd);
    return true;
  } catch (_e) {
    return false;
  }
}

async function confirmImportRun() {
  console.log('');
  console.log(importRunSummaryText());
  console.log('');

  const interactive = isInteractiveStdin();
  if (!interactive) {
    console.log('  (No TTY detected — auto-accepting. Ctrl-C now if wrong.)');
    console.log('');
    return true;
  }

  return new Promise((resolve) => {
    const readline = require('readline');
    let input = process.stdin;
    let openedTty = false;
    if (!process.stdin.isTTY) {
      try {
        input = fs.createReadStream('/dev/tty');
        openedTty = true;
        input.on('error', () => { try { input.destroy(); } catch (_e) {} resolve(true); });
      } catch (_e) {
        return resolve(true);
      }
    }
    const rl = readline.createInterface({ input, output: process.stdout, terminal: true });
    rl.question('Continue with this import? [Y/n] ', (answer) => {
      rl.close();
      if (openedTty) try { input.destroy(); } catch (_e) {}
      const s = String(answer || '').trim().toLowerCase();
      // Default Yes — empty input accepts.
      if (!s) return resolve(true);
      resolve(/^y(es)?$/.test(s));
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Print run-summary + presets and ask Y/N before any side effects (server
  // check, backups, extraction). Always asks when TTY is available; auto-
  // accepts in non-interactive contexts. Skipped under --preflight-only
  // (handled before main is called) and when invoked as a child of setupFresh
  // (which already showed its own confirmation gate).
  if (!process.argv.includes('--from-setup-fresh')) {
    if (!(await confirmImportRun())) {
      console.log('Aborted at run-summary confirmation. Re-run with a different');
      console.log('archive or one of the recipes above.');
      process.exit(2);
    }
  }

  // Step 2 — server check
  const serverStatus = await checkServer();
  if (serverStatus === 'up') {
    console.error('The server is running. Stop it before importing:');
    console.error('  ./run-bank.sh stop   (or: npm stop)');
    console.error('');
    console.error('Reason: better-sqlite3 holds an exclusive write lock.');
    console.error('Importing with the server running will corrupt config.db.');
    process.exit(1);
  }

  // Step 3 — verify archive & extract manifest
  console.log(`Reading archive: ${resolvedArchive}`);
  let manifest;
  try {
    manifest = await extractManifest(resolvedArchive);
  } catch (e) {
    console.error(`Failed to read archive: ${e.message}`);
    console.error('Is this a valid banking export archive?');
    process.exit(1);
  }

  if (!manifest.version) {
    console.error('Not a valid banking export archive (manifest missing version).');
    process.exit(1);
  }
  if (!Array.isArray(manifest.files)) {
    console.error('Corrupt manifest: files array not found.');
    process.exit(1);
  }

  if (manifest.version === 1) {
    console.warn('');
    console.warn('WARNING: Old archive format (version 1) — .env not included.');
    console.warn('         You will need to copy .env manually after import.');
    console.warn('         Make sure CONFIG_ENCRYPTION_KEY or SESSION_SECRET matches the source machine.');
    console.warn('');
    manifest.hasEnv = false;
  }

  // Step 4 — warn if .env absent
  if (manifest.hasEnv === false) {
    console.warn('');
    console.warn('WARNING: This archive does not contain a .env file.');
    console.warn('         After import completes, copy your .env manually to banking_api_server/.env');
    console.warn('         making sure CONFIG_ENCRYPTION_KEY or SESSION_SECRET matches the source machine.');
    console.warn('         Without it, config.db will be unreadable and the app will not start correctly.');
    console.warn('');
    console.log('Continuing in 3 seconds...');
    await sleep(3000);
  }

  // Step 5 — backup existing data
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(DATA_BACKUPS, `pre-import-${timestamp}`);

  fs.mkdirSync(backupDir, { recursive: true });

  const existingPersistent = fs.existsSync(DATA_PERSISTENT)
    ? fs.readdirSync(DATA_PERSISTENT)
    : [];

  for (const file of existingPersistent) {
    try {
      fs.copyFileSync(
        path.join(DATA_PERSISTENT, file),
        path.join(backupDir, file)
      );
    } catch (e) {
      console.error(`Backup failed on ${file}: ${e.message}`);
      console.error('Aborting — no files in data/persistent/ have been changed.');
      console.error('Fix the error and retry.');
      process.exit(1);
    }
  }

  // Backup existing .env
  let envBackupPath = null;
  if (fs.existsSync(ENV_FILE)) {
    envBackupPath = `${ENV_FILE}.pre-import-${timestamp}`;
    fs.copyFileSync(ENV_FILE, envBackupPath);
  }

  console.log(`Backup saved to: ${backupDir}`);

  // Step 6 — extract all files
  const os = require('os');
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banking-import-'));

  try {
    await tar.extract({
      file: resolvedArchive,
      cwd: extractDir,
    });

    // Write manifest as audit trail
    const manifestSrc = path.join(extractDir, 'manifest.json');
    if (fs.existsSync(manifestSrc)) {
      fs.mkdirSync(DATA_PERSISTENT, { recursive: true });
      fs.copyFileSync(manifestSrc, path.join(DATA_PERSISTENT, 'manifest-last-import.json'));
    }

    // Copy persistent/** files, skipping excluded ones. We walk recursively
    // so that any subdirectory the export bundled (future services may
    // namespace state under data/persistent/<service>/) is preserved.
    const persistentSrc = path.join(extractDir, 'persistent');
    if (fs.existsSync(persistentSrc)) {
      fs.mkdirSync(DATA_PERSISTENT, { recursive: true });
      const copyTree = (srcDir, dstDir) => {
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
          const srcPath = path.join(srcDir, entry.name);
          const dstPath = path.join(dstDir, entry.name);
          if (entry.isDirectory()) {
            fs.mkdirSync(dstPath, { recursive: true });
            copyTree(srcPath, dstPath);
            continue;
          }
          if (!entry.isFile()) continue;
          if (SKIP_FILES.has(entry.name)) {
            console.log(`  Skipping ${entry.name} (excluded)`);
            continue;
          }
          fs.copyFileSync(srcPath, dstPath);
        }
      };
      copyTree(persistentSrc, DATA_PERSISTENT);
    }

    // Write .env
    const envSrc = path.join(extractDir, '.env');
    if (manifest.hasEnv !== false && fs.existsSync(envSrc)) {
      fs.copyFileSync(envSrc, ENV_FILE);
    }

  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }

  // Step 6.5 — rewrite legacy hostname in extracted text files.
  // The demo hostname changed from api.pingdemo.com → api.ping.demo. Old archives
  // may have the legacy host hardcoded in .env or in any JSON config in
  // data/persistent/. We rewrite text files here so configStore reads the new
  // hostname when it initialises below. Binary .db files are NOT touched —
  // their encrypted redirect URIs get refreshed on the next bootstrap step
  // (which calls updateApplication() with config.publicAppUrl).
  const LEGACY_HOST = 'api.pingdemo.com';
  const NEW_HOST = 'api.ping.demo';
  const rewriteFile = (filePath) => {
    try {
      const original = fs.readFileSync(filePath, 'utf8');
      if (!original.includes(LEGACY_HOST)) return 0;
      const rewritten = original.split(LEGACY_HOST).join(NEW_HOST);
      fs.writeFileSync(filePath, rewritten, 'utf8');
      return (original.match(new RegExp(LEGACY_HOST.replace(/\./g, '\\.'), 'g')) || []).length;
    } catch (_e) { return 0; }
  };
  let rewriteCount = 0;
  if (fs.existsSync(ENV_FILE)) {
    const n = rewriteFile(ENV_FILE);
    if (n > 0) { console.log(`  Hostname rewrite (.env): ${n} → ${NEW_HOST}`); rewriteCount += n; }
  }
  if (fs.existsSync(DATA_PERSISTENT)) {
    for (const f of fs.readdirSync(DATA_PERSISTENT)) {
      if (!f.endsWith('.json')) continue;     // skip .db SQLite binaries
      const n = rewriteFile(path.join(DATA_PERSISTENT, f));
      if (n > 0) { console.log(`  Hostname rewrite (${f}): ${n} → ${NEW_HOST}`); rewriteCount += n; }
    }
  }
  if (rewriteCount > 0) {
    console.log(`Rewrote ${rewriteCount} legacy hostname reference(s) in imported text files.`);
    console.log(`Note: encrypted redirect URIs in config.db will be refreshed by the bootstrap step.`);
  }

  // Verify expected files landed
  const missingFiles = [];
  for (const f of manifest.files) {
    if (f === '.env') {
      if (!fs.existsSync(ENV_FILE)) missingFiles.push('.env');
      continue;
    }
    if (f.startsWith('persistent/')) {
      const filename = path.basename(f);
      if (SKIP_FILES.has(filename)) continue;
      if (!fs.existsSync(path.join(DATA_PERSISTENT, filename))) {
        missingFiles.push(f);
      }
    }
  }

  if (missingFiles.length > 0) {
    console.error('');
    console.error('Import incomplete — the following files are missing after extraction:');
    for (const f of missingFiles) console.error(`  - ${f}`);
    console.error('');
    console.error(`Rollback with:\n  cp ${backupDir}/* ${DATA_PERSISTENT}/`);
    if (envBackupPath) console.error(`  cp ${envBackupPath} ${ENV_FILE}`);
    process.exit(1);
  }

  // Step 7 — post-import health check
  // Reload .env so configStore picks up the imported SESSION_SECRET / CONFIG_ENCRYPTION_KEY
  if (fs.existsSync(ENV_FILE)) {
    require('dotenv').config({ path: ENV_FILE, override: true });
  }

  // Clear cached module so it re-initialises with the new .env values
  const configStorePath = require.resolve('../services/configStore');
  delete require.cache[configStorePath];

  let configStore;
  let pingoneConfigured = false;
  let pingoneUserConfigured = false;
  try {
    configStore = require('../services/configStore');
    await configStore.ensureInitialized();

    pingoneConfigured = configStore.isConfigured();
    pingoneUserConfigured = configStore.isUserOAuthConfigured();

    if (pingoneConfigured && pingoneUserConfigured) {
      console.log('Config OK: environment_id, admin_client_id, and user_client_id are all set');
    } else if (pingoneConfigured) {
      console.log('Config partial: environment_id and admin_client_id set, but user_client_id missing');
    } else {
      console.log('Config incomplete: environment_id or admin_client_id missing');
    }
  } catch (err) {
    console.error('');
    console.error(`Config failed to initialize: ${err.message}`);
    console.error('');
    console.error('Most likely cause: CONFIG_ENCRYPTION_KEY or SESSION_SECRET in the imported .env');
    console.error('does not match the key used to encrypt config.db on the source machine.');
    console.error('');
    console.error('This should not happen if the .env was bundled with this archive.');
    console.error('If you modified .env after importing, restore it from:');
    if (envBackupPath) console.error(`  ${envBackupPath}`);
    console.error('');
    console.error('To rollback all data:');
    console.error(`  cp ${backupDir}/* ${DATA_PERSISTENT}/`);
    if (envBackupPath) console.error(`  cp ${envBackupPath} ${ENV_FILE}`);
    process.exit(1);
  }

  // Step 8 — completion summary
  console.log('');
  console.log('Import complete');
  console.log('');
  console.log('Data files:');
  for (const f of manifest.files) {
    if (f !== '.env') console.log(`  ${f}`);
  }
  console.log('');
  console.log('Environment:');
  if (manifest.hasEnv !== false && fs.existsSync(ENV_FILE)) {
    console.log(`  .env written${envBackupPath ? `  (previous backed up to ${path.basename(envBackupPath)})` : ''}`);
  } else {
    console.log('  .env not in archive — copy manually before starting');
  }
  console.log('');
  console.log(`Backup saved to: ${backupDir}`);
  console.log('');
  // Check if TLS certs exist on this machine
  const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
  const certFile = path.join(REPO_ROOT, 'certs', 'api.ping.demo+2.pem');
  const certsMissing = !fs.existsSync(certFile);

  // Check sibling packages — running app needs all three. CRA peerOptional quirk on UI.
  const SIBLINGS = [
    { dir: 'banking_api_ui', flags: ' --legacy-peer-deps' },
    { dir: 'banking_mcp_server', flags: '' },
  ];
  const siblingsMissingDeps = SIBLINGS.filter(({ dir }) =>
    !fs.existsSync(path.join(REPO_ROOT, dir, 'node_modules'))
  );

  // Detect missing PingOne provisioning. The wizard provisions both PingOne resources
  // (apps/scopes/users) AND writes the env vars the gateway/agent need to start.
  // We nudge the user to it when:
  //   (a) configStore says PingOne isn't configured (no env_id / admin_client_id), OR
  //   (b) MCP_GW_CLIENT_ID or AGENT_CLIENT_ID are absent — :3005 / :3006 will fail to start otherwise.
  let needsBootstrap = !pingoneConfigured || !pingoneUserConfigured;
  if (!needsBootstrap && fs.existsSync(ENV_FILE)) {
    try {
      const envText = fs.readFileSync(ENV_FILE, 'utf8');
      const has = (key) => new RegExp(`^${key}=\\S`, 'm').test(envText);
      if (!has('MCP_GW_CLIENT_ID') || !has('AGENT_CLIENT_ID')) {
        needsBootstrap = true;
      }
    } catch (_e) { /* if .env unreadable, configStore would have already errored above */ }
  }

  console.log('Next steps:');
  let stepNum = 1;
  if (siblingsMissingDeps.length > 0) {
    console.log(`  ${stepNum++}. Install sibling package dependencies:`);
    for (const { dir, flags } of siblingsMissingDeps) {
      console.log(`       cd ${dir} && npm install${flags} && cd ..`);
    }
    console.log('');
  }
  if (certsMissing) {
    console.log(`  ${stepNum++}. Generate TLS certs (machine-bound — not in archive):`);
    if (hasMkcert()) {
      console.log('       mkdir -p certs && cd certs && mkcert api.ping.demo localhost 127.0.0.1');
    } else {
      console.log('       brew install mkcert && mkcert -install');
      console.log('       mkdir -p certs && cd certs && mkcert api.ping.demo localhost 127.0.0.1');
    }
    console.log('');
  }
  console.log(`  ${stepNum++}. Start the server:  ./run-bank.sh`);
  if (needsBootstrap) {
    console.log(`  ${stepNum++}. Provision PingOne (creates apps, scopes, users; writes MCP_GW / AGENT creds):`);
    console.log('       Log in as admin, then visit:  https://api.ping.demo:4000/setup/wizard');
    console.log('       You will need PingOne management worker creds (env id, region, client id, secret).');
    console.log('       After provisioning, restart the server so the new .env vars take effect:');
    console.log('         ./run-bank.sh restart');
    console.log('');
  }
  console.log(`  ${stepNum++}. Visit /configure   — page will show "Import verified" if config is OK`);
  console.log('');
  console.log('To rollback:');
  console.log(`  cp ${backupDir}/* ${DATA_PERSISTENT}/`);
  if (envBackupPath) console.log(`  cp ${envBackupPath} ${ENV_FILE}`);
}

// Capture errors that escape main() so they print stack traces (and so when
// invoked as a child of setupFresh, they reach setup.log via stderr tee).
process.on('uncaughtException', (err) => {
  console.error('');
  console.error('UNCAUGHT EXCEPTION (import):');
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('');
  console.error('UNHANDLED PROMISE REJECTION (import):');
  console.error(reason && reason.stack ? reason.stack : String(reason));
  process.exit(1);
});

main().catch((e) => {
  console.error(`Unexpected error: ${e.message}`);
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
});
