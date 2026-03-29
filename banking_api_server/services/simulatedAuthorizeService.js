/**
 * simulatedAuthorizeService.js
 *
 * Local "policy decision" that mimics PingOne Authorize **response shape** for demos and
 * user education when PingOne Authorize is not configured (or `ff_authorize_simulated` is on).
 *
 * Does **not** call PingOne. Returns the same fields as `pingOneAuthorizeService.evaluateTransaction`:
 *   { decision, stepUpRequired, path, decisionId, raw }
 *
 * Rules (document for instructors — adjust thresholds here if needed):
 *   - DENY: amount > SIMULATED_DENY_AMOUNT_USD (default 50_000)
 *   - Step-up obligation: amount >= SIMULATED_POLICY_STEPUP_USD (default 15_000) for
 *     transfer or withdrawal — mirrors a policy that requests MFA even after a lower runtime gate
 *   - Otherwise PERMIT
 *
 * @module services/simulatedAuthorizeService
 */

'use strict';

/** Hard deny above this amount (USD). */
const SIMULATED_DENY_AMOUNT_USD = parseFloat(process.env.SIMULATED_AUTHORIZE_DENY_AMOUNT || '50000');

/** Policy-style step-up signal (USD) — same transaction types as real Authorize gate. */
const SIMULATED_POLICY_STEPUP_USD = parseFloat(
  process.env.SIMULATED_AUTHORIZE_POLICY_STEPUP_AMOUNT || '15000'
);

let _seq = 0;

/** Ring buffer of recent simulated decisions (education / parity with PingOne recent decisions). */
const SIMULATED_RECENT_MAX = 50;
let _recentSimulated = [];

/**
 * Trust Framework parameters — same keys as PingOne decision endpoint POST body (Phase 2).
 * @see pingOneAuthorizeService._evaluateViaDecisionEndpoint
 */
function buildTrustFrameworkParameters(userId, amount, type, acr) {
  return {
    Amount: Number(amount),
    TransactionType: type,
    UserId: userId,
    ...(acr ? { Acr: acr } : {}),
    Timestamp: new Date().toISOString(),
  };
}

function recordSimulatedDecision(entry) {
  _recentSimulated = [{ ...entry, recordedAt: new Date().toISOString() }, ..._recentSimulated].slice(
    0,
    SIMULATED_RECENT_MAX
  );
}

/** Tools denied in simulated MCP first-tool policy (comma-separated env). */
function _simulatedMcpDenyToolSet() {
  const raw = process.env.SIMULATED_MCP_DENY_TOOLS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Simulated PingOne Authorize for MCP first tool use (DecisionContext=McpFirstTool).
 * Default PERMIT; optional DENY when tool name is listed in SIMULATED_MCP_DENY_TOOLS.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.toolName
 * @param {string} [params.tokenAudience]
 * @param {string} [params.actClientId]
 * @param {string} [params.nestedActClientId]
 * @param {string} [params.mcpResourceUri]
 * @param {string} [params.acr]
 */
async function evaluateMcpFirstTool({
  userId,
  toolName,
  tokenAudience,
  actClientId,
  nestedActClientId,
  mcpResourceUri,
  acr,
}) {
  const decisionId = `sim-mcp-${Date.now()}-${++_seq}`;
  const parameters = {
    DecisionContext: 'McpFirstTool',
    UserId: userId,
    ToolName: toolName || '',
    TokenAudience: tokenAudience != null ? String(tokenAudience) : '',
    ActClientId: actClientId || '',
    NestedActClientId: nestedActClientId || '',
    McpResourceUri: mcpResourceUri || '',
    ...(acr ? { Acr: acr } : {}),
    Timestamp: new Date().toISOString(),
  };

  const denySet = _simulatedMcpDenyToolSet();
  const denied = toolName && denySet.has(toolName);

  const rawBase = {
    engine: 'simulated',
    requestShape: 'decision-endpoint',
    kind: 'mcp_first_tool',
    parameters,
    educationNote:
      'Simulated MCP first-tool policy. Set SIMULATED_MCP_DENY_TOOLS=comma,separated,tool_names to force DENY for demos.',
  };

  let out;
  if (denied) {
    out = {
      decision: 'DENY',
      stepUpRequired: false,
      path: 'simulated',
      decisionId,
      raw: {
        ...rawBase,
        decision: 'DENY',
        reason: `Simulated policy DENY: tool "${toolName}" is in SIMULATED_MCP_DENY_TOOLS.`,
      },
    };
  } else {
    out = {
      decision: 'PERMIT',
      stepUpRequired: false,
      path: 'simulated',
      decisionId,
      raw: {
        ...rawBase,
        decision: 'PERMIT',
        obligations: [],
      },
    };
  }

  recordSimulatedDecision({
    decisionId: out.decisionId,
    decision: out.decision,
    stepUpRequired: out.stepUpRequired,
    parameters,
    path: out.path,
    kind: 'mcp_first_tool',
  });

  return out;
}

/**
 * @param {number} [limit=20]
 * @returns {object[]}
 */
function getSimulatedRecentDecisions(limit = 20) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 20, 1), SIMULATED_RECENT_MAX);
  return _recentSimulated.slice(0, n);
}

