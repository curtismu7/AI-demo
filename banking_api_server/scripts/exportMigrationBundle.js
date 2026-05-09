'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Step 0 — package pre-flight
let tar;
try {
  tar = require('tar');
} catch (_e) {
  console.error('Required package "tar" is not installed.');
  console.error('Run:  cd banking_api_server && npm install');
  console.error('Then retry the export.');
  process.exit(1);
}

// Try better-sqlite3 for read-only .db probing.
// Returns the constructor on success, null when node:sqlite is the fallback,
// or exits on unrecoverable error.
function loadSqliteDriver() {
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
      let probe = new Db(':memory:');
      probe.close();
      probeOk = true;
    } catch (probeErr) {
      let msg = (probeErr && probeErr.message) || '';
      probeMismatch =
        msg.includes('NODE_MODULE_VERSION') ||
        msg.includes('wrong architecture') ||
        msg.includes('invalid ELF') ||
        (probeErr && probeErr.code) === 'ERR_DLOPEN_FAILED';
      if (!probeMismatch) {
        console.error(`SQLite driver error: ${msg}`);
        process.exit(1);
      }
    }
    if (probeOk) { return Db; }
    // probe failed due to binary mismatch — fall through to node:sqlite check
    loadMsg = 'binary mismatch';
  }

  // better-sqlite3 unavailable — check node:sqlite built-in (Node 22.5+)
  let nodeSqliteOk = false;
  try {
    require('node:sqlite');
    nodeSqliteOk = true;
  } catch (_nsErr) {
    nodeSqliteOk = false;
  }

  if (nodeSqliteOk) {
    if (loadMsg) {
      console.warn(`better-sqlite3 unavailable (${loadMsg}) — using fs-only probe (node:sqlite present).`);
    }
    return null; // null = skip open/close probe, use fs.existsSync only
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

const Database = loadSqliteDriver();

console.log('Package pre-flight passed');

const http = require('http');

// Paths — script lives in scripts/, server root is one level up
const SERVER_ROOT = path.resolve(__dirname, '..');
const DATA_PERSISTENT = path.join(SERVER_ROOT, 'data', 'persistent');
const ENV_FILE = path.join(SERVER_ROOT, '.env');

const DB_FILES = [
  'config.db',
  'banking.db',
  'delegations.db',
  'demoAccounts.db'
];

const JSON_FILES = [
  'users.json',
  'accounts.json',
  'transactions.json',
  'activityLogs.json'
];

// Step 1 — resolve output path
function resolveOutputPath() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  if (outIdx !== -1 && args[outIdx + 1]) {
    return path.resolve(args[outIdx + 1]);
  }
  if (process.env.BANKING_EXPORT_PATH) {
    return path.resolve(process.env.BANKING_EXPORT_PATH);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19) + 'Z';
  return path.resolve(process.cwd(), `banking-export-${ts}.tar.gz`);
}

const outputPath = resolveOutputPath();
const outputDir = path.dirname(outputPath);

if (!fs.existsSync(outputDir)) {
  console.error(`Output directory does not exist: ${outputDir}`);
  process.exit(1);
}

try {
  fs.accessSync(outputDir, fs.constants.W_OK);
} catch (_eAccess) {
  console.error(`Output directory is not writable: ${outputDir}`);
  process.exit(1);
}

// Step 2 — check server status
function checkServer() {
  return new Promise((resolve) => {
    const port = process.env.PORT || 3001;
    const req = http.request({ hostname: 'localhost', port, path: '/api/health/live', method: 'GET', timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200 ? 'up' : 'down');
    });
    req.on('error', () => resolve('down'));
    req.on('timeout', () => { req.destroy(); resolve('down'); });
    req.end();
  });
}

