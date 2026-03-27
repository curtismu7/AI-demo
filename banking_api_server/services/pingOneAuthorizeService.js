/**
 * pingOneAuthorizeService.js
 *
 * Evaluates transactions against a PingOne Authorize policy.
 *
 * Two API paths are supported — the service auto-selects based on config:
 *
 *   NEW (Phase 2):  POST /v1/environments/{envId}/decisionEndpoints/{endpointId}
 *                   Requires authorize_decision_endpoint_id / PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID
 *                   Request body: { parameters: { Amount, TransactionType, UserId, ... } }
 *
 *   LEGACY (Phase 1 / fallback):
 *                   POST /v1/environments/{envId}/governance/policyDecisionPoints/{policyId}/evaluate
 *                   Requires authorize_policy_id / PINGONE_AUTHORIZE_POLICY_ID
 *                   Request body: { context: { user, transaction } }
 *
 * Worker credentials are read from configStore first, falling back to environment
 * variables so existing deployments continue to work without migration:
 *
 *   configStore:  authorize_worker_client_id / authorize_worker_client_secret
 *   Env vars:     PINGONE_AUTHORIZE_WORKER_CLIENT_ID / PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET
 *
 * The environment ID and region come from configStore (pingone_environment_id /
 * pingone_region) with the same env-var fallbacks used throughout the app.
 *
 * Exported functions:
 *   evaluateTransaction(params)   — full policy evaluation returning PERMIT/DENY/INDETERMINATE
 *   checkStepUpRequired(params)   — lightweight check: returns { stepUpRequired, reason }
 *   getRecentDecisions(endpointId, limit) — Phase 3: last N decisions for an endpoint
 *   isConfigured()                — returns true if all required credentials are present
 *   getDecisionEndpoints()        — list all decision endpoints in the environment
 */

'use strict';

const configStore = require('./configStore');

const REGION_TLD_MAP = {
  com: 'com',
  eu: 'eu',
  ca: 'ca',
  asia: 'asia',
  'com.au': 'com.au',
};

// ---------------------------------------------------------------------------
// Credential resolution — configStore first, env var fallback
// ---------------------------------------------------------------------------

function _getCredentials() {
  const envId =
    configStore.get('pingone_environment_id') ||
    process.env.PINGONE_ENVIRONMENT_ID;

  const region =
    configStore.get('pingone_region') ||
    process.env.PINGONE_REGION ||
    'com';

  const clientId =
    configStore.get('authorize_worker_client_id') ||
    process.env.PINGONE_AUTHORIZE_WORKER_CLIENT_ID;

  const clientSecret =
    configStore.get('authorize_worker_client_secret') ||
    process.env.PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET;

  const decisionEndpointId =
    configStore.get('authorize_decision_endpoint_id') ||
    process.env.PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID;

  const policyId =
    configStore.get('authorize_policy_id') ||
    process.env.PINGONE_AUTHORIZE_POLICY_ID;

  const regionTld = REGION_TLD_MAP[(region || 'com').toLowerCase()] || 'com';

  return { envId, clientId, clientSecret, decisionEndpointId, policyId, regionTld };
}

const apiBase  = (tld) => `https://api.pingone.${tld}`;
const authBase = (tld) => `https://auth.pingone.${tld}`;

// ---------------------------------------------------------------------------
// Worker token (client credentials grant)
// ---------------------------------------------------------------------------

/**
 * Obtain a short-lived worker access_token via client credentials.
 * @returns {Promise<string>} access_token
 */
async function getWorkerToken() {
  const { envId, clientId, clientSecret, regionTld } = _getCredentials();

  if (!envId || !clientId || !clientSecret) {
    throw new Error(
      'PingOne Authorize worker credentials are not fully configured. ' +
      'Set authorize_worker_client_id and authorize_worker_client_secret in ' +
      'Admin → Configuration → PingOne Authorize, or set ' +
      'PINGONE_AUTHORIZE_WORKER_CLIENT_ID and PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET ' +
      'environment variables.'
    );
  }

  const tokenUrl = `${authBase(regionTld)}/${envId}/as/token`;
  const encoded  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker token request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Worker token response did not include access_token');
  }
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Phase 2 — Decision Endpoints evaluation (current / preferred path)
// POST /v1/environments/{envId}/decisionEndpoints/{endpointId}
// ---------------------------------------------------------------------------

