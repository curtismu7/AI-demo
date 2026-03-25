// banking_api_server/services/agentMcpTokenService.js
/**
 * Resolves the access token sent to banking_mcp_server: either legacy (user-only exchange)
 * or on-behalf-of (subject = user, actor = agent OAuth client) when USE_AGENT_ACTOR_FOR_MCP=true.
 *
 * Also returns tokenEvents — decoded token metadata for the UI Token Chain panel.
 * No raw tokens are included; events contain only decoded JWT claims (header + payload).
 */
'use strict';

const configStore = require('./configStore');
const oauthService = require('./oauthService');
const { MCP_TOOL_SCOPES, getSessionAccessToken } = require('./mcpWebSocketClient');

// ─── JWT decode (no verification — display only) ─────────────────────────────

/**
 * Decode a JWT without signature verification.
 * Returns { header, claims } or null if malformed.
 * NEVER returns the raw token string.
 */
function decodeJwtClaims(token) {
  if (!token || typeof token !== 'string') { return null; }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) { return null; }
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { header, claims };
  } catch (_e) {
    return null;
  }
}

/**
 * Build a sanitized claims snapshot for the UI.
 * Strips any field that could be sensitive or identifying beyond what's needed for education.
 * @param {Record<string, unknown>|null|undefined} claims
 */
function sanitizeClaims(claims) {
  if (claims == null || typeof claims !== 'object') return null;
  const c = claims;
  const result = {};
  if (c.sub) result.sub = c.sub;
  if (c.aud) result.aud = c.aud;
  if (c.scope) result.scope = c.scope;
  if (c.iss) result.iss = c.iss;
  if (c.exp) result.exp = c.exp;
  if (c.iat) result.iat = c.iat;
  if (c.nbf) result.nbf = c.nbf;
  if (c.may_act) result.may_act = c.may_act;
  if (c.act) result.act = c.act;
  if (c.client_id) result.client_id = c.client_id;
  if (c.azp) result.azp = c.azp;
  if (c.jti) result.jti = c.jti;
  if (c.email) result.email = c.email;
  if (c.preferred_username) result.preferred_username = c.preferred_username;
  if (c.given_name) result.given_name = c.given_name;
  if (c.family_name) result.family_name = c.family_name;
  if (c.acr) result.acr = c.acr;
  return result;
}

/**
 * Build a token event object for the frontend Token Chain panel.
 * @param {string}  id
 * @param {string}  label
 * @param {string}  status  'active' | 'acquiring' | 'exchanged' | 'failed' | 'skipped'
 * @param {object|null} decoded  { header, claims } from decodeJwtClaims
 * @param {string}  explanation  Human-readable description of what happened and why
 * @param {object}  [extra]  Extra fields (exchangeDetails, error, rfc, etc.)
 */
function buildTokenEvent(id, label, status, decoded, explanation, extra = {}) {
  return {
    id,
    label,
    status,
    timestamp: new Date().toISOString(),
    alg: decoded?.header?.alg || null,
    claims: sanitizeClaims(decoded?.claims),
    explanation,
    ...extra,
  };
}

// ─── may_act validation (informational — PingOne does the real check) ─────────

/**
 * Inspect the subject token's may_act claim and return a human-readable result.
 * This mirrors the validation algorithm in may_act.md §Reference Validation Algorithm.
 * The actual enforcement is performed by PingOne during the token exchange; this
 * function produces the explanation text shown in the UI.
 */
