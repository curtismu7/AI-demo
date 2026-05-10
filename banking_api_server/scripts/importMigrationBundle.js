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

const SKIP_FILES = new Set(['sessions.db', 'runtimeData.json', 'runtimeData.json.bak']);

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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
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

    // Copy persistent/* files, skipping excluded ones
    const persistentSrc = path.join(extractDir, 'persistent');
    if (fs.existsSync(persistentSrc)) {
      fs.mkdirSync(DATA_PERSISTENT, { recursive: true });
      const filesToExtract = fs.readdirSync(persistentSrc);
      for (const file of filesToExtract) {
        if (SKIP_FILES.has(file)) {
          console.log(`  Skipping ${file} (excluded)`);
          continue;
        }
        fs.copyFileSync(
          path.join(persistentSrc, file),
          path.join(DATA_PERSISTENT, file)
        );
      }
    }

    // Write .env
    const envSrc = path.join(extractDir, '.env');
    if (manifest.hasEnv !== false && fs.existsSync(envSrc)) {
      fs.copyFileSync(envSrc, ENV_FILE);
    }

  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
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
  const certFile = path.join(REPO_ROOT, 'certs', 'api.pingdemo.com+2.pem');
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
      console.log('       mkdir -p certs && cd certs && mkcert api.pingdemo.com localhost 127.0.0.1');
    } else {
      console.log('       brew install mkcert && mkcert -install');
      console.log('       mkdir -p certs && cd certs && mkcert api.pingdemo.com localhost 127.0.0.1');
    }
    console.log('');
  }
  console.log(`  ${stepNum++}. Start the server:  ./run-bank.sh`);
  if (needsBootstrap) {
    console.log(`  ${stepNum++}. Provision PingOne (creates apps, scopes, users; writes MCP_GW / AGENT creds):`);
    console.log('       Log in as admin, then visit:  https://api.pingdemo.com:4000/setup/wizard');
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

main().catch((e) => {
  console.error(`Unexpected error: ${e.message}`);
  process.exit(1);
});
