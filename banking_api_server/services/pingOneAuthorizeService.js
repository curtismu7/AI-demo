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
 *   evaluateMcpToolDelegation(params) — MCP first-tool gate (DecisionContext=McpFirstTool); requires authorize_mcp_decision_endpoint_id
 *   checkStepUpRequired(params)   — lightweight check: returns { stepUpRequired, reason }
 *   getRecentDecisions(endpointId, limit) — Phase 3: last N decisions for an endpoint
 *   isConfigured()                — returns true if all required credentials are present
 *   isMcpDelegationDecisionReady()  — worker + MCP decision endpoint ID configured
 *   getDecisionEndpoints()        — list all decision endpoints in the environment
 *   isWorkerCredentialReady()   — env + worker client id/secret (no decision endpoint required)
 *   provisionDemoDecisionEndpoints(opts) — create/link Super Banking demo decision endpoints via Platform API
 */

'use strict';

const crypto = require('crypto');
const configStore = require('./configStore');

/** Stable names — idempotent GET list + create if missing */
const DEMO_TX_ENDPOINT_NAME = 'Super Banking Demo — Transactions';
const DEMO_MCP_ENDPOINT_NAME = 'Super Banking Demo — MCP first tool';

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

  /** Optional second decision endpoint for MCP first-tool delegation (Trust Framework: DecisionContext=McpFirstTool). */
  const mcpDecisionEndpointId =
    configStore.get('authorize_mcp_decision_endpoint_id') ||
    process.env.PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID;

  const regionTld = REGION_TLD_MAP[(region || 'com').toLowerCase()] || 'com';

  return { envId, clientId, clientSecret, decisionEndpointId, policyId, mcpDecisionEndpointId, regionTld };
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
 * POST a Trust Framework parameters object to a decision endpoint (Phase 2).
 * @param {string} endpointId
 * @param {Record<string, unknown>} parameters
 * @returns {Promise<{ decision, stepUpRequired, raw, decisionId, path }>}
 */
async function _postDecisionEndpoint(endpointId, parameters) {
  const { envId, regionTld } = _getCredentials();

  const workerToken = await getWorkerToken();

  const url = `${apiBase(regionTld)}/v1/environments/${envId}/decisionEndpoints/${endpointId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parameters }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PingOne Authorize decision endpoint evaluation failed (${response.status}): ${text}`);
  }

  const raw = await response.json();
  const decision = raw.decision || raw.status || 'INDETERMINATE';
  const stepUpRequired = _extractStepUpRequired(raw);

  const decisionId = raw.id || raw.decisionId || null;

  return { decision, stepUpRequired, raw, decisionId, path: 'decision-endpoint' };
}

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
  const parameters = {
    Amount: amount,
    TransactionType: type,
    UserId: userId,
    ...(acr ? { Acr: acr } : {}),
    Timestamp: new Date().toISOString(),
    ...extra,
  };
  return _postDecisionEndpoint(endpointId, parameters);
}

/**
 * MCP first-tool delegation evaluation (separate Trust Framework shape).
 * Requires authorize_mcp_decision_endpoint_id (or explicit decisionEndpointId).
 * PingOne policy should key off DecisionContext === "McpFirstTool" and attributes below.
 *
 * @param {object} opts
 * @param {string} [opts.decisionEndpointId] - overrides config authorize_mcp_decision_endpoint_id
 * @param {string} opts.userId
 * @param {string} opts.toolName
 * @param {string} [opts.tokenAudience] - MCP access token aud (string)
 * @param {string} [opts.actClientId] - act.client_id or act.sub from MCP token (RFC 8693 §4.1 canonical: act.sub)
 * @param {string} [opts.nestedActClientId] - act.act.client_id or act.act.sub (nested delegation, RFC 8693 two-hop)
 * @param {string} [opts.mcpResourceUri] - expected MCP resource audience
 * @param {string} [opts.acr] - end-user ACR from session when available
 */
