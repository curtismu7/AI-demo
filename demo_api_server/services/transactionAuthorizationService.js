/**
 * transactionAuthorizationService.js
 *
 * Single entry for transaction policy evaluation aligned with docs/PINGONE_AUTHORIZE_PLAN.md:
 * - **Simulated** (education): in-process, same Trust Framework parameter shape as Phase 2
 * - **PingOne Authorize**: decision endpoint (preferred) or legacy PDP
 *
 * Used by POST /api/transactions so behavior and HTTP shapes stay consistent between engines.
 *
 * ## Failover mode (F6)
 * When the PingOne Authorize engine is unreachable (network error, 5xx), the service
 * applies the configured failover policy rather than propagating a raw error:
 *
 *   authorize_failover_mode = 'fallback_simulated' (default)
 *     → Switch to in-process simulated engine. Demo continues; policy gates still enforced.
 *   authorize_failover_mode = 'deny'
 *     → Return 503 — block all transactions when live policy is unavailable (fail-closed).
 *   authorize_failover_mode = 'permit'
 *     → Allow transaction with a warning log (fail-open). Weakest posture.
 *
 * Legacy: ff_authorize_fail_open=true is treated as authorize_failover_mode=permit.
 */

'use strict';

const configStore = require('./configStore');
const pingOneAuthorizeService = require('./pingOneAuthorizeService');
const simulatedAuthorizeService = require('./simulatedAuthorizeService');
const { logEvent, EVENT_CATEGORIES } = require('./appEventService');

/**
 * Build 428/403 bodies shared between engines (Feature Flags + Config labels).
 */
function buildStepUpBody({ useSimulated, policyId, runtimeSettings }) {
  const STEP_UP_ACR = runtimeSettings.get('stepUpAcrValue');
  const stepUpMethod = configStore.getEffective('step_up_method') || runtimeSettings.get('stepUpMethod') || 'ciba';
  return {
    error: 'step_up_required',
    hitl: { type: 'step_up' },
    error_description: useSimulated
      ? 'This transaction requires additional authentication (MFA) as required by the simulated authorization policy (education mode).'
      : 'This transaction requires additional authentication (MFA) as required by the authorization policy.',
    step_up_acr: STEP_UP_ACR,
    step_up_method: stepUpMethod,
    step_up_url: '/api/auth/oauth/user/stepup',
    authorize_policy_id: policyId || undefined,
    authorize_engine: useSimulated ? 'simulated' : 'pingone',
  };
}

function buildConsentBody() {
  return {
    error: 'hitl_required',
    hitl: { type: 'consent' },
    error_description: 'This transaction requires explicit human approval. Create a consent challenge first.',
  };
}

function buildDenyBody({ useSimulated, policyId }) {
  return {
    error: 'transaction_denied',
    error_description: useSimulated
      ? 'This transaction was denied by the simulated authorization policy (education mode). See server logs for rule details.'
      : 'This transaction was denied by the authorization policy.',
    authorize_policy_id: policyId || undefined,
    authorize_engine: useSimulated ? 'simulated' : 'pingone',
  };
}

/**
 * Run PingOne Authorize or simulated policy when enabled. Admin users skip entirely.
 *
 * @param {object} opts
 * @param {object} opts.runtimeSettings - runtimeSettings module
 * @param {string} opts.userRole
 * @param {string} opts.userId
 * @param {number} opts.amount
 * @param {string} opts.type
 * @param {string} [opts.acr]
 * @returns {Promise<
 *   | { ran: false, reason: string }
 *   | { ran: true, permit: true, evaluation: object }
 *   | { ran: true, block: { status: number, body: object } }
 *   | { ran: true, simulatedError: Error }
 *   | { ran: true, pingoneError: Error }
 * >}
 */
