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
 *   - DENY: amount > SIMULATED_DENY_AMOUNT_USD (default 2_000)
 *   - Step-up obligation: amount >= SIMULATED_POLICY_STEPUP_USD (default 500) for
 *     withdrawal — mirrors a policy that requests MFA even after a lower runtime gate
 *   - Transfer: all transfers require human consent (HITL_CONSENT obligation)
 *   - Otherwise PERMIT
 *
 * @module services/simulatedAuthorizeService
 */

'use strict';

const configStore = require('./configStore');

// Guard: prevent accidental use in production without an explicit opt-in.
// The feature-flag check (ff_authorize_simulated) at the caller layer is the primary gate,
// but a direct import of this module would bypass it. This secondary guard makes that impossible.
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATED_AUTHORIZE !== 'true') {
  throw new Error(
    '[simulatedAuthorizeService] Cannot be loaded in production without ALLOW_SIMULATED_AUTHORIZE=true. ' +
    'Use pingOneAuthorizeService instead.'
  );
}

/** Hard deny above this amount (USD) — lazy read from configStore, falls back to env, then default. */
function getDenyAmountUsd() {
  return parseFloat(
    configStore.get('SIMULATED_AUTHORIZE_DENY_AMOUNT') ||
    process.env.SIMULATED_AUTHORIZE_DENY_AMOUNT ||
    '2000'
  );
}

/** Confirm threshold (USD) — requires explicit consent only (no MFA). */
function getConfirmAmountUsd() {
  return parseFloat(
    configStore.get('SIMULATED_AUTHORIZE_CONFIRM_AMOUNT') ||
    process.env.SIMULATED_AUTHORIZE_CONFIRM_AMOUNT ||
    '250'
  );
}

/** Step-up threshold (USD) — requires consent + MFA. */
function getStepUpAmountUsd() {
  return parseFloat(
    configStore.get('SIMULATED_AUTHORIZE_STEPUP_AMOUNT') ||
    process.env.SIMULATED_AUTHORIZE_POLICY_STEPUP_AMOUNT ||
    '500'
  );
}

/** Transaction types that always require consent (comma-separated, e.g., "transfer,withdrawal"). */
function getConsentTypes() {
  const raw = configStore.get('SIMULATED_AUTHORIZE_CONSENT_TYPES') ||
              process.env.SIMULATED_AUTHORIZE_CONSENT_TYPES ||
              'transfer';
  return new Set(
    raw
      .split(',')
      .map(function(s) { return s.trim().toLowerCase(); })
      .filter(Boolean)
  );
}

/** Transaction types that always require step-up (comma-separated, e.g., "withdrawal"). */
function getStepUpTypes() {
  const raw = configStore.get('SIMULATED_AUTHORIZE_STEPUP_TYPES') ||
              process.env.SIMULATED_AUTHORIZE_STEPUP_TYPES ||
              '';
  return new Set(
    raw
      .split(',')
      .map(function(s) { return s.trim().toLowerCase(); })
      .filter(Boolean)
  );
}

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

