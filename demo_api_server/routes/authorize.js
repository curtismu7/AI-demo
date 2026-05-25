// banking_api_server/routes/authorize.js
// Admin-only PingOne Authorize management endpoints:
//   GET  /api/authorize/decision-endpoints        — list all endpoints in the environment
//   GET  /api/authorize/recent-decisions          — last N decisions for the configured endpoint
//   POST /api/authorize/bootstrap-demo-endpoints  — worker token → create/reuse demo decision endpoints + save config

'use strict';

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const configStore = require('../services/configStore');
const {
  getRecentDecisions,
  getDecisionEndpoints,
  isConfigured,
  isWorkerCredentialReady,
  provisionDemoDecisionEndpoints,
  evaluateTransaction: evaluatePingOneTransaction,
} = require('../services/pingOneAuthorizeService');
const {
  getSimulatedRecentDecisions,
  evaluateTransaction: evaluateSimulatedTransaction,
  getDenyAmountUsd,
  getStepUpAmountUsd,
  getConfirmAmountUsd,
  getConsentTypes,
  getStepUpTypes,
} = require('../services/simulatedAuthorizeService');
const { getAuthorizationStatusSummary } = require('../services/transactionAuthorizationService');
const { getMcpFirstToolGateStatus } = require('../services/mcpToolAuthorizationService');
const { logEvent } = require('../services/appEventService');

const router = express.Router();

/**
 * GET /api/authorize/decision-endpoints
 * List all PingOne Authorize decision endpoints in the configured environment.
 * Admin-only; used by the Config UI and education panel.
 */
