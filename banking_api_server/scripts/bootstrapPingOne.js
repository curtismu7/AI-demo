#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * CLI for PingOne provisioning — non-browser variant of /setup/wizard.
 *
 * Wraps provisionEnvironment() from services/pingoneProvisionService.js.
 * Interactive by default; prompts for management worker creds and runs the
 * full provisioning sequence (resource servers, scopes, apps, users with
 * passwords, .env writeback). Idempotent: rerun is safe.
 *
 * Usage:
 *   node scripts/bootstrapPingOne.js                # interactive
 *   node scripts/bootstrapPingOne.js --help
 *
 * Non-interactive (CI / automation):
 *   PINGONE_BOOTSTRAP_ENV_ID=...
 *   PINGONE_BOOTSTRAP_REGION=com
 *   PINGONE_BOOTSTRAP_CLIENT_ID=...
 *   PINGONE_BOOTSTRAP_CLIENT_SECRET=...
 *   PUBLIC_APP_URL=https://api.ping.demo:4000   (optional)
 *   node scripts/bootstrapPingOne.js --non-interactive
 */

const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Defer Node-version pre-flight until after --help so users can read help text
// from any Node. checkNodeVersion() is called below, after the --help branch.
function checkNodeVersion() {
  const fs = require('fs');
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
  process.exit(1);
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`PingOne bootstrap CLI

Provisions a complete PingOne environment for the banking demo:
  - Resource servers: Super Banking API, Super Banking MCP Server, Super Banking MCP Gateway
  - Scopes:           banking:*, admin:*, users:*, p1:*, banking:mcp:invoke
  - Applications:     Admin (WEB_APP), User (WEB_APP), MCP Server (WORKER),
                      Worker (WORKER), MCP Exchanger (WORKER), MCP Gateway (WORKER),
                      Agent (WORKER)
  - Users:            bankuser, bankadmin (with generated passwords)
  - Schema attribute: bankingPrincipalUserId
  - Token claims:     bankingPrincipalUserId on User app, may_act on Admin app

Writes credentials to banking_api_server/.env (overwrites existing).
Idempotent — rerunning produces "exists" rows and exits 0.

Usage:
  node scripts/bootstrapPingOne.js                    Interactive (browser, terminal fallback)
  node scripts/bootstrapPingOne.js --no-browser       Force terminal prompts
  node scripts/bootstrapPingOne.js --non-interactive  Read creds from env vars

Step 1: Create a PingOne worker app with the "Identity Data Admin" role.
Step 2: Run this script. By default it pops a localhost form for the three creds
        (Environment ID, Client ID, Client Secret) and resumes when you submit.
        Auth method is hard-coded to client_secret_basic to match the demo.

Env vars (non-interactive mode):
  PINGONE_BOOTSTRAP_ENV_ID         PingOne environment id (UUID)
  PINGONE_BOOTSTRAP_REGION         com | eu | ca | asia | com.au   (default: com)
  PINGONE_BOOTSTRAP_CLIENT_ID      Management worker client id
  PINGONE_BOOTSTRAP_CLIENT_SECRET  Management worker client secret
  PUBLIC_APP_URL                   App base URL              (default: https://api.ping.demo:4000)
  PINGONE_BOOTSTRAP_AUDIENCE       Resource server audience  (default: banking_api_enduser)
  MCP_GW_AUDIENCE                  Gateway audience          (default: mcp-gw.bxf.com)

Exit codes:
  0  Provisioning succeeded (or idempotent re-run)
  1  Validation / network / fatal PingOne API error
  2  User aborted at confirmation prompt
`);
  process.exit(0);
}

// Real run — pre-flight Node version now (services pulled in by main() need it).
checkNodeVersion();

const NON_INTERACTIVE = args.includes('--non-interactive') || !!process.env.CI;
const NO_BROWSER = args.includes('--no-browser');

// ── Prompts ──────────────────────────────────────────────────────────────────

