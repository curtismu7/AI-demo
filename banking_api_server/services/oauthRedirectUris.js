// banking_api_server/services/oauthRedirectUris.js
/**
 * Single place for OAuth redirect_uri and frontend origin resolution.
 * PingOne requires redirect_uri to match an allowlisted entry exactly (scheme, host, path).
 */
'use strict';

const configStore = require('./configStore');
const { getCanonicalPublicOrigin, OFFICIAL_DEMO_ORIGIN } = require('./vercelPublicUrl');

/** Public hostname for this request (Vercel often sets x-forwarded-host). */
function getPublicHost(req) {
  if (!req || !req.get) return '';
  const xf = req.get('x-forwarded-host');
  if (xf) return xf.split(',')[0].trim();
  return req.get('host') || '';
}

/** Strip trailing slashes, whitespace, and newlines from a URL. */
function _sanitizeUrl(url) {
  return (url || '').trim().replace(/[\/\r\n]+$/, '');
}

/**
 * Static examples for PingOne allowlists — register every host you actually use.
 * Paths are fixed; origins match common BX Finance deployments (local + custom API domain).
 */
const REFERENCE_REDIRECT_SETS = [
  {
    id: 'localhost',
    label: 'Local development (API / BFF on port 3001)',
    adminRedirectUri: 'http://localhost:3001/api/auth/oauth/callback',
    userRedirectUri: 'http://localhost:3001/api/auth/oauth/user/callback',
    postLogoutExample: 'http://localhost:3000/logout',
    hint: 'CRA often serves the UI on :3000 and proxies /api to :3001 — OAuth callbacks still hit the BFF origin (:3001).',
  },
  {
    id: 'api-pingdeme',
    label: 'Custom API host (example: api.pingdeme.org)',
    adminRedirectUri: 'https://api.pingdeme.org/api/auth/oauth/callback',
    userRedirectUri: 'https://api.pingdeme.org/api/auth/oauth/user/callback',
    postLogoutExample: 'https://api.pingdeme.org/logout',
    hint: 'Set PUBLIC_APP_URL=https://api.pingdeme.org when the BFF is served at this host. Sign Off URL must match REACT_APP_CLIENT_URL + /logout.',
  },
];

/**
 * Frontend origin for redirects after login / config (no /api prefix).
 */
function getFrontendOrigin(req) {
  const fromStore = configStore.getEffective('frontend_url');
  if (fromStore) return _sanitizeUrl(fromStore);
  const canonical = getCanonicalPublicOrigin();
  if (canonical) return canonical;
  if (process.env.VERCEL) {
    const proto = req.protocol === 'http' ? 'http' : 'https';
    return `${proto}://${getPublicHost(req)}`;
  }
  return _sanitizeUrl(process.env.REACT_APP_CLIENT_URL || 'http://localhost:3000');
}

/**
 * Admin OAuth redirect_uri (must match PingOne Web app allowlist).
 * @param {{ silent?: boolean }} [opts] — if silent, no console.warn (e.g. GET /redirect-info)
 */
function getAdminRedirectUri(req, opts = {}) {
  const fromStore = configStore.getEffective('admin_redirect_uri');
  if (fromStore) return _sanitizeUrl(fromStore);
  const base = getCanonicalPublicOrigin();
  if (base) return `${base}/api/auth/oauth/callback`;
  if (process.env.VERCEL) {
    if (!opts.silent) {
      console.warn(
        '[OAuth admin] No PUBLIC_APP_URL / REACT_APP_CLIENT_URL / VERCEL_PROJECT_PRODUCTION_URL; using request host for redirect_uri — set PUBLIC_APP_URL to your stable production domain (e.g. banking-demo-puce.vercel.app) and register that URI in PingOne.'
      );
    }
    const proto = req.protocol === 'http' ? 'http' : 'https';
    return `${proto}://${getPublicHost(req)}/api/auth/oauth/callback`;
  }
  // Local dev or Replit — derive from request
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const host  = getPublicHost(req);
  return `${proto}://${host}/api/auth/oauth/callback`;
}

/**
 * End-user OAuth redirect_uri (must match PingOne app allowlist).
 * @param {{ silent?: boolean }} [opts]
 */
function getUserRedirectUri(req, opts = {}) {
  const fromStore = configStore.getEffective('user_redirect_uri');
  if (fromStore) return _sanitizeUrl(fromStore);
  const base = getCanonicalPublicOrigin();
  if (base) return `${base}/api/auth/oauth/user/callback`;
  if (process.env.VERCEL) {
    if (!opts.silent) {
      console.warn(
        '[OAuth user] No canonical PUBLIC_APP_URL — using request host for redirect_uri; set PUBLIC_APP_URL and register the same URIs in PingOne.'
      );
    }
    const proto = req.protocol === 'http' ? 'http' : 'https';
    return `${proto}://${getPublicHost(req)}/api/auth/oauth/user/callback`;
  }
  // Local dev or Replit — derive from request
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const host  = getPublicHost(req);
  return `${proto}://${host}/api/auth/oauth/user/callback`;
}

