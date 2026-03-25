'use strict';

/**
 * /api/admin/config  — read/write app configuration.
 *
 * GET  /api/admin/config       → masked config (secrets replaced with ••••••••)
 * POST /api/admin/config       → save one or more config keys
 * POST /api/admin/config/test  → validate PingOne credentials by calling the
 *                                discovery / token endpoint
 * POST /api/admin/config/reset → wipe stored config (requires admin session)
 *
 * Security model:
 *  • GET is open (returns masked data — no secret exposure).
 *  • POST is open when no config is stored yet (first-run setup).
 *  • POST is restricted to admin OAuth session once config exists (or X-Config-Password on hosted stacks).
 *  • On Vercel without KV, POST/reset return 403 (env-only); with KV, writes go to Upstash.
 *  • Reset uses the same gate as POST; on hosted stacks prefer ADMIN_CONFIG_PASSWORD for auth.
 */

const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const configStore = require('../services/configStore');
const { FIELD_DEFS, SECRET_KEYS } = require('../services/configStore');
const { getOAuthRedirectDebugInfo } = require('../services/oauthRedirectUris');
const { blockInDemoMode } = require('../middleware/demoMode');
const hosting = require('../config/hosting');

// Rate limit for unauthenticated config reads (GET returns masked data only).
// Admins must match session shape used elsewhere (session.user.role / oauthType) — oauthUser.role was wrong and forced admins into the same cap as anonymous users behind NAT.
const configReadLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 120,               // headroom for SPA + Config page + shared office IPs (masked GET only)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many config requests. Please wait a minute.' },
  skip: (req) =>
    isAdminSession(req) ||
    req.session?.oauthType === 'admin',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminSession(req) {
  return !!(req.session?.user?.role === 'admin' || req.session?.isAdmin);
}

/**
 * Gate: allow request if (a) no config is stored yet, OR (b) caller is admin,
 * OR (c) hosted mode and the correct ADMIN_CONFIG_PASSWORD header is provided,
 * OR (d) hosted mode and ADMIN_CONFIG_PASSWORD is not set (open demo mode).
 * OR (e) local dev (not Vercel / Replit) — always open.
 */
function requireAdminOrUnconfigured(req, res, next) {
  if (!configStore.isConfigured()) return next(); // first-run: always open
  if (!hosting.isVercel() && !hosting.isReplit()) return next(); // local dev: always open
  if (isAdminSession(req)) return next();          // OAuth admin session

  // Vercel / opt-in Replit: sessions may not persist — optional admin password header.
  if (hosting.useConfigPasswordHeader()) {
    const envPassword = process.env.ADMIN_CONFIG_PASSWORD;
    if (!envPassword) return next(); // no password configured → open demo mode
    if (req.headers['x-config-password'] === envPassword) return next();
    return res.status(401).json({
      error:   'unauthorized',
      message: 'Config password required. Set the X-Config-Password header to match the ADMIN_CONFIG_PASSWORD environment variable.',
    });
  }

  return res.status(401).json({
    error:   'unauthorized',
    message: 'Admin session required to update config once the app is configured.',
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/config
// ---------------------------------------------------------------------------

router.get('/', configReadLimiter, async (req, res) => {
  try {
    await configStore.ensureInitialized();
    let redirectInfo = null;
    try {
      redirectInfo = getOAuthRedirectDebugInfo(req);
    } catch (e) {
      redirectInfo = { error: e.message };
    }
    res.json({
      config:       configStore.getMasked(),
      isConfigured: configStore.isConfigured(),
      storageType:  configStore.getStorageType(),
      readOnly:     configStore.isReadOnly(),
      /** Hosted (Vercel or REPLIT_MANAGED_OAUTH): OAuth clients from env/KV — UI may be deployment-managed. */
      deploymentManagedPingOneOAuth: hosting.isDeploymentManagedPingOneOAuth(),
      /** Demo mode: destructive operations are limited — set via DEMO_MODE env var on shared/public deployments. */
      demoMode: !!process.env.DEMO_MODE,
      /** Exact redirect URIs to register in PingOne for this deployment (server-computed). */
      redirectInfo,
    });
  } catch (err) {
    console.error('[adminConfig] GET error:', err.message);
    res.status(500).json({ error: 'config_read_error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/config
// ---------------------------------------------------------------------------

router.post('/', requireAdminOrUnconfigured, async (req, res) => {
  if (hosting.isVercel() && !configStore.hasKvStorage()) {
    return res.status(403).json({
      error:   'read_only',
      message:
        'This Vercel deployment has no KV / Upstash connection. Set KV_REST_API_URL and KV_REST_API_TOKEN (or the Vercel KV integration), or manage PingOne settings via environment variables only.',
    });
  }
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'invalid_body', message: 'JSON body required.' });
    }

    // Validate: only accept known keys
    const filtered = {};
    for (const key of Object.keys(FIELD_DEFS)) {
      if (data[key] !== undefined) {
        const val = String(data[key]).trim();
        filtered[key] = val; // empty string = "leave unchanged" (setConfig skips empty)
      }
    }

    await configStore.setConfig(filtered);

    res.json({
      ok:           true,
      config:       configStore.getMasked(),
      isConfigured: configStore.isConfigured(),
    });
  } catch (err) {
    console.error('[adminConfig] POST error:', err.message);
    res.status(500).json({ error: 'config_save_error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/config/test  — test PingOne connection
// ---------------------------------------------------------------------------

router.post('/test', async (req, res) => {
  try {
    await configStore.ensureInitialized();

    // Prefer values sent in the request body (allows testing before saving)
    const envId    = req.body?.pingone_environment_id || configStore.getEffective('pingone_environment_id');
    const region   = req.body?.pingone_region         || configStore.getEffective('pingone_region') || 'com';
    const clientId = req.body?.admin_client_id        || configStore.getEffective('admin_client_id');

    if (!envId || !clientId) {
      return res.status(400).json({
        ok:    false,
        error: 'missing_config',
        message: 'Set at minimum pingone_environment_id and admin_client_id before testing.',
      });
    }

    // Hit the OIDC discovery endpoint — no credentials required
    const discoveryUrl = `https://auth.pingone.${region}/${envId}/as/.well-known/openid-configuration`;
    const response = await axios.get(discoveryUrl, { timeout: 8000 });

    res.json({
      ok:        true,
      issuer:    response.data.issuer,
      endpoints: {
        authorization: response.data.authorization_endpoint,
        token:         response.data.token_endpoint,
        userinfo:      response.data.userinfo_endpoint,
        jwks:          response.data.jwks_uri,
      },
      message: 'PingOne environment reached successfully.',
    });
  } catch (err) {
    const status = err.response?.status;
    const isNotFound = status === 404;
    res.status(200).json({
      ok:      false,
      error:   isNotFound ? 'environment_not_found' : 'connection_failed',
      message: isNotFound
        ? 'Environment ID not found — check pingone_environment_id and region.'
        : `Failed to reach PingOne: ${err.message}`,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/config/reset  — wipe all stored config (admin only)
// ---------------------------------------------------------------------------

router.post('/reset', blockInDemoMode('config reset'), requireAdminOrUnconfigured, async (req, res) => {
  if (hosting.isVercel() && !configStore.hasKvStorage()) {
    return res.status(403).json({
      error:   'read_only',
      message:
        'This Vercel deployment has no KV store. Reset is only available when KV_REST_API_URL and KV_REST_API_TOKEN are configured.',
    });
  }
  try {
    await configStore.ensureInitialized();
    await configStore.resetConfig();
    res.json({ ok: true, message: 'Configuration cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'reset_failed', message: err.message });
  }
});

module.exports = router;