async function evaluateMcpToolDelegation({
  decisionEndpointId,
  userId,
  toolName,
  tokenAudience,
  actClientId,
  nestedActClientId,
  mcpResourceUri,
  acr,
}) {
  const creds = _getCredentials();
  const endpointId = decisionEndpointId || creds.mcpDecisionEndpointId;

  if (!creds.envId) {
    throw new Error('PingOne environment ID is not configured.');
  }
  if (!endpointId) {
    throw new Error(
      'MCP delegation decision endpoint is not configured. Set authorize_mcp_decision_endpoint_id in Admin → Config.',
    );
  }

  const parameters = {
    DecisionContext: 'McpFirstTool',
    UserId: userId,
    ToolName: toolName || '',
    TokenAudience: tokenAudience != null ? String(tokenAudience) : '',
    ActClientId: actClientId || '',          // from act.client_id || act.sub
    NestedActClientId: nestedActClientId || '', // from act.act.client_id || act.act.sub
    McpResourceUri: mcpResourceUri || '',    // expected MCP resource URI from config
    ...(acr ? { Acr: acr } : {}),
    Timestamp: new Date().toISOString(),
  };

  return _postDecisionEndpoint(endpointId, parameters);
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

/**
 * True when PingOne Authorize worker app credentials are present (can call Management API).
 */
function isWorkerCredentialReady() {
  const { envId, clientId, clientSecret } = _getCredentials();
  return !!(envId && clientId && clientSecret);
}

/**
 * Find a decision endpoint returned from getDecisionEndpoints() by exact name.
 * @param {Array<{ id?: string, name?: string }>} endpoints
 * @param {string} name
 */
function _findEndpointByName(endpoints, name) {
  if (!Array.isArray(endpoints)) return null;
  return endpoints.find((e) => String(e?.name || '') === name) || null;
}

/**
 * POST /v1/environments/{envId}/decisionEndpoints — create a policy decision endpoint.
 * @see https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints/create-decision-endpoint.html
 * @param {{ name: string, description: string, policyId?: string, authorizationVersionId?: string }} opts
 * @returns {Promise<{ id: string, raw: object }>}
 */
async function _createDecisionEndpointResource(opts) {
  const { envId, regionTld } = _getCredentials();
  const workerToken = await getWorkerToken();
  const url = `${apiBase(regionTld)}/v1/environments/${envId}/decisionEndpoints`;

  const base = {
    name: opts.name,
    description: opts.description,
    recordRecentRequests: true,
  };
  if (opts.policyId) base.policyId = opts.policyId;
  if (opts.authorizationVersionId) {
    base.authorizationVersion = { id: opts.authorizationVersionId };
  }

  async function postWithPayload(payload) {
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  // Prefer server-assigned id; some tenants require a client UUID — retry with id on 400.
  let response = await postWithPayload(base);
  if (!response.ok && response.status === 400) {
    const withId = { ...base, id: crypto.randomUUID() };
    response = await postWithPayload(withId);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Create decision endpoint failed (${response.status}): ${text}`);
  }

  const raw = await response.json();
  const id = raw.id;
  if (!id) throw new Error('PingOne did not return decision endpoint id');
  return { id, raw };
}

/**
 * Ensure two demo decision endpoints exist in PingOne (transactions + MCP first-tool).
 * Reuses existing endpoints if names match (idempotent).
 *
 * @param {{ policyId?: string, authorizationVersionId?: string }} [options]
 * @returns {Promise<{ transactionEndpointId: string, mcpEndpointId: string, created: { transaction: boolean, mcp: boolean } }>}
 */
async function provisionDemoDecisionEndpoints(options = {}) {
  if (!isWorkerCredentialReady()) {
    throw new Error(
      'PingOne Authorize worker is not configured. Set authorize_worker_client_id and ' +
        'authorize_worker_client_secret (or PINGONE_AUTHORIZE_WORKER_* env vars) in Application Configuration.'
    );
  }

  const policyId = options.policyId && String(options.policyId).trim() ? String(options.policyId).trim() : undefined;
  const authorizationVersionId =
    options.authorizationVersionId && String(options.authorizationVersionId).trim()
      ? String(options.authorizationVersionId).trim()
      : undefined;

  const list = await getDecisionEndpoints();
  let tx = _findEndpointByName(list, DEMO_TX_ENDPOINT_NAME);
  let mcp = _findEndpointByName(list, DEMO_MCP_ENDPOINT_NAME);

  const created = { transaction: false, mcp: false };

  if (!tx) {
    const r = await _createDecisionEndpointResource({
      name: DEMO_TX_ENDPOINT_NAME,
      description:
        'Super Banking demo — transactions (Trust Framework: Amount, TransactionType, UserId, Acr, Timestamp). Created by Application Configuration bootstrap.',
      policyId,
      authorizationVersionId,
    });
    tx = { id: r.id, name: DEMO_TX_ENDPOINT_NAME };
    created.transaction = true;
  }

  if (!mcp) {
    const r = await _createDecisionEndpointResource({
      name: DEMO_MCP_ENDPOINT_NAME,
      description:
        'Super Banking demo — first MCP tool gate (DecisionContext=McpFirstTool). Trust Framework attributes: TokenAudience (aud), ActClientId (act.client_id|act.sub), NestedActClientId (act.act.client_id|act.act.sub). Created by Application Configuration bootstrap.',
      policyId,
      authorizationVersionId,
    });
    mcp = { id: r.id, name: DEMO_MCP_ENDPOINT_NAME };
    created.mcp = true;
  }

  return {
    transactionEndpointId: tx.id,
    mcpEndpointId: mcp.id,
    created,
  };
}

/**
 * True when worker credentials and authorize_mcp_decision_endpoint_id are set (live MCP first-tool gate).
 */
function isMcpDelegationDecisionReady() {
  const { envId, clientId, clientSecret, mcpDecisionEndpointId } = _getCredentials();
  return !!(envId && clientId && clientSecret && mcpDecisionEndpointId && String(mcpDecisionEndpointId).trim());
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
  evaluateMcpToolDelegation,
  checkStepUpRequired,
  getRecentDecisions,
  getDecisionEndpoints,
  isConfigured,
  isMcpDelegationDecisionReady,
  isWorkerCredentialReady,
  provisionDemoDecisionEndpoints,
  getWorkerToken,
};
