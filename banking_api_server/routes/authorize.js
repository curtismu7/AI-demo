// banking_api_server/routes/authorize.js
// Phase 3 — Admin-only PingOne Authorize management endpoints:
//   GET  /api/authorize/decision-endpoints   — list all endpoints in the environment
//   GET  /api/authorize/recent-decisions     — last N decisions for the configured endpoint

'use strict';

const express = require('express');
const { authenticateToken, requireScopes } = require('../middleware/auth');
const {
  getRecentDecisions,
  getDecisionEndpoints,
  isConfigured,
} = require('../services/pingOneAuthorizeService');
const { getSimulatedRecentDecisions } = require('../services/simulatedAuthorizeService');
const { getAuthorizationStatusSummary } = require('../services/transactionAuthorizationService');
const { getMcpFirstToolGateStatus } = require('../services/mcpToolAuthorizationService');

const router = express.Router();

/**
 * GET /api/authorize/decision-endpoints
 * List all PingOne Authorize decision endpoints in the configured environment.
 * Admin-only; used by the Config UI and education panel.
 */
router.get('/decision-endpoints', authenticateToken, requireScopes(['openid']), async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_only', message: 'This endpoint requires admin role.' });
  }

  if (!isConfigured()) {
    return res.status(422).json({
      error: 'authorize_not_configured',
      message: 'PingOne Authorize worker credentials are not configured.',
    });
  }

  try {
    const endpoints = await getDecisionEndpoints();
    return res.json({ endpoints });
  } catch (err) {
    console.error('[authorize/decision-endpoints] Error:', err.message);
    return res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

/**
 * GET /api/authorize/recent-decisions?endpointId=&limit=
 * Fetch recent decisions for a decision endpoint.
 * Requires recordRecentRequests: true on the endpoint in PingOne Authorize.
 * Admin-only; used by the education panel and debugging UI.
 */
router.get('/recent-decisions', authenticateToken, requireScopes(['openid']), async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_only', message: 'This endpoint requires admin role.' });
  }

  if (!isConfigured()) {
    return res.status(422).json({
      error: 'authorize_not_configured',
      message: 'PingOne Authorize worker credentials are not configured.',
    });
  }

  const { endpointId, limit } = req.query;
  const parsedLimit = Math.min(parseInt(limit, 10) || 10, 20);

  try {
    const result = await getRecentDecisions(endpointId || undefined, parsedLimit);
    return res.json(result);
  } catch (err) {
    console.error('[authorize/recent-decisions] Error:', err.message);
    return res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

/**
 * GET /api/authorize/simulated-recent-decisions?limit=
 * In-memory decisions from Simulated Authorize (education). Parity with PingOne recent decisions UI.
 */
router.get('/simulated-recent-decisions', authenticateToken, requireScopes(['openid']), async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_only', message: 'This endpoint requires admin role.' });
  }

  const parsedLimit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  try {
    const decisions = getSimulatedRecentDecisions(parsedLimit);
    return res.json({ decisions, source: 'simulated', limit: parsedLimit });
  } catch (err) {
    console.error('[authorize/simulated-recent-decisions] Error:', err.message);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * GET /api/authorize/evaluation-status
 * Which engine would run for transaction auth (no secrets).
 */
router.get('/evaluation-status', authenticateToken, requireScopes(['openid']), async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_only', message: 'This endpoint requires admin role.' });
  }
  try {
    return res.json({
      ...getAuthorizationStatusSummary(),
      ...getMcpFirstToolGateStatus(),
    });
  } catch (err) {
    console.error('[authorize/evaluation-status] Error:', err.message);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