router.get('/decision-endpoints', authenticateToken, async (req, res) => {
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
router.get('/recent-decisions', authenticateToken, async (req, res) => {
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
router.get('/simulated-recent-decisions', authenticateToken, async (req, res) => {
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
 * GET /api/authorize/rules
 * Public (no auth) — returns simulated rule thresholds, MCP tool lists, and engine status.
 * No secrets: no PingOne credentials, no env vars. Safe for any user including unauthenticated.
 */
router.get('/rules', async (_req, res) => {
  try {
    const consentTypesSet = getConsentTypes();
    const stepUpTypesSet = getStepUpTypes();
    return res.json({
      simulated: {
        confirmAmount: getConfirmAmountUsd(),
        denyAmount: getDenyAmountUsd(),
        stepUpAmount: getStepUpAmountUsd(),
        consentTypes: Array.from(consentTypesSet).join(','),
        stepUpTypes: Array.from(stepUpTypesSet).join(','),
        mcpDenyTools: (configStore.get('SIMULATED_MCP_DENY_TOOLS') || '').split(',').filter(Boolean),
        mcpHitlTools: (configStore.get('SIMULATED_MCP_HITL_TOOLS') || '').split(',').filter(Boolean),
      },
      flags: {
        ff_authorize_mcp_first_tool: configStore.get('ff_authorize_mcp_first_tool') === 'true',
      },
      ...getAuthorizationStatusSummary(),
      ...getMcpFirstToolGateStatus(),
    });
  } catch (err) {
    console.error('[authorize/rules] Error:', err.message);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * GET /api/authorize/evaluation-status
 * Which engine would run for transaction auth (no secrets).
 */
router.get('/evaluation-status', authenticateToken, async (req, res) => {
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
 * named "Super Banking Demo — Transactions" and "Super Banking Demo — MCP first tool", then saves their IDs
 * into config when persistence is available (KV / local SQLite).
 *
 * Body (optional): { policyId?, authorizationVersionId?, enableLiveAuthorize?, enableMcpFirstTool? }
 */
router.post('/bootstrap-demo-endpoints', authenticateToken, async (req, res) => {
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
        // Authorization is always enabled; just switch from simulated to live PingOne
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

// ---------------------------------------------------------------------------
// Test routes — no authentication required (safe: read-only evaluation calls)
// ---------------------------------------------------------------------------

const TEST_FALLBACK_USER_ID = process.env.AUTHZ_TEST_USER_ID || 'test-user';

/**
 * GET /api/authorize/test-status
 * Returns current engine status and thresholds for the test page.
 * No authentication required.
 */
router.get('/test-status', async (_req, res) => {
  try {
    const summary = getAuthorizationStatusSummary();
    const simulatedStepUp = parseFloat(process.env.SIMULATED_AUTHORIZE_POLICY_STEPUP_AMOUNT || '15000');
    const simulatedDeny   = parseFloat(process.env.SIMULATED_AUTHORIZE_DENY_AMOUNT         || '50000');
    const depositsIncluded = configStore.get('ff_authorize_deposits') === 'true';

    // getEffective('authorize_decision_endpoint_id') → env var PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID first
    // then fall back to the FIELD_DEF cache key used when saved via POST /api/admin/config
    const storedEndpointId =
      configStore.getEffective('authorize_decision_endpoint_id') ||
      configStore.get('PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID') ||
      '';
    // alias: pingone_worker_client_id → env PINGONE_AUTHORIZE_WORKER_CLIENT_ID
    const storedWorkerClientId =
      configStore.getEffective('pingone_worker_client_id') ||
      configStore.get('PINGONE_AUTHORIZE_WORKER_CLIENT_ID') ||
      '';

    return res.json({
      activeEngine: summary.activeEngine,
      authorizeEnabled: summary.authorizeEnabledConfig,
      simulatedMode: summary.simulatedMode,
      pingoneConfigured: summary.pingoneConfigured,
      hasDecisionEndpointId: summary.hasDecisionEndpointId,
      hasPolicyId: summary.hasPolicyId,
      decisionEndpointId: storedEndpointId,
      workerClientId: storedWorkerClientId,
      thresholds: {
        simulated: {
          stepUp: simulatedStepUp,
          deny: simulatedDeny,
          stepUpTypes: ['transfer', 'withdrawal'],
          depositsIncluded,
        },
        pingone: {
          stepUp: 10000,
          deny: 50000,
          note: 'As configured in the Super Banking Transaction Authorization policy in PingOne Authorize',
          stepUpTypes: ['transfer', 'withdrawal'],
          depositsIncluded,
        },
      },
    });
  } catch (err) {
    console.error('[authorize/test-status] Error:', err.message);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * POST /api/authorize/test-evaluate
 * Evaluate a transaction against the active authorization engine (simulated or PingOne).
 * No authentication required — safe because this is a read-only policy decision call.
 *
 * Body: { amount: number, type: 'transfer'|'withdrawal'|'deposit', acr?: string, userId?: string }
 */
router.post('/test-evaluate', async (req, res) => {
  const { amount, type, acr, userId: bodyUserId } = req.body || {};

  if (amount == null || !type) {
    return res.status(400).json({ error: 'amount and type are required' });
  }
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const userId = bodyUserId || req.session?.user?.id || TEST_FALLBACK_USER_ID;
  const summary = getAuthorizationStatusSummary();

  // If authorization is off entirely, return an informational permit
  if (!summary.authorizeEnabledConfig && !summary.simulatedMode) {
    logEvent('authorize', 'info', `Authorize bypassed — authorization is disabled`,
      { tag: 'authorize/bypass', metadata: { engine: 'off', type, amount: numAmount, userId } });
    return res.json({
      ok: true,
      decision: 'PERMIT',
      stepUpRequired: false,
      hitlRequired: false,
      engine: 'off',
      path: 'bypass',
      parameters: { Amount: numAmount, TransactionType: type, UserId: userId, ...(acr ? { Acr: acr } : {}) },
      note: 'Authorization is currently disabled. Enable it in Application Configuration to evaluate policies.',
    });
  }

  try {
    let result;

    if (summary.simulatedMode) {
      result = await evaluateSimulatedTransaction({ userId, amount: numAmount, type, acr: acr || undefined });
      logEvent('authorize', result.decision === 'PERMIT' ? 'info' : 'warning',
        `Authorize [simulated] ${result.decision} — ${type} $${numAmount}`,
        { tag: result.decision === 'PERMIT' ? 'authorize/permit' : 'authorize/deny',
          metadata: { engine: 'simulated', decision: result.decision, type, amount: numAmount, userId, stepUpRequired: result.stepUpRequired, path: result.path } });
      // F7: both fields always present so the response contract is identical
      // regardless of which engine is active. consentRequired is the canonical
      // name (HITL_CONSENT obligation); hitlRequired is kept as an alias for
      // legacy callers.
      const simConsent = result.consentRequired || false;
      return res.json({
        ok: true,
        decision: result.decision,
        stepUpRequired: result.stepUpRequired,
        consentRequired: simConsent,
        hitlRequired: simConsent,
        engine: 'simulated',
        path: result.path,
        decisionId: result.decisionId,
        parameters: result.raw?.parameters || { Amount: numAmount, TransactionType: type, UserId: userId },
        raw: result.raw,
      });
    }

    // PingOne Authorize (live)
    result = await evaluatePingOneTransaction({ userId, amount: numAmount, type, acr: acr || undefined });
    logEvent('authorize', result.decision === 'PERMIT' ? 'info' : 'warning',
      `Authorize [pingone] ${result.decision} — ${type} $${numAmount}`,
      { tag: result.decision === 'PERMIT' ? 'authorize/permit' : 'authorize/deny',
        metadata: { engine: 'pingone', decision: result.decision, type, amount: numAmount, userId, stepUpRequired: result.stepUpRequired, decisionId: result.decisionId, path: result.path } });
    // F7: normalize both field names — consentRequired (canonical) and
    // hitlRequired (alias) always present so callers don't need engine-specific
    // field name knowledge. Both are identical values.
    const pingConsent = result.hitlRequired || result.consentRequired || false;
    return res.json({
      ok: true,
      decision: result.decision,
      stepUpRequired: result.stepUpRequired,
      consentRequired: pingConsent,
      hitlRequired: pingConsent,
      engine: 'pingone',
      path: result.path,
      decisionId: result.decisionId,
      parameters: { Amount: numAmount, TransactionType: type, UserId: userId, ...(acr ? { Acr: acr } : {}) },
      raw: result.raw,
      pingoneRequest: result._debug?.request,
      pingoneResponse: result._debug?.response,
    });
  } catch (err) {
    console.error('[authorize/test-evaluate] Error:', err.message);
    logEvent('authorize', 'error', `Authorize evaluation error: ${err.message}`,
      { tag: 'authorize/error', metadata: { type, amount: numAmount, userId, error: err.message } });

    // F6: apply failover policy for test-evaluate when PingOne is unreachable.
    // Legacy ff_authorize_fail_open=true maps to failover_mode=permit.
    const legacyFailOpen = configStore.getEffective('ff_authorize_fail_open') === 'true';
    const failoverMode = legacyFailOpen
      ? 'permit'
      : (configStore.getEffective('authorize_failover_mode') || 'fallback_simulated');

    if (failoverMode === 'fallback_simulated') {
      try {
        const fallback = await evaluateSimulatedTransaction({ userId, amount: numAmount, type, acr: acr || undefined });
        const fallbackConsent = fallback.consentRequired || false;
        logEvent('authorize', 'warning',
          `[Authorize] test-evaluate fell back to simulated (pingone unreachable)`,
          { tag: 'authorize/fallback-simulated', metadata: { type, amount: numAmount, userId, decision: fallback.decision } });
        return res.json({
          ok: true,
          decision: fallback.decision,
          stepUpRequired: fallback.stepUpRequired,
          consentRequired: fallbackConsent,
          hitlRequired: fallbackConsent,
          engine: 'fallback_simulated',
          fallback: { reason: 'pingone_unavailable', originalError: err.message },
          path: fallback.path,
          decisionId: fallback.decisionId,
          parameters: fallback.raw?.parameters || { Amount: numAmount, TransactionType: type, UserId: userId },
          raw: fallback.raw,
        });
      } catch (_fallbackErr) {
        return res.status(503).json({ ok: false, error: 'Authorization evaluation failed.', failoverMode });
      }
    }

    if (failoverMode === 'deny') {
      return res.status(503).json({
        ok: false,
        error: 'authorization_service_unavailable',
        error_description: 'PingOne Authorize is temporarily unavailable. Transactions are blocked (failover_mode=deny).',
        failoverMode,
      });
    }

    // failoverMode === 'permit': return 502 with clear message for test UI
    return res.status(502).json({ ok: false, error: err.message, failoverMode });
  }
});

module.exports = router;