function describeMayAct(claims, bffClientId) {
  if (!claims) return { valid: false, reason: 'no claims decoded' };
  const { may_act } = claims;

  if (!may_act) {
    return {
      valid: false,
      reason: 'may_act claim absent — PingOne will reject the exchange unless policy allows it without the claim',
    };
  }
  if (typeof may_act !== 'object' || Array.isArray(may_act)) {
    return { valid: false, reason: 'may_act is not a JSON object — invalid per RFC 8693 / may_act spec' };
  }

  const checks = [];
  let mismatch = false;

  if (may_act.client_id) {
    const match = !bffClientId || may_act.client_id === bffClientId;
    const mismatchMsg = match ? '✅ matches Backend For Frontend (BFF)' : `❌ mismatch (Backend For Frontend (BFF) is ${bffClientId})`;
    checks.push(`client_id: ${may_act.client_id} ${mismatchMsg}`);
    if (!match) mismatch = true;
  }
  if (may_act.sub) {
    checks.push(`sub: ${may_act.sub}`);
  }
  if (may_act.iss) {
    checks.push(`iss: ${may_act.iss}`);
  }

  if (checks.length === 0) {
    return { valid: false, reason: 'may_act has no recognised fields (client_id / sub / iss)' };
  }

  return {
    valid: !mismatch,
    reason: checks.join(' · '),
    mayActObj: may_act,
  };
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the MCP access token and produce tokenEvents for the UI Token Chain panel.
 *
 * Returns { token, tokenEvents } where:
 *   token       — the JWT to pass to the MCP server (may be exchanged)
 *   tokenEvents — array of TokenEvent objects for the frontend
 *
 * @param {import('express').Request} req
 * @param {string} tool
 */
async function resolveMcpAccessTokenWithEvents(req, tool) {
  const tokenEvents = [];
  const userToken = getSessionAccessToken(req);

  if (!userToken) {
    return { token: null, tokenEvents };
  }

  // ── Event 1: User token (T1) ────────────────────────────────────────────────
  const t1Decoded = decodeJwtClaims(userToken);
  const t1Claims = t1Decoded?.claims;
  const userSub = t1Claims?.sub || null;
  const bffClientId = oauthService.config?.clientId || process.env.PINGONE_CLIENT_ID || null;
  const mayActInfo = describeMayAct(t1Claims, bffClientId);

  tokenEvents.push(buildTokenEvent(
    'user-token',
    'User Token',
    'active',
    t1Decoded,
    'Issued by PingOne after Authorization Code + PKCE login. ' +
    'Stored in the Backend For Frontend (BFF) session (server-side httpOnly cookie — never sent to the browser). ' +
    (t1Claims?.may_act
      ? `Contains may_act: ${JSON.stringify(t1Claims.may_act)} — this prospectively authorises the Backend For Frontend (BFF) to exchange this token. ${mayActInfo.reason}`
      : 'No may_act claim — PingOne must be configured to add may_act for token exchange to succeed.'),
    {
      rfc: 'RFC 7519 (JWT) · RFC 9068 (OAuth2 JWT AT)',
      mayActPresent: !!t1Claims?.may_act,
      mayActValid: mayActInfo.valid,
      mayActDetails: mayActInfo.reason,
    }
  ));

  const mcpResourceUri = configStore.getEffective('mcp_resource_uri');
  const toolScopes = MCP_TOOL_SCOPES[tool] || ['banking:read'];
  const useActor = process.env.USE_AGENT_ACTOR_FOR_MCP === 'true' && process.env.AGENT_OAUTH_CLIENT_ID;
  const requireMayAct = process.env.REQUIRE_MAY_ACT === 'true';

  // Pre-flight: token exchange requires may_act when REQUIRE_MAY_ACT=true (aligns with banking_mcp_server).
  if (requireMayAct && mcpResourceUri && !t1Claims?.may_act) {
    tokenEvents.push(buildTokenEvent(
      'may-act-required',
      'may_act (RFC 8693) — required',
      'failed',
      t1Decoded,
      'REQUIRE_MAY_ACT=true but the user token has no may_act claim. Add may_act via PingOne token policy, or set REQUIRE_MAY_ACT=false for local testing.',
      { rfc: 'RFC 8693 §4.2' }
    ));
    return { token: null, tokenEvents, userSub };
  }

  // ── No exchange configured ──────────────────────────────────────────────────
  if (!mcpResourceUri) {
    const agentClientId = process.env.AGENT_OAUTH_CLIENT_ID;
    if (agentClientId) {
      // M2M path: use agent client_credentials as the transport token so the
      // user's own access token (T1) never crosses the BFF→MCP boundary.
      // The user's identity is communicated separately as userSub metadata in
      // the MCP initialize handshake (see mcpWebSocketClient.js).
      try {
        const m2mToken = await oauthService.getAgentClientCredentialsToken();
        const m2mDecoded = decodeJwtClaims(m2mToken);
        tokenEvents.push(buildTokenEvent(
          'agent-m2m-token',
          'Agent Token (M2M)',
          'active',
          m2mDecoded,
          `MCP_RESOURCE_URI not configured — using BFF Agent Token (client_credentials for ${agentClientId}) ` +
          'to authenticate the BFF to the MCP server. The user\'s identity (sub) is passed as ' +
          'trusted metadata in the MCP initialize handshake, NOT as the auth credential. ' +
          'The User Token never crosses the BFF→MCP boundary.',
          {
            rfc: 'RFC 6749 §4.4 (Client Credentials)',
            userSub,
            note: 'Set MCP_RESOURCE_URI to enable RFC 8693 token exchange with full delegation chain.',
          }
        ));
        return { token: m2mToken, tokenEvents, userSub };
      } catch (err) {
        tokenEvents.push(buildTokenEvent(
          'agent-m2m-token',
          'Agent Token — failed',
          'failed',
          null,
          `Agent client_credentials failed: ${err.message}. Falling back to User Token passthrough (insecure — fix AGENT_OAUTH_CLIENT_SECRET).`,
          { error: err.message }
        ));
        // Fall through to T1 passthrough below so the demo keeps working
      }
    }
    // T1 passthrough — only reached when AGENT_OAUTH_CLIENT_ID is not set
    tokenEvents.push(buildTokenEvent(
      'exchange-skipped',
      'Token Exchange (RFC 8693)',
      'skipped',
      null,
      'MCP_RESOURCE_URI is not configured and AGENT_OAUTH_CLIENT_ID is not set — the User Token is forwarded ' +
      'directly to the MCP server. Set AGENT_OAUTH_CLIENT_ID/SECRET to use an Agent Token (M2M) ' +
      'instead, or set MCP_RESOURCE_URI to enable RFC 8693 token exchange for a scoped MCP Token.',
      { rfc: 'RFC 8693 (Token Exchange)', warning: 'T1_PASSTHROUGH' }
    ));
    return { token: userToken, tokenEvents, userSub };
  }

  // ── Event 2a (optional): Agent actor client-credentials token ───────────────
  let actorToken = null;
  if (useActor) {
    try {
      actorToken = await oauthService.getAgentClientCredentialsToken();
      const a0Decoded = decodeJwtClaims(actorToken);
      tokenEvents.push(buildTokenEvent(
        'agent-actor-token',
        'Agent Token (actor)',
        'active',
        a0Decoded,
        `Client-credentials token for the dedicated agent OAuth client (${process.env.AGENT_OAUTH_CLIENT_ID}). ` +
        'Used as actor_token in the RFC 8693 exchange — the resulting MCP Token will carry ' +
        'act: { client_id: agent-client } identifying the agent as the current actor.',
        { rfc: 'RFC 8693 §2.1 (actor_token)' }
      ));
    } catch (err) {
      tokenEvents.push(buildTokenEvent(
        'agent-actor-token',
        'Agent Token — failed',
        'failed',
        null,
        `Agent client-credentials token failed: ${err.message}. Falling back to subject-only exchange.`,
        { error: err.message }
      ));
      actorToken = null;
    }
  }

  // ── Event 2b: Token exchange attempt ────────────────────────────────────────
  tokenEvents.push(buildTokenEvent(
    'exchange-in-progress',
    'MCP Token (acquiring via RFC 8693)',
    'acquiring',
    null,
    `Backend For Frontend (BFF) is exchanging the User Token for an MCP Token scoped to audience=${mcpResourceUri}, ` +
    `scope="${toolScopes.join(' ')}". ` +
    (t1Claims?.may_act
      ? `PingOne will validate may_act.client_id="${t1Claims.may_act.client_id}" against the authenticated Backend For Frontend (BFF) client.`
      : 'PingOne will check exchange policy (may_act not present in User Token — exchange may be rejected).'),
    {
      rfc: 'RFC 8693 · RFC 8707 (resource indicator)',
      exchangeRequest: {
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        audience: mcpResourceUri,
        scope: toolScopes.join(' '),
        has_actor_token: !!actorToken,
      },
    }
  ));

  // ── Perform exchange ─────────────────────────────────────────────────────────
  let exchangedToken = null;
  let exchangeMethod = 'subject-only';

  try {
    if (actorToken) {
      exchangedToken = await oauthService.performTokenExchangeWithActor(
        userToken, actorToken, mcpResourceUri, toolScopes
      );
      exchangeMethod = 'with-actor';
    } else {
      exchangedToken = await oauthService.performTokenExchange(
        userToken, mcpResourceUri, toolScopes
      );
    }

    // Decode T2 to show act claim in the UI
    const t2Decoded = decodeJwtClaims(exchangedToken);
    const t2Claims = t2Decoded?.claims;

    // Replace the in-progress event with the completed result
    const inProgressIdx = tokenEvents.findIndex(e => e.id === 'exchange-in-progress');
    if (inProgressIdx !== -1) tokenEvents.splice(inProgressIdx, 1);

    tokenEvents.push(buildTokenEvent(
      'exchanged-token',
      'MCP Token (delegated)',
      'exchanged',
      t2Decoded,
      'PingOne issued the MCP Token after validating may_act. ' +
      (t2Claims?.act
        ? `act: ${JSON.stringify(t2Claims.act)} — this is the current fact: the Backend For Frontend (BFF) is acting on behalf of the user. ` +
          'Resource servers use act (not may_act) to identify the current actor for audit and policy decisions.'
        : 'act claim not present — PingOne may not have applied delegation policy. ') +
      `Audience is narrowed to ${mcpResourceUri}, scope narrowed to "${toolScopes.join(' ')}". ` +
      'The User Token never leaves the Backend For Frontend (BFF).',
      {
        rfc: 'RFC 8693 · RFC 8707',
        exchangeMethod,
        actPresent: !!t2Claims?.act,
        actDetails: t2Claims?.act ? JSON.stringify(t2Claims.act) : null,
        audienceNarrowed: mcpResourceUri,
        scopeNarrowed: toolScopes.join(' '),
      }
    ));

    return { token: exchangedToken, tokenEvents, userSub };

  } catch (err) {
    // Replace in-progress with failure
    const inProgressIdx = tokenEvents.findIndex(e => e.id === 'exchange-in-progress');
    if (inProgressIdx !== -1) tokenEvents.splice(inProgressIdx, 1);

    tokenEvents.push(buildTokenEvent(
      'exchange-failed',
      'MCP Token (exchange failed)',
      'failed',
      null,
      `Exchange failed: ${err.message}. ` +
      (t1Claims?.may_act
        ? `may_act was present — check that PingOne has the token-exchange grant enabled on this client and the audience policy allows ${mcpResourceUri}.`
        : 'may_act was absent — add the may_act claim to the User Token via PingOne token policy, then retry.'),
      { error: err.message, rfc: 'RFC 8693' }
    ));

    // Fallback: try subject-only if actor exchange failed
    if (actorToken) {
      exchangedToken = await oauthService.performTokenExchange(userToken, mcpResourceUri, toolScopes);
      const t2Decoded = decodeJwtClaims(exchangedToken);
      tokenEvents.push(buildTokenEvent(
        'exchanged-token',
        'MCP Token (delegated, subject-only fallback)',
        'exchanged',
        t2Decoded,
        'Actor exchange failed; fell back to subject-only RFC 8693 exchange (no act claim from actor token). ' +
        'The MCP Token is still scoped to the MCP audience.',
        { rfc: 'RFC 8693', exchangeMethod: 'fallback-subject-only' }
      ));
      return { token: exchangedToken, tokenEvents, userSub };
    }
    throw err;
  }
}

/**
 * Legacy resolver — returns only the token (backwards compat with existing callers).
 */
async function resolveMcpAccessToken(req, tool) {
  const { token } = await resolveMcpAccessTokenWithEvents(req, tool);
  return token;
}

module.exports = {
  resolveMcpAccessToken,
  resolveMcpAccessTokenWithEvents,
  decodeJwtClaims,
  sanitizeClaims,
};
