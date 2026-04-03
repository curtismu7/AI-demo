/**
 * transactionAuthorizationService.js
 *
 * Single entry for transaction policy evaluation aligned with docs/PINGONE_AUTHORIZE_PLAN.md:
 * - **Simulated** (education): in-process, same Trust Framework parameter shape as Phase 2
 * - **PingOne Authorize**: decision endpoint (preferred) or legacy PDP
 *
 * Used by POST /api/transactions so behavior and HTTP shapes stay consistent between engines.
 */

'use strict';

const configStore = require('./configStore');
const pingOneAuthorizeService = require('./pingOneAuthorizeService');
const simulatedAuthorizeService = require('./simulatedAuthorizeService');

/**
 * Build 428/403 bodies shared between engines (Feature Flags + Config labels).
 */
function buildStepUpBody({ useSimulated, policyId, runtimeSettings }) {
  const STEP_UP_ACR = runtimeSettings.get('stepUpAcrValue');
  const stepUpMethod = configStore.getEffective('step_up_method') || runtimeSettings.get('stepUpMethod') || 'ciba';
  return {
    error: 'step_up_required',
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
 *   | { ran: false }
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
  const AUTHORIZE_ENABLED =
    (configStore.get('authorize_enabled') === 'true' || configStore.get('authorize_enabled') === true) ||
    runtimeSettings.get('authorizeEnabled');
  const AUTHORIZE_DEPOSITS = configStore.get('ff_authorize_deposits') === 'true';
  const USE_SIMULATED = simulatedAuthorizeService.isSimulatedModeEnabled(configStore);
  const AUTHORIZE_DECISION_ENDPOINT_ID = configStore.get('authorize_decision_endpoint_id');
  const AUTHORIZE_POLICY_ID =
    configStore.get('authorize_policy_id') || runtimeSettings.get('authorizePolicyId');

  const AUTHORIZE_TYPES = AUTHORIZE_DEPOSITS
    ? ['transfer', 'withdrawal', 'deposit']
    : ['transfer', 'withdrawal'];

  const PINGONE_READY = !!(AUTHORIZE_DECISION_ENDPOINT_ID || AUTHORIZE_POLICY_ID);
  const SHOULD_RUN =
    AUTHORIZE_ENABLED &&
    userRole !== 'admin' &&
    AUTHORIZE_TYPES.includes(type) &&
    (USE_SIMULATED || PINGONE_READY);

  if (!SHOULD_RUN) {
    return { ran: false };
  }

  try {
    if (USE_SIMULATED) {
      const r = await simulatedAuthorizeService.evaluateTransaction({
        userId,
        amount,
        type,
        acr,
      });

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
      return { ran: true, simulatedError: err };
    }
    return { ran: true, pingoneError: err };
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
