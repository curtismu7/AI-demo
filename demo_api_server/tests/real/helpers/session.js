// demo_api_server/tests/real/helpers/session.js
'use strict';

const path = require('path');
const fs   = require('fs');
const https  = require('https');
const axios  = require('axios');
const crypto = require('crypto');

const SESSION_CACHE = path.resolve(__dirname, '../../../.test-session.json');
const BFF_BASE      = 'https://api.ping.demo:3001';
const httpsAgent    = new https.Agent({ rejectUnauthorized: false }); // mkcert self-signed

// ── Headless PKCE login via BFF ───────────────────────────────────────────────

async function loginViaBff({ envId, region, clientId, clientSecret, redirectUri, username, password, authMethod }) {
  // Use BFF /api/auth/oauth/login → PingOne → BFF callback, tracking cookies.
  const bff = axios.create({ baseURL: BFF_BASE, httpsAgent, maxRedirects: 0, validateStatus: () => true });
  let bffCookies = '';

  function extractBffCookies(r) {
    return (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  }
  function merge(existing, fresh) {
    if (!fresh) return existing;
    const map = new Map();
    for (const p of (existing || '').split('; ').filter(Boolean)) { const [k,...v]=p.split('='); map.set(k,v.join('=')); }
    for (const p of fresh.split('; ').filter(Boolean)) { const [k,...v]=p.split('='); map.set(k,v.join('=')); }
    return [...map.entries()].map(([k,v])=>`${k}=${v}`).join('; ');
  }

  // 1. Start BFF login — get connect.sid + state in session
  const r1 = await bff.get('/api/auth/oauth/login', { headers: { Cookie: bffCookies } });
  bffCookies = merge(bffCookies, extractBffCookies(r1));
  const pingLoc = r1.headers.location || '';
  if (!pingLoc) throw new Error('BFF /login did not redirect to PingOne');

  // 2. Follow to PingOne, do headless credential flow
  let pCookies = '';
  const r2 = await axios.get(pingLoc, { maxRedirects: 0, validateStatus: () => true, httpsAgent });
  pCookies = merge(pCookies, (r2.headers['set-cookie'] || []).map(c=>c.split(';')[0]).join('; '));
  const loc2 = r2.headers.location || '';
  let flowId;
  try { flowId = new URL(loc2).searchParams.get('flowId'); } catch(_) {}
  if (!flowId) {
    const r2b = await axios.get(loc2, { maxRedirects:0, validateStatus:()=>true, httpsAgent, headers:{Cookie:pCookies} });
    pCookies = merge(pCookies, (r2b.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; '));
    try { flowId = new URL(r2b.headers.location||'').searchParams.get('flowId'); } catch(_) {}
  }
  if (!flowId) throw new Error('loginViaBff: could not extract flowId');

  const base = `https://auth.pingone.${region || 'com'}/${envId}/as`;
  const flowUrl = `https://auth.pingone.${region || 'com'}/${envId}/flows/${flowId}`;
  const rc = await axios.post(flowUrl, { username, password }, {
    headers: { 'Content-Type': 'application/vnd.pingidentity.usernamePassword.check+json', Cookie: pCookies },
    validateStatus:()=>true, httpsAgent,
  });
  pCookies = merge(pCookies, (rc.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; '));
  if (rc.data?.status !== 'COMPLETED') throw new Error(`loginViaBff: flow not COMPLETED: ${rc.data?.status}`);

  const rr = await axios.get(`${base}/resume?flowId=${flowId}`, {
    maxRedirects:0, validateStatus:()=>true, httpsAgent, headers:{Cookie:pCookies},
  });
  const resumeLoc = rr.headers.location || '';
  const code = new URL(resumeLoc).searchParams.get('code');
  const errR = new URL(resumeLoc).searchParams.get('error');
  if (errR) throw new Error(`loginViaBff: PingOne error: ${errR}`);
  if (!code) throw new Error('loginViaBff: no code in resume redirect');

  // 3. Send code to BFF callback — BFF issues connect.sid with full session
  const callbackUrl = `/api/auth/oauth/callback?code=${code}&state=${new URL(resumeLoc).searchParams.get('state')||''}`;
  const r4 = await bff.get(callbackUrl, { headers: { Cookie: bffCookies } });
  bffCookies = merge(bffCookies, extractBffCookies(r4));

  // connect.sid is in bffCookies
  const sidEntry = bffCookies.split('; ').find(p => p.startsWith('connect.sid='));
  if (!sidEntry) throw new Error('loginViaBff: no connect.sid in BFF cookies after callback');
  return sidEntry; // "connect.sid=s%3A..."
}

// ── sessions.db fallback ──────────────────────────────────────────────────────

function loadFromSessionsDb() {
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.resolve(__dirname, '../../../data/sessions.db');
    if (!fs.existsSync(dbPath)) return null;
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT sid, sess FROM sessions ORDER BY expire DESC LIMIT 20').all();
    db.close();
    const now = Math.floor(Date.now() / 1000);
    for (const row of rows) {
      try {
        const sess = JSON.parse(row.sess);
        const at = sess?.oauthTokens?.accessToken;
        if (!at) continue;
        const payload = JSON.parse(Buffer.from(at.split('.')[1], 'base64url').toString());
        if (payload.exp > now) {
          return `connect.sid=${encodeURIComponent(`s:${row.sid}`)}`;
        }
      } catch (_) { /* skip malformed */ }
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function resolveSession(persona = 'enduser') {
  const cached = fs.existsSync(SESSION_CACHE) ? JSON.parse(fs.readFileSync(SESSION_CACHE, 'utf8')) : {};
  if (cached[persona] && cached[persona] !== 'skip') return cached[persona];

  const envId      = process.env.PINGONE_ENVIRONMENT_ID;
  const region     = process.env.PINGONE_REGION || 'com';
  const authMethod = 'post';

  if (persona === 'enduser' && process.env.PINGONE_TEST_USER && process.env.PINGONE_TEST_PASSWORD) {
    const clientId     = process.env.PINGONE_USER_CLIENT_ID || process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.PINGONE_USER_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET;
    const redirectUri  = `https://api.ping.demo:3001/api/auth/oauth/callback`;
    try {
      const cookie = await loginViaBff({ envId, region, clientId, clientSecret, redirectUri,
        username: process.env.PINGONE_TEST_USER, password: process.env.PINGONE_TEST_PASSWORD, authMethod });
      return cookie;
    } catch (e) {
      console.warn(`[session] Headless enduser login failed: ${e.message} — trying sessions.db`);
    }
  }

  if (persona === 'admin' && process.env.PINGONE_TEST_ADMIN_USER && process.env.PINGONE_TEST_ADMIN_PASSWORD) {
    const clientId     = process.env.PINGONE_ADMIN_CLIENT_ID;
    const clientSecret = process.env.PINGONE_ADMIN_CLIENT_SECRET;
    const redirectUri  = `https://api.ping.demo:3001/api/auth/oauth/callback`;
    try {
      const cookie = await loginViaBff({ envId, region, clientId, clientSecret, redirectUri,
        username: process.env.PINGONE_TEST_ADMIN_USER, password: process.env.PINGONE_TEST_ADMIN_PASSWORD, authMethod });
      return cookie;
    } catch (e) {
      console.warn(`[session] Headless admin login failed: ${e.message} — trying sessions.db`);
    }
  }

  // sessions.db fallback (works for both personas — picks the most recent valid session)
  const dbCookie = loadFromSessionsDb();
  if (dbCookie) return dbCookie;

  return null; // triggers skip sentinel in globalSetup
}

module.exports = { resolveSession, SESSION_CACHE };
