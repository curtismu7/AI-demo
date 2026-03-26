#!/usr/bin/env node
// scripts/setup-vercel-env.js
//
// Interactive Vercel environment setup for the Banking Demo.
// Detects conflicts, validates Upstash connectivity, generates secrets,
// writes a .env.vercel.local file, and optionally pushes to Vercel CLI.
//
// Usage:
//   node scripts/setup-vercel-env.js          # interactive wizard
//   node scripts/setup-vercel-env.js --check   # check only (no prompts)

'use strict';

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const { execSync } = require('child_process');

// ── Terminal colours ─────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
};
const ok    = (s) => `${c.green}✓${c.reset} ${s}`;
const warn  = (s) => `${c.yellow}⚠${c.reset}  ${s}`;
const err   = (s) => `${c.red}✗${c.reset}  ${s}`;
const info  = (s) => `${c.cyan}ℹ${c.reset}  ${s}`;
const hdr   = (s) => `\n${c.bold}${c.blue}── ${s} ${'─'.repeat(Math.max(0, 60 - s.length))}${c.reset}`;
const label = (s) => `${c.bold}${s}${c.reset}`;

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT          = path.resolve(__dirname, '..');
const LOCAL_ENV     = path.join(ROOT, '.env.vercel.local');
const EXAMPLE_ENV   = path.join(ROOT, '.env.vercel.example');
const CHECK_ONLY    = process.argv.includes('--check');

// ── Load existing values ─────────────────────────────────────────────────────
/** Parse a .env file into a plain object. */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const eq = trimmed.indexOf('=');
      if (eq < 0) return acc;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (k) acc[k] = v;
      return acc;
    }, {});
}

// Start from .env.vercel.local if it exists, otherwise blank
const current = parseEnvFile(LOCAL_ENV);

// Helper: get a value from current local file or process env (Vercel injects)
function get(key, ...aliases) {
  for (const k of [key, ...aliases]) {
    if (current[k])         return current[k];
    if (process.env[k])     return process.env[k];
  }
  return '';
}

// ── Readline helpers ─────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