/**
 * Evaluate using the Decision Endpoints API (Phase 2 path).
 * Parameters map to Trust Framework attribute names defined in PingOne Authorize.
 *
 * @param {object} opts
 * @param {string} opts.endpointId
 * @param {string} opts.userId
 * @param {number} opts.amount
 * @param {string} opts.type        - 'transfer' | 'withdrawal' | 'deposit'
 * @param {string} [opts.acr]
 * @param {object} [opts.extra]     - Additional Trust Framework attributes
 * @returns {Promise<{ decision, stepUpRequired, raw, decisionId, path }>}
 */
async function _evaluateViaDecisionEndpoint({ endpointId, userId, amount, type, acr, extra = {} }) {
  const { envId, regionTld } = _getCredentials();

  const workerToken = await getWorkerToken();

  const url = `${apiBase(regionTld)}/v1/environments/${envId}/decisionEndpoints/${endpointId}`;

  // Parameters must match Trust Framework attribute names configured in PingOne Authorize.
  // The defaults below assume a standard banking policy with Amount, TransactionType, UserId.
  const payload = {
    parameters: {
      Amount: amount,
      TransactionType: type,
      UserId: userId,
      ...(acr ? { Acr: acr } : {}),
      Timestamp: new Date().toISOString(),
      ...extra,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PingOne Authorize decision endpoint evaluation failed (${response.status}): ${text}`);
  }

  const raw = await response.json();
  const decision = raw.decision || raw.status || 'INDETERMINATE';
  const stepUpRequired = _extractStepUpRequired(raw);

  // Decision endpoints return an `id` field for the recorded decision
  const decisionId = raw.id || raw.decisionId || null;

  return { decision, stepUpRequired, raw, decisionId, path: 'decision-endpoint' };
}

// ---------------------------------------------------------------------------
// Phase 1 — Legacy PDP evaluation (fallback path)
// POST /v1/environments/{envId}/governance/policyDecisionPoints/{policyId}/evaluate
// ---------------------------------------------------------------------------

/**
 * Evaluate using the legacy Policy Decision Points path.
 *
 * @param {object} opts
 * @param {string} opts.policyId
 * @param {string} opts.userId
 * @param {number} opts.amount
 * @param {string} opts.type
 * @param {string} [opts.acr]
 * @param {object} [opts.context]
 * @returns {Promise<{ decision, stepUpRequired, raw, decisionId, path }>}
 */
async function _evaluateViaPdp({ policyId, userId, amount, type, acr, context = {} }) {
  const { envId, regionTld } = _getCredentials();

  const workerToken = await getWorkerToken();

  const url = `${apiBase(regionTld)}/v1/environments/${envId}/governance/policyDecisionPoints/${policyId}/evaluate`;

  const payload = {
    context: {
      user: {
        id: userId,
        acr: acr || null,
      },
      transaction: {
        amount,
        type,
        timestamp: new Date().toISOString(),
      },
      ...context,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PingOne Authorize PDP evaluation failed (${response.status}): ${text}`);
  }

  const raw = await response.json();
  const decision = raw.decision || 'INDETERMINATE';
  const stepUpRequired = _extractStepUpRequired(raw);

  return { decision, stepUpRequired, raw, decisionId: null, path: 'pdp-legacy' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a transaction against PingOne Authorize.
 *
 * Automatically selects the API path:
 *   - Decision Endpoints path (Phase 2) when authorize_decision_endpoint_id is configured.
 *   - Legacy PDP path (Phase 1) when only authorize_policy_id is configured.
 *
 * @param {object} params
 * @param {string} [params.policyId]          - Legacy PDP ID (configStore fallback)
 * @param {string} [params.decisionEndpointId]- Decision endpoint ID (Phase 2; configStore fallback)
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.type                - 'transfer' | 'withdrawal' | 'deposit'
 * @param {string} [params.acr]
 * @param {object} [params.context]           - Extra context (legacy path) / extra parameters (new path)
 * @returns {Promise<{ decision: 'PERMIT'|'DENY'|'INDETERMINATE', stepUpRequired: boolean, raw: object, decisionId: string|null, path: string }>}
 */
async function evaluateTransaction({ policyId, decisionEndpointId, userId, amount, type, acr, context = {} }) {
  const creds = _getCredentials();

  // Resolve endpoint / policy — caller param takes priority over configStore
  const resolvedEndpointId = decisionEndpointId || creds.decisionEndpointId;
  const resolvedPolicyId   = policyId           || creds.policyId;

  if (!creds.envId) throw new Error('PingOne environment ID is not configured.');

  if (resolvedEndpointId) {
    // Phase 2 — preferred path
    return _evaluateViaDecisionEndpoint({
      endpointId: resolvedEndpointId,
      userId,
      amount,
      type,
      acr,
      extra: context,
    });
  }

  if (resolvedPolicyId) {
    // Phase 1 — legacy fallback
    console.warn('[Authorize] Using legacy PDP path. Set authorize_decision_endpoint_id for Phase 2 API.');
    return _evaluateViaPdp({ policyId: resolvedPolicyId, userId, amount, type, acr, context });
  }

  throw new Error('authorize_decision_endpoint_id or authorize_policy_id must be configured.');
}

/**
 * Lightweight check: call PingOne Authorize to determine if step-up MFA is
 * required for this transaction, without rendering a final permit/deny decision.
 *
 * Returns early (stepUpRequired: false) if Authorize is not configured.
 *
 * @param {object} params
 * @param {string} [params.policyId]
 * @param {string} [params.decisionEndpointId]
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.type
 * @param {string} [params.acr]
 * @returns {Promise<{ stepUpRequired: boolean, reason: string|null, raw: object|null }>}
 */
async function checkStepUpRequired({ policyId, decisionEndpointId, userId, amount, type, acr }) {
  if (!isConfigured()) {
    return { stepUpRequired: false, reason: null, raw: null };
  }

  try {
    const { decision, stepUpRequired, raw } = await evaluateTransaction({
      policyId,
      decisionEndpointId,
      userId,
      amount,
      type,
      acr,
      context: { checkType: 'step_up_check' },
    });

    if (stepUpRequired) {
      return { stepUpRequired: true, reason: 'policy_step_up_obligation', raw };
    }

    if (decision === 'DENY') {
      return { stepUpRequired: true, reason: 'policy_deny', raw };
    }

    return { stepUpRequired: false, reason: null, raw };
  } catch (err) {
    console.warn(`[Authorize] checkStepUpRequired failed — defaulting to not required: ${err.message}`);
    return { stepUpRequired: false, reason: null, raw: null };
  }
}

/**
 * Phase 3 — Fetch recent decisions for a decision endpoint.
 * Requires recordRecentRequests: true on the endpoint in PingOne Authorize.
 *
 * @param {string} [endpointId]  - defaults to authorize_decision_endpoint_id from configStore
 * @param {number} [limit=20]    - PingOne returns at most 20; 24-hour window
 * @returns {Promise<{ decisions: Array, endpointId: string }>}
 */
async function getRecentDecisions(endpointId, limit = 20) {
  const { envId, regionTld, decisionEndpointId } = _getCredentials();
  const resolvedId = endpointId || decisionEndpointId;

  if (!envId)        throw new Error('PingOne environment ID is not configured.');
  if (!resolvedId)   throw new Error('authorize_decision_endpoint_id is required for recent decisions.');

  const workerToken = await getWorkerToken();

  const url = `${apiBase(regionTld)}/v1/environments/${envId}/decisionEndpoints/${resolvedId}/recentDecisions?limit=${limit}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Recent decisions fetch failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const decisions = data._embedded?.decisions || data.decisions || [];

  return { decisions, endpointId: resolvedId };
}

/**
 * List all decision endpoints in the PingOne environment.
 * Useful for the Config UI and education panel.
 *
 * @returns {Promise<Array<{ id, name, description, recordRecentRequests }>>}
 */
async function getDecisionEndpoints() {
  const { envId, regionTld } = _getCredentials();
  if (!envId) throw new Error('PingOne environment ID is not configured.');

  const workerToken = await getWorkerToken();

  const url = `${apiBase(regionTld)}/v1/environments/${envId}/decisionEndpoints`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${workerToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Decision endpoints list failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded?.decisionEndpoints || data.decisionEndpoints || [];
}

/**
 * Returns true if all required credentials are available (configStore or env).
 * Accepts either decision endpoint ID (Phase 2) or policy ID (Phase 1).
 */
function isConfigured() {
  const { envId, clientId, clientSecret, decisionEndpointId, policyId } = _getCredentials();
  return !!(envId && clientId && clientSecret && (decisionEndpointId || policyId));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract step-up requirement from a PingOne Authorize raw response.
 * Policies can signal step-up via an obligation with type 'STEP_UP' or via
 * an advice attribute. Returns true if any such signal is found.
 */
function _extractStepUpRequired(raw) {
  const obligations = raw.obligations || raw.details?.obligations || [];
  if (obligations.some((o) => (o.type || o.id || '').toUpperCase().includes('STEP_UP'))) {
    return true;
  }
  const advice = raw.advice || raw.details?.advice || [];
  if (advice.some((a) => (a.type || a.id || '').toUpperCase().includes('STEP_UP'))) {
    return true;
  }
  return false;
}

module.exports = {
  evaluateTransaction,
  checkStepUpRequired,
  getRecentDecisions,
  getDecisionEndpoints,
  isConfigured,
  getWorkerToken,
};