// Char codes for control keys (raw mode reads single bytes / sequences)
const CTRL_C = 0x03;
const BACKSPACE = 0x08;
const DEL      = 0x7f;

// Under `curl ... | bash` and similar pipelines, process.stdin is the HTTP
// body — not the user's keyboard. process.stdin.isTTY is false in that case.
// The user's keyboard is at /dev/tty; this helper returns a usable read stream
// (either process.stdin if it's a real terminal, or a freshly opened /dev/tty).
// Returns { stream, fd } — caller closes fd when done. fd is null when we're
// using process.stdin directly.
function getInteractiveInput() {
  if (process.stdin.isTTY) return { stream: process.stdin, fd: null };
  const fs = require('fs');
  try {
    const fd = fs.openSync('/dev/tty', 'r');
    const stream = fs.createReadStream('', { fd });
    return { stream, fd };
  } catch (_e) {
    return { stream: process.stdin, fd: null };  // fall back; will likely fail
  }
}

function prompt(rl, question, { defaultValue, secret = false } = {}) {
  return new Promise((resolve) => {
    const display = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;

    if (!secret) {
      rl.question(display, (answer) => {
        const trimmed = String(answer || '').trim();
        resolve(trimmed || defaultValue || '');
      });
      return;
    }

    // Hidden input — manual prompt + raw stdin, no echo.
    process.stdout.write(display);
    const stdin = process.stdin;
    let captured = '';
    const wasRaw = stdin.isRaw;
    if (typeof stdin.setRawMode === 'function') stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const restore = () => {
      if (typeof stdin.setRawMode === 'function') stdin.setRawMode(wasRaw);
      stdin.removeListener('data', onData);
      stdin.pause();
    };

    const onData = (ch) => {
      const c = ch.toString('utf8');
      // Some terminals deliver \r\n as a single chunk on Enter — match prefix.
      if (c === '\n' || c === '\r' || c.startsWith('\r')) {
        restore();
        process.stdout.write('\n');
        resolve(captured.trim() || defaultValue || '');
        return;
      }
      const code = c.charCodeAt(0);
      if (code === CTRL_C) {
        restore();
        process.stdout.write('\n');
        process.exit(130);
      } else if (code === DEL || code === BACKSPACE) {
        captured = captured.slice(0, -1);
      } else if (code >= 0x20) {
        captured += c;
      }
    };
    stdin.on('data', onData);
  });
}

// ── Browser prompt ────────────────────────────────────────────────────────────
//
// Spins up a one-shot HTTPS server on 127.0.0.1:<random-free-port>, opens the
// default browser to a self-contained HTML form, and resolves with the values
// the user submits. Server closes after the first valid submission, on Ctrl-C,
// or after 5 minutes (whichever first).
//
// Loopback-only binding means the form is unreachable from elsewhere on the
// network. A per-launch nonce in the form gates POSTs anyway.

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open'
    : platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const cmdArgs = platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch (_e) {
    return false;
  }
}