async function evaluateTransactionPolicy({
  runtimeSettings,
  userRole,
  userId,
  amount,
  type,
  acr,
}) {
  // Authorization is ALWAYS ENABLED for security — no ff to disable it.
  // Either use simulated Authorize (education) or live PingOne (when configured).
  const USE_SIMULATED = simulatedAuthorizeService.isSimulatedModeEnabled(configStore);
  const AUTHORIZE_ENABLED = true;
  const AUTHORIZE_DEPOSITS = configStore.get('ff_authorize_deposits') === 'true';
  const AUTHORIZE_DECISION_ENDPOINT_ID = configStore.get('authorize_decision_endpoint_id');
  const AUTHORIZE_POLICY_ID =
    configStore.get('authorize_policy_id') || runtimeSettings.get('authorizePolicyId');

  const AUTHORIZE_TYPES = AUTHORIZE_DEPOSITS
    ? ['transfer', 'withdrawal', 'deposit']
    : ['transfer', 'withdrawal'];

  const PINGONE_READY = !!(AUTHORIZE_DECISION_ENDPOINT_ID || AUTHORIZE_POLICY_ID);
  if (!AUTHORIZE_ENABLED) {
    return { ran: false, reason: 'authorize_disabled' };
  }
  if (userRole === 'admin') {
    return { ran: false, reason: 'admin_role_exempt' };
  }
  if (!AUTHORIZE_TYPES.includes(type)) {
    return { ran: false, reason: 'type_not_in_scope' };
  }
  if (!USE_SIMULATED && !PINGONE_READY) {
    return { ran: false, reason: 'not_configured' };
  }

  try {
    if (USE_SIMULATED) {
      const r = await simulatedAuthorizeService.evaluateTransaction({
        userId,
        amount,
        type,
        acr,
      });

      logEvent(EVENT_CATEGORIES.AUTHORIZE, 'info',
        `Authorize simulated — ${type} $${amount} — decision=${r.decision} consent=${r.consentRequired} stepUp=${r.stepUpRequired}`,
        { tag: 'authorize/simulated-result', metadata: { type, amount, userId, decision: r.decision, consentRequired: r.consentRequired, stepUpRequired: r.stepUpRequired } });

      // Check stepUpRequired before consentRequired: step-up is the stronger gate
      // and must not be bypassed by the ff_hitl_enabled=false consent-skip path.
      // A $600 transfer satisfies both thresholds; step-up takes priority.
      if (r.stepUpRequired) {
        return {
          ran: true,
          block: {
            status: 428,
            body: buildStepUpBody({
              useSimulated: true,
              policyId: AUTHORIZE_POLICY_ID,
              runtimeSettings,
            }),
          },
        };
      }

      if (r.consentRequired) {
        logEvent(EVENT_CATEGORIES.HITL, 'info',
          `HITL consent required — ${type} $${amount}`,
          { tag: 'hitl/consent-required-authz', metadata: { type, amount, userId } });
        return { ran: true, block: { status: 428, body: buildConsentBody() } };
      }

      if (r.decision === 'DENY') {
        return {
          ran: true,
          block: { status: 403, body: buildDenyBody({ useSimulated: true, policyId: AUTHORIZE_POLICY_ID }) },
        };
      }

      return {
        ran: true,
        permit: true,
        evaluation: {
          engine: 'simulated',
          decision: r.decision,
          path: r.path,
          decisionId: r.decisionId,
          parameters: r.raw?.parameters || null,
        },
      };
    }

    const r = await pingOneAuthorizeService.evaluateTransaction({
      decisionEndpointId: AUTHORIZE_DECISION_ENDPOINT_ID,
      policyId: AUTHORIZE_POLICY_ID,
      userId,
      amount,
      type,
      acr,
    });

    if (r.consentRequired) {
      return { ran: true, block: { status: 428, body: buildConsentBody() } };
    }

    if (r.stepUpRequired) {
      return {
        ran: true,
        block: {
          status: 428,
          body: buildStepUpBody({
            useSimulated: false,
            policyId: AUTHORIZE_POLICY_ID,
            runtimeSettings,
          }),
        },
      };
    }

    if (r.decision === 'DENY') {
      return {
        ran: true,
        block: { status: 403, body: buildDenyBody({ useSimulated: false, policyId: AUTHORIZE_POLICY_ID }) },
      };
    }

    return {
      ran: true,
      permit: true,
      evaluation: {
        engine: 'pingone',
        decision: r.decision,
        path: r.path,
        decisionId: r.decisionId,
        authorizeRef: AUTHORIZE_DECISION_ENDPOINT_ID || AUTHORIZE_POLICY_ID,
      },
    };
  } catch (err) {
    if (USE_SIMULATED) {
      // Simulated engine failure is unexpected — propagate as-is (simulated never calls network).
      return { ran: true, simulatedError: err };
    }

    // PingOne engine failure — apply configured failover policy (F6).
    // Legacy: ff_authorize_fail_open=true maps to failover_mode=permit for
    // backward compatibility with existing deployments that set that flag.
    const legacyFailOpen = configStore.getEffective('ff_authorize_fail_open') === 'true';
    const failoverMode = legacyFailOpen
      ? 'permit'
      : (configStore.getEffective('authorize_failover_mode') || 'fallback_simulated');

    logEvent(EVENT_CATEGORIES.AUTHORIZE, 'error',
      `[Authorize] PingOne unreachable — failover_mode=${failoverMode}: ${err.message}`,
      { tag: 'authorize/failover', metadata: { failoverMode, error: err.message, type, amount, userId } });

    if (failoverMode === 'permit') {
      // Fail-open: allow the transaction and log prominently.
      logEvent(EVENT_CATEGORIES.AUTHORIZE, 'warning',
        `[Authorize] FAIL-OPEN — transaction permitted without policy evaluation (failover_mode=permit)`,
        { tag: 'authorize/fail-open', metadata: { type, amount, userId } });
      return {
        ran: true,
        permit: true,
        evaluation: {
          engine: 'failover',
          decision: 'PERMIT',
          path: 'failover',
          failoverMode: 'permit',
          note: 'PingOne Authorize unreachable — permitted by failover policy',
        },
      };
    }

    if (failoverMode === 'deny') {
      // Fail-closed: block all transactions when live policy is unavailable.
      return {
        ran: true,
        block: {
          status: 503,
          body: {
            error: 'authorization_service_unavailable',
            error_description:
              'The authorization service is temporarily unavailable. Transactions are blocked (failover mode: deny). Please try again shortly.',
            failover_mode: 'deny',
          },
        },
      };
    }

    // failoverMode === 'fallback_simulated' (default): run simulated engine.
    // This keeps the demo running and still enforces policy gates.
    try {
      const fallback = await simulatedAuthorizeService.evaluateTransaction({ userId, amount, type, acr });

      logEvent(EVENT_CATEGORIES.AUTHORIZE, 'warning',
        `[Authorize] Fell back to simulated engine — ${type} $${amount} — decision=${fallback.decision}`,
        { tag: 'authorize/fallback-simulated', metadata: { type, amount, userId, decision: fallback.decision } });

      if (fallback.stepUpRequired) {
        return {
          ran: true,
          block: {
            status: 428,
            body: buildStepUpBody({ useSimulated: true, policyId: AUTHORIZE_POLICY_ID, runtimeSettings }),
          },
        };
      }
      if (fallback.consentRequired) {
        return { ran: true, block: { status: 428, body: buildConsentBody() } };
      }
      if (fallback.decision === 'DENY') {
        return {
          ran: true,
          block: { status: 403, body: buildDenyBody({ useSimulated: true, policyId: AUTHORIZE_POLICY_ID }) },
        };
      }
      return {
        ran: true,
        permit: true,
        evaluation: {
          engine: 'fallback_simulated',
          decision: fallback.decision,
          path: fallback.path,
          decisionId: fallback.decisionId,
          note: 'PingOne Authorize unreachable — evaluated by fallback simulated engine',
        },
      };
    } catch (fallbackErr) {
      // Even the fallback failed (should never happen) — hard deny.
      logEvent(EVENT_CATEGORIES.AUTHORIZE, 'error',
        `[Authorize] Fallback simulated engine also failed: ${fallbackErr.message}`,
        { tag: 'authorize/fallback-error', metadata: { type, amount, userId } });
      return {
        ran: true,
        block: {
          status: 503,
          body: {
            error: 'authorization_service_unavailable',
            error_description: 'Authorization evaluation failed. Please try again.',
          },
        },
      };
    }
  }
}

