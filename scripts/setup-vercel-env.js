#!/usr/bin/env node
// scripts/setup-vercel-env.js
//
// Interactive Vercel environment setup for the Banking Demo.
// Detects conflicts, validates Upstash connectivity, generates secrets,
// writes .env.vercel.local, and optionally pushes every non-empty var to Vercel
// (vercel env add … --yes --force; --sensitive for tokens) for production / preview / development.
//
// Usage:
//   npm run setup:vercel
//   node scripts/setup-vercel-env.js          # interactive wizard
//   node scripts/setup-vercel-env.js --check  # check only (no prompts)

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
/** Grayed example/hint line — shown before a prompt to explain expected value. */
const tip   = (s) => `  ${c.dim}${s}${c.reset}`;

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
/** @returns {'vercel'|'npx vercel'|null} */
function vercelResolveCommand() {
  try {
    execSync('vercel --version', { stdio: 'pipe' });
    return 'vercel';
  } catch { /* try npx */ }
  try {
    execSync('npx vercel --version', { stdio: 'pipe' });
    return 'npx vercel';
  } catch { /* none */ }
  return null;
}

const SECRET_ENV_KEYS = new Set([
  'SESSION_SECRET',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_TOKEN',
  'REDIS_URL',
  'KV_URL',
  'PINGONE_AI_CORE_CLIENT_SECRET',
  'PINGONE_AI_CORE_USER_CLIENT_SECRET',
  'AGENT_OAUTH_CLIENT_SECRET',
  'PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET',
]);

function shellSingleQuote(s) {
  return `'${String(s).replace(/'/g, `'\"'\"'`)}'`;
}

/**
 * Push one variable to Vercel.
 * Removes the variable first (suppressing errors if it didn't exist) so that
 * a stale value from a previous failed run can never persist.  Then adds the
 * new value.  Uses a temp file + bash stdin redirect so values are not mangled
 * by the shell.  --sensitive is set for secret keys.
 */