async function main() {
  const serverStatus = await checkServer();
  let dbOpenOptions = {};

  if (serverStatus === 'up') {
    console.log('Server is running — opening databases read-only (safe)');
    dbOpenOptions = { readonly: true };
  } else {
    console.log('Server is stopped — opening databases normally');
  }

  // Step 3 — probe .db files
  const validDbFiles = [];
  const skippedDb = [];

  for (const dbFile of DB_FILES) {
    const filePath = path.join(DATA_PERSISTENT, dbFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`  Skipping ${dbFile}: file not found`);
      skippedDb.push(`${dbFile} — not found`);
      continue;
    }
    if (Database) {
      try {
        const db = new Database(filePath, dbOpenOptions);
        db.close();
        validDbFiles.push(dbFile);
      } catch (e) {
        console.warn(`  Skipping ${dbFile}: could not open — ${e.message}`);
        skippedDb.push(`${dbFile} — open failed: ${e.message}`);
      }
    } else {
      // No open/close probe available — file existence confirmed above
      validDbFiles.push(dbFile);
    }
  }

  // Step 4 — probe .json files
  const validJsonFiles = [];

  for (const jsonFile of JSON_FILES) {
    const filePath = path.join(DATA_PERSISTENT, jsonFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`  Skipping ${jsonFile}: file not found`);
      continue;
    }
    validJsonFiles.push(jsonFile);
  }

  // Step 5 — collect .env
  const hasEnv = fs.existsSync(ENV_FILE);
  if (!hasEnv) {
    console.warn('');
    console.warn('WARNING: No .env file found — archive will not include environment variables.');
    console.warn('         The app will not start on the destination without a .env file.');
    console.warn('');
  }

  // Step 6 — build manifest
  const persistentFiles = [
    ...validDbFiles.map(f => `persistent/${f}`),
    ...validJsonFiles.map(f => `persistent/${f}`),
  ];
  const allFiles = hasEnv ? ['.env', ...persistentFiles] : persistentFiles;

  const manifest = {
    version: 2,
    exportedAt: new Date().toISOString(),
    sourceNodeVersion: process.version,
    sourcePlatform: process.platform,
    files: allFiles,
    hasEnv,
    skipped: [
      'sessions.db — machine-bound Express sessions',
      'runtimeData.json — ephemeral in-memory snapshot',
      'certs/ — machine-bound TLS certificates (regenerate with mkcert on destination)',
      ...skippedDb,
    ],
  };

  // Step 7 — create archive
  const tempPath = outputPath + '.tmp.' + process.pid;

  // Build list of entries: { filePath, archiveName }
  const entries = [];

  for (const dbFile of validDbFiles) {
    entries.push({ src: path.join(DATA_PERSISTENT, dbFile), name: `persistent/${dbFile}` });
  }
  for (const jsonFile of validJsonFiles) {
    entries.push({ src: path.join(DATA_PERSISTENT, jsonFile), name: `persistent/${jsonFile}` });
  }
  if (hasEnv) {
    entries.push({ src: ENV_FILE, name: '.env' });
  }

  // Write all files into a staging dir so tar can pack them
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banking-export-'));

  try {
    // Write manifest
    fs.writeFileSync(path.join(stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Copy each file into staging tree
    for (const entry of entries) {
      const dest = path.join(stageDir, entry.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(entry.src, dest);
    }

    // Create tarball from staging dir
    const stagedNames = ['manifest.json', ...entries.map(e => e.name)];

    await tar.create(
      {
        gzip: true,
        file: tempPath,
        cwd: stageDir,
        portable: true,
      },
      stagedNames
    );

    // Atomic rename
    fs.renameSync(tempPath, outputPath);

  } catch (e) {
    // Clean up temp file on error
    try { fs.unlinkSync(tempPath); } catch {}
    if (e.code === 'ENOSPC') {
      console.error('Disk full — archive not created. Free up space and retry.');
    } else {
      console.error(`Archive creation failed: ${e.message}`);
    }
    process.exit(1);
  } finally {
    // Clean up staging dir
    fs.rmSync(stageDir, { recursive: true, force: true });
  }

  // Step 8 — print summary
  const stat = fs.statSync(outputPath);
  const sizeMB = (stat.size / 1024 / 1024).toFixed(2);

  console.log('');
  console.log(`Archive: ${outputPath}  (${sizeMB} MB)`);
  console.log('');
  console.log('Included:');
  console.log('  manifest.json');
  if (hasEnv) {
    const envStat = fs.statSync(ENV_FILE);
    console.log(`  .env  (${(envStat.size / 1024).toFixed(1)} KB)`);
  }
  for (const dbFile of validDbFiles) {
    const s = fs.statSync(path.join(DATA_PERSISTENT, dbFile));
    console.log(`  persistent/${dbFile}  (${(s.size / 1024).toFixed(1)} KB)`);
  }
  for (const jsonFile of validJsonFiles) {
    const s = fs.statSync(path.join(DATA_PERSISTENT, jsonFile));
    console.log(`  persistent/${jsonFile}  (${(s.size / 1024).toFixed(1)} KB)`);
  }
  console.log('');
  console.log('Skipped:');
  console.log('  sessions.db       (machine-bound Express sessions)');
  console.log('  runtimeData.json  (ephemeral in-memory snapshot)');
  console.log('  certs/            (machine-bound TLS certs — regenerate on destination)');
  if (skippedDb.length > 0) {
    for (const s of skippedDb) {
      console.log(`  ${s}`);
    }
  }
  const archiveName = path.basename(outputPath);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('NEXT STEPS — copy to another machine and import:');
  console.log('');
  console.log('  1. Copy the archive to the target machine:');
  console.log(`       scp ${outputPath} user@target-machine:~/`);
  console.log('');
  console.log('  2. On the target machine, clone the repo and run:');
  console.log('       cd banking_api_server');
  console.log('       npm install');
  console.log(`       npm run data:import -- ~/${archiveName}`);
  console.log('');
  console.log('  3. Start the server:');
  console.log('       ./run-bank.sh');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('SECURITY: This archive contains your .env and all');
  console.log('database secrets. Treat it like your .env file:');
  console.log('  - Do NOT commit to git');
  console.log('  - Do NOT upload to public storage');
  console.log('  - Transfer via secure channel (scp, encrypted USB, etc.)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((e) => {
  console.error(`Unexpected error: ${e.message}`);
  process.exit(1);
});
