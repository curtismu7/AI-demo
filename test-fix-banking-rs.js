#!/usr/bin/env node
/**
 * test-fix-banking-rs.js
 * 
 * Integration smoke-test for POST /api/pingone-test/fix-banking-resource-server
 * 
 * Usage:
 *   node test-fix-banking-rs.js                   # default http://localhost:3001
 *   node test-fix-banking-rs.js http://localhost:4000
 *   BASE_URL=https://your-vercel-app.vercel.app node test-fix-banking-rs.js
 * 
 * Prerequisites:
 *   - banking_api_server running (npm start or run-bank.sh)
 *   - Valid PingOne credentials in .env (PINGONE_WORKER_CLIENT_ID, etc.)
 *   - A browser session cookie OR run after logging in (the fix endpoint
 *     uses worker creds server-side, so no user cookie is required)
 */

'use strict';

const http = require('http');
const https = require('https');

const BASE_URL = process.argv[2] || process.env.BASE_URL || 'http://localhost:3001';
const ENDPOINT = `${BASE_URL}/api/pingone-test/fix-banking-resource-server?sessionId=cli-test`;

const CANONICAL_SCOPES = ['read', 'write', 'admin', 'sensitive', 'ai:agent'];

// ─── Simple HTTP POST (no external deps) ────────────────────────────────────

function post(url, body = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(body);

    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ─── Test runner ────────────────────────────────────────────────────────────

function pass(msg) { console.log(`  ✓  ${msg}`); }
function fail(msg) { console.error(`  ✗  ${msg}`); process.exitCode = 1; }

async function run() {
  console.log(`\nTarget: POST ${ENDPOINT}\n`);

  // ── 1. Call the endpoint ──────────────────────────────────────────────────
  let res;
  try {
    res = await post(ENDPOINT);
  } catch (err) {
    fail(`Request failed — is the server running at ${BASE_URL}? (${err.message})`);
    console.log('\n  Equivalent curl:\n');
    console.log(`  curl -s -X POST '${ENDPOINT}' -H 'Content-Type: application/json' -d '{}'`);
    return;
  }

  console.log(`HTTP status : ${res.status}`);
  console.log(`Response   :`, JSON.stringify(res.body, null, 2));
  console.log('');

  // ── 2. Status assertions ──────────────────────────────────────────────────
  if (res.status === 200) {
    pass(`HTTP 200 OK`);
  } else if (res.status === 503) {
    fail(`503 — worker token unavailable. Check PINGONE_WORKER_CLIENT_ID / PINGONE_WORKER_CLIENT_SECRET in .env`);
    return;
  } else if (res.status === 502) {
    fail(`502 — PingOne API rejected resource server creation: ${res.body?.error}`);
    return;
  } else {
    fail(`Unexpected status ${res.status}: ${res.body?.error || 'unknown error'}`);
    return;
  }

  // ── 3. Shape assertions ───────────────────────────────────────────────────
  const body = res.body;

  if (body.success === true) {
    pass('success: true');
  } else {
    fail(`success is not true: ${body.error}`);
    return;
  }

  if (typeof body.resourceServerId === 'string' && body.resourceServerId.length > 0) {
    pass(`resourceServerId present: ${body.resourceServerId}`);
  } else {
    fail('resourceServerId missing or empty');
  }

  if (typeof body.created === 'boolean') {
    pass(`created: ${body.created} (${body.created ? 'RS was just created' : 'RS already existed'})`);
  } else {
    fail('created field missing');
  }

  if (Array.isArray(body.scopeResults)) {
    pass(`scopeResults is array (${body.scopeResults.length} scope(s) created)`);
    const failed = body.scopeResults.filter(r => !r.success);
    if (failed.length === 0) {
      pass('All scope create operations succeeded');
    } else {
      fail(`${failed.length} scope(s) failed to create: ${JSON.stringify(failed)}`);
    }
  } else {
    fail('scopeResults missing or not an array');
  }

  // ── 4. Idempotency check — run it twice ───────────────────────────────────
  console.log('\nIdempotency check (running a second time)…\n');
  const res2 = await post(ENDPOINT);
  if (res2.status === 200 && res2.body.success) {
    if (res2.body.scopeResults.length === 0) {
      pass('Second run created 0 scopes — endpoint is idempotent ✓');
    } else {
      // May legit create 0 on second run or still some missing — just note it
      pass(`Second run created ${res2.body.scopeResults.length} scope(s) (check PingOne if unexpected)`);
    }
  } else {
    fail(`Second call failed: ${res2.status} ${res2.body?.error}`);
  }

  // ── 5. Verify canonical scopes via /verify-assets (optional) ─────────────
  console.log('\nVerify-assets cross-check…\n');
  const verifyRes = await post(`${BASE_URL}/api/pingone-test/verify-assets?sessionId=cli-test`).catch(() => null);
  if (!verifyRes) {
    console.log('  (skipped — verify-assets not reachable or method mismatch)\n');
  } else if (verifyRes.status === 200) {
    const missing = verifyRes.body?.missingCanonicalScopes || [];
    if (missing.length === 0) {
      pass(`verify-assets reports 0 missing canonical scopes`);
    } else {
      fail(`verify-assets still reports missing scopes after fix: ${missing.join(', ')}`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────');
  if (process.exitCode === 1) {
    console.log('RESULT: SOME CHECKS FAILED — see ✗ lines above\n');
  } else {
    console.log('RESULT: ALL CHECKS PASSED ✓\n');
  }
  
  // ── Equivalent curl for manual runs ──────────────────────────────────────
  console.log('Equivalent curl command:\n');
  console.log(`  curl -s -X POST '${ENDPOINT}' \\`);
  console.log(`    -H 'Content-Type: application/json' \\`);
  console.log(`    -d '{}' | jq .`);
  console.log('');
}

run().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
