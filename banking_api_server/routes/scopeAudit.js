/**
 * routes/scopeAudit.js — PingOne resource & scope audit endpoints.
 *
 * GET  /api/admin/scope-audit/resources   — list resources + scopes from PingOne
 * POST /api/admin/scope-audit/scopes      — create a missing scope on a resource
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getManagementToken } = require('../services/pingOneClientService');
const configStore = require('../services/configStore');
const axios = require('axios');

// ── Expected scope configuration per resource name pattern ───────────────────
const EXPECTED_SCOPES = {
  'banking api': {
    requiredScopes: ['banking:read', 'banking:write'],
    optionalScopes: [
      'banking:accounts:read', 'banking:transactions:read',
      'banking:transactions:write', 'banking:read',
      'banking:write',
    ],
  },
  'agent gateway': {
    requiredScopes: ['banking:agent:invoke', 'ai_agent'],
    optionalScopes: [],
  },
  'ai agent': {
    requiredScopes: ['banking:read', 'banking:write', 'banking:agent:invoke'],
    optionalScopes: [
      'banking:accounts:read', 'banking:transactions:read',
      'banking:transactions:write',
    ],
  },
  'mcp gateway': {
    requiredScopes: ['banking:mcp:invoke', 'mcp_resource_access'],
    optionalScopes: ['banking:ai:agent:read', 'banking:ai:agent:write'],
  },
  'mcp server': {
    requiredScopes: ['get_accounts:read', 'transfer:execute', 'check:read'],
    optionalScopes: [
      'banking:accounts:read', 'banking:transactions:read',
      'banking:transactions:write', 'banking:ai:agent:read',
      'banking:ai:agent:write',
    ],
  },
};

/** Match a PingOne resource name to an expected scope set */
function matchExpected(resourceName) {
  const lower = (resourceName || '').toLowerCase();
  for (const [pattern, config] of Object.entries(EXPECTED_SCOPES)) {
    if (lower.includes(pattern)) return config;
  }
  return null;
}

// ── GET /resources — list PingOne resources with scopes + expected comparison ─
router.get('/resources', async (_req, res) => {
  try {
    const envId = configStore.getEffective('PINGONE_ENVIRONMENT_ID');
    const region = configStore.getEffective('PINGONE_REGION') || 'com';
    if (!envId) {
      return res.status(400).json({ error: 'PINGONE_ENVIRONMENT_ID not configured' });
    }

    const token = await getManagementToken();
    const baseUrl = `https://api.pingone.${region}/v1/environments/${envId}`;

    // Fetch all resources
    const resourcesRes = await axios.get(`${baseUrl}/resources`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const resources = resourcesRes.data?._embedded?.resources || [];

    // For each resource, fetch its scopes
    const results = [];
    for (const r of resources) {
      let scopes = [];
      try {
        const scopesRes = await axios.get(`${baseUrl}/resources/${r.id}/scopes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        scopes = (scopesRes.data?._embedded?.scopes || []).map(s => ({
          id: s.id,
          name: s.name,
          description: s.description || '',
        }));
      } catch (e) {
        // Some built-in resources don't support scope listing
      }

      const expected = matchExpected(r.name);
      const scopeNames = scopes.map(s => s.name);
      const missingRequired = expected
        ? expected.requiredScopes.filter(s => !scopeNames.includes(s))
        : [];
      const missingOptional = expected
        ? expected.optionalScopes.filter(s => !scopeNames.includes(s))
        : [];

      results.push({
        id: r.id,
        name: r.name,
        audience: r.audience || null,
        type: r.type || 'CUSTOM',
        scopes,
        expected: expected
          ? {
              requiredScopes: expected.requiredScopes,
              optionalScopes: expected.optionalScopes,
              missingRequired,
              missingOptional,
              allRequiredPresent: missingRequired.length === 0,
            }
          : null,
      });
    }

    res.json({ resources: results, environment: envId, region });
  } catch (err) {
    console.error('[scope-audit] Error fetching resources:', err.message);
    const status = err.response?.status || 500;
    res.status(status).json({
      error: err.message,
      hint: status === 401
        ? 'Management worker credentials may be invalid. Check PINGONE_MGMT_CLIENT_ID/SECRET.'
        : undefined,
    });
  }
});

// ── POST /scopes — create a scope on a resource ─────────────────────────────
router.post('/scopes', async (req, res) => {
  try {
    const { resourceId, scopeName, description } = req.body;
    if (!resourceId || !scopeName) {
      return res.status(400).json({ error: 'resourceId and scopeName are required' });
    }

    const envId = configStore.getEffective('PINGONE_ENVIRONMENT_ID');
    const region = configStore.getEffective('PINGONE_REGION') || 'com';
    const token = await getManagementToken();
    const url = `https://api.pingone.${region}/v1/environments/${envId}/resources/${resourceId}/scopes`;

    const result = await axios.post(url, {
      name: scopeName,
      description: description || `${scopeName} scope`,
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    res.json({ created: true, scope: result.data });
  } catch (err) {
    console.error('[scope-audit] Error creating scope:', err.response?.data || err.message);
    const status = err.response?.status || 500;
    const detail = err.response?.data?.message || err.message;
    res.status(status).json({ error: detail });
  }
});

module.exports = router;
