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
const { MCP_TOOL_SCOPES, getSessionBearerForMcp } = require('./mcpWebSocketClient');

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
 */
function sanitizeClaims(claims) {
  if (!claims) { return null; }
  const result = {};
  if (claims.sub)    result.sub    = claims.sub;
  if (claims.aud)    result.aud    = claims.aud;
  if (claims.scope)  result.scope  = claims.scope;
  if (claims.iss)    result.iss    = claims.iss;
  if (claims.exp)    result.exp    = claims.exp;
  if (claims.iat)    result.iat    = claims.iat;
  if (claims.nbf)    result.nbf    = claims.nbf;
  if (claims.may_act) result.may_act = claims.may_act;
  if (claims.act)    result.act    = claims.act;
  if (claims.client_id) result.client_id = claims.client_id;
  if (claims.azp)    result.azp    = claims.azp;
  if (claims.jti)    result.jti    = claims.jti;
  if (claims.email) result.email = claims.email;
  if (claims.preferred_username) result.preferred_username = claims.preferred_username;
  if (claims.given_name) result.given_name = claims.given_name;
  if (claims.family_name) result.family_name = claims.family_name;
  if (claims.acr) result.acr = claims.acr;
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
 * Returns { token, tokenEvents, userSub } where:
 *   token       — the JWT to pass to the MCP server (may be exchanged)
 *   tokenEvents — array of TokenEvent objects for the frontend
 *   userSub     — PingOne subject from the user token (T1), for MCP metadata
 *
 * @param {import('express').Request} req
 * @param {string} tool
 */
async function resolveMcpAccessTokenWithEvents(req, tool) {
  const tokenEvents = [];
  const userToken = getSessionBearerForMcp(req);

  if (!userToken) {
    return { token: null, tokenEvents, userSub: null };
  }

  // ── Event 1: User token (T1) ────────────────────────────────────────────────
  const t1Decoded = decodeJwtClaims(userToken);
  const t1Claims = t1Decoded?.claims;
  const userSub = t1Claims?.sub != null ? String(t1Claims.sub) : null;
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

  // ── No exchange configured ──────────────────────────────────────────────────
  if (!mcpResourceUri) {
    tokenEvents.push(buildTokenEvent(
      'exchange-skipped',
      'Token Exchange (RFC 8693)',
      'skipped',
      null,
      'MCP_RESOURCE_URI is not configured — the User Token is forwarded directly to the MCP server. ' +
      'To enable delegation: set MCP_RESOURCE_URI to the MCP server\'s audience URI and configure ' +
      'the token-exchange grant + may_act policy in PingOne.',
      { rfc: 'RFC 8693 (Token Exchange)' }
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
        'Agent Token (Client Credentials)',
        'active',
        a0Decoded,
        `Client-credentials token for the dedicated Agent OAuth client (${process.env.AGENT_OAUTH_CLIENT_ID}). ` +
        'Used as actor_token in the RFC 8693 exchange — the resulting MCP Token will carry ' +
        'act: { client_id: agent-client } identifying the Agent as the current actor.',
        { rfc: 'RFC 8693 §2.1 (actor_token)' }
      ));
    } catch (err) {
      tokenEvents.push(buildTokenEvent(
        'agent-actor-token',
        'Agent Token',
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
    'Token Exchange (RFC 8693): User Token → MCP Token',
    'acquiring',
    null,
    `Backend For Frontend (BFF) is exchanging the User Token for a delegated MCP Token scoped to audience=${mcpResourceUri}, ` +
    `scope="${toolScopes.join(' ')}". ` +
    (t1Claims?.may_act
      ? `PingOne will validate may_act.client_id="${t1Claims.may_act.client_id}" against the authenticated Backend For Frontend (BFF) client.`
      : 'PingOne will check exchange policy (may_act not present in T1 — exchange may be rejected).'),
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
      'MCP Token (Delegated) → MCP Server',
      'exchanged',
      t2Decoded,
      'PingOne issued the MCP Token after validating may_act. ' +
      (t2Claims?.act
        ? `act: ${JSON.stringify(t2Claims.act)} — this is the current fact: the Backend For Frontend (BFF) is acting on behalf of the user. ` +
          'Resource servers use act (not may_act) to identify the current actor for audit and policy decisions.'
        : 'act claim not present — PingOne may not have applied delegation policy. ') +
      `Audience is narrowed to ${mcpResourceUri}, scope narrowed to "${toolScopes.join(' ')}". ` +
      'The User Token (your original login token) NEVER leaves the Backend For Frontend (BFF) — only the MCP Token reaches the MCP Server.',
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
      'Token Exchange (RFC 8693) — Failed',
      'failed',
      null,
      `Exchange failed: ${err.message}. ` +
      (t1Claims?.may_act
        ? 'may_act was present — check that PingOne has the token-exchange grant enabled on this client and the audience policy allows ' + mcpResourceUri + '.'
        : 'may_act was absent — add the may_act claim to the user token via PingOne token policy, then retry.'),
      { error: err.message, rfc: 'RFC 8693' }
    ));

    // Fallback: try subject-only if actor exchange failed
    if (actorToken) {
      try {
        exchangedToken = await oauthService.performTokenExchange(userToken, mcpResourceUri, toolScopes);
        const t2Decoded = decodeJwtClaims(exchangedToken);
        tokenEvents.push(buildTokenEvent(
          'exchanged-token',
          'MCP Token (Subject-only Fallback)',
          'exchanged',
          t2Decoded,
          'Agent Token exchange failed; fell back to subject-only RFC 8693 exchange (no act claim). ' +
          'The MCP Token is still scoped to the MCP audience — the User Token never leaves the BFF.',
          { rfc: 'RFC 8693', exchangeMethod: 'fallback-subject-only' }
        ));
        return { token: exchangedToken, tokenEvents, userSub };
      } catch (err2) {
        throw err2;
      }
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