function buildFormPage(nonce) {
  // No external assets — single self-contained document.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PingOne Bootstrap</title>
  <style>
    body { font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f7; color: #1d1d1f; margin: 0; padding: 32px; }
    main { max-width: 520px; margin: 0 auto; background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    h1 { font-size: 18px; margin: 0 0 6px; }
    p.lead { color: #555; margin: 0 0 20px; }
    label { display: block; font-weight: 600; margin: 14px 0 4px; font-size: 13px; }
    input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #c7c7cc; border-radius: 6px; font: inherit; }
    input:focus { outline: none; border-color: #0071e3; box-shadow: 0 0 0 3px rgba(0,113,227,0.15); }
    button { margin-top: 22px; padding: 10px 18px; background: #0071e3; color: #fff; border: 0; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:disabled { background: #999; cursor: wait; }
    .note { color: #6e6e73; font-size: 12px; margin-top: 4px; }
    .err { color: #c00; margin-top: 14px; min-height: 18px; }
  </style>
</head>
<body>
  <main>
    <h1>PingOne Bootstrap</h1>
    <p class="lead">Paste the worker app credentials. The terminal is waiting; this tab will close automatically when you submit.</p>
    <form id="f">
      <label for="envId">Environment ID</label>
      <input id="envId" name="envId" required autocomplete="off" placeholder="00000000-0000-0000-0000-000000000000">
      <div class="note">PingOne Console → Settings → Environment Properties.</div>

      <label for="region">Region</label>
      <input id="region" name="region" value="com" autocomplete="off">
      <div class="note">com | eu | ca | asia | com.au</div>

      <label for="clientId">Worker Client ID</label>
      <input id="clientId" name="clientId" required autocomplete="off">

      <label for="clientSecret">Worker Client Secret</label>
      <input id="clientSecret" name="clientSecret" type="password" required autocomplete="off">
      <div class="note">Sent only to 127.0.0.1 on this machine. Auth method is hard-coded to client_secret_basic.</div>

      <button id="submit" type="submit">Submit and continue</button>
      <div class="err" id="err"></div>
    </form>
    <script>
      const NONCE = ${JSON.stringify(nonce)};
      const f = document.getElementById('f');
      const err = document.getElementById('err');
      const btn = document.getElementById('submit');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        btn.disabled = true; btn.textContent = 'Submitting…'; err.textContent = '';
        const data = Object.fromEntries(new FormData(f));
        try {
          const res = await fetch('/submit', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-bootstrap-nonce': NONCE },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error(await res.text());
          document.body.innerHTML = '<main><h1>Submitted.</h1><p>You can close this tab — the script is provisioning PingOne now.</p></main>';
          setTimeout(() => window.close(), 800);
        } catch (e2) {
          err.textContent = String(e2.message || e2);
          btn.disabled = false; btn.textContent = 'Submit and continue';
        }
      });
    </script>
  </main>
</body>
</html>`;
}

function browserPrompt({ timeoutMs = 5 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    const REPO_ROOT = path.resolve(__dirname, '..', '..');
    const certPath = path.join(REPO_ROOT, 'certs', 'api.ping.demo+2.pem');
    const keyPath  = path.join(REPO_ROOT, 'certs', 'api.ping.demo+2-key.pem');
    const useTls = fs.existsSync(certPath) && fs.existsSync(keyPath);

    const nonce = crypto.randomBytes(24).toString('base64url');
    const formPage = buildFormPage(nonce);

    const handler = (req, res) => {
      // Only accept the configured origin (127.0.0.1) — Node binds there, but
      // refuse Host headers that don't match to neutralize DNS rebinding.
      const host = String(req.headers.host || '');
      if (!/^127\.0\.0\.1(:|$)/.test(host) && !/^localhost(:|$)/.test(host)) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        return res.end('bad host');
      }

      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(formPage);
      }

      // Browsers auto-fetch /favicon.ico — return 204 so it doesn't pollute the
      // console with a 404 (cosmetic, but the user sees it and worries).
      if (req.method === 'GET' && req.url === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }

      if (req.method === 'POST' && req.url === '/submit') {
        if (req.headers['x-bootstrap-nonce'] !== nonce) {
          res.writeHead(403, { 'content-type': 'text/plain' });
          return res.end('bad nonce');
        }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 16 * 1024) { req.destroy(); }     // hard cap
        });
        req.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(body); } catch (_e) {
            res.writeHead(400, { 'content-type': 'text/plain' });
            return res.end('bad json');
          }
          const envId = String(parsed.envId || '').trim();
          const region = String(parsed.region || 'com').trim() || 'com';
          const clientId = String(parsed.clientId || '').trim();
          const clientSecret = String(parsed.clientSecret || '').trim();

          if (!envId || !clientId || !clientSecret) {
            res.writeHead(400, { 'content-type': 'text/plain' });
            return res.end('All fields are required.');
          }

          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
          // Keep the listener alive briefly so the page's post-submit "Submitted —
          // closing tab" view can render and self-close without ERR_CONNECTION_REFUSED.
          // The page calls window.close() at +800ms; 3000ms gives a comfortable margin
          // (favicon refetch, password manager extension callback, browser-internal hits).
          setTimeout(() => { try { server.close(); } catch (_e) {} }, 3000);
          finish({ envId, region, workerClientId: clientId, workerClientSecret: clientSecret });
        });
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    };

    let settled = false;
    const finish = (creds) => { if (settled) return; settled = true; clearTimeout(timer); resolve(creds); };
    const fail   = (err)   => { if (settled) return; settled = true; clearTimeout(timer); try { server.close(); } catch (_e) {} reject(err); };

    const server = useTls
      ? require('https').createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, handler)
      : require('http').createServer(handler);

    server.on('error', fail);

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const scheme = useTls ? 'https' : 'http';
      const url = `${scheme}://127.0.0.1:${port}/`;
      console.log('');
      console.log(`Open this URL to enter PingOne worker creds:`);
      console.log(`  ${url}`);
      const opened = openBrowser(url);
      if (!opened) console.log('  (tried to open your default browser; if it didn\'t pop, paste the URL manually)');
      console.log('Waiting for submission… (Ctrl-C to abort)');
    });

    const timer = setTimeout(() => fail(new Error('Browser prompt timed out after 5 minutes.')), timeoutMs);
  });
}

async function gatherCredsViaBrowser() {
  console.log('PingOne Bootstrap — browser-based credential entry');
  console.log('You will enter Environment ID, Worker Client ID, and Worker Client Secret');
  console.log('in a localhost form. Auth method is hard-coded to client_secret_basic.');
  const fromForm = await browserPrompt();

  const publicAppUrl = process.env.PUBLIC_APP_URL || 'https://api.ping.demo:4000';
  const audience = process.env.PINGONE_BOOTSTRAP_AUDIENCE || 'banking_api_enduser';
  const mcpGatewayAudience = process.env.MCP_GW_AUDIENCE || 'mcp-gw.bxf.com';
  return { ...fromForm, publicAppUrl, audience, mcpGatewayAudience };
}

async function gatherCredsInteractive() {
  const tty = getInteractiveInput();
  const rl = readline.createInterface({ input: tty.stream, output: process.stdout, terminal: true });
  try {
    console.log('PingOne Bootstrap — interactive setup');
    console.log('Paste your PingOne management worker credentials (the worker app needs');
    console.log('the "Identity Data Admin" role to create users / apps / resources).');
    console.log('');

    const envId = await prompt(rl, 'PingOne Environment ID (UUID)');
    if (!envId) throw new Error('Environment ID is required.');

    const region = await prompt(rl, 'Region', { defaultValue: 'com' });
    const workerClientId = await prompt(rl, 'Management Client ID');
    if (!workerClientId) throw new Error('Management client ID is required.');

    const workerClientSecret = await prompt(rl, 'Management Client Secret', { secret: true });
    if (!workerClientSecret) throw new Error('Management client secret is required.');

    const publicAppUrl = await prompt(rl, 'Public App URL', {
      defaultValue: process.env.PUBLIC_APP_URL || 'https://api.ping.demo:4000',
    });

    const audience = process.env.PINGONE_BOOTSTRAP_AUDIENCE || 'banking_api_enduser';
    const mcpGatewayAudience = process.env.MCP_GW_AUDIENCE || 'mcp-gw.bxf.com';

    return { envId, region, workerClientId, workerClientSecret, publicAppUrl, audience, mcpGatewayAudience };
  } finally {
    rl.close();
    if (tty.fd != null) { try { require('fs').closeSync(tty.fd); } catch (_e) {} }
  }
}

function gatherCredsFromEnv() {
  const envId = process.env.PINGONE_BOOTSTRAP_ENV_ID;
  const workerClientId = process.env.PINGONE_BOOTSTRAP_CLIENT_ID;
  const workerClientSecret = process.env.PINGONE_BOOTSTRAP_CLIENT_SECRET;

  const missing = [];
  if (!envId) missing.push('PINGONE_BOOTSTRAP_ENV_ID');
  if (!workerClientId) missing.push('PINGONE_BOOTSTRAP_CLIENT_ID');
  if (!workerClientSecret) missing.push('PINGONE_BOOTSTRAP_CLIENT_SECRET');
  if (missing.length > 0) {
    throw new Error(`Non-interactive mode missing required env vars: ${missing.join(', ')}`);
  }

  return {
    envId,
    region: process.env.PINGONE_BOOTSTRAP_REGION || 'com',
    workerClientId,
    workerClientSecret,
    publicAppUrl: process.env.PUBLIC_APP_URL || 'https://api.ping.demo:4000',
    audience: process.env.PINGONE_BOOTSTRAP_AUDIENCE || 'banking_api_enduser',
    mcpGatewayAudience: process.env.MCP_GW_AUDIENCE || 'mcp-gw.bxf.com',
  };
}

// ── Confirmation summary ──────────────────────────────────────────────────────

function printPlan(creds) {
  const masked = creds.workerClientSecret
    ? `${creds.workerClientSecret.slice(0, 3)}…${creds.workerClientSecret.slice(-2)}`
    : '(empty)';
  console.log('');
  console.log('Plan:');
  console.log(`  Environment:        ${creds.envId}  (region: ${creds.region})`);
  console.log(`  Mgmt client id:     ${creds.workerClientId}`);
  console.log(`  Mgmt client secret: ${masked}`);
  console.log(`  Public app URL:     ${creds.publicAppUrl}`);
  console.log(`  Audience:           ${creds.audience}`);
  console.log(`  Gateway audience:   ${creds.mcpGatewayAudience}`);
  console.log('');
  console.log('Will create or reuse:');
  console.log('  3 resource servers, ~25 scopes, 7 applications, 2 users (with passwords),');
  console.log('  1 schema attribute, 2 token claims, scope mappings.');
  console.log('');
  console.log('Will overwrite banking_api_server/.env with provisioned credentials.');
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let creds;
  if (NON_INTERACTIVE) {
    creds = gatherCredsFromEnv();
  } else if (NO_BROWSER) {
    creds = await gatherCredsInteractive();
  } else {
    try {
      creds = await gatherCredsViaBrowser();
    } catch (err) {
      console.log('');
      console.log(`Browser prompt unavailable (${err.message}). Falling back to terminal.`);
      console.log('');
      creds = await gatherCredsInteractive();
    }
  }

  printPlan(creds);

  if (!NON_INTERACTIVE) {
    const tty = getInteractiveInput();
    const rl = readline.createInterface({ input: tty.stream, output: process.stdout, terminal: true });
    const confirm = await prompt(rl, 'Proceed with provisioning? [y/N]');
    rl.close();
    if (tty.fd != null) { try { require('fs').closeSync(tty.fd); } catch (_e) {} }
    if (!/^y(es)?$/i.test(String(confirm).trim())) {
      console.log('Aborted by user.');
      process.exit(2);
    }
  }

  // Lazy-require so --help and prompts don't pay the bootstrap import cost.
  const { provisionEnvironment } = require('../services/pingoneProvisionService');

  console.log('');
  console.log('═'.repeat(60));
  console.log('  PingOne provisioning');
  console.log('═'.repeat(60));
  console.log('');

  // Group the wizard's ~30 step keys into 6 user-readable phases. Each phase
  // gets a banner the FIRST time we see one of its keys; everything else
  // prints as an indented line under that banner.
  const PHASE_GROUPS = [
    { label: '① Validate worker creds',  keys: ['validate', 'population'] },
    { label: '② Resource servers',        keys: ['resource-server', 'mcp-resource-server', 'mcp-gw-resource'] },
    { label: '③ Scopes',                  keys: ['scopes', 'mcp-scopes', 'mcp-gw-scopes'] },
    { label: '④ Applications',            keys: ['admin-app', 'admin-config', 'user-app', 'user-config', 'mcp-app', 'mcp-config', 'worker-app', 'worker-config', 'mcp-exchanger-app', 'mcp-gw-app', 'mcp-gw-config', 'agent-app', 'agent-config'] },
    { label: '⑤ Scope grants',            keys: ['admin-grants', 'user-grants', 'mcp-grants', 'worker-grants', 'mcp-gw-grants', 'agent-grants'] },
    { label: '⑥ Demo users + claims',     keys: ['bankuser', 'bankuser-password', 'bankadmin', 'bankadmin-password', 'schema-attr', 'spel-claim'] },
    { label: '⑦ Write .env',              keys: ['config'] },
  ];
  const phaseSeen = new Set();

  let lastIcon = '';
  let stepCount = 0;
  const counters = { created: 0, exists: 0, failed: 0 };
  const onStep = (step) => {
    stepCount++;
    const icon = step.icon || '·';
    const msg = step.message || step.step || '';
    lastIcon = icon;

    // Print phase banner the first time we see a key from a new phase.
    const group = PHASE_GROUPS.find(g => g.keys.includes(step.step));
    if (group && !phaseSeen.has(group.label)) {
      phaseSeen.add(group.label);
      console.log('');
      console.log(`▶ ${group.label}`);
      console.log(`  ${'─'.repeat(56)}`);
    }

    // Tally outcomes by icon — provisionEnvironment uses ✅ for created and
    // ⚠️ for "already exists". Failures use ❌.
    if (icon === '✅') counters.created++;
    else if (icon === '⚠️') counters.exists++;
    else if (icon === '❌') counters.failed++;

    console.log(`  ${icon}  ${msg}`);
  };

  try {
    const result = await provisionEnvironment(creds, onStep);
    console.log('');
    console.log('═'.repeat(60));
    console.log('  PingOne provisioning complete');
    console.log('═'.repeat(60));
    console.log('');
    console.log(`  ${stepCount} steps run:`);
    console.log(`    ✅  ${counters.created} created`);
    if (counters.exists > 0) console.log(`    ⚠️   ${counters.exists} already existed (reused)`);
    if (counters.failed > 0) console.log(`    ❌  ${counters.failed} failed (see lines above)`);
    console.log('');

    if (result?.provisioned?.bankUser?.password || result?.provisioned?.bankAdmin?.password) {
      console.log('  Demo credentials (also saved in banking_api_server/.env):');
      if (result.provisioned.bankUser?.password) {
        console.log(`    bankuser   ${result.provisioned.bankUser.password}`);
      }
      if (result.provisioned.bankAdmin?.password) {
        console.log(`    bankadmin  ${result.provisioned.bankAdmin.password}`);
      }
      console.log('');
    }
    console.log('  banking_api_server/.env has been written with all PingOne credentials.');
    console.log('  Restart services so they pick up the new .env values:');
    console.log('    ./run-bank.sh restart');
    console.log('');
    process.exit(0);
  } catch (err) {
    console.log('');
    console.log('═'.repeat(60));
    console.log('  Bootstrap failed');
    console.log('═'.repeat(60));
    console.error('');
    console.error(`  Error: ${err.message}`);
    console.error('');
    console.error('  Last step icon emitted:', lastIcon || '(none)');
    console.error(`  Counters before failure: ${counters.created} created, ${counters.exists} already existed, ${counters.failed} failed`);
    console.error('');
    console.error('  PingOne resources created up to this point are preserved (no rollback).');
    console.error('  Re-running this command is safe — idempotent steps will report "already exists" and reuse.');
    console.error('');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`Unexpected error: ${e.message}`);
  process.exit(1);
});
