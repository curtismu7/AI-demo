'use strict';

const path = require('path');
const fs   = require('fs');
const axios  = require('axios');

const { BFF_BASE, httpsAgent } = require('./constants');

const SESSION_CACHE = path.resolve(__dirname, '../../../.test-session.json');

async function loginViaBff({ envId, region, username, password, loginPath, callbackPath }) {
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

  const r1 = await bff.get(loginPath, { headers: { Cookie: bffCookies } });
  bffCookies = merge(bffCookies, extractBffCookies(r1));
  const pingLoc = r1.headers.location || '';
  if (!pingLoc) throw new Error(`BFF ${loginPath} did not redirect to PingOne`);

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

  const base    = `https://auth.pingone.${region || 'com'}/${envId}/as`;
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

  const callbackUrl = `${callbackPath}?code=${code}&state=${new URL(resumeLoc).searchParams.get('state')||''}`;
  const r4 = await bff.get(callbackUrl, { headers: { Cookie: bffCookies } });
  bffCookies = merge(bffCookies, extractBffCookies(r4));

  const sidEntry = bffCookies.split('; ').find(p => p.startsWith('connect.sid='));
  if (!sidEntry) throw new Error('loginViaBff: no connect.sid in BFF cookies after callback');
  return sidEntry;
}

// Per-persona BFF routes: enduser uses the user OAuth client; admin uses the admin client.
const PERSONA_ROUTES = {
  enduser: {
    loginPath:    '/api/auth/oauth/user/login',
    callbackPath: '/api/auth/oauth/user/callback',
    oauthType:    'user',
  },
  admin: {
    loginPath:    '/api/auth/oauth/login',
    callbackPath: '/api/auth/oauth/callback',
    oauthType:    'admin',
  },
};

function loadFromLmdb(oauthType) {
  try {
    const { open } = require('lmdb');
    const lmdbPath = path.resolve(__dirname, '../../../data/persistent/lmdb');
    if (!fs.existsSync(lmdbPath)) return null;
    const env = open({ path: lmdbPath, maxDbs: 16, encoding: 'json', readOnly: true });
    const db = env.openDB('sessions', { encoding: 'json' });
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);
    for (const { key, value } of db.getRange()) {
      try {
        if (!value || value.expire <= now) continue;
        const sess = value.sess;
        const at = sess?.oauthTokens?.accessToken;
        if (!at) continue;
        if (oauthType && sess.oauthType && sess.oauthType !== oauthType) continue;
        const payload = JSON.parse(Buffer.from(at.split('.')[1], 'base64url').toString());
        if (payload.exp > nowSec) {
          env.close();
          return `connect.sid=${encodeURIComponent(`s:${key}`)}`;
        }
      } catch (_) { /* skip malformed */ }
    }
    env.close();
    return null;
  } catch (_) {
    return null;
  }
}

function loadFromSessionsDb(oauthType) {
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
        // Filter by oauthType when specified so enduser doesn't reuse an admin session
        if (oauthType && sess.oauthType && sess.oauthType !== oauthType) continue;
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

async function resolveSession(persona = 'enduser') {
  const cached = fs.existsSync(SESSION_CACHE) ? JSON.parse(fs.readFileSync(SESSION_CACHE, 'utf8')) : {};
  if (cached[persona] && cached[persona] !== 'skip') return cached[persona];

  const envId  = process.env.PINGONE_ENVIRONMENT_ID;
  const region = process.env.PINGONE_REGION || 'com';
  const routes  = PERSONA_ROUTES[persona] || PERSONA_ROUTES.admin;

  if (persona === 'enduser' && process.env.PINGONE_TEST_USER && process.env.PINGONE_TEST_PASSWORD) {
    try {
      return await loginViaBff({ envId, region,
        username: process.env.PINGONE_TEST_USER,
        password: process.env.PINGONE_TEST_PASSWORD,
        loginPath:    routes.loginPath,
        callbackPath: routes.callbackPath,
      });
    } catch (e) {
      console.warn(`[session] Headless enduser login failed: ${e.message} — trying sessions.db`);
    }
  }

  if (persona === 'admin' && process.env.PINGONE_TEST_ADMIN_USER && process.env.PINGONE_TEST_ADMIN_PASSWORD) {
    try {
      return await loginViaBff({ envId, region,
        username: process.env.PINGONE_TEST_ADMIN_USER,
        password: process.env.PINGONE_TEST_ADMIN_PASSWORD,
        loginPath:    routes.loginPath,
        callbackPath: routes.callbackPath,
      });
    } catch (e) {
      console.warn(`[session] Headless admin login failed: ${e.message} — trying sessions.db`);
    }
  }

  const lmdbCookie = loadFromLmdb(routes.oauthType);
  if (lmdbCookie) return lmdbCookie;

  const dbCookie = loadFromSessionsDb(routes.oauthType);
  if (dbCookie) return dbCookie;

  return null;
}

module.exports = { resolveSession, SESSION_CACHE };
