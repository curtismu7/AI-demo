// banking_api_server/routes/authorizeConfig.js
// Admin-only endpoints for reading/writing PingOne Authorize and Simulated Authorize configuration.

'use strict';

const express = require('express');
const { authenticateToken, requireScopes } = require('../middleware/auth');
const configStore = require('../services/configStore');
const {
  getAuthorizationStatusSummary,
} = require('../services/transactionAuthorizationService');
const {
  getMcpFirstToolGateStatus,
} = require('../services/mcpToolAuthorizationService');
const {
  getDenyAmountUsd,
  getStepUpAmountUsd,
  getConfirmAmountUsd,
} = require('../services/simulatedAuthorizeService');

const router = express.Router();

/**
 * GET /api/admin/authorize/config
 * Returns all authorize-related configuration in one response:
 * - Status (active engine, feature flags)
 * - Simulated rules (thresholds, MCP tool lists)
 * - PingOne credentials (masked)
 * - Env vars (for reference)
 */
router.get('/config', authenticateToken, requireScopes(['openid']), async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_only', message: 'This endpoint requires admin role.' });
  }

  try {
    const status = getAuthorizationStatusSummary();
    const mcpStatus = getMcpFirstToolGateStatus();

    const simulated = {
      confirmAmount: getConfirmAmountUsd(),
      denyAmount: getDenyAmountUsd(),
      stepUpAmount: getStepUpAmountUsd(),
      mcpDenyTools: (configStore.get('SIMULATED_MCP_DENY_TOOLS') || '').split(',').filter(Boolean),
      mcpHitlTools: (configStore.get('SIMULATED_MCP_HITL_TOOLS') || '').split(',').filter(Boolean),
    };

    const workerClientId = configStore.get('PINGONE_AUTHORIZE_WORKER_CLIENT_ID') || '';
    const decisionEndpointId = configStore.get('PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID') || '';
    const mcpDecisionEndpointId = configStore.get('PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID') || '';
    const policyId = configStore.get('PINGONE_AUTHORIZE_POLICY_ID') || '';

    const pingone = {
      workerClientId: workerClientId ? '••••' : '(not set)',
      decisionEndpointId,
      mcpDecisionEndpointId,
      policyId,
    };

    const flags = {
      authorize_enabled: configStore.get('authorize_enabled') === 'true',
      ff_authorize_simulated: configStore.get('ff_authorize_simulated') === 'true',
      ff_authorize_fail_open: configStore.get('ff_authorize_fail_open') === 'true',
      ff_authorize_deposits: configStore.get('ff_authorize_deposits') === 'true',
      ff_authorize_mcp_first_tool: configStore.get('ff_authorize_mcp_first_tool') === 'true',
    };

    const envVars = {
      SIMULATED_AUTHORIZE_DENY_AMOUNT: configStore.get('SIMULATED_AUTHORIZE_DENY_AMOUNT') || process.env.SIMULATED_AUTHORIZE_DENY_AMOUNT || '(default 50000)',
      SIMULATED_AUTHORIZE_POLICY_STEPUP_AMOUNT: configStore.get('SIMULATED_AUTHORIZE_STEPUP_AMOUNT') || process.env.SIMULATED_AUTHORIZE_POLICY_STEPUP_AMOUNT || '(default 15000)',
      SIMULATED_MCP_DENY_TOOLS: configStore.get('SIMULATED_MCP_DENY_TOOLS') || process.env.SIMULATED_MCP_DENY_TOOLS || '(none)',
      SIMULATED_MCP_HITL_TOOLS: configStore.get('SIMULATED_MCP_HITL_TOOLS') || process.env.SIMULATED_MCP_HITL_TOOLS || '(none)',
    };

    return res.json({
      status,
      mcp: mcpStatus,
      simulated,
      pingone,
      flags,
      envVars,
    });
  } catch (err) {
    console.error('[authorizeConfig/config] Error:', err.message);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * POST /api/admin/authorize/config
 * Write simulated authorize rules to configStore.
 * Body: {
 *   simulated_deny_amount?: number,
 *   simulated_stepup_amount?: number,
 *   simulated_mcp_deny_tools?: string (comma-separated),
 *   simulated_mcp_hitl_tools?: string (comma-separated)
 * }
 */
router.post('/config', authenticateToken, requireScopes(['openid']), async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_only', message: 'This endpoint requires admin role.' });
  }

  const { simulated_confirm_amount, simulated_deny_amount, simulated_stepup_amount, simulated_mcp_deny_tools, simulated_mcp_hitl_tools } = req.body || {};

  const updates = {};

  if (simulated_confirm_amount !== undefined && simulated_confirm_amount !== null) {
    const val = parseFloat(simulated_confirm_amount);
    if (!isNaN(val) && val >= 0) {
      updates.SIMULATED_AUTHORIZE_CONFIRM_AMOUNT = String(val);
    }
  }

  if (simulated_deny_amount !== undefined && simulated_deny_amount !== null) {
    const val = parseFloat(simulated_deny_amount);
    if (!isNaN(val) && val >= 0) {
      updates.SIMULATED_AUTHORIZE_DENY_AMOUNT = String(val);
    }
  }

  if (simulated_stepup_amount !== undefined && simulated_stepup_amount !== null) {
    const val = parseFloat(simulated_stepup_amount);
    if (!isNaN(val) && val >= 0) {
      updates.SIMULATED_AUTHORIZE_STEPUP_AMOUNT = String(val);
    }
  }

  if (simulated_mcp_deny_tools !== undefined && simulated_mcp_deny_tools !== null) {
    updates.SIMULATED_MCP_DENY_TOOLS = String(simulated_mcp_deny_tools).trim();
  }

  if (simulated_mcp_hitl_tools !== undefined && simulated_mcp_hitl_tools !== null) {
    updates.SIMULATED_MCP_HITL_TOOLS = String(simulated_mcp_hitl_tools).trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no_updates', message: 'No valid fields provided to update.' });
  }

  try {
    await configStore.setConfig(updates);
    // Return updated values
    const simulated = {
      confirmAmount: getConfirmAmountUsd(),
      denyAmount: getDenyAmountUsd(),
      stepUpAmount: getStepUpAmountUsd(),
      mcpDenyTools: (configStore.get('SIMULATED_MCP_DENY_TOOLS') || '').split(',').filter(Boolean),
      mcpHitlTools: (configStore.get('SIMULATED_MCP_HITL_TOOLS') || '').split(',').filter(Boolean),
    };
    return res.json({
      ok: true,
      message: 'Simulated authorize rules updated.',
      simulated,
    });
  } catch (err) {
    console.error('[authorizeConfig/config] Save error:', err.message);
    return res.status(502).json({ error: 'save_failed', message: err.message });
  }
});

module.exports = router;