/**
 * JSON for GET /api/auth/oauth/redirect-info — copy values into PingOne redirect URI lists.
 */
function getOAuthRedirectDebugInfo(req) {
  const canonical = getCanonicalPublicOrigin();
  const admin = getAdminRedirectUri(req, { silent: true });
  const user = getUserRedirectUri(req, { silent: true });
  const frontendOrigin = getFrontendOrigin(req);
  const postLogoutUri = `${frontendOrigin}/logout`;
  const warnings = [];
  if (process.env.VERCEL && !canonical) {
    warnings.push(
      'Set PUBLIC_APP_URL (or REACT_APP_CLIENT_URL / VERCEL_PROJECT_PRODUCTION_URL) to your stable production URL (e.g. https://banking-demo-puce.vercel.app) so redirect_uri does not change when deployment hostnames change. Register adminRedirectUri and userRedirectUri below in PingOne exactly.'
    );
  }
  return {
    canonicalOrigin: canonical,
    adminRedirectUri: admin,
    userRedirectUri: user,
    postLogoutUri,
    requestHost: getPublicHost(req),
    pingOneRegisterThese: [...new Set([admin, user])],
    /** Copy/paste examples — add each origin you use to PingOne (localhost + api.pingdeme.org, etc.). */
    referenceRedirectSets: REFERENCE_REDIRECT_SETS,
    environmentId:    configStore.getEffective('pingone_environment_id') || null,
    adminClientId:    configStore.getEffective('admin_client_id')        || null,
    adminSecretSet:   !!(configStore.getEffective('admin_client_secret')),
    adminSecretHint:  (configStore.getEffective('admin_client_secret') || '').slice(0, 4) || null,
    userClientId:     configStore.getEffective('user_client_id')         || null,
    userSecretSet:    !!(configStore.getEffective('user_client_secret')),
    userSecretHint:   (configStore.getEffective('user_client_secret')  || '').slice(0, 4) || null,
    /** Stable production alias for this repo's Vercel deployment (allowlist in PingOne). */
    stableDemoOrigin: OFFICIAL_DEMO_ORIGIN,
    instructions: {
      summary:
        'In PingOne, each OAuth application (Admin app and Customer app) must list its redirect URI exactly — same scheme, host, and path. You can register **multiple** URIs per app (e.g. **localhost** for dev and **https://api.pingdeme.org** for a hosted BFF) so the same tenant works in every environment.',
      steps: [
        'If you use **local dev** and a **hosted API** (e.g. api.pingdeme.org), add **both** sets of Admin + Customer callback URLs from the reference table below to each PingOne app — not only the “current” deployment values.',
        'PingOne Admin → Applications → select the Admin (staff) app → Configuration → Redirect URIs → Add URI → paste the Admin redirect URI below (and any reference rows you need).',
        'PingOne Admin → Applications → select the End-user (customer) app → Configuration → Redirect URIs → Add URI → paste the Customer redirect URI below (and reference rows).',
        'Both apps → Configuration → Sign Off URLs → Add URI → paste the Sign Off (post-logout) URI for each frontend origin you use (see reference examples). PingOne redirects here after RP-Initiated Logout.',
        'Save both applications. Sign-in uses Authorization Code + PKCE; the callback path is always under /api/auth/oauth/ on this server.',
      ],
    },
    warnings,
  };
}

/**
 * Validates that a computed redirect URI's origin matches the deployment origin.
 * Prevents session-hijacking attacks from forcing a mismatched redirect_uri
 * into the token exchange.
 *
 * Returns true when the URI is safe to use. On Vercel, we also enforce
 * that the URI does not point to localhost.
 */
function validateRedirectUriOrigin(redirectUri) {
  try {
    const { hostname, protocol } = new URL(redirectUri);
    const isProd = process.env.NODE_ENV === 'production'
      || !!process.env.VERCEL
      || !!process.env.REPL_ID
      || !!process.env.REPLIT_DEPLOYMENT;
    if (isProd) {
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
        return { ok: false, reason: `Redirect URI hostname "${hostname}" is not allowed on this deployment.` };
      }
      if (protocol === 'http:') {
        return { ok: false, reason: 'Redirect URI must use HTTPS on this deployment.' };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Invalid redirect URI format.' };
  }
}

/**
 * Returns the expected frontend origin for this deployment.
 * Used to validate Origin/Referer headers on sensitive endpoints.
 */
function getExpectedFrontendOrigin(req) {
  // Explicit override
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.REACT_APP_CLIENT_URL) return process.env.REACT_APP_CLIENT_URL.replace(/\/$/, '');
  // Vercel system URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  // Fall back to request origin
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const host = getPublicHost(req);  // use existing helper
  return `${proto}://${host}`;
}

module.exports = {
  getPublicHost,
  getFrontendOrigin,
  getAdminRedirectUri,
  getUserRedirectUri,
  getOAuthRedirectDebugInfo,
  validateRedirectUriOrigin,
  getExpectedFrontendOrigin,
  REFERENCE_REDIRECT_SETS,
};
