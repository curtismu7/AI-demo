// banking_api_server/services/agentMcpTokenService.js
/**
 * Resolves the access token sent to banking_mcp_server: either legacy (user-only exchange)
 * or on-behalf-of (subject = user, actor = agent OAuth client) when USE_AGENT_ACTOR_FOR_MCP=true.
 *
 * **Token names** (used in tokenEvents labels and documentation):
 * - **User access token** — PingOne OAuth access token for the end user; held in the BFF session; RFC 8693 `subject_token`.
 * - **Agent access token** — Client-credentials token for `AGENT_OAUTH_CLIENT_ID`; optional RFC 8693 `actor_token`.
 * - **MCP access token** — Delegated access token PingOne issues for the MCP audience (`mcp_resource_uri`); Bearer to MCP.
 *
 * Also returns tokenEvents — decoded token metadata for the UI Token Chain panel.
 * No raw tokens are included. Each event may include jwtFullDecode: { header, claims }
 * (full JWT payload JSON for dumps) alongside a smaller sanitized `claims` field for tables.
 */
'use strict';

const configStore = require('./configStore');
const oauthService = require('./oauthService');
const { writeExchangeEvent } = require('./exchangeAuditStore');
const {
  parseAllowedScopesFromConfig,
  isToolPermittedByAgentPolicy,
  missingAgentPolicyScopes,
  scopesAreCatalogOnly,
} = require('./agentMcpScopePolicy');
const { MCP_TOOL_SCOPES, getSessionBearerForMcp } = require('./mcpWebSocketClient');

/** Minimum distinct scopes on the User access token before RFC 8693 to MCP (so PingOne can narrow audience + scope). */
const MIN_USER_SCOPES_FOR_MCP = Math.max(
  1,
  parseInt(process.env.MIN_USER_SCOPES_FOR_MCP_EXCHANGE || '5', 10) || 5
);

/**
 * Count space-separated OAuth scopes on JWT claims (PingOne access tokens).
 * @param {object|null|undefined} claims
 * @returns {number}
 */