function vercelEnvAdd(cmdPrefix, key, value, envTarget) {
  const isSecret = SECRET_ENV_KEYS.has(key);
  const tmpFile = path.join(ROOT, `.vercel-env-tmp-${Date.now()}-${key.replace(/[^a-z0-9_-]/gi, '_')}.txt`);
  try {
    // Remove first — clears any wrong value from a prior run; ignore if not found
    try {
      execSync(`${cmdPrefix} env rm ${shellSingleQuote(key)} ${shellSingleQuote(envTarget)} --yes`, { cwd: ROOT, shell: '/bin/bash', stdio: 'pipe' });
    } catch { /* not present — expected on first run */ }

    fs.writeFileSync(tmpFile, String(value), 'utf8');
    const sens = isSecret ? ' --sensitive' : '';
    const line = `${cmdPrefix} env add ${shellSingleQuote(key)} ${shellSingleQuote(envTarget)} --yes${sens} < ${shellSingleQuote(tmpFile)}`;
    execSync(line, { cwd: ROOT, shell: '/bin/bash', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
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
    { title: 'SESSION STORE (required for OAuth on Vercel)', keys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'REDIS_URL', 'SESSION_SECRET'] },
    { title: 'PINGONE OAUTH (required)', keys: ['PINGONE_ENVIRONMENT_ID', 'PINGONE_REGION', 'PINGONE_AI_CORE_CLIENT_ID', 'PINGONE_AI_CORE_CLIENT_SECRET', 'PINGONE_AI_CORE_REDIRECT_URI', 'PINGONE_AI_CORE_USER_CLIENT_ID', 'PINGONE_AI_CORE_USER_CLIENT_SECRET', 'PINGONE_AI_CORE_USER_REDIRECT_URI', 'REACT_APP_CLIENT_URL', 'PUBLIC_APP_URL', 'FRONTEND_ADMIN_URL', 'FRONTEND_DASHBOARD_URL'] },
    { title: 'MCP SERVER (required for banking agent)', keys: ['MCP_SERVER_URL'] },
    { title: 'SERVER CONFIG', keys: ['NODE_ENV', 'CORS_ORIGIN', 'DEMO_MODE'] },
    { title: 'RFC 8693 / MCP TOKEN EXCHANGE (optional)', keys: ['AGENT_OAUTH_CLIENT_ID', 'AGENT_OAUTH_CLIENT_SECRET', 'MCP_SERVER_RESOURCE_URI', 'MCP_RESOURCE_URI', 'BFF_CLIENT_ID', 'USE_AGENT_ACTOR_FOR_MCP', 'REQUIRE_MAY_ACT'] },
    { title: 'PINGONE AUTHORIZE (optional)', keys: ['PINGONE_AUTHORIZE_WORKER_CLIENT_ID', 'PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET', 'PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID', 'PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID', 'PINGONE_AUTHORIZE_POLICY_ID'] },
    { title: 'OPTIONAL', keys: ['DEBUG_OAUTH', 'DEBUG_TOKENS', 'STEP_UP_AMOUNT_THRESHOLD', 'STEP_UP_ACR_VALUE'] },
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

  // 7. MCP_SERVER_URL set but MCP_RESOURCE_URI missing — token exchange audience will be empty
  if (vars.MCP_SERVER_URL && !(vars.MCP_RESOURCE_URI || vars.MCP_SERVER_RESOURCE_URI)) {
    warnings.push(
      'MCP_SERVER_URL is set but MCP_RESOURCE_URI is not.\n' +
      '     The BFF will send no audience in RFC 8693 token exchange — the MCP server cannot validate tokens.\n' +
      '     Set MCP_RESOURCE_URI to the base URL registered in PingOne as the MCP resource URI.\n' +
      '     Vercel: https://your-app.vercel.app  |  localhost: http://localhost:3001\n' +
      '     Same value must be in MCP_SERVER_RESOURCE_URI inside banking_mcp_server/.env'
    );
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
        vars.KV_REST_API_URL          = restUrl;
        vars.KV_REST_API_TOKEN        = restToken;
        // Remove conflicting wire-protocol vars if they were wrong
        if (vars.REDIS_URL && !vars.REDIS_URL.startsWith('redis')) delete vars.REDIS_URL;
      } else {
        console.log(err(`Connection failed: ${result.error}`));
        console.log(warn('Saving URL/token anyway — fix credentials in Vercel dashboard.\n'));
        vars.UPSTASH_REDIS_REST_URL   = restUrl;
        vars.UPSTASH_REDIS_REST_TOKEN = restToken;
        vars.KV_REST_API_URL          = restUrl;
        vars.KV_REST_API_TOKEN        = restToken;
      }
    }
  }

  if (!vars.REDIS_URL) {
    const wire = await ask('REDIS_URL  (optional rediss://… — skip if using REST above)', '');
    if (wire) vars.REDIS_URL = wire;
  }

  if (vars.UPSTASH_REDIS_REST_URL && vars.UPSTASH_REDIS_REST_TOKEN) {
    vars.KV_REST_API_URL   = vars.KV_REST_API_URL   || vars.UPSTASH_REDIS_REST_URL;
    vars.KV_REST_API_TOKEN = vars.KV_REST_API_TOKEN || vars.UPSTASH_REDIS_REST_TOKEN;
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
  console.log(info('Where to find these values:'));
  console.log(tip('  PingOne Admin Console → Environments → [your env]'));
  console.log(tip('    Environment ID:   Overview page (UUID at top)'));
  console.log(tip('    Client ID/Secret: Applications → [your app] → Configuration tab'));
  console.log(tip('    Region code:      com (North America)  eu (Europe)  ca (Canada)  asia (APAC)'));
  console.log('');

  // Fifth element (optional) is a hint printed before the prompt when the var needs to be entered.
  const pingVars = [
    ['PINGONE_ENVIRONMENT_ID',
      'PingOne Environment ID',
      false, '',
      'Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  (Overview tab in PingOne admin)'],
    ['PINGONE_REGION',
      'PingOne region  (com / eu / ca / asia)',
      false, 'com',
      'com = US/global · eu = Europe · ca = Canada · asia = APAC'],
    ['PINGONE_AI_CORE_CLIENT_ID',
      'Admin OAuth client ID',
      false, '',
      'Applications → [Admin app] → Client ID  (same value for Vercel and localhost)'],
    ['PINGONE_AI_CORE_CLIENT_SECRET',
      'Admin OAuth client secret',
      true, '',
      'Applications → [Admin app] → Client Secret'],
    ['PINGONE_AI_CORE_REDIRECT_URI',
      'Admin redirect URI',
      false, '',
      'Vercel:    https://your-app.vercel.app/api/auth/oauth/callback\n  localhost: http://localhost:3001/api/auth/oauth/callback  (must match PingOne app config)'],
    ['PINGONE_AI_CORE_USER_CLIENT_ID',
      'User OAuth client ID',
      false, '',
      'Applications → [User/Customer app] → Client ID'],
    ['PINGONE_AI_CORE_USER_CLIENT_SECRET',
      'User OAuth client secret',
      true, '',
      'Applications → [User/Customer app] → Client Secret'],
    ['PINGONE_AI_CORE_USER_REDIRECT_URI',
      'User redirect URI',
      false, '',
      'Vercel:    https://your-app.vercel.app/api/auth/oauth/user/callback\n  localhost: http://localhost:3001/api/auth/oauth/user/callback  (must match PingOne app config)'],
    ['REACT_APP_CLIENT_URL',
      'Frontend base URL  (drives all auto-derived URLs)',
      false, '',
      'Vercel:    https://your-app.vercel.app\n  localhost: http://localhost:3000\n  Used for: PUBLIC_APP_URL, FRONTEND_ADMIN_URL, FRONTEND_DASHBOARD_URL, CORS_ORIGIN'],
  ];

  for (const [key, label_, secret, defaultVal = '', hint_ = ''] of pingVars) {
    const existing = vars[key] || get(key) || defaultVal;
    if (existing && !existing.includes('<your-vercel-url>') && !existing.includes('<')) {
      console.log(ok(`${key} is set`));
    } else {
      if (hint_) console.log(tip(hint_));
      const val = await ask(label_, existing.includes('<') ? '' : existing, secret);
      if (val) vars[key] = val;
      else console.log(warn(`  Skipped ${key} — fill in later`));
    }
  }

  const baseClient = (vars.REACT_APP_CLIENT_URL || '').replace(/\/$/, '');
  if (baseClient) {
    if (!(vars.PUBLIC_APP_URL || '').trim()) {
      vars.PUBLIC_APP_URL = baseClient;
      console.log(ok(`PUBLIC_APP_URL → ${baseClient} (OAuth / redirect canonical)`));
    }
    if (!(vars.FRONTEND_ADMIN_URL || '').trim()) {
      vars.FRONTEND_ADMIN_URL = `${baseClient}/admin`;
      console.log(ok(`FRONTEND_ADMIN_URL → ${vars.FRONTEND_ADMIN_URL}`));
    }
    if (!(vars.FRONTEND_DASHBOARD_URL || '').trim()) {
      vars.FRONTEND_DASHBOARD_URL = `${baseClient}/dashboard`;
      console.log(ok(`FRONTEND_DASHBOARD_URL → ${vars.FRONTEND_DASHBOARD_URL}`));
    }
  }

  // ── Step 5: MCP Server ────────────────────────────────────────────────────
  console.log(hdr('MCP Server'));
  console.log(info('banking_mcp_server requires a persistent WebSocket — it cannot run on Vercel.'));
  console.log(info('Deploy it to Railway, Render, or Fly.io, then paste the URL below.'));
  console.log(tip('  Vercel:    MCP_SERVER_URL = wss://your-mcp.railway.app'));
  console.log(tip('  localhost: MCP_SERVER_URL = ws://localhost:8080\n'));
  let mcpUrl = vars.MCP_SERVER_URL || get('MCP_SERVER_URL') || '';
  if (mcpUrl) {
    console.log(ok(`MCP_SERVER_URL = ${mcpUrl}`));
  } else {
    const mcp = await ask('MCP_SERVER_URL  (wss:// or ws:// — skip if not deployed yet)', '');
    if (mcp) { vars.MCP_SERVER_URL = mcp; mcpUrl = mcp; }
    else console.log(warn('  MCP_SERVER_URL not set — banking agent will show "connecting…"'));
  }

  // MCP_RESOURCE_URI — RFC 8707 Resource Indicator used as the `resource` / `audience` parameter
  // in the RFC 8693 token exchange.  This value must be registered in PingOne as the Resource URI
  // of the MCP resource application.  Both the BFF (Vercel) and the MCP server must agree on it.
  //
  //   • BFF (banking_api_server):   MCP_RESOURCE_URI  (or MCP_SERVER_RESOURCE_URI — both work)
  //   • MCP server:                 MCP_SERVER_RESOURCE_URI  (validates inbound token `aud` claim)
  //
  // What value to use:
  //   Vercel:    base URL of your Vercel deployment, e.g. https://your-app.vercel.app
  //   localhost: base URL of the API server,         e.g. http://localhost:3001
  //   (Must exactly match the Resource URI configured in PingOne → Resources → [MCP resource])
  if (mcpUrl) {
    // Suggest the app base URL (REACT_APP_CLIENT_URL without trailing slash) as default,
    // falling back to stripping the path from the wss:// URL.
    const appBase = (vars.REACT_APP_CLIENT_URL || '').replace(/\/$/, '');
    const mcpHttpsDefault = (vars.MCP_RESOURCE_URI || vars.MCP_SERVER_RESOURCE_URI || '')
      || appBase
      || mcpUrl.replace(/^wss?:\/\//, 'https://').replace(/\/.*$/, '');

    console.log('');
    console.log(info('MCP_RESOURCE_URI — RFC 8707 resource indicator (registered in PingOne as the MCP resource URI)'));
    console.log(tip('  Vercel:    https://your-app.vercel.app           (your Vercel deployment base URL)'));
    console.log(tip('  localhost: http://localhost:3001                  (API server base URL)'));
    console.log(tip('  Must match: PingOne → Resources → [MCP resource] → Resource URI\n'));

    const mcpAud = await ask(
      'MCP_RESOURCE_URI  (base URL registered in PingOne as MCP resource)',
      mcpHttpsDefault,
    );
    if (mcpAud.trim()) {
      vars.MCP_RESOURCE_URI         = mcpAud.trim();
      vars.MCP_SERVER_RESOURCE_URI  = mcpAud.trim();
      console.log(ok(`MCP_RESOURCE_URI + MCP_SERVER_RESOURCE_URI → ${mcpAud.trim()}`));
      console.log(warn(`Also set MCP_SERVER_RESOURCE_URI=${mcpAud.trim()} in banking_mcp_server/.env`));
    } else {
      console.log(warn('  MCP_RESOURCE_URI not set — token audience validation will be skipped'));
    }

    const doTok = await askYN('Configure RFC 8693 token exchange (agent OAuth client + actor claims)?', !!(vars.AGENT_OAUTH_CLIENT_ID));
    if (doTok) {
      console.log(tip('  AGENT_OAUTH_CLIENT_ID:  PingOne app configured for token exchange (grant: Token Exchange)'));
      console.log(tip('  BFF_CLIENT_ID:          usually the same as PINGONE_AI_CORE_CLIENT_ID (admin app)\n'));
      vars.AGENT_OAUTH_CLIENT_ID     = await ask('AGENT_OAUTH_CLIENT_ID', vars.AGENT_OAUTH_CLIENT_ID || '');
      vars.AGENT_OAUTH_CLIENT_SECRET = await ask('AGENT_OAUTH_CLIENT_SECRET', vars.AGENT_OAUTH_CLIENT_SECRET || '', true);
      vars.BFF_CLIENT_ID             = await ask('BFF_CLIENT_ID', vars.BFF_CLIENT_ID || vars.PINGONE_AI_CORE_CLIENT_ID || '');
      vars.USE_AGENT_ACTOR_FOR_MCP   = (await ask('USE_AGENT_ACTOR_FOR_MCP  (add act claim to MCP token?)', vars.USE_AGENT_ACTOR_FOR_MCP || 'true')) || 'true';
      vars.REQUIRE_MAY_ACT           = (await ask('REQUIRE_MAY_ACT  (reject if may_act missing?)', vars.REQUIRE_MAY_ACT || 'false')) || 'false';
    }
  } else {
    // MCP server not configured yet — still allow manual token exchange config
    const doTok = await askYN('Add RFC 8693 / MCP token exchange vars (requires MCP server later)?', false);
    if (doTok) {
      console.log(tip('  MCP_RESOURCE_URI: base URL registered in PingOne as the MCP resource'));
      console.log(tip('    Vercel: https://your-app.vercel.app  |  localhost: http://localhost:3001\n'));
      vars.MCP_RESOURCE_URI          = await ask('MCP_RESOURCE_URI', vars.MCP_RESOURCE_URI || '');
      if (vars.MCP_RESOURCE_URI) vars.MCP_SERVER_RESOURCE_URI = vars.MCP_RESOURCE_URI;
      vars.AGENT_OAUTH_CLIENT_ID     = await ask('AGENT_OAUTH_CLIENT_ID', vars.AGENT_OAUTH_CLIENT_ID || '');
      vars.AGENT_OAUTH_CLIENT_SECRET = await ask('AGENT_OAUTH_CLIENT_SECRET', vars.AGENT_OAUTH_CLIENT_SECRET || '', true);
      vars.BFF_CLIENT_ID             = await ask('BFF_CLIENT_ID', vars.BFF_CLIENT_ID || vars.PINGONE_AI_CORE_CLIENT_ID || '');
    }
  }

  const doPaz = await askYN('Add PingOne Authorize (worker + decision endpoints)?', false);
  if (doPaz) {
    vars.PINGONE_AUTHORIZE_WORKER_CLIENT_ID = await ask('PINGONE_AUTHORIZE_WORKER_CLIENT_ID', vars.PINGONE_AUTHORIZE_WORKER_CLIENT_ID || '');
    vars.PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET = await ask('PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET', vars.PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET || '', true);
    vars.PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID = await ask('PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID (transactions)', vars.PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID || '');
    vars.PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID = await ask('PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID (MCP first-tool)', vars.PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID || '');
    vars.PINGONE_AUTHORIZE_POLICY_ID = await ask('PINGONE_AUTHORIZE_POLICY_ID (legacy PDP, optional)', vars.PINGONE_AUTHORIZE_POLICY_ID || '');
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
  const vercelCmd = vercelResolveCommand();
  if (vercelCmd) {
    const push = await askYN('Push all non-empty vars to Vercel now via CLI (vercel env add --yes --force)?', false);
    if (push) {
      console.log(info('Targets: 1 = production only · 2 = production + preview · 3 = all (incl. development)'));
      const tgt = (await ask('Choice', '2')).trim();
      const targets = tgt === '1' ? ['production'] : tgt === '3' ? ['production', 'preview', 'development'] : ['production', 'preview'];

      const pushKeys = Object.keys(vars).filter((k) => {
        const v = vars[k];
        return v !== undefined && v !== null && String(v).trim() !== '';
      }).sort();

      console.log('');
      for (const envTarget of targets) {
        console.log(hdr(`Vercel → ${envTarget}`));
        for (const key of pushKeys) {
          const pushed = vercelEnvAdd(vercelCmd, key, vars[key], envTarget);
          console.log(pushed ? ok(`  ${key}`) : warn(`  ${key} — failed (set in dashboard or run again with --force)`));
        }
      }
      console.log(`\n${ok('Done! Redeploy: vercel --prod — then sign out and sign in again.')}`);
    }
  } else {
    console.log(warn('Vercel CLI not found — copy values from .env.vercel.local to the Vercel dashboard.'));
    console.log(info('Install: npm i -g vercel   (or use npx vercel)\n'));
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
  console.log(`               ${c.green}sessionRestored: false${c.reset} (after fresh login)`);

  const mcpResourceUri = vars.MCP_RESOURCE_URI || vars.MCP_SERVER_RESOURCE_URI || '';
  if (vars.MCP_SERVER_URL || mcpResourceUri) {
    console.log('');
    console.log(`  ${c.bold}5.${c.reset} MCP server — set matching env var in ${c.bold}banking_mcp_server/.env${c.reset}:`);
    const uriLine = mcpResourceUri || 'https://your-mcp-server.example.com';
    console.log(`       ${c.cyan}MCP_SERVER_RESOURCE_URI=${uriLine}${c.reset}`);
    console.log(`       (Must match ${c.bold}MCP_RESOURCE_URI${c.reset} set here — both sides use it as the RFC 8707 token audience.)`);
    console.log('');
    console.log(`       ${c.dim}Quick CLI if you need to set MCP_RESOURCE_URI on Vercel manually:${c.reset}`);
    console.log(`       ${c.cyan}echo ${shellSingleQuote(uriLine)} | vercel env add MCP_RESOURCE_URI production --yes --force${c.reset}`);
    console.log(`       ${c.cyan}echo ${shellSingleQuote(uriLine)} | vercel env add MCP_SERVER_RESOURCE_URI production --yes --force${c.reset}`);
  }
  console.log('');

  rl.close();
}

main().catch((e) => {
  console.error(err(`Unexpected error: ${e.message}`));
  rl.close();
  process.exit(1);
});
