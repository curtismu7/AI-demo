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
const { classifyObligations } = require('./authorizeObligations');

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

/**
 * Confirm threshold (USD) — requires explicit consent only (no MFA).
 *
 * `SIMULATED_AUTHORIZE_CONFIRM_AMOUNT` is the AS's CANONICAL input key. Both
 * admin surfaces fan a user-entered value into it: the dedicated Authorize
 * config (routes/authorizeConfig.js, writes it directly) AND the Setup page /
 * Demo Controls control button (routes/thresholds.js mirror-writes it
 * alongside the HITL `confirm_threshold_usd` key the consent path reads). So
 * editing EITHER surface changes this getter, and all runtime decisions flow
 * from the AS response only. `get()` (raw cache) is used deliberately — not
 * `getEffective()`, which would mask an unset key with the FIELD_DEFS default
 * and make the env fallback dead code.
 */
function getConfirmAmountUsd() {
  return parseFloat(
    configStore.get('SIMULATED_AUTHORIZE_CONFIRM_AMOUNT') ||
    process.env.SIMULATED_AUTHORIZE_CONFIRM_AMOUNT ||
    '250'
  );
}

/**
 * Step-up threshold (USD) — requires consent + MFA.
 *
 * `SIMULATED_AUTHORIZE_STEPUP_AMOUNT` is the AS's CANONICAL input key. Both
 * admin surfaces fan into it (authorizeConfig.js direct; thresholds.js
 * mirror-writes it next to the HITL `mfa_threshold_usd` key). Same
 * single-source-of-truth + raw-`get()` rationale as getConfirmAmountUsd.
 */
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

  // ── Audience-match guard (highest-priority deny — runs before tool-name checks).
  //
  // The bearer token's `aud` MUST equal the audience the BFF's single RFC 8693
  // exchange minted (the MCP-gateway URI when the gateway is the egress, else
  // the MCP-server URI). Caller (mcpToolAuthorizationService) resolves it via
  // the shared resolveExchangeAudience() and passes it as `mcpResourceUri`. If
  // the token aud doesn't match, an attacker may have sent an intermediate
  // (e.g. actor-CC) token directly to MCP (skipping the gateway hop).
  //
  // Both the simulated AS (this file) and the PingOne PingAuthorize policy
  // enforce this rule — they receive the same inputs and must agree on the
  // same outputs (parity is a design requirement; ff_authorize_simulated
  // picks which one runs at runtime).
  if (mcpResourceUri && tokenAudience) {
    const tokenAudList = String(tokenAudience).split(/[\s,]+/).filter(Boolean);
    const expected = String(mcpResourceUri).trim();
    if (!tokenAudList.includes(expected)) {
      const out = {
        decision: 'DENY',
        stepUpRequired: false,
        hitlRequired: false,
        path: 'simulated',
        decisionId,
        raw: {
          ...rawBase,
          decision: 'DENY',
          reason:
            `Audience mismatch — token aud=${JSON.stringify(tokenAudList)} does not include expected ` +
            `${JSON.stringify(expected)}. Possible step-skipping (token not from final exchange step).`,
        },
      };
      recordSimulatedDecision(out);
      return out;
    }
  }

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
    // Amount-based policy for MCP write tools — highest gate wins, no stacking.
    // Type-based rules (consentTypes/stepUpTypes) do NOT apply on the MCP path.
    //   < confirmAmount   → PERMIT
    //   confirmAmount–stepUpAmount-1 → confirm only (HITL, no MFA)
    //   ≥ stepUpAmount    → step-up (MFA = consent+auth), skips confirm
    //   > denyAmount      → DENY
    const denyAmount = getDenyAmountUsd();
    const stepUpAmount = getStepUpAmountUsd();
    const confirmAmount = getConfirmAmountUsd();

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
      // Build candidate obligations from the amount thresholds, then let the
      // SHARED classifier pick the single winning gate (highest-gate-wins:
      // STEP_UP > HITL_CONSENT). This is the same classifier the PingOne path
      // and evaluateTransaction use, so the precedence rule (the H2 drift
      // point) cannot diverge between engines.
      //
      // Contract note (intentional, not drift): the classifier's canonical
      // flag for a HITL_CONSENT obligation is `consentRequired`. The MCP
      // first-tool gate's wire contract is `hitlRequired` (caller
      // mcpToolAuthorizationService returns `mcp_hitl_required`, driving the
      // BankingAgent HITL approval flow — §1 row 64). So on THIS path a
      // classifier `consentRequired` win is surfaced as `hitlRequired`. The
      // security-relevant invariant (which gate wins) is shared; only the
      // per-path flag label differs, matching each caller's expectation.
      const acrStrong = acrLooksStrong(acr);
      const mcpCandidates = [];
      if (amount >= confirmAmount && !acrStrong) {
        mcpCandidates.push({ type: 'HITL_CONSENT', detail: 'Confirmation required.' });
      }
      if (amount >= stepUpAmount && !acrStrong) {
        mcpCandidates.push({ type: 'STEP_UP', detail: 'MFA required — amount exceeds step-up threshold.' });
      }
      const mcpFlags = classifyObligations(mcpCandidates);

      if (mcpFlags.stepUpRequired) {
        out = {
          decision: 'INDETERMINATE',
          stepUpRequired: true,
          hitlRequired: false,
          path: 'simulated',
          decisionId,
          raw: { ...rawBase, decision: 'INDETERMINATE', obligations: mcpCandidates, enforced: 'STEP_UP', reason: `Amount $${amount} >= step-up threshold $${stepUpAmount}.` },
        };
      } else if (mcpFlags.consentRequired) {
        out = {
          decision: 'INDETERMINATE',
          stepUpRequired: false,
          hitlRequired: true,
          path: 'simulated',
          decisionId,
          raw: { ...rawBase, decision: 'INDETERMINATE', obligations: mcpCandidates, enforced: 'HITL_CONSENT', reason: `Amount $${amount} >= confirm threshold $${confirmAmount}.` },
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

  var reasonParts;
  var reason;
  var typeRequiresConsent;
  var typeRequiresStepUp;
  var amountRequiresStepUp;
  var amountRequiresConsent;
  var consentApplies;
  var stepUpApplies;
  var candidateObligations;
  var flags;

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

    // Which obligations the rules produce (may be more than one — e.g. a
    // $600 transfer matches both consent and step-up thresholds).
    consentApplies = typeRequiresConsent || amountRequiresConsent;
    stepUpApplies = typeRequiresStepUp || amountRequiresStepUp;

    // Build the full candidate obligation list (recorded in raw for
    // education), then let the shared classifier pick the single winning
    // enforcement flag (highest-gate-wins: STEP_UP > HITL_CONSENT). This is
    // the SAME classifier the PingOne path uses — the two engines can no
    // longer disagree on what a given obligation means or which one wins.
    candidateObligations = [];
    if (consentApplies) {
      candidateObligations.push({ type: 'HITL_CONSENT', detail: 'Human approval required.' });
    }
    if (stepUpApplies) {
      candidateObligations.push({ type: 'STEP_UP', detail: 'Elevated authentication (MFA) required.' });
    }

    flags = classifyObligations(candidateObligations);

    if (flags.stepUpRequired || flags.consentRequired) {
      // Build reason message — describes every rule that fired, even though
      // only the highest gate is enforced (educational transparency).
      reasonParts = [];
      if (typeRequiresConsent) reasonParts.push('transaction type requires consent');
      if (typeRequiresStepUp) reasonParts.push('transaction type requires step-up');
      if (amountRequiresConsent && !typeRequiresConsent) reasonParts.push('amount exceeds $' + confirmAmount.toLocaleString());
      if (amountRequiresStepUp && !typeRequiresStepUp) reasonParts.push('amount exceeds $' + stepUpAmount.toLocaleString());
      reason = 'Simulated policy: ' + reasonParts.join('; ') + '.';

      out = {
        decision: 'INDETERMINATE',
        stepUpRequired: flags.stepUpRequired,
        consentRequired: flags.consentRequired,
        path: 'simulated',
        decisionId,
        raw: {
          engine: 'simulated',
          decision: 'INDETERMINATE',
          obligations: candidateObligations,
          enforced: flags.stepUpRequired ? 'STEP_UP' : 'HITL_CONSENT',
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
  // SECURITY-CRITICAL DEFAULT: use getEffective (default-aware), NOT get
  // (raw cache read). ff_authorize_simulated defaults to 'true' — the
  // simulated path is what enforces the amount-based step-up / HITL gate
  // when a live PingOne Authorize decision endpoint is not configured.
  // configStore.get() returns null on a cache miss (e.g. a corrupt/empty
  // config.db where SQLite init failed) — with the old code that null made
  // this return false, silently DISABLING the high-value-transfer consent
  // gate (fail-open). getEffective applies the 'true' default so an
  // unreadable/unset config fails SAFE toward enforcing the gate. An
  // operator who explicitly sets it to 'false' still gets false.
  const v = configStore.getEffective
    ? configStore.getEffective('ff_authorize_simulated')
    : configStore.get('ff_authorize_simulated');
  return v === true || v === 'true';
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