/**
 * Public read model for admin / education UIs (no secrets).
 */
function getAuthorizationStatusSummary() {
  const USE_SIMULATED = simulatedAuthorizeService.isSimulatedModeEnabled(configStore);
  const decisionEndpointId = configStore.get('authorize_decision_endpoint_id');
  const policyId = configStore.get('authorize_policy_id');
  const pingoneConfigured = pingOneAuthorizeService.isConfigured();
  const authorizeEnabled =
    (configStore.get('authorize_enabled') === 'true' || configStore.get('authorize_enabled') === true);

  const hasDecision = !!(decisionEndpointId && String(decisionEndpointId).trim());
  const hasPolicy = !!(policyId && String(policyId).trim());
  let activeEngine = 'off';
  if (!authorizeEnabled) {
    activeEngine = 'off';
  } else if (USE_SIMULATED) {
    activeEngine = 'simulated';
  } else if (pingoneConfigured && (hasDecision || hasPolicy)) {
    activeEngine = 'pingone';
  } else {
    activeEngine = 'pending_config';
  }

  return {
    authorizeEnabledConfig: authorizeEnabled,
    simulatedMode: USE_SIMULATED,
    pingoneConfigured,
    hasDecisionEndpointId: hasDecision,
    hasPolicyId: hasPolicy,
    activeEngine,
  };
}

module.exports = {
  evaluateTransactionPolicy,
  getAuthorizationStatusSummary,
};
