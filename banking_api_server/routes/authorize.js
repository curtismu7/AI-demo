// banking_api_server/routes/authorize.js
// Admin-only PingOne Authorize management endpoints:
//   GET  /api/authorize/decision-endpoints        — list all endpoints in the environment
//   GET  /api/authorize/recent-decisions          — last N decisions for the configured endpoint
//   POST /api/authorize/bootstrap-demo-endpoints  — worker token → create/reuse demo decision endpoints + save config

'use strict';

const express = require('express');
const { authenticateToken, requireScopes } = require('../middleware/auth');
const configStore = require('../services/configStore');
const {
  getRecentDecisions,
  getDecisionEndpoints,
  isConfigured,
  isWorkerCredentialReady,
  provisionDemoDecisionEndpoints,
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

/**
 * POST /api/authorize/bootstrap-demo-endpoints
 * Admin-only: uses worker token + PingOne Platform API to create (or reuse) two decision endpoints
 * named "BX Finance Demo — Transactions" and "BX Finance Demo — MCP first tool", then saves their IDs
 * into config when persistence is available (KV / local SQLite).
 *
 * Body (optional): { policyId?, authorizationVersionId?, enableLiveAuthorize?, enableMcpFirstTool? }
 */
router.post('/bootstrap-demo-endpoints', authenticateToken, requireScopes(['openid']), async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_only', message: 'This endpoint requires admin role.' });
  }

  if (!isWorkerCredentialReady()) {
    return res.status(422).json({
      error: 'worker_not_configured',
      message:
        'PingOne Authorize worker app is not configured. Add authorize_worker_client_id and authorize_worker_client_secret under PingOne Authorize in Application Configuration (or PINGONE_AUTHORIZE_WORKER_* env vars).',
    });
  }

  const policyId =
    req.body && typeof req.body.policyId === 'string' && req.body.policyId.trim()
      ? req.body.policyId.trim()
      : undefined;
  const authorizationVersionId =
    req.body && typeof req.body.authorizationVersionId === 'string' && req.body.authorizationVersionId.trim()
      ? req.body.authorizationVersionId.trim()
      : undefined;
  const enableLiveAuthorize = req.body && req.body.enableLiveAuthorize === true;
  const enableMcpFirstTool = req.body && req.body.enableMcpFirstTool === true;

  try {
    const result = await provisionDemoDecisionEndpoints({ policyId, authorizationVersionId });

    let configSaved = false;
    if (!configStore.isReadOnly()) {
      const patch = {
        authorize_decision_endpoint_id: result.transactionEndpointId,
        authorize_mcp_decision_endpoint_id: result.mcpEndpointId,
      };
      if (enableLiveAuthorize) {
        patch.authorize_enabled = 'true';
        patch.ff_authorize_simulated = 'false';
      }
      if (enableMcpFirstTool) {
        patch.ff_authorize_mcp_first_tool = 'true';
      }
      await configStore.setConfig(patch);
      configSaved = true;
    }

    const copyEnvHint = !configSaved
      ? `Add to Vercel (or .env): PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID=${result.transactionEndpointId} and PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID=${result.mcpEndpointId}`
      : null;

    const createdParts = [];
    if (result.created.transaction) createdParts.push('transactions endpoint');
    if (result.created.mcp) createdParts.push('MCP endpoint');
    const verb = createdParts.length ? `Created ${createdParts.join(' and ')} in PingOne.` : 'Reused existing demo endpoints in PingOne.';

    return res.json({
      ok: true,
      transactionEndpointId: result.transactionEndpointId,
      mcpEndpointId: result.mcpEndpointId,
      created: result.created,
      configSaved,
      copyEnvHint,
      message: `${verb} ${configSaved ? 'Saved IDs to application configuration.' : 'Copy endpoint IDs into configuration or environment variables.'}`,
    });
  } catch (err) {
    console.error('[authorize/bootstrap-demo-endpoints] Error:', err.message);
    return res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

module.exports = router;
