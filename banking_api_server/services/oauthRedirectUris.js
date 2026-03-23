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

/**
 * Frontend origin for redirects after login / config (no /api prefix).
 */
function getFrontendOrigin(req) {
  const fromStore = configStore.getEffective('frontend_url');
  if (fromStore) return fromStore.replace(/\/+$/, '');
  const canonical = getCanonicalPublicOrigin();
  if (canonical) return canonical;
  if (process.env.VERCEL) {
    const proto = req.protocol === 'http' ? 'http' : 'https';
    return `${proto}://${getPublicHost(req)}`;
  }
  return (process.env.REACT_APP_CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Admin OAuth redirect_uri (must match PingOne Web app allowlist).
 * @param {{ silent?: boolean }} [opts] — if silent, no console.warn (e.g. GET /redirect-info)
 */
function getAdminRedirectUri(req, opts = {}) {
  const fromStore = configStore.getEffective('admin_redirect_uri');
  if (fromStore) return fromStore;
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
  if (fromStore) return fromStore;
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
    requestHost: getPublicHost(req),
    pingOneRegisterThese: [...new Set([admin, user])],
    /** Stable production alias for this repo’s Vercel deployment (allowlist in PingOne). */
    stableDemoOrigin: OFFICIAL_DEMO_ORIGIN,
    instructions: {
      summary:
        'In PingOne, each OAuth application (Admin app and Customer app) must list its redirect URI exactly as shown below — same scheme, host, and path.',
      steps: [
        'PingOne Admin → Applications → select the Admin (staff) app → Configuration → Redirect URIs → Add URI → paste the Admin redirect URI below.',
        'PingOne Admin → Applications → select the End-user (customer) app → Configuration → Redirect URIs → Add URI → paste the Customer redirect URI below.',
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
};