/** Tools requiring HITL approval in simulated MCP first-tool policy (comma-separated env). */
function _simulatedMcpHitlToolSet() {
  const raw = process.env.SIMULATED_MCP_HITL_TOOLS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Simulated PingOne Authorize for MCP tool calls (DecisionContext=McpToolCall).
 * Runs on every tool call. Evaluates:
 *   1. Tool-name DENY/HITL overrides (SIMULATED_MCP_DENY_TOOLS / SIMULATED_MCP_HITL_TOOLS)
 *   2. Amount-based rules for write tools (same thresholds as evaluateTransaction)
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.toolName
 * @param {string} [params.tokenAudience]
 * @param {string} [params.actClientId]
 * @param {string} [params.nestedActClientId]
 * @param {string} [params.mcpResourceUri]
 * @param {string} [params.acr]
 * @param {number|null} [params.amount] - populated for write tools (create_transfer, etc.)
 * @param {string|null} [params.transactionType] - 'transfer' | 'deposit' | 'withdrawal' | null
 */
async function evaluateMcpFirstTool({
  userId,
  toolName,
  tokenAudience,
  actClientId,
  nestedActClientId,
  mcpResourceUri,
  acr,
  amount = null,
  transactionType = null,
}) {
  const decisionId = `sim-mcp-${Date.now()}-${++_seq}`;
  const parameters = {
    DecisionContext: 'McpToolCall',
    UserId: userId,
    ToolName: toolName || '',
    TokenAudience: tokenAudience != null ? String(tokenAudience) : '',
    ActClientId: actClientId || '',
    NestedActClientId: nestedActClientId || '',
    McpResourceUri: mcpResourceUri || '',
    ...(acr ? { Acr: acr } : {}),
    ...(transactionType ? { TransactionType: transactionType } : {}),
    ...(amount != null ? { Amount: amount } : {}),
    Timestamp: new Date().toISOString(),
  };

  const denySet = _simulatedMcpDenyToolSet();
  const denied = toolName && denySet.has(toolName);
  const hitlSet = _simulatedMcpHitlToolSet();
  const hitlRequired = toolName && hitlSet.has(toolName);

  const rawBase = {
    engine: 'simulated',
    requestShape: 'decision-endpoint',
    kind: 'mcp_tool_call',
    parameters,
    educationNote:
      'Simulated MCP tool-call policy — runs on every tool call. ' +
      'Set SIMULATED_MCP_DENY_TOOLS to force DENY; SIMULATED_MCP_HITL_TOOLS for HITL.',
  };

  let out;
  if (denied) {
    out = {
      decision: 'DENY',
      stepUpRequired: false,
      hitlRequired: false,
      path: 'simulated',
      decisionId,
      raw: {
        ...rawBase,
        decision: 'DENY',
        reason: `Simulated policy DENY: tool "${toolName}" is in SIMULATED_MCP_DENY_TOOLS.`,
      },
    };
  } else if (hitlRequired) {
    out = {
      decision: 'INDETERMINATE',
      stepUpRequired: false,
      hitlRequired: true,
      path: 'simulated',
      decisionId,
      raw: {
        ...rawBase,
        decision: 'INDETERMINATE',
        obligations: [{ type: 'HITL', detail: 'Simulated Authorize obligation — human approval required.' }],
        reason: `Simulated policy HITL: tool "${toolName}" is in SIMULATED_MCP_HITL_TOOLS.`,
      },
    };
  } else if (transactionType && amount != null) {
    // Amount-based policy for write tools — same thresholds as evaluateTransaction
    const denyAmount = getDenyAmountUsd();
    const stepUpAmount = getStepUpAmountUsd();
    const confirmAmount = getConfirmAmountUsd();
    const consentTypes = getConsentTypes();
    const stepUpTypes = getStepUpTypes();

    if (amount > denyAmount) {
      out = {
        decision: 'DENY',
        stepUpRequired: false,
        hitlRequired: false,
        path: 'simulated',
        decisionId,
        raw: { ...rawBase, decision: 'DENY', reason: `Amount $${amount} exceeds deny limit $${denyAmount}.` },
      };
    } else {
      const typeHitl = consentTypes.has(transactionType.toLowerCase());
      const typeStepUp = stepUpTypes.has(transactionType.toLowerCase()) && !acrLooksStrong(acr);
      const amtStepUp = amount >= stepUpAmount && !acrLooksStrong(acr);
      const amtHitl = amount >= confirmAmount;
      const needsHitl = typeHitl || amtHitl;
      const needsStepUp = typeStepUp || amtStepUp;

      if (needsHitl || needsStepUp) {
        const obligations = [];
        if (needsHitl) obligations.push({ type: 'HITL_CONSENT', detail: 'Human approval required.' });
        if (needsStepUp) obligations.push({ type: 'STEP_UP', detail: 'MFA required.' });
        const reasons = [];
        if (typeHitl) reasons.push(`${transactionType} requires consent`);
        if (amtHitl && !typeHitl) reasons.push(`amount $${amount} >= $${confirmAmount}`);
        if (amtStepUp && !typeStepUp) reasons.push(`amount $${amount} >= step-up threshold $${stepUpAmount}`);
        out = {
          decision: 'INDETERMINATE',
          stepUpRequired: needsStepUp,
          hitlRequired: needsHitl,
          path: 'simulated',
          decisionId,
          raw: { ...rawBase, decision: 'INDETERMINATE', obligations, reason: `Simulated policy: ${reasons.join('; ')}.` },
        };
      } else {
        out = {
          decision: 'PERMIT',
          stepUpRequired: false,
          hitlRequired: false,
          path: 'simulated',
          decisionId,
          raw: { ...rawBase, decision: 'PERMIT', obligations: [] },
        };
      }
    }
  } else {
    out = {
      decision: 'PERMIT',
      stepUpRequired: false,
      hitlRequired: false,
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
    hitlRequired: out.hitlRequired,
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

  const denyAmount = getDenyAmountUsd();
  const stepUpAmount = getStepUpAmountUsd();
  const confirmAmount = getConfirmAmountUsd();
  const consentTypes = getConsentTypes();
  const stepUpTypes = getStepUpTypes();

  var obligations;
  var reasonParts;
  var reason;
  var typeRequiresConsent;
  var typeRequiresStepUp;
  var amountRequiresStepUp;
  var amountRequiresConsent;
  var consentRequired;
  var stepUpRequired;

  // DENY: amounts exceeding deny threshold (always checked first)
  if (amt > denyAmount) {
    out = {
      decision: 'DENY',
      stepUpRequired: false,
      consentRequired: false,
      path: 'simulated',
      decisionId,
      raw: {
        engine: 'simulated',
        decision: 'DENY',
        reason: 'Simulated policy DENY: amount exceeds $' + denyAmount.toLocaleString() + ' limit.',
      },
    };
  } else {
    // Type-based rules: check if transaction type requires consent or step-up
    typeRequiresConsent = consentTypes.has(type.toLowerCase());
    typeRequiresStepUp = stepUpTypes.has(type.toLowerCase()) && !acrLooksStrong(acr);

    // Amount-based rules: check thresholds
    amountRequiresStepUp = amt >= stepUpAmount && !acrLooksStrong(acr);
    amountRequiresConsent = amt >= confirmAmount;

    // Combine type-based and amount-based requirements
    consentRequired = typeRequiresConsent || amountRequiresConsent;
    stepUpRequired = typeRequiresStepUp || amountRequiresStepUp;

    if (consentRequired || stepUpRequired) {
      // Build obligations list
      obligations = [];
      if (consentRequired) {
        obligations.push({ type: 'HITL_CONSENT', detail: 'Human approval required.' });
      }
      if (stepUpRequired) {
        obligations.push({ type: 'STEP_UP', detail: 'Elevated authentication (MFA) required.' });
      }

      // Build reason message
      reasonParts = [];
      if (typeRequiresConsent) reasonParts.push('transaction type requires consent');
      if (typeRequiresStepUp) reasonParts.push('transaction type requires step-up');
      if (amountRequiresConsent && !typeRequiresConsent) reasonParts.push('amount exceeds $' + confirmAmount.toLocaleString());
      if (amountRequiresStepUp && !typeRequiresStepUp) reasonParts.push('amount exceeds $' + stepUpAmount.toLocaleString());
      reason = 'Simulated policy: ' + reasonParts.join('; ') + '.';

      out = {
        decision: 'INDETERMINATE',
        stepUpRequired: stepUpRequired,
        consentRequired: consentRequired,
        path: 'simulated',
        decisionId,
        raw: {
          engine: 'simulated',
          decision: 'INDETERMINATE',
          obligations: obligations,
          reason: reason,
        },
      };
    } else {
      // PERMIT: no type or amount requirements
      out = {
        decision: 'PERMIT',
        stepUpRequired: false,
        consentRequired: false,
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
    consentRequired: out.consentRequired,
    parameters,
    path: out.path,
  });

  return out;
}

/**
 * Evaluate a transaction and return a response envelope byte-for-byte identical to
 * PingOne Authorize (https://apidocs.pingidentity.com/pingone/platform/v1/api/#post-decision).
 *
 * Accepts PingOne-style body: `{ parameters: { transactionAmount, userId, transactionType } }`
 *
 * @param {{ parameters: { transactionAmount: number, userId: string, transactionType: string, acr?: string } }} body
 * @returns {Promise<object>} PingOne Authorize response envelope
 */
async function evaluate({ parameters = {} } = {}) {
  const { transactionAmount, userId, transactionType, acr } = parameters;
  const createdAt = new Date().toISOString();
  const startMs = Date.now();

  const inner = await evaluateTransaction({
    userId: userId || 'unknown',
    amount: transactionAmount || 0,
    type: transactionType || 'transfer',
    acr,
  });

  const completedAt = new Date().toISOString();
  const duration = Date.now() - startMs;

  const id = inner.decisionId || `sim-${Date.now()}`;

  if (inner.decision === 'DENY') {
    return {
      id, createdAt, completedAt, duration,
      status: 'SUCCESS',
      result: { decision: 'DENY', weight: 1.0 },
      statements: [],
      obligations: [],
    };
  }

  if (inner.stepUpRequired) {
    return {
      id, createdAt, completedAt, duration,
      status: 'SUCCESS',
      result: { decision: 'PERMIT', weight: 1.0 },
      statements: [],
      obligations: [
        { id: 'step_up_mfa', type: 'IDENTITY_REQUIREMENT', detail: { acr: 'Multi_Factor' } },
      ],
    };
  }

  return {
    id, createdAt, completedAt, duration,
    status: 'SUCCESS',
    result: { decision: 'PERMIT', weight: 1.0 },
    statements: [],
    obligations: [],
  };
}

// configStore is injected rather than imported at module top so callers (e.g. mcpToolAuthorizationService)
// can pass a fresh reference. This avoids a circular-require when the module is loaded early in the chain.
function isSimulatedModeEnabled(configStore) {
  const sim =
    configStore.get('ff_authorize_simulated') === true ||
    configStore.get('ff_authorize_simulated') === 'true';
  return !!sim;
}

module.exports = {
  evaluate,
  evaluateTransaction,
  evaluateMcpFirstTool,
  isSimulatedModeEnabled,
  getSimulatedRecentDecisions,
  buildTrustFrameworkParameters,
  getDenyAmountUsd,
  getStepUpAmountUsd,
  getConfirmAmountUsd,
  getConsentTypes,
  getStepUpTypes,
  // Constant aliases for tests — read defaults so test assertions use the same values as the service.
  get SIMULATED_DENY_AMOUNT_USD() { return getDenyAmountUsd(); },
  get SIMULATED_POLICY_STEPUP_USD() { return getStepUpAmountUsd(); },
  get SIMULATED_CONFIRM_AMOUNT_USD() { return getConfirmAmountUsd(); },
};