function countJwtScopes(claims) {
  if (!claims || claims.scope == null) return 0;
  const s = String(claims.scope).trim();
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Attach tokenEvents for the UI and throw with HTTP status + machine code.
 * @param {Array} tokenEvents
 * @param {string} code
 * @param {string} message
 * @param {number} [httpStatus]
 */
function throwTokenResolutionError(tokenEvents, code, message, httpStatus = 502) {
  const err = new Error(message);
  err.code = code;
  err.tokenEvents = tokenEvents;
  err.httpStatus = httpStatus;
  throw err;
}

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
  /** Full JWT decode (header + payload) for Token Chain JSON dump — never includes the raw token string. */
  const jwtFullDecode =
    decoded?.header != null && decoded?.claims != null
      ? { header: decoded.header, claims: decoded.claims }
      : null;
  return {
    id,
    label,
    status,
    timestamp: new Date().toISOString(),
    alg: decoded?.header?.alg || null,
    claims: sanitizeClaims(decoded?.claims),
    explanation,
    ...extra,
    ...(jwtFullDecode ? { jwtFullDecode } : {}),
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
      reason: 'may_act claim absent — PingOne may reject the exchange; add the may_act claim via a PingOne token policy to guarantee acceptance',
    };
  }
  if (typeof may_act !== 'object' || Array.isArray(may_act)) {
    return { valid: false, reason: 'may_act is not a JSON object — invalid per RFC 8693 / may_act spec' };
  }

  const checks = [];
  let mismatch = false;

  if (may_act.client_id) {
    const match = !bffClientId || may_act.client_id === bffClientId;
    const mismatchMsg = match ? '✅ matches Backend-for-Frontend (BFF)' : `❌ mismatch (Backend-for-Frontend (BFF) is ${bffClientId})`;
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

/**
 * Append the user access token row to tokenEvents (same shape as MCP tool-call flow).
 * @returns {{ userSub: string|null, userAccessTokenClaims: object|undefined, userAccessTokenDecoded: object|null }}
 */
function appendUserTokenEvent(tokenEvents, userToken, req = null) {
  const userAccessTokenDecoded = decodeJwtClaims(userToken);
  const userAccessTokenClaims = userAccessTokenDecoded?.claims;
  const userSub = userAccessTokenClaims?.sub != null ? String(userAccessTokenClaims.sub) : null;
  const bffClientId = oauthService.config?.clientId || process.env.PINGONE_CLIENT_ID || null;
  const mayActInfo = describeMayAct(userAccessTokenClaims, bffClientId);

  tokenEvents.push(buildTokenEvent(
    'user-token',
    'User access token',
    'active',
    userAccessTokenDecoded,
    'Issued by PingOne after Authorization Code + PKCE login. ' +
    'Stored in the Backend-for-Frontend (BFF) session (server-side httpOnly cookie — never sent to the browser). ' +
    (userAccessTokenClaims?.may_act
      ? `Contains may_act: ${JSON.stringify(userAccessTokenClaims.may_act)} — this prospectively authorises the Backend-for-Frontend (BFF) to exchange this token. ${mayActInfo.reason}`
      : 'No may_act claim — PingOne must be configured to add may_act for token exchange to succeed.'),
    {
      rfc: 'RFC 7519 (JWT) · RFC 9068 (OAuth2 JWT AT)',
      mayActPresent: !!userAccessTokenClaims?.may_act,
      mayActValid: mayActInfo.valid,
      mayActDetails: mayActInfo.reason,
    }
  ));

  return { userSub, userAccessTokenClaims, userAccessTokenDecoded };
}

/**
 * Session-only token chain rows for the dashboard after login — decodes User Token from BFF session only (no PingOne exchange).
 * @param {import('express').Request} req
 * @returns {{ tokenEvents: Array }}
 */
function buildSessionPreviewTokenEvents(req) {
  const tokenEvents = [];
  const userToken = getSessionBearerForMcp(req);
  if (!userToken) {
    return { tokenEvents: [] };
  }

  appendUserTokenEvent(tokenEvents, userToken, req);

  const mcpResourceUri = configStore.getEffective('mcp_resource_uri');
  if (!mcpResourceUri) {
    tokenEvents.push(buildTokenEvent(
      'exchange-required',
      'Token Exchange (RFC 8693) — Not Configured',
      'skipped',
      null,
      'mcp_resource_uri is not set — RFC 8693 token exchange is not active. ' +
        'Banking tools run via local fallback; the user access token is never forwarded to MCP. ' +
        'Token exchange (and human-in-the-loop consent) only applies to deposit, withdrawal, and transfer transactions over $500.',
      { rfc: 'RFC 8693 · RFC 8707' }
    ));
    return { tokenEvents };
  }

  const userAccessTokenDecoded = decodeJwtClaims(userToken);
  const userAccessTokenClaims = userAccessTokenDecoded?.claims;
  const scopeCount = countJwtScopes(userAccessTokenClaims);
  if (scopeCount < MIN_USER_SCOPES_FOR_MCP) {
    tokenEvents.push(buildTokenEvent(
      'user-scopes-insufficient',
      'User access token — insufficient scopes for MCP exchange',
      'failed',
      userAccessTokenDecoded,
      `User access token has ${scopeCount} scope(s); at least ${MIN_USER_SCOPES_FOR_MCP} distinct scopes are required ` +
        'so PingOne can issue a delegated MCP token with a narrower audience and reduced scopes. ' +
        'Request additional scopes at login (PingOne app) and sign in again.',
      { rfc: 'RFC 8693', scopeCount, minRequired: MIN_USER_SCOPES_FOR_MCP }
    ));
    return { tokenEvents };
  }

  tokenEvents.push(buildTokenEvent(
    'exchange',
    'Token exchange (RFC 8693): user access token → MCP access token',
    'waiting',
    null,
    'Your session has a user access token (above). The exchange runs when the AI Agent invokes a banking tool. ' +
      'For deposit, withdrawal, and transfer over $500 the exchange is paired with human-in-the-loop consent (OTP).',
    { rfc: 'RFC 8693 · RFC 8707' }
  ));

  tokenEvents.push(buildTokenEvent(
    'exchanged-token',
    'MCP access token (delegated) → MCP server',
    'waiting',
    null,
    'After a successful exchange on an MCP tool call, decoded MCP access token claims (including act, audience, and scope) appear here.',
    { rfc: 'RFC 8693' }
  ));

  return { tokenEvents };
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the MCP access token and produce tokenEvents for the UI Token Chain panel.
 *
 * Returns { token, tokenEvents, userSub } where:
 *   token       — the JWT to pass to the MCP server (may be exchanged)
 *   tokenEvents — array of TokenEvent objects for the frontend
 *   userSub     — PingOne subject from the User token, for MCP metadata
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

  const { userSub, userAccessTokenClaims: _rawUserClaims } = appendUserTokenEvent(tokenEvents, userToken, req);

  // ── Optional BFF synthetic may_act injection ──────────────────────────────
  // When ff_inject_may_act is true and the user token has no may_act claim, the
  // BFF synthesises { client_id: <bff-client-id> } so token exchange can proceed
  // without any PingOne token-policy change.  Educational/demo only.
  const ffInjectMayAct =
    configStore.getEffective('ff_inject_may_act') === true ||
    configStore.getEffective('ff_inject_may_act') === 'true';

  let userAccessTokenClaims = _rawUserClaims;
  if (ffInjectMayAct && userAccessTokenClaims && !userAccessTokenClaims.may_act) {
    const bffClientId =
      oauthService.config?.clientId ||
      configStore.getEffective('user_client_id') ||
      process.env.PINGONE_CLIENT_ID ||
      null;
    if (bffClientId) {
      // Patch claims in memory only — the JWT itself is unchanged.
      userAccessTokenClaims = { ...userAccessTokenClaims, may_act: { client_id: bffClientId } };
      // Update the user-token event that was just pushed to reflect the injection.
      const utEvent = tokenEvents.find(e => e.id === 'user-token');
      if (utEvent) {
        utEvent.mayActPresent = true;
        utEvent.mayActValid   = true;
        utEvent.mayActInjected = true;
        utEvent.mayActDetails =
          `may_act synthesised by BFF (ff_inject_may_act = true): { client_id: "${bffClientId}" }. ` +
          'This is a demo/dev shortcut — enable may_act in your PingOne token policy to remove this.';
        utEvent.explanation =
          (utEvent.explanation || '') +
          ` [BFF-INJECTED may_act: { client_id: "${bffClientId}" } — enable ff_inject_may_act is ON]`;
      }
      tokenEvents.push(buildTokenEvent(
        'may-act-injected',
        'may_act — BFF synthetic injection',
        'active',
        null,
        `ff_inject_may_act is ON. The user access token had no may_act claim so the BFF has ` +
          `synthesised { client_id: "${bffClientId}" } in memory before attempting RFC 8693 token exchange. ` +
          'The JWT itself is unchanged. To remove this shortcut, configure PingOne to add may_act natively ' +
          'via an attribute mapping expression, then disable this flag.',
        { rfc: 'RFC 8693 §4.1', synthetic: true, injectedValue: { client_id: bffClientId } }
      ));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const mcpResourceUri = configStore.getEffective('mcp_resource_uri');
  const toolCandidateScopes = MCP_TOOL_SCOPES[tool] || ['banking:read'];
  const agentAllowedRaw = configStore.getEffective('agent_mcp_allowed_scopes');
  const agentAllowedSet = parseAllowedScopesFromConfig(agentAllowedRaw);

  // Classify tool as high-risk (write) so the UI can label the Token Chain accordingly.
  const isHighRiskTool = toolCandidateScopes.some(
    s => s.includes(':write') || s === 'banking:write'
  );
  const toolTrigger = isHighRiskTool ? 'high_risk' : 'read_only';

  if (
    scopesAreCatalogOnly(toolCandidateScopes) &&
    !isToolPermittedByAgentPolicy(toolCandidateScopes, agentAllowedSet)
  ) {
    const missing = missingAgentPolicyScopes(toolCandidateScopes, agentAllowedSet);
    tokenEvents.push(buildTokenEvent(
      'agent-scope-denied',
      'Agent MCP scope policy — action blocked',
      'failed',
      null,
      `Application Configuration does not allow the OAuth scopes required for this tool: ${missing.join(', ')}. ` +
        'Enable the matching options under **Agent MCP scopes** on the config page. RFC 8693 token exchange was not started.',
      {
        missingScopes: missing,
        agentPolicyAllows: [...agentAllowedSet].join(' '),
      }
    ));
    throwTokenResolutionError(
      tokenEvents,
      'agent_mcp_scope_denied',
      `Agent MCP scopes exclude: ${missing.join(', ')}. Enable them in Application Configuration → Agent MCP scopes, then try again.`,
      403
    );
  }

  // Narrow toolCandidateScopes to only scopes the user token actually carries.
  // PingOne can only narrow — it cannot grant a scope the subject token doesn't have.
  // Example: tool needs ['banking:accounts:read','banking:read']; user has 'banking:read'
  //          → toolScopes = ['banking:read']  (exchanges successfully for the broad scope)
  const userTokenScopes = new Set(
    (typeof userAccessTokenClaims?.scope === 'string'
      ? userAccessTokenClaims.scope.split(' ')
      : (userAccessTokenClaims?.scope || [])
    ).filter(Boolean)
  );
  const toolScopes = toolCandidateScopes.filter((s) => userTokenScopes.has(s));
  // If none of the tool's scopes are present in the user token, fall back to any allowed
  // scope in the user token so the exchange still has something to request.  PingOne will
  // return only what is actually permitted — the missing tool scope will surface at the MCP layer.
  const effectiveToolScopes = toolScopes.length > 0
    ? toolScopes
    : toolCandidateScopes;

  // Always use actor token when agent OAuth client is configured — ensures on_behalf_of semantics
  // (the exchanged MCP token carries act: { client_id: <agent> } proving which client is acting).
  // Without AGENT_OAUTH_CLIENT_ID the exchange runs subject-only (still RFC 8693; user token
  // is NEVER forwarded to MCP — but the act claim is absent, weakening audit provenance).
  const useActor = !!process.env.AGENT_OAUTH_CLIENT_ID;

  if (!mcpResourceUri) {
    tokenEvents.push(buildTokenEvent(
      'exchange-required',
      'Token Exchange (RFC 8693) — Not Configured',
      'skipped',
      null,
      'RFC 8693 token exchange is not configured. Set mcp_resource_uri in the Admin → Config UI ' +
        '(or MCP_RESOURCE_URI env) to the MCP resource audience URI. ' +
        'Banking tools are running via local fallback — the user access token is not forwarded to MCP.',
      { rfc: 'RFC 8693 · RFC 8707', trigger: toolTrigger }
    ));
    // Return null token — server.js will route to the local tool handler.
    // The User Token is never forwarded to MCP from this path.
    return { token: null, tokenEvents, userSub };
  }

  const scopeCount = countJwtScopes(userAccessTokenClaims);
  if (scopeCount < MIN_USER_SCOPES_FOR_MCP) {
    tokenEvents.push(buildTokenEvent(
      'user-scopes-insufficient',
      'User access token — insufficient scopes for MCP exchange',
      'failed',
      decodeJwtClaims(userToken),
      `User access token has ${scopeCount} scope(s); at least ${MIN_USER_SCOPES_FOR_MCP} are required. ` +
        'Request a broader scope set at login so PingOne can narrow to MCP-only scopes after exchange.',
      { rfc: 'RFC 8693', scopeCount, minRequired: MIN_USER_SCOPES_FOR_MCP }
    ));
    throwTokenResolutionError(
      tokenEvents,
      'user_token_insufficient_scopes',
      `User token must include at least ${MIN_USER_SCOPES_FOR_MCP} distinct OAuth scopes (found ${scopeCount}). Re-authorize with more scopes.`,
      403
    );
  }

  // ── Event 2a: Agent actor client-credentials token (required for on_behalf_of) ─
  if (!useActor) {
    console.warn(
      '[agentMcpTokenService] AGENT_OAUTH_CLIENT_ID not set — RFC 8693 exchange will run subject-only ' +
      '(no act claim). Configure AGENT_OAUTH_CLIENT_ID + AGENT_OAUTH_CLIENT_SECRET for full on_behalf_of semantics.'
    );
    tokenEvents.push(buildTokenEvent(
      'on-behalf-of-warning',
      'On-Behalf-Of — agent client not configured',
      'skipped',
      null,
      'AGENT_OAUTH_CLIENT_ID is not set. The token exchange will proceed subject-only (RFC 8693 still enforced — ' +
        'the user access token is never forwarded to MCP). However, the resulting MCP access token will have no act claim, ' +
        'so audit logs and the MCP server cannot distinguish the AI Agent from the user. ' +
        'Set AGENT_OAUTH_CLIENT_ID + AGENT_OAUTH_CLIENT_SECRET to enable full on-behalf-of delegation.',
      { rfc: 'RFC 8693 §2.1 (actor_token)' }
    ));
  }

  let actorToken = null;
  if (useActor) {
    try {
      actorToken = await oauthService.getAgentClientCredentialsToken();
      const a0Decoded = decodeJwtClaims(actorToken);
      tokenEvents.push(buildTokenEvent(
        'agent-actor-token',
        'Agent access token (client credentials)',
        'active',
        a0Decoded,
        `Client-credentials token for the dedicated Agent OAuth client (${process.env.AGENT_OAUTH_CLIENT_ID}). ` +
        'Used as actor_token in the RFC 8693 exchange — the resulting MCP access token will carry ' +
        'act: { client_id: agent-client } identifying the Agent as the current actor.',
        { rfc: 'RFC 8693 §2.1 (actor_token)' }
      ));
    } catch (err) {
      tokenEvents.push(buildTokenEvent(
        'agent-actor-token',
        'Agent access token',
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
    'Token exchange (RFC 8693): user access token → MCP access token',
    'acquiring',
    null,
    `Backend-for-Frontend (BFF) is exchanging the user access token for a delegated MCP access token scoped to audience=${mcpResourceUri}, ` +
    `scope="${effectiveToolScopes.join(' ')}". ` +
    (userAccessTokenClaims?.may_act
      ? `PingOne will validate may_act.client_id="${userAccessTokenClaims.may_act.client_id}" against the authenticated Backend-for-Frontend (BFF) client.`
      : 'PingOne will check exchange policy (may_act not present on user access token — exchange may be rejected).'),
    {
      rfc: 'RFC 8693 · RFC 8707 (resource indicator)',
      trigger: toolTrigger,
      exchangeRequest: {
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        audience: mcpResourceUri,
        scope: effectiveToolScopes.join(' '),
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
        userToken, actorToken, mcpResourceUri, effectiveToolScopes
      );
      exchangeMethod = 'with-actor';
    } else {
      exchangedToken = await oauthService.performTokenExchange(
        userToken, mcpResourceUri, effectiveToolScopes
      );
    }

    // Decode MCP access token to show act claim in the UI
    const mcpAccessTokenDecoded = decodeJwtClaims(exchangedToken);
    const mcpAccessTokenClaims = mcpAccessTokenDecoded?.claims;

    // Replace the in-progress event with the completed result
    const inProgressIdx = tokenEvents.findIndex(e => e.id === 'exchange-in-progress');
    if (inProgressIdx !== -1) tokenEvents.splice(inProgressIdx, 1);

    // Validate that the issued MCP access token's aud actually matches what was requested.
    const mcpTokenAud = mcpAccessTokenClaims?.aud;
    const audMatches = mcpTokenAud === mcpResourceUri ||
      (Array.isArray(mcpTokenAud) && mcpTokenAud.includes(mcpResourceUri));

    tokenEvents.push(buildTokenEvent(
      'exchanged-token',
      'MCP access token (delegated) → MCP server',
      'exchanged',
      mcpAccessTokenDecoded,
      'PingOne issued the MCP access token after validating may_act. ' +
      (mcpAccessTokenClaims?.act
        ? `act: ${JSON.stringify(mcpAccessTokenClaims.act)} — this is the current fact: the Backend-for-Frontend (BFF) is acting on behalf of the user. ` +
          'Resource servers use act (not may_act) to identify the current actor for audit and policy decisions.'
        : 'act claim not present — PingOne may not have applied delegation policy. ') +
      `Audience narrowed to ${mcpResourceUri} (aud=${JSON.stringify(mcpTokenAud)}${audMatches ? ' ✅' : ' ❌ mismatch'}), scope narrowed to "${effectiveToolScopes.join(' ')}". ` +
      'The user access token (your original login token) NEVER leaves the Backend-for-Frontend (BFF) — only the MCP access token reaches the MCP server.',
      {
        rfc: 'RFC 8693 · RFC 8707',
        trigger: toolTrigger,
        exchangeMethod,
        actPresent: !!mcpAccessTokenClaims?.act,
        actDetails: mcpAccessTokenClaims?.act ? JSON.stringify(mcpAccessTokenClaims.act) : null,
        audienceNarrowed: mcpResourceUri,
        audMatches,
        audExpected: mcpResourceUri,
        audActual: mcpTokenAud,
        scopeNarrowed: effectiveToolScopes.join(' '),
      }
    ));

    // Write success to cross-Lambda audit log (fire-and-forget)
    void writeExchangeEvent({
      type: 'exchange-success',
      level: 'info',
      message: `[TokenExchange] Issued MCP access token — audience=${mcpResourceUri} method=${exchangeMethod} act=${!!mcpAccessTokenClaims?.act}`,
      exchangeMethod,
      mcpResourceUri,
      scopeNarrowed: effectiveToolScopes.join(' '),
      actPresent: !!mcpAccessTokenClaims?.act,
      audMatches,
    });

    return { token: exchangedToken, tokenEvents, userSub };

  } catch (err) {
    // Replace in-progress with failure
    const inProgressIdx = tokenEvents.findIndex(e => e.id === 'exchange-in-progress');
    if (inProgressIdx !== -1) tokenEvents.splice(inProgressIdx, 1);

    // Build a human-readable summary from all available error detail
    const failParts = [
      `Exchange failed: ${err.message}`,
      err.httpStatus              ? `HTTP ${err.httpStatus}` : null,
      err.pingoneError            ? `error: ${err.pingoneError}` : null,
      err.pingoneErrorDescription && err.pingoneErrorDescription !== err.message
        ? `description: ${err.pingoneErrorDescription}` : null,
      err.pingoneErrorDetail      ? `detail: ${JSON.stringify(err.pingoneErrorDetail)}` : null,
    ].filter(Boolean).join(' — ');

    const guidanceMsg = userAccessTokenClaims?.may_act
      ? `may_act was present — check that PingOne has the token-exchange grant enabled on this client and the audience policy allows ${mcpResourceUri}.`
      : 'may_act was absent — add the may_act claim to the user access token via PingOne token policy, then retry.';

    tokenEvents.push(buildTokenEvent(
      'exchange-failed',
      'Token Exchange (RFC 8693) — Failed',
      'failed',
      null,
      `${failParts}. ${guidanceMsg}`,
      {
        error: err.message,
        httpStatus: err.httpStatus,
        pingoneError: err.pingoneError,
        pingoneErrorDescription: err.pingoneErrorDescription,
        pingoneErrorDetail: err.pingoneErrorDetail,
        requestContext: err.requestContext,
        rfc: 'RFC 8693',
        trigger: toolTrigger,
        mayActPresent: !!userAccessTokenClaims?.may_act,
      }
    ));

    // Write failure to cross-Lambda Redis audit log (fire-and-forget)
    void writeExchangeEvent({
      type: 'exchange-failed',
      level: 'error',
      message: `[TokenExchange] Failed — ${failParts}`,
      httpStatus: err.httpStatus,
      pingoneError: err.pingoneError,
      pingoneErrorDescription: err.pingoneErrorDescription,
      pingoneErrorDetail: err.pingoneErrorDetail,
      requestContext: err.requestContext,
      mcpResourceUri,
      mayActPresent: !!userAccessTokenClaims?.may_act,
      rfc: 'RFC 8693',
    });

    // Fallback: try subject-only if actor exchange failed
    if (actorToken) {
      try {
        exchangedToken = await oauthService.performTokenExchange(userToken, mcpResourceUri, effectiveToolScopes);
        const mcpAccessTokenDecodedFallback = decodeJwtClaims(exchangedToken);
        tokenEvents.push(buildTokenEvent(
          'exchanged-token',
          'MCP access token (subject-only fallback)',
          'exchanged',
          mcpAccessTokenDecodedFallback,
          'Agent access token exchange failed; fell back to subject-only RFC 8693 exchange (no act claim). ' +
          'The MCP access token is still scoped to the MCP audience — the user access token never leaves the Backend-for-Frontend (BFF).',
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
  buildSessionPreviewTokenEvents,
  decodeJwtClaims,
  sanitizeClaims,
  countJwtScopes,
  MIN_USER_SCOPES_FOR_MCP,
};
