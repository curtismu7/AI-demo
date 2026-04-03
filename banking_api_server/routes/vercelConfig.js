'use strict';

/**
 * /api/admin/vercel-config — Read and update Vercel project environment variables.
 *
 * GET  /   → list all env vars (secrets masked, values never returned for secret/encrypted types)
 * PATCH /:key → update a plain env var value (blocked for secret/encrypted)
 *
 * Security:
 * - VERCEL_TOKEN is never logged or returned to the client (OWASP A3).
 * - Secret/encrypted env var values are never returned to the client (OWASP A2).
 * - Both routes are mounted behind admin auth middleware in server.js.
 * - When VERCEL_TOKEN or VERCEL_PROJECT_ID are missing, returns 503.
 */

const express = require('express');
const router  = express.Router();

const VERCEL_API = 'https://api.vercel.com';

function getVercelCredentials() {
  const token     = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  return { token, projectId, ready: !!(token && projectId) };
}

function isSensitiveType(type) {
  return type === 'secret' || type === 'encrypted';
}

// ---------------------------------------------------------------------------
// GET / — list all env vars
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const { token, projectId, ready } = getVercelCredentials();
  if (!ready) {
    return res.status(503).json({
      ok:      false,
      error:   'VERCEL_NOT_CONFIGURED',
      message: 'VERCEL_TOKEN and VERCEL_PROJECT_ID must be set to use this feature.',
    });
  }

  try {
    const response = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/env`,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        ok:     false,
        error:  'VERCEL_API_ERROR',
        status: response.status,
      });
    }

    const body = await response.json();
    const envs = Array.isArray(body.envs) ? body.envs : [];

    const vars = envs.map((env) => ({
      id:       env.id,
      key:      env.key,
      type:     env.type,
      hasValue: !!(env.value),
      // Never return the value for secrets/encrypted
      value:    isSensitiveType(env.type) ? null : (env.value || null),
    }));

    return res.json({ ok: true, vars });
  } catch (err) {
    console.error('[vercelConfig] GET error:', err.message);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:key — update a plain env var
// ---------------------------------------------------------------------------
router.patch('/:key', async (req, res) => {
  const { token, projectId, ready } = getVercelCredentials();
  if (!ready) {
    return res.status(503).json({
      ok:      false,
      error:   'VERCEL_NOT_CONFIGURED',
      message: 'VERCEL_TOKEN and VERCEL_PROJECT_ID must be set to use this feature.',
    });
  }

  const { key } = req.params;

  if (typeof req.body.value !== 'string') {
    return res.status(400).json({ ok: false, error: 'INVALID_BODY', message: 'value must be a string.' });
  }

  try {
    // Fetch current env list to find the var by key
    const listResponse = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/env`,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!listResponse.ok) {
      return res.status(502).json({ ok: false, error: 'VERCEL_API_ERROR', status: listResponse.status });
    }

    const listBody = await listResponse.json();
    const envs     = Array.isArray(listBody.envs) ? listBody.envs : [];
    const existing = envs.find((e) => e.key === key);

    if (!existing) {
      // Create new plain env var
      const createResponse = await fetch(
        `${VERCEL_API}/v9/projects/${projectId}/env`,
        {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key,
            value:  req.body.value,
            type:   'plain',
            target: ['production', 'preview'],
          }),
        }
      );

      if (!createResponse.ok) {
        return res.status(502).json({ ok: false, error: 'VERCEL_CREATE_ERROR', status: createResponse.status });
      }

      return res.json({ ok: true, key, type: 'plain', created: true });
    }

    // Block updates for secret/encrypted types
    if (isSensitiveType(existing.type)) {
      return res.status(403).json({
        ok:      false,
        error:   'CANNOT_UPDATE_SECRET',
        message: 'Secrets cannot be updated via this API. Re-enter the value directly in the Vercel Dashboard.',
      });
    }

    // Update existing plain env var
    const patchResponse = await fetch(
      `${VERCEL_API}/v9/projects/${projectId}/env/${existing.id}`,
      {
        method:  'PATCH',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: req.body.value }),
      }
    );

    if (!patchResponse.ok) {
      return res.status(502).json({ ok: false, error: 'VERCEL_PATCH_ERROR', status: patchResponse.status });
    }

    return res.json({ ok: true, key, type: existing.type });
  } catch (err) {
    console.error('[vercelConfig] PATCH error:', err.message);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