/** Treat ACR as strong enough that a simulated "policy" will not ask for step-up again. */
function acrLooksStrong(acr) {
  if (acr == null || acr === '') return false;
  const s = String(acr).toLowerCase();
  return s.includes('mfa') || s.includes('multi') || s.includes('http') || s.length > 8;
}

/**
 * Evaluate transaction with simulated PingOne Authorize semantics.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.type - transfer | withdrawal | deposit
 * @param {string} [params.acr]
 * @returns {Promise<{ decision: string, stepUpRequired: boolean, path: string, decisionId: string, raw: object }>}
 */
async function evaluateTransaction({ userId, amount, type, acr }) {
  const amt = Number(amount);
  const decisionId = `sim-${Date.now()}-${++_seq}`;
  const parameters = buildTrustFrameworkParameters(userId, amt, type, acr);

  const rawBase = {
    engine: 'simulated',
    requestShape: 'decision-endpoint',
    parameters,
    educationNote:
      'This decision is produced in-process to mimic PingOne Authorize Phase 2 (parameters.*). ' +
      'Turn off Simulated Authorize in Feature Flags and configure worker + endpoint for live PingOne.',
    userId,
    amount: amt,
    type,
    acr: acr || null,
  };

  let out;

  if (amt > SIMULATED_DENY_AMOUNT_USD) {
    out = {
      decision: 'DENY',
      stepUpRequired: false,
      path: 'simulated',
      decisionId,
      raw: {
        ...rawBase,
        decision: 'DENY',
        reason: `Simulated policy DENY: amount exceeds $${SIMULATED_DENY_AMOUNT_USD.toLocaleString()} demo ceiling.`,
      },
    };
  } else {
    const stepUpTypes = ['transfer', 'withdrawal'];
    if (
      stepUpTypes.includes(type) &&
      amt >= SIMULATED_POLICY_STEPUP_USD &&
      amt <= SIMULATED_DENY_AMOUNT_USD &&
      !acrLooksStrong(acr)
    ) {
      out = {
        decision: 'INDETERMINATE',
        stepUpRequired: true,
        path: 'simulated',
        decisionId,
        raw: {
          ...rawBase,
          decision: 'INDETERMINATE',
          obligations: [{ type: 'STEP_UP', detail: 'Simulated Authorize obligation — strengthen authentication (acr).' }],
          reason: `Simulated policy: transactions ≥ $${SIMULATED_POLICY_STEPUP_USD.toLocaleString()} require elevated ACR.`,
        },
      };
    } else {
      out = {
        decision: 'PERMIT',
        stepUpRequired: false,
        path: 'simulated',
        decisionId,
        raw: {
          ...rawBase,
          decision: 'PERMIT',
          obligations: [],
        },
      };
    }
  }

  recordSimulatedDecision({
    decisionId: out.decisionId,
    decision: out.decision,
    stepUpRequired: out.stepUpRequired,
    parameters,
    path: out.path,
  });

  return out;
}

function isSimulatedModeEnabled(configStore) {
  const sim =
    configStore.get('ff_authorize_simulated') === true ||
    configStore.get('ff_authorize_simulated') === 'true';
  return !!sim;
}

module.exports = {
  evaluateTransaction,
  evaluateMcpFirstTool,
  isSimulatedModeEnabled,
  getSimulatedRecentDecisions,
  buildTrustFrameworkParameters,
  SIMULATED_DENY_AMOUNT_USD,
  SIMULATED_POLICY_STEPUP_USD,
};