/** Prompt for a value; shows current/default in brackets. */
function ask(question, defaultVal = '', secret = false) {
  return new Promise((resolve) => {
    const hint = defaultVal ? ` ${c.dim}[${secret ? '••••' : defaultVal}]${c.reset}` : '';
    rl.question(`  ${question}${hint}: `, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

/** Yes/No prompt, returns boolean. */
function askYN(question, defaultYes = true) {
  return new Promise((resolve) => {
    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    rl.question(`  ${question} ${c.dim}${hint}${c.reset} `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (!a) return resolve(defaultYes);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

// ── Upstash REST connectivity test ───────────────────────────────────────────
/** Test Upstash REST API with a SET + GET round trip. */
async function testUpstash(url, token) {
  const key = `banking:health:setup-${Date.now()}`;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    // PING
    const pingRes = await fetch(`${url}/ping`, { headers });
    const pingBody = await pingRes.json().catch(() => ({}));
    if (!pingRes.ok || pingBody.result !== 'PONG') {
      return { ok: false, error: `PING failed: HTTP ${pingRes.status} — ${JSON.stringify(pingBody)}` };
    }
    // SET
    const setRes = await fetch(`${url}/set/${encodeURIComponent(key)}/test?EX=30`, { headers });
    if (!setRes.ok) {
      const body = await setRes.text().catch(() => '');
      return { ok: false, error: `SET failed: HTTP ${setRes.status} — ${body}` };
    }
    // GET
    const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers });
    const getBody = await getRes.json().catch(() => ({}));
    if (!getRes.ok || getBody.result !== 'test') {
      return { ok: false, error: `GET mismatch: expected "test" got ${JSON.stringify(getBody.result)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Vercel CLI helpers ───────────────────────────────────────────────────────
function vercelCliAvailable() {
  try { execSync('vercel --version', { stdio: 'pipe' }); return true; }
  catch { return false; }
}

/** Push a key=value to Vercel via CLI. */
function vercelEnvAdd(key, value, env = 'production') {
  try {
    const tmpFile = path.join(ROOT, `.vercel-env-tmp-${Date.now()}`);
    fs.writeFileSync(tmpFile, value, 'utf8');
    execSync(`vercel env add ${key} ${env} < "${tmpFile}"`, { stdio: 'pipe', cwd: ROOT });
    fs.unlinkSync(tmpFile);
    return true;
  } catch {
    return false;
  }
}

// ── Write local .env file ────────────────────────────────────────────────────
function writeEnvFile(vars) {
  const lines = [
    '# Banking Demo — Vercel Environment Variables',
    '# Generated by scripts/setup-vercel-env.js',
    `# ${new Date().toISOString()}`,
    '#',
    '# Copy these values to: Vercel Dashboard → Project → Settings → Environment Variables',
    '# Or run: node scripts/setup-vercel-env.js  (it can push for you via Vercel CLI)',
    '',
  ];

  const sections = [
    { title: 'SESSION STORE (required for OAuth on Vercel)', keys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SESSION_SECRET'] },
    { title: 'PINGONE OAUTH (required)', keys: ['PINGONE_ENVIRONMENT_ID', 'PINGONE_REGION', 'PINGONE_AI_CORE_CLIENT_ID', 'PINGONE_AI_CORE_CLIENT_SECRET', 'PINGONE_AI_CORE_REDIRECT_URI', 'PINGONE_AI_CORE_USER_CLIENT_ID', 'PINGONE_AI_CORE_USER_CLIENT_SECRET', 'PINGONE_AI_CORE_USER_REDIRECT_URI', 'REACT_APP_CLIENT_URL'] },
    { title: 'MCP SERVER (required for banking agent)', keys: ['MCP_SERVER_URL'] },
    { title: 'SERVER CONFIG', keys: ['NODE_ENV', 'CORS_ORIGIN', 'DEMO_MODE'] },
    { title: 'OPTIONAL', keys: ['MCP_SERVER_RESOURCE_URI', 'AGENT_OAUTH_CLIENT_ID', 'AGENT_OAUTH_CLIENT_SECRET', 'USE_AGENT_ACTOR_FOR_MCP', 'DEBUG_OAUTH', 'STEP_UP_AMOUNT_THRESHOLD', 'STEP_UP_ACR_VALUE'] },
  ];

  const written = new Set();
  for (const section of sections) {
    const sectionVars = section.keys.filter(k => vars[k]);
    if (!sectionVars.length) continue;
    lines.push(`# ${'─'.repeat(60)}`);
    lines.push(`# ${section.title}`);
    lines.push(`# ${'─'.repeat(60)}`);
    for (const k of sectionVars) {
      lines.push(`${k}=${vars[k]}`);
      written.add(k);
    }
    lines.push('');
  }

  // Anything not in sections
  const extras = Object.entries(vars).filter(([k]) => !written.has(k));
  if (extras.length) {
    lines.push('# Additional vars');
    for (const [k, v] of extras) lines.push(`${k}=${v}`);
  }

  fs.writeFileSync(LOCAL_ENV, lines.join('\n'), 'utf8');
}

// ── Conflict detection ───────────────────────────────────────────────────────
const conflicts = [];
const warnings  = [];

function detectConflicts(vars) {
  // 1. REDIS_URL set to https:// — wrong protocol, will be ignored by server
  const redisUrl = vars.REDIS_URL || '';
  if (redisUrl.startsWith('https://') || redisUrl.startsWith('http://')) {
    conflicts.push({
      key: 'REDIS_URL',
      message: `REDIS_URL is set to "${redisUrl.slice(0, 40)}…" which is an HTTP/REST URL, not a wire-protocol URL.\n     The server requires redis:// or rediss:// for wire-protocol.\n     This value will be IGNORED — remove it to avoid confusion.`,
      fix: 'REMOVE',
    });
  }

  // 2. Both wire-protocol AND REST set — REST takes priority (fine, but warn)
  const hasWire = (vars.REDIS_URL && (vars.REDIS_URL.startsWith('redis://') || vars.REDIS_URL.startsWith('rediss://')))
               || (vars.KV_URL && (vars.KV_URL.startsWith('redis://') || vars.KV_URL.startsWith('rediss://')));
  const hasRest = (vars.UPSTASH_REDIS_REST_URL && vars.UPSTASH_REDIS_REST_TOKEN)
               || (vars.KV_REST_API_URL && vars.KV_REST_API_TOKEN);
  if (hasWire && hasRest) {
    warnings.push('Both wire-protocol (REDIS_URL/KV_URL) and REST (UPSTASH_REDIS_REST_*) vars are set.\n     REST API takes priority — wire-protocol vars are unused but harmless.');
  }

  // 3. SKIP_TOKEN_SIGNATURE_VALIDATION in production
  if (vars.SKIP_TOKEN_SIGNATURE_VALIDATION === 'true') {
    conflicts.push({
      key: 'SKIP_TOKEN_SIGNATURE_VALIDATION',
      message: 'SKIP_TOKEN_SIGNATURE_VALIDATION=true is NOT allowed in production.\n     The server will refuse to start with this set.',
      fix: 'REMOVE',
    });
  }

  // 4. SESSION_SECRET too short
  const secret = vars.SESSION_SECRET || '';
  if (secret && secret.length < 32) {
    conflicts.push({
      key: 'SESSION_SECRET',
      message: `SESSION_SECRET is only ${secret.length} characters — must be 32+ characters.\n     Short secrets make sessions easy to forge.`,
      fix: 'REGENERATE',
    });
  }

  // 5. Missing UPSTASH_REDIS_REST_URL/TOKEN (and no wire fallback)
  if (!hasRest && !hasWire) {
    warnings.push('No session store configured. OAuth will fail on Vercel (sessions not shared across instances).\n     Add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.');
  }

  // 6. MCP_SERVER_URL not set
  if (!vars.MCP_SERVER_URL) {
    warnings.push('MCP_SERVER_URL not set. The Banking Agent panel will show "connecting…" forever.\n     Deploy banking_mcp_server to Railway/Render/Fly and set this.');
  }

  // 7. Redirect URIs still have placeholder
  for (const k of ['PINGONE_AI_CORE_REDIRECT_URI', 'PINGONE_AI_CORE_USER_REDIRECT_URI', 'REACT_APP_CLIENT_URL']) {
    if ((vars[k] || '').includes('<your-vercel-url>')) {
      conflicts.push({ key: k, message: `${k} still contains the placeholder "<your-vercel-url>" — replace with your actual Vercel domain.`, fix: 'UPDATE' });
    }
  }

  return { conflicts, warnings };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}${c.blue}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.blue}║   Banking Demo — Vercel Environment Setup                ║${c.reset}`);
  console.log(`${c.bold}${c.blue}╚══════════════════════════════════════════════════════════╝${c.reset}\n`);

  if (fs.existsSync(LOCAL_ENV)) {
    console.log(info(`Loaded existing values from ${c.bold}.env.vercel.local${c.reset}`));
  } else {
    console.log(info(`No .env.vercel.local found — starting fresh.`));
    console.log(info(`See ${c.bold}.env.vercel.example${c.reset} for all available options.\n`));
  }

  // Build vars map — start from loaded file
  const vars = { ...current };

  // ── Step 1: Conflict detection ─────────────────────────────────────────────
  console.log(hdr('Conflict & Health Check'));
  detectConflicts(vars);

  if (conflicts.length === 0 && warnings.length === 0) {
    console.log(ok('No conflicts detected.\n'));
  }

  for (const w of warnings) {
    console.log(warn(w));
  }

  for (const conflict of conflicts) {
    console.log(err(conflict.message));
    if (!CHECK_ONLY && conflict.fix === 'REMOVE') {
      const remove = await askYN(`  Remove ${label(conflict.key)}?`, true);
      if (remove) {
        delete vars[conflict.key];
        console.log(`     ${ok(`Removed ${conflict.key}`)}`);
      }
    }
    if (!CHECK_ONLY && conflict.fix === 'REGENERATE' && conflict.key === 'SESSION_SECRET') {
      vars.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      console.log(`     ${ok('Generated new SESSION_SECRET (64-char hex)')}`);
    }
  }

  if (CHECK_ONLY) {
    const total = conflicts.length + warnings.length;
    console.log(total === 0
      ? `\n${ok('All checks passed.')}`
      : `\n${warn(`${conflicts.length} conflict(s), ${warnings.length} warning(s) found.`)}`
    );
    rl.close();
    process.exit(conflicts.length > 0 ? 1 : 0);
  }

  // ── Step 2: Session store ─────────────────────────────────────────────────
  console.log(hdr('Session Store (Upstash Redis REST)'));
  console.log(info('Required for OAuth to work on Vercel. Sessions must be shared across instances.'));
  console.log(info('Get free credentials at https://upstash.com → Create Database → REST API\n'));
  console.log(info('Or: Vercel Dashboard → Storage → Connect KV Store (auto-injects credentials)\n'));

  const hasRest = (vars.UPSTASH_REDIS_REST_URL && vars.UPSTASH_REDIS_REST_TOKEN)
               || (vars.KV_REST_API_URL && vars.KV_REST_API_TOKEN);

  let restUrl   = vars.UPSTASH_REDIS_REST_URL || vars.KV_REST_API_URL   || '';
  let restToken = vars.UPSTASH_REDIS_REST_TOKEN || vars.KV_REST_API_TOKEN || '';

  if (hasRest) {
    console.log(ok(`UPSTASH_REDIS_REST_URL already set: ${c.dim}${restUrl.slice(0, 40)}…${c.reset}`));
    const retest = await askYN('Test connectivity?', true);
    if (retest) {
      process.stdout.write('  Testing Upstash connection… ');
      const result = await testUpstash(restUrl, restToken);
      console.log(result.ok ? ok('Connected!') : err(`Failed: ${result.error}`));
      if (!result.ok) {
        const reenter = await askYN('Enter new credentials?', true);
        if (reenter) { restUrl = ''; restToken = ''; }
      }
    }
  }

  if (!restUrl || !restToken) {
    console.log('\n  ' + label('Upstash REST API credentials:'));
    console.log(`  ${c.dim}(Find these in Upstash Dashboard → Your Database → REST API tab)${c.reset}`);
    restUrl   = await ask('UPSTASH_REDIS_REST_URL  (https://…upstash.io)', restUrl);
    restToken = await ask('UPSTASH_REDIS_REST_TOKEN', restToken, true);

    if (restUrl && restToken) {
      process.stdout.write('\n  Testing Upstash connection… ');
      const result = await testUpstash(restUrl, restToken);
      if (result.ok) {
        console.log(ok('Connected! Session store is healthy.\n'));
        vars.UPSTASH_REDIS_REST_URL   = restUrl;
        vars.UPSTASH_REDIS_REST_TOKEN = restToken;
        // Remove conflicting wire-protocol vars if they were wrong
        if (vars.REDIS_URL && !vars.REDIS_URL.startsWith('redis')) delete vars.REDIS_URL;
      } else {
        console.log(err(`Connection failed: ${result.error}`));
        console.log(warn('Saving URL/token anyway — fix credentials in Vercel dashboard.\n'));
        vars.UPSTASH_REDIS_REST_URL   = restUrl;
        vars.UPSTASH_REDIS_REST_TOKEN = restToken;
      }
    }
  }

  // ── Step 3: Session secret ────────────────────────────────────────────────
  console.log(hdr('Session Secret'));
  let sessionSecret = vars.SESSION_SECRET || '';
  if (sessionSecret.length >= 32) {
    console.log(ok(`SESSION_SECRET is set (${sessionSecret.length} chars)\n`));
  } else {
    if (!sessionSecret) {
      console.log(warn('SESSION_SECRET not set — generating a strong random value…'));
    }
    sessionSecret = crypto.randomBytes(32).toString('hex');
    vars.SESSION_SECRET = sessionSecret;
    console.log(ok(`Generated SESSION_SECRET: ${c.dim}${sessionSecret.slice(0, 12)}…${c.reset}\n`));
  }

  // ── Step 4: PingOne OAuth ─────────────────────────────────────────────────
  console.log(hdr('PingOne OAuth'));
  const pingVars = [
    ['PINGONE_ENVIRONMENT_ID',          'PingOne Environment ID',           false],
    ['PINGONE_REGION',                  'PingOne region (com/eu/ca/asia)',   false, 'com'],
    ['PINGONE_AI_CORE_CLIENT_ID',       'Admin OAuth client ID',             false],
    ['PINGONE_AI_CORE_CLIENT_SECRET',   'Admin OAuth client secret',         true],
    ['PINGONE_AI_CORE_REDIRECT_URI',    'Admin redirect URI (https://…/api/auth/oauth/callback)', false],
    ['PINGONE_AI_CORE_USER_CLIENT_ID',  'User OAuth client ID',              false],
    ['PINGONE_AI_CORE_USER_CLIENT_SECRET', 'User OAuth client secret',       true],
    ['PINGONE_AI_CORE_USER_REDIRECT_URI', 'User redirect URI (https://…/api/auth/oauth/user/callback)', false],
    ['REACT_APP_CLIENT_URL',            'Frontend URL (https://…vercel.app)', false],
  ];

  for (const [key, label_, secret, defaultVal = ''] of pingVars) {
    const existing = vars[key] || get(key) || defaultVal;
    if (existing && !existing.includes('<your-vercel-url>') && !existing.includes('<')) {
      console.log(ok(`${key} is set`));
    } else {
      const val = await ask(label_, existing.includes('<') ? '' : existing, secret);
      if (val) vars[key] = val;
      else console.log(warn(`  Skipped ${key} — fill in later`));
    }
  }

  // ── Step 5: MCP Server ────────────────────────────────────────────────────
  console.log(hdr('MCP Server'));
  console.log(info('Deploy banking_mcp_server to Railway/Render/Fly — Vercel does not support WebSocket.'));
  const mcpUrl = vars.MCP_SERVER_URL || get('MCP_SERVER_URL') || '';
  if (mcpUrl) {
    console.log(ok(`MCP_SERVER_URL = ${mcpUrl}`));
  } else {
    const mcp = await ask('MCP_SERVER_URL  (wss://… — skip if not deployed yet)', '');
    if (mcp) vars.MCP_SERVER_URL = mcp;
    else console.log(warn('  MCP_SERVER_URL not set — banking agent will show "connecting…"'));
  }

  // ── Step 6: NODE_ENV + CORS ───────────────────────────────────────────────
  vars.NODE_ENV    = vars.NODE_ENV    || 'production';
  vars.CORS_ORIGIN = vars.CORS_ORIGIN || vars.REACT_APP_CLIENT_URL || '';
  if (!vars.DEMO_MODE) vars.DEMO_MODE = 'true';

  // ── Step 7: Write local file ──────────────────────────────────────────────
  console.log(hdr('Summary'));
  writeEnvFile(vars);
  console.log(ok(`Written to ${c.bold}.env.vercel.local${c.reset}`));
  console.log(info('This file is gitignored — it stays local.'));
  console.log(info('Copy these values to Vercel Dashboard → Settings → Environment Variables\n'));

  // ── Step 8: Optionally push to Vercel CLI ────────────────────────────────
  if (vercelCliAvailable()) {
    const push = await askYN('Push all vars to Vercel now via CLI (vercel env add)?', false);
    if (push) {
      const envTarget = await ask('Environment target', 'production');
      console.log('');
      const required = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SESSION_SECRET',
        'PINGONE_ENVIRONMENT_ID', 'PINGONE_REGION',
        'PINGONE_AI_CORE_CLIENT_ID', 'PINGONE_AI_CORE_CLIENT_SECRET',
        'PINGONE_AI_CORE_REDIRECT_URI', 'PINGONE_AI_CORE_USER_CLIENT_ID',
        'PINGONE_AI_CORE_USER_CLIENT_SECRET', 'PINGONE_AI_CORE_USER_REDIRECT_URI',
        'REACT_APP_CLIENT_URL', 'NODE_ENV', 'CORS_ORIGIN', 'DEMO_MODE',
      ];
      if (vars.MCP_SERVER_URL) required.push('MCP_SERVER_URL');

      for (const key of required) {
        if (!vars[key]) continue;
        const pushed = vercelEnvAdd(key, vars[key], envTarget);
        console.log(pushed ? ok(`  Pushed ${key}`) : warn(`  Failed to push ${key} — set manually in dashboard`));
      }
      console.log(`\n${ok('Done! Redeploy Vercel, then sign out and sign in again.')}`);
    }
  } else {
    console.log(warn('Vercel CLI not found — copy values from .env.vercel.local to the Vercel dashboard.'));
    console.log(info('Install CLI: npm i -g vercel\n'));
  }

  // ── Final checklist ──────────────────────────────────────────────────────
  console.log(hdr('Post-Setup Checklist'));
  console.log(`  ${c.bold}1.${c.reset} In PingOne, add redirect URIs for your Vercel domain:`);
  console.log(`       Admin:    https://<your-domain>/api/auth/oauth/callback`);
  console.log(`       Customer: https://<your-domain>/api/auth/oauth/user/callback`);
  console.log(`  ${c.bold}2.${c.reset} Redeploy: ${c.dim}vercel --prod${c.reset}`);
  console.log(`  ${c.bold}3.${c.reset} Sign out and sign in (old cookie-only session won't hydrate)`);
  console.log(`  ${c.bold}4.${c.reset} Verify: GET ${c.cyan}/api/auth/debug${c.reset}`);
  console.log(`       Expect: ${c.green}sessionStoreType: "upstash-rest"${c.reset}`);
  console.log(`               ${c.green}sessionStoreHealthy: true${c.reset}`);
  console.log(`               ${c.green}sessionRestored: false${c.reset} (after fresh login)\n`);

  rl.close();
}

main().catch((e) => {
  console.error(err(`Unexpected error: ${e.message}`));
  rl.close();
  process.exit(1);
});
