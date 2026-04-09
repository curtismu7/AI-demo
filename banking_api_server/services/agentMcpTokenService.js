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
const { createTokenExchangeError, RFC8693_ERRORS } = require('./rfcCompliantErrorHandler');
const {
  parseAllowedScopesFromConfig,
  isToolPermittedByAgentPolicy,
  missingAgentPolicyScopes,
  scopesAreCatalogOnly,
} = require('./agentMcpScopePolicy');
const { MCP_TOOL_SCOPES, getSessionBearerForMcp } = require('./mcpWebSocketClient');
const adminTokenService = require('./adminTokenService');

/** Minimum distinct scopes on the User access token before RFC 8693 to MCP (so PingOne can narrow audience + scope). */
const MIN_USER_SCOPES_FOR_MCP = Math.max(
  1,
  parseInt(process.env.MIN_USER_SCOPES_FOR_MCP_EXCHANGE || '1', 10) || 1
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
  // Extract scopes for visibility
  const tokenScopes = userAccessTokenClaims?.scope
    ? String(userAccessTokenClaims.scope).split(/\s+/).filter(Boolean)
    : [];
  const scopeDisplay = tokenScopes.length > 0 ? tokenScopes.join(' ') : '(no scopes)';
  const hasAgentScope = tokenScopes.some(s => s.includes('agent'));
  const agentScopesInToken = tokenScopes.filter(s => s.includes('agent'));
  const scopeDetails = `Token carries ${tokenScopes.length} scope(s): ${scopeDisplay}` +
    (hasAgentScope ? `\n✓ Agent scopes: ${agentScopesInToken.join(', ')}` : `\n⚠️ NO agent scopes found`);

  tokenEvents.push(buildTokenEvent(
    'user-token',
    'User access token',
    'active',
    userAccessTokenDecoded,
    'Issued by PingOne after Authorization Code + PKCE login. ' +
    'Stored in the Backend-for-Frontend (BFF) session (server-side httpOnly cookie — never sent to the browser). ' +
    scopeDetails + '\n' +
    (userAccessTokenClaims?.may_act
      ? `Contains may_act: ${JSON.stringify(userAccessTokenClaims.may_act)} — this prospectively authorises the Backend-for-Frontend (BFF) to exchange this token. ${mayActInfo.reason}`
      : 'No may_act claim — PingOne must be configured to add may_act for token exchange to succeed.'),
    {
      rfc: 'RFC 7519 (JWT) · RFC 9068 (OAuth2 JWT AT)',
      tokenScopes,
      scopeCount: tokenScopes.length,
      hasAgentScope,
      agentScopesInToken,
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

  const mcpResourceUri = configStore.getEffective('pingone_resource_mcp_server_uri');
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
  let userToken = getSessionBearerForMcp(req);

  if (!userToken) {
    return { token: null, tokenEvents, userSub: null };
  }

  // ── Admin Token Detection ────────────────────────────────────────────────
  // Check if this is an admin session and use admin token as subject token
  const shouldUseAdmin = adminTokenService.shouldUseAdminTokenForTool(req, tool);
  
  if (shouldUseAdmin) {
    const adminToken = adminTokenService.getAdminTokenFromSession(req.session);
    if (adminToken) {
      tokenEvents.push(buildTokenEvent(
        'admin-token-detected',
        'Admin Token — Using admin token as subject',
        'active',
        null,
        'Admin session detected. Admin token will be used as subject token for MCP exchange.',
        { adminClientId: adminToken.clientId, adminScopes: adminToken.scopes }
      ));

      // Replace userToken with adminToken for the rest of the standard flow
      userToken = adminToken.accessToken;
      tokenEvents.push(buildTokenEvent(
        'admin-token-substituted',
        'Admin Token — Substituted admin token for user token',
        'success',
        null,
        'Admin token substituted for user token in standard token exchange flow.',
        { adminClientId: adminToken.clientId }
      ));
    } else {
      tokenEvents.push(buildTokenEvent(
        'admin-token-not-found',
        'Admin Token — Admin session but no admin token',
        'warning',
        null,
        'Admin session detected but no admin token found in session. Using user token.',
        null
      ));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const { userSub, userAccessTokenClaims: _rawUserClaims } = appendUserTokenEvent(tokenEvents, userToken, req);

  // ── RFC 8693 may_act Support Configuration ───────────────────────────────
  // DEPRECATED: Synthetic may_act injection via ff_inject_may_act (kept for backwards compatibility).
  // New code should use enableMayActSupport with PingOne token policies for RFC 8693 compliance.
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
      // DEPRECATED: Patch claims in memory only — the JWT itself is unchanged.
      // This is a backwards-compatibility shortcut. For production RFC 8693 compliance,
      // configure PingOne to add may_act natively via token policy + enableMayActSupport.
      userAccessTokenClaims = { ...userAccessTokenClaims, may_act: { client_id: bffClientId } };
      // Update the user-token event that was just pushed to reflect the injection.
      const utEvent = tokenEvents.find(e => e.id === 'user-token');
      if (utEvent) {
        utEvent.mayActPresent = true;
        utEvent.mayActValid   = true;
        utEvent.mayActInjected = true;
        utEvent.mayActDetails =
          `may_act synthesised by BFF (ff_inject_may_act = true): { client_id: "${bffClientId}" }. ` +
          'DEPRECATED: This is a demo/dev shortcut — enable may_act in your PingOne token policy and set enableMayActSupport=true for RFC 8693 compliance.';
        utEvent.explanation =
          (utEvent.explanation || '') +
          ` [BFF-INJECTED may_act: { client_id: "${bffClientId}" } — enable ff_inject_may_act is ON — DEPRECATED]`;
      }
      tokenEvents.push(buildTokenEvent(
        'may-act-injected',
        'may_act — BFF synthetic injection (DEPRECATED)',
        'active',
        null,
        `ff_inject_may_act is ON. The user access token had no may_act claim so the BFF has ` +
          `synthesised { client_id: "${bffClientId}" } in memory before attempting RFC 8693 token exchange. ` +
          'DEPRECATED: This is a demo/dev shortcut. For production RFC 8693 compliance, configure PingOne to add may_act natively ' +
          'via an attribute mapping expression, enable enableMayActSupport=true, then disable this flag.',
        { rfc: 'RFC 8693 §4.1', synthetic: true, deprecated: true, injectedValue: { client_id: bffClientId } }
      ));
    }
  }
  
  // ── RFC 8693 may_act Support Configuration (Production) ──────────────────
  // Validate RFC 8693-compliant may_act claims from PingOne token policies (not synthetic injection).
  const mayActSupported = configStore.getEffective('enableMayActSupport') === true ||
    configStore.getEffective('enableMayActSupport') === 'true';
  // ─────────────────────────────────────────────────────────────────────────

  // ── ff_skip_token_exchange — direct user token path (no RFC 8693) ────────
  // When ON the user access token is forwarded to MCP unchanged. No actor token
  // is acquired and no exchange is performed. Useful when PingOne is not yet
  // configured for token exchange. The alternative (OFF) is the full on-behalf-of
  // exchange: agent client-credentials token + RFC 8693 → scoped MCP token + act claim.
  const ffSkipExchange =
    configStore.getEffective('ff_skip_token_exchange') === true ||
    configStore.getEffective('ff_skip_token_exchange') === 'true';
  if (ffSkipExchange) {
    tokenEvents.push(buildTokenEvent(
      'exchange-skipped',
      'Token Exchange (RFC 8693) — Bypassed',
      'skipped',
      null,
      'ff_skip_token_exchange is ON. The user access token is passed directly to the MCP server without RFC 8693 exchange. ' +
        'The MCP server receives the user\'s original token (no act claim, no audience narrowing). ' +
        'Alternative — turn this flag OFF: the BFF performs a full RFC 8693 on-behalf-of exchange, ' +
        'minting a scoped MCP token with act: { client_id: <agent> } for audit provenance. ' +
        'In production always use token exchange.',
      { rfc: 'RFC 8693', bypass: true }
    ));
    return { token: userToken, tokenEvents, userSub };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const mcpResourceUri = configStore.getEffective('pingone_resource_mcp_server_uri');
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
  // If none of the tool's required scopes are in the user token (e.g. user logged in with
  // banking:ai:agent:read only when ENDUSER_AUDIENCE is set), fall back to any banking:*
  // scope the user token carries — but EXCLUDE pure delegation scopes
  // (banking:ai:agent:read, ai_agent) because they are not valid resource-access scopes on
  // the MCP resource server. Using them as the exchange scope causes PingOne to return
  // "At least one scope must be granted" since they are absent from the MCP resource's
  // scope registry.  Instead, fall through to toolCandidateScopes so PingOne evaluates the
  // exchange against the actual tool scopes it does know about (banking:write, etc.).
  // PingOne's token exchange policy — configured on the MCP resource — decides whether to
  // grant those scopes when the subject token carries the delegation scope (banking:ai:agent:read).
  const DELEGATION_ONLY_SCOPES = new Set(['banking:ai:agent:read', 'ai_agent']);
  const fallbackScopes = toolScopes.length > 0
    ? null
    : [...userTokenScopes].filter(
        (s) => (s.startsWith('banking:') || s === 'ai_agent') && !DELEGATION_ONLY_SCOPES.has(s)
      );
  const effectiveToolScopes = toolScopes.length > 0
    ? toolScopes
    : (fallbackScopes && fallbackScopes.length > 0 ? fallbackScopes : toolCandidateScopes);

  // Safety check: ensure we have at least one valid scope for token exchange
  // If all scopes are delegation-only, use a minimal banking:read scope to avoid "At least one scope must be granted"
  const validExchangeScopes = effectiveToolScopes.filter(scope => !DELEGATION_ONLY_SCOPES.has(scope));
  const finalScopes = validExchangeScopes.length > 0 ? validExchangeScopes : ['banking:read'];

  // ── Comprehensive scope-resolution debug log ──────────────────────────────
  console.log(
    '[TokenExchange:DEBUG] tool=%s | userScopes=[%s] | toolCandidateScopes=[%s] | ' +
    'toolScopes=[%s] | fallbackScopes=[%s] | effectiveToolScopes=[%s] | finalScopes=[%s] | ' +
    'mcpResourceUri=%s | ENDUSER_AUDIENCE=%s',
    tool,
    [...userTokenScopes].join(',') || '(none)',
    toolCandidateScopes.join(','),
    toolScopes.join(',') || '(none — no tool scopes in user token)',
    (fallbackScopes || []).join(',') || '(none)',
    effectiveToolScopes.join(','),
    finalScopes.join(','),
    mcpResourceUri || '(not set)',
    process.env.ENDUSER_AUDIENCE || '(not set)'
  );

  // ── Pre-exchange bail-out: skip when exchange is guaranteed to fail ────────
  // PingOne token exchange can ONLY narrow scopes — it cannot grant a scope that the
  // subject token does not already carry.  When none of finalScopes appear in the user
  // token (common when ENDUSER_AUDIENCE is set and login scope is banking:ai:agent:read
  // only), the exchange will always return "At least one scope must be granted" (HTTP 400).
  // Detecting this upfront avoids the round-trip to PingOne and routes directly to the
  // local tool fallback in server.js without surfacing a confusing error to the user.
  //
  // Exception: if ff_skip_token_exchange is ON we never reach this point (returned above).
  // Exception: if user token carries banking:ai:agent:read — the delegation scope that authorises
  //            the agent to invoke the MCP server.  PingOne's token exchange policy on the MCP
  //            resource decides whether to grant banking scopes from this delegation scope, so
  //            we must NOT pre-block the exchange.  Pass through and let PingOne adjudicate.
  // Exception: if PingOne has a cross-scope grant policy for banking:ai:agent:read → banking:write,
  //            set ALLOW_AGENT_INVOKE_EXCHANGE=true to bypass this early-exit (legacy env override).
  const allowAgentInvokeExchange = process.env.ALLOW_AGENT_INVOKE_EXCHANGE === 'true';
  // Auto-bypass: user holds the agent delegation scope — PingOne token-exchange policy decides.
  const userHasAgentInvokeScope = userTokenScopes.has('banking:ai:agent:read') || userTokenScopes.has('banking:ai:agent:read');
  const scopesMissingFromUserToken = finalScopes.every(s => !userTokenScopes.has(s));
  if (scopesMissingFromUserToken && !allowAgentInvokeExchange && !userHasAgentInvokeScope) {
    const userScopesStr = [...userTokenScopes].join(' ') || '(none)';
    // The pre-condition for the agent/MCP path is banking:ai:agent:read, not the downstream banking scopes.
    // Showing banking scopes here would misdirect the user — they need to obtain banking:ai:agent:read first.
    const requiredStr = 'banking:ai:agent:read';
    console.warn(
      '[TokenExchange:BLOCKED] tool=%s — user token [%s] lacks banking:ai:agent:read and has none of finalScopes [%s]. ' +
      'The agent/MCP path requires banking:ai:agent:read on the user token. ' +
      'Fix: add banking:ai:agent:read (banking:ai:agent:read) to PingOne user app scopes and re-login. ' +
      'Or enable ff_skip_token_exchange. ' +
      'Or set ALLOW_AGENT_INVOKE_EXCHANGE=true if PingOne grants banking scopes from banking:ai:agent:read.',
      tool, userScopesStr, finalScopes.join(',')
    );
    tokenEvents.push(buildTokenEvent(
      'exchange-blocked',
      'Token Exchange (RFC 8693) — Blocked: banking:ai:agent:read scope not on user token',
      'failed',
      null,
      `User access token does not carry banking:ai:agent:read (banking:ai:agent:read) — the scope that authorises the agent to call the MCP server. ` +
      `User token scopes: [${userScopesStr}]. ` +
      `Fix: add banking:ai:agent:read to the PingOne user app allowed scopes and sign in again.`,
      {
        rfc: 'RFC 8693 §2.1',
        trigger: toolTrigger,
        userScopes: userScopesStr,
        requiredScopes: requiredStr,
        blockReason: 'agent_invoke_scope_not_on_subject_token',
        enduserAudience: process.env.ENDUSER_AUDIENCE || null,
      }
    ));
    const scopeErr = new Error(
      `Token exchange blocked: your access token has [${userScopesStr}] but the agent/MCP path requires [${requiredStr}]. ` +
      `Add banking:ai:agent:read (banking:ai:agent:read) to the PingOne user app, then sign out and sign back in.`
    );
    scopeErr.code        = 'missing_exchange_scopes';
    scopeErr.httpStatus  = 403;
    scopeErr.tokenEvents = tokenEvents;
    scopeErr.missingScopes   = ['banking:ai:agent:read'];
    scopeErr.userScopes      = userScopesStr;
    scopeErr.requiredScopes  = requiredStr;
    throw scopeErr;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── 2-Exchange delegation path ──────────────────────────────────────────────────
  // ff_two_exchange_delegation: Subject Token → (AI Agent) → Agent Exchanged Token → (MCP) → Final Token
  // Produces nested act claim: act.sub=MCP_CLIENT_ID, act.act.sub=AI_AGENT_CLIENT_ID
  const sessionExchangeMode = req && req.session ? req.session.mcpExchangeMode : undefined;
  const ffTwoExchange =
    sessionExchangeMode === 'double' ||
    (sessionExchangeMode == null && (
      configStore.getEffective('ff_two_exchange_delegation') === true ||
      configStore.getEffective('ff_two_exchange_delegation') === 'true'
    ));
  if (ffTwoExchange) {
    return await _performTwoExchangeDelegation(
      tokenEvents, userToken, userAccessTokenClaims, finalScopes, userSub, toolTrigger, mcpResourceUri
    );
  }
  // ────────────────────────────────────────────────────────────────────

  // Always use actor token when agent OAuth client is configured — ensures on_behalf_of semantics
  // (the exchanged MCP token carries act: { client_id: <agent> } proving which client is acting).
  // Without PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID the exchange runs subject-only (still RFC 8693; user token
  // is NEVER forwarded to MCP — but the act claim is absent, weakening audit provenance).
  const useActor = !!(configStore.getEffective('pingone_mcp_token_exchanger_client_id') || process.env.AGENT_OAUTH_CLIENT_ID);

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

  // ── Optional BFF synthetic audience injection ─────────────────────────────
  // When ff_inject_audience is true and the user token's aud claim does not already
  // include mcp_resource_uri, the BFF adds it to the local claim snapshot in memory.
  // Some PingOne token-exchange policies require the subject token to be valid for the
  // requested audience (RFC 8707 resource indicators). Educational/demo only — the JWT
  // itself is unchanged; only the BFF's internal snapshot is updated for Token Chain display.
  const ffInjectAudience =
    configStore.getEffective('ff_inject_audience') === true ||
    configStore.getEffective('ff_inject_audience') === 'true';

  if (ffInjectAudience && userAccessTokenClaims) {
    const currentAud = userAccessTokenClaims.aud;
    const audArr = Array.isArray(currentAud) ? currentAud : (currentAud ? [currentAud] : []);
    const audAlreadyPresent = audArr.includes(mcpResourceUri);

    if (!audAlreadyPresent) {
      userAccessTokenClaims = { ...userAccessTokenClaims, aud: [...audArr, mcpResourceUri] };
      const utEvent = tokenEvents.find(e => e.id === 'user-token');
      if (utEvent) {
        utEvent.audInjected = true;
        utEvent.explanation =
          (utEvent.explanation || '') +
          ` [BFF-INJECTED aud: "${mcpResourceUri}" — enable ff_inject_audience is ON]`;
      }
      tokenEvents.push(buildTokenEvent(
        'audience-injected',
        'Audience — BFF synthetic injection',
        'active',
        null,
        `ff_inject_audience is ON. The user access token's aud claim (${JSON.stringify(currentAud)}) did not include ` +
          `the MCP resource URI "${mcpResourceUri}". ` +
          `The BFF has added "${mcpResourceUri}" to the aud claim snapshot in memory before RFC 8693 exchange. ` +
          'Some PingOne token-exchange policies require the subject token to carry the resource URI in its aud ' +
          '(RFC 8707 resource indicators). The JWT itself is unchanged — only the local claim snapshot is updated. ' +
          'Configure PingOne to include the resource URI in issued access tokens to remove this shortcut.',
        { rfc: 'RFC 8693 §2.1 · RFC 8707', synthetic: true, injectedValue: mcpResourceUri }
      ));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

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
      '[agentMcpTokenService] PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID not set — RFC 8693 exchange will run subject-only ' +
      '(no act claim). Set PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID + PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET (Super Banking MCP Token Exchanger) for full on_behalf_of semantics.'
    );
    tokenEvents.push(buildTokenEvent(
      'on-behalf-of-warning',
      'On-Behalf-Of — agent client not configured',
      'skipped',
      null,
      'PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID is not set. The token exchange will proceed subject-only (RFC 8693 still enforced — ' +
        'the user access token is never forwarded to MCP). However, the resulting MCP access token will have no act claim, ' +
        'so audit logs and the MCP server cannot distinguish the AI Agent from the user. ' +
        'Set PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID + PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET (PingOne: Super Banking MCP Token Exchanger) to enable full on-behalf-of delegation.',
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
    `scope="${finalScopes.join(' ')}". ` +
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
        scope: finalScopes.join(' '),
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
        userToken, actorToken, mcpResourceUri, finalScopes
      );
      exchangeMethod = 'with-actor';
    } else {
      exchangedToken = await oauthService.performTokenExchange(
        userToken, mcpResourceUri, finalScopes
      );
    }

    // Decode MCP access token to show act claim in the UI
    const mcpAccessTokenDecoded = decodeJwtClaims(exchangedToken);
    const mcpAccessTokenClaims = mcpAccessTokenDecoded?.claims;

    // ── RFC 8693 §3: Subject Preservation Validation ────────────────────────
    // Verify that the exchanged token preserves the original user's subject claim.
    if (exchangedToken && mcpAccessTokenClaims && mcpAccessTokenClaims.sub && mcpAccessTokenClaims.sub !== userSub) {
      logger.warn('[RFC 8693 SECURITY] Subject mismatch in token exchange', {
        original_sub: userSub,
        exchanged_sub: mcpAccessTokenClaims.sub,
        audience: mcpResourceUri,
        scope: finalScopes.join(' '),
      });
      tokenEvents.push(buildTokenEvent(
        'subject-preservation-mismatch',
        'RFC 8693 Subject — Mismatch Detected',
        'warning',
        null,
        `Subject claim mismatch detected in token exchange. Original: ${userSub}, Exchanged: ${mcpAccessTokenClaims.sub}. RFC 8693 §3 requires subject preservation.`,
        {
          rfc: 'RFC 8693 §3',
          original_sub: userSub,
          exchanged_sub: mcpAccessTokenClaims.sub,
        }
      ));
    }
    // ─────────────────────────────────────────────────────────────────────────

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

// ─── 2-Exchange delegation helper ──────────────────────────────────────────────────

/**
 * Perform the 2-exchange delegated chain:
 *   Step 1: AI Agent gets actor CC token (audience = AGENT_GATEWAY_AUDIENCE)
 *   Step 2: Exchange #1 — Subject Token + Agent Actor Token → Agent Exchanged Token
 *           exchanger = AI_AGENT_CLIENT_ID, audience = AI_AGENT_INTERMEDIATE_AUDIENCE
 *   Step 3: MCP Service gets actor CC token (audience = MCP_GATEWAY_AUDIENCE)
 *   Step 4: Exchange #2 — Agent Exchanged Token + MCP Actor Token → Final Token
 *           exchanger = AGENT_OAUTH_CLIENT_ID, audience = mcpResourceUri
 *   Result: Final Token has act.sub = MCP_CLIENT_ID, act.act.sub = AI_AGENT_CLIENT_ID
 */
async function _performTwoExchangeDelegation(
  tokenEvents, userToken, userAccessTokenClaims, effectiveToolScopes, userSub, toolTrigger, mcpResourceUri
) {
  const aiAgentClientId     = configStore.getEffective('ai_agent_client_id') || process.env.AI_AGENT_CLIENT_ID || '';
  const aiAgentClientSecret = process.env.AI_AGENT_CLIENT_SECRET || '';
  const agentGatewayAud     = configStore.getEffective('agent_gateway_audience') || 'https://agent-gateway.pingdemo.com';
  let   intermediateAud     = configStore.getEffective('ai_agent_intermediate_audience') || '';
  if (!intermediateAud) intermediateAud = 'https://mcp-server.pingdemo.com';
  const mcpGatewayAud       = configStore.getEffective('mcp_gateway_audience') || 'https://mcp-gateway.pingdemo.com';
  // Exchange #2 output audience — must point to Super Banking Resource Server (https://resource-server.pingdemo.com),
  // NOT the 1-exchange Super Banking MCP Server (https://mcp-server.pingdemo.com).
  // Using the 1-exchange audience triggers the wrong `act` expression (may_act.sub check instead of
  // act.sub forward) → act=null with Required=true → PingOne rejects Exchange #2 with invalid_grant.
  const twoExFinalAud = configStore.getEffective('mcp_resource_uri_two_exchange') || 'https://resource-server.pingdemo.com';
  const mcpExchangerClient  = process.env.AGENT_OAUTH_CLIENT_ID || '';
  const mcpExchangerSecret  = process.env.AGENT_OAUTH_CLIENT_SECRET || '';
  // Auth method env vars — default 'basic' (CLIENT_SECRET_BASIC) matching PingOne app config
  const aiAgentAuthMethod      = (process.env.AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();
  const mcpExchangerAuthMethod = (process.env.MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();

  // Pre-flight check: all required credentials must be present
  const missingVars = [];
  if (!aiAgentClientId)     missingVars.push('AI_AGENT_CLIENT_ID (or ai_agent_client_id config)');
  if (!aiAgentClientSecret) missingVars.push('AI_AGENT_CLIENT_SECRET');
  if (!mcpExchangerClient)  missingVars.push('AGENT_OAUTH_CLIENT_ID');
  if (!mcpExchangerSecret)  missingVars.push('AGENT_OAUTH_CLIENT_SECRET');

  if (missingVars.length > 0) {
    tokenEvents.push(buildTokenEvent(
      'two-exchange-not-configured',
      '2-Exchange Delegation — Not Configured',
      'failed',
      null,
      `ff_two_exchange_delegation is ON but required credentials are missing: ${missingVars.join(', ')}. ` +
        'Set these env vars and re-deploy. See docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md for setup guide.',
      { missingVars, rfc: 'RFC 8693' }
    ));
    throw createTokenExchangeError('exchange_not_configured', {
      exchangeType: 'double',
      exchangeStep: 'configuration',
      actorPresent: false,
      missingVars,
      rfc: 'RFC 8693'
    });
  }

  // ─ Step 1: AI Agent Actor Token (Client Credentials) ───────────────────────────
  tokenEvents.push(buildTokenEvent(
    'two-ex-agent-actor-acquiring',
    '2-Exchange #1 — AI Agent Actor Token (CC)',
    'acquiring',
    null,
    `AI Agent App (${aiAgentClientId}) getting Client Credentials actor token. ` +
      `Audience: ${agentGatewayAud} (Super Banking Agent Gateway).`,
    { rfc: 'RFC 8693 §2.1 (actor_token)', exchangeStep: '1-actor' }
  ));

  let agentActorToken;
  try {
    agentActorToken = await oauthService.getClientCredentialsTokenAs(aiAgentClientId, aiAgentClientSecret, agentGatewayAud, aiAgentAuthMethod);
    const agentActorDecoded = decodeJwtClaims(agentActorToken);
    const actorIdx = tokenEvents.findIndex(e => e.id === 'two-ex-agent-actor-acquiring');
    if (actorIdx !== -1) tokenEvents.splice(actorIdx, 1);
    tokenEvents.push(buildTokenEvent(
      'two-ex-agent-actor',
      '2-Exchange #1 — AI Agent Actor Token (CC) ✔️',
      'active',
      agentActorDecoded,
      `AI Agent App (${aiAgentClientId}) obtained its Client Credentials actor token. ` +
        `aud=${agentGatewayAud}. Used as actor_token in Exchange #1.`,
      { rfc: 'RFC 8693 §2.1', exchangeStep: '1-actor' }
    ));
  } catch (err) {
    const actorIdx = tokenEvents.findIndex(e => e.id === 'two-ex-agent-actor-acquiring');
    if (actorIdx !== -1) tokenEvents.splice(actorIdx, 1);
    tokenEvents.push(buildTokenEvent(
      'two-ex-agent-actor',
      '2-Exchange #1 — AI Agent Actor Token ❌',
      'failed',
      null,
      `AI Agent client credentials failed: ${err.message}. Check AI_AGENT_CLIENT_ID and AI_AGENT_CLIENT_SECRET.`,
      { error: err.message, exchangeStep: '1-actor' }
    ));
    throw createTokenExchangeError('actor_token_invalid', {
      exchangeType: 'double',
      exchangeStep: '1-actor',
      actorPresent: false,
      audience: agentGatewayAud,
      originalError: err
    }, err);
  }

  // ─ Step 2: Exchange #1 — Subject Token + Agent Actor Token → Agent Exchanged Token ─────
  tokenEvents.push(buildTokenEvent(
    'two-ex-exchange1-in-progress',
    '2-Exchange #1 — Subject Token → Agent Exchanged Token',
    'acquiring',
    null,
    `Exchange #1 (RFC 8693): exchanger=${aiAgentClientId}, ` +
      `subject=Subject Token (may_act.sub must equal actor_token.aud[0]=${aiAgentClientId}), ` +
      `audience=${intermediateAud}, scope="${effectiveToolScopes.join(' ')}".`,
    { rfc: 'RFC 8693', exchangeStep: '1-exchange',
      exchangeRequest: { exchanger: aiAgentClientId, audience: intermediateAud, scope: effectiveToolScopes.join(' ') } }
  ));

  let agentExchangedToken;
  try {
    agentExchangedToken = await oauthService.performTokenExchangeAs(
      userToken, agentActorToken, aiAgentClientId, aiAgentClientSecret, intermediateAud, effectiveToolScopes, aiAgentAuthMethod
    );
    const agentExchangedDecoded = decodeJwtClaims(agentExchangedToken);
    const agentExchangedClaims = agentExchangedDecoded?.claims;
    const ex1Idx = tokenEvents.findIndex(e => e.id === 'two-ex-exchange1-in-progress');
    if (ex1Idx !== -1) tokenEvents.splice(ex1Idx, 1);
    tokenEvents.push(buildTokenEvent(
      'two-ex-exchange1',
      '2-Exchange #1 — Agent Exchanged Token ✔️',
      'exchanged',
      agentExchangedDecoded,
      `Exchange #1 succeeded. Agent Exchanged Token (Token 2): aud=${JSON.stringify(agentExchangedClaims?.aud)}, ` +
        `act=${JSON.stringify(agentExchangedClaims?.act)}. ` +
        'act.sub records that the AI Agent performed this exchange. Now performing Exchange #2.',
      { rfc: 'RFC 8693', exchangeStep: '1-exchange',
        actPresent: !!agentExchangedClaims?.act,
        actDetails: agentExchangedClaims?.act ? JSON.stringify(agentExchangedClaims.act) : null }
    ));
  } catch (err) {
    const ex1Idx = tokenEvents.findIndex(e => e.id === 'two-ex-exchange1-in-progress');
    if (ex1Idx !== -1) tokenEvents.splice(ex1Idx, 1);
    const guidanceMsg = userAccessTokenClaims?.may_act
      ? `may_act.sub="${userAccessTokenClaims.may_act.sub}" must equal AI_AGENT_CLIENT_ID="${aiAgentClientId}".`
      : 'may_act claim missing from Subject Token. Set mayAct.sub = AI_AGENT_CLIENT_ID on the user record (DemoData page → 2-Exchange mode), then sign out and back in.';
    tokenEvents.push(buildTokenEvent(
      'two-ex-exchange1',
      '2-Exchange #1 — Subject Token exchange failed ❌',
      'failed',
      null,
      `Exchange #1 failed: ${err.message}. ${guidanceMsg}`,
      { error: err.message, httpStatus: err.httpStatus, pingoneError: err.pingoneError,
        pingoneErrorDescription: err.pingoneErrorDescription, exchangeStep: '1-exchange' }
    ));
    void writeExchangeEvent({ type: 'exchange-failed', level: 'error',
      message: `[2-Exchange#1] Failed — ${err.message}`, exchangeStep: '1', pingoneError: err.pingoneError });
    throw createTokenExchangeError('invalid_grant', {
      exchangeType: 'double',
      exchangeStep: '1-exchange',
      actorPresent: true,
      audience: intermediateAud,
      scopes: effectiveToolScopes,
      originalError: err
    }, err);
  }

  // ─ Step 3: MCP Actor Token (Client Credentials) ──────────────────────────────
  tokenEvents.push(buildTokenEvent(
    'two-ex-mcp-actor-acquiring',
    '2-Exchange #2 — MCP Actor Token (CC)',
    'acquiring',
    null,
    `MCP Service App (${mcpExchangerClient}) getting Client Credentials actor token. ` +
      `Audience: ${mcpGatewayAud} (Super Banking MCP Gateway).`,
    { rfc: 'RFC 8693 §2.1 (actor_token)', exchangeStep: '2-actor' }
  ));

  let mcpActorToken;
  try {
    mcpActorToken = await oauthService.getClientCredentialsTokenAs(mcpExchangerClient, mcpExchangerSecret, mcpGatewayAud, mcpExchangerAuthMethod);
    const mcpActorDecoded = decodeJwtClaims(mcpActorToken);
    const mcpActorIdx = tokenEvents.findIndex(e => e.id === 'two-ex-mcp-actor-acquiring');
    if (mcpActorIdx !== -1) tokenEvents.splice(mcpActorIdx, 1);
    tokenEvents.push(buildTokenEvent(
      'two-ex-mcp-actor',
      '2-Exchange #2 — MCP Actor Token (CC) ✔️',
      'active',
      mcpActorDecoded,
      `MCP Service App (${mcpExchangerClient}) obtained its Client Credentials actor token. ` +
        `aud=${mcpGatewayAud}. Used as actor_token in Exchange #2.`,
      { rfc: 'RFC 8693 §2.1', exchangeStep: '2-actor' }
    ));
  } catch (err) {
    const mcpActorIdx = tokenEvents.findIndex(e => e.id === 'two-ex-mcp-actor-acquiring');
    if (mcpActorIdx !== -1) tokenEvents.splice(mcpActorIdx, 1);
    tokenEvents.push(buildTokenEvent(
      'two-ex-mcp-actor',
      '2-Exchange #2 — MCP Actor Token ❌',
      'failed',
      null,
      `MCP Service client credentials failed: ${err.message}. Check AGENT_OAUTH_CLIENT_ID and AGENT_OAUTH_CLIENT_SECRET.`,
      { error: err.message, exchangeStep: '2-actor' }
    ));
    throw createTokenExchangeError('actor_token_invalid', {
      exchangeType: 'double',
      exchangeStep: '2-actor',
      actorPresent: false,
      audience: mcpGatewayAud,
      originalError: err
    }, err);
  }

  // ─ Step 4: Exchange #2 — Agent Exchanged Token + MCP Actor Token → Final Token ────
  tokenEvents.push(buildTokenEvent(
    'two-ex-exchange2-in-progress',
    '2-Exchange #2 — Agent Exchanged Token → Final MCP Token',
    'acquiring',
    null,
    `Exchange #2 (RFC 8693): exchanger=${mcpExchangerClient}, ` +
      `subject=Agent Exchanged Token (act.sub must equal actor_token.aud[0]=${mcpExchangerClient}), ` +
      `audience=${twoExFinalAud} (Super Banking Resource Server). act expression forwards act.sub from Agent Exchanged Token.`,
    { rfc: 'RFC 8693', exchangeStep: '2-exchange',
      exchangeRequest: { exchanger: mcpExchangerClient, audience: mcpResourceUri, scope: effectiveToolScopes.join(' ') } }
  ));

  let finalToken;
  try {
    finalToken = await oauthService.performTokenExchangeAs(
      agentExchangedToken, mcpActorToken, mcpExchangerClient, mcpExchangerSecret, twoExFinalAud, effectiveToolScopes, mcpExchangerAuthMethod
    );
    const finalDecoded = decodeJwtClaims(finalToken);
    const finalClaims  = finalDecoded?.claims;
    const ex2Idx = tokenEvents.findIndex(e => e.id === 'two-ex-exchange2-in-progress');
    if (ex2Idx !== -1) tokenEvents.splice(ex2Idx, 1);
    const mcpTokenAud = finalClaims?.aud;
    const audMatches  = mcpTokenAud === twoExFinalAud || (Array.isArray(mcpTokenAud) && mcpTokenAud.includes(twoExFinalAud));
    const nestedActOk = !!finalClaims?.act?.sub && !!finalClaims?.act?.act?.sub;
    tokenEvents.push(buildTokenEvent(
      'two-ex-final-token',
      '2-Exchange: Final MCP Token (nested act chain) ✔️',
      'exchanged',
      finalDecoded,
      'Both RFC 8693 exchanges succeeded. Final MCP Token (Token 3): ' +
        `aud=${JSON.stringify(mcpTokenAud)}${audMatches ? ' ✅' : ' ❌ mismatch'}, ` +
        `act.sub=${finalClaims?.act?.sub ?? '—'} (MCP Service), ` +
        `act.act.sub=${finalClaims?.act?.act?.sub ?? '—'} (AI Agent). ` +
        (nestedActOk
          ? 'Full delegation chain verified. PAZ can enforce both act.sub and act.act.sub as named policy attributes.'
          : finalClaims?.act?.sub
            ? `Delegation chain recorded: act.sub=${finalClaims.act.sub} (AI Agent identity preserved). ` +
              'PingOne SpEL cannot construct fully-nested act objects — act.sub reflects the AI Agent as delegation initiator. ' +
              'PAZ can enforce act.sub as a policy attribute. See docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md §1e.'
            : 'WARNING: act claim missing from Final Token — check act expression on Super Banking Resource Server (docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md §1e).'),
      { rfc: 'RFC 8693', exchangeStep: '2-exchange', exchangeMethod: '2-exchange',
        actPresent: !!finalClaims?.act,
        actDetails: finalClaims?.act ? JSON.stringify(finalClaims.act) : null,
        nestedActPresent: nestedActOk,
        audienceNarrowed: twoExFinalAud, audMatches,
        audExpected: twoExFinalAud, audActual: mcpTokenAud,
        scopeNarrowed: effectiveToolScopes.join(' ') }
    ));

    void writeExchangeEvent({
      type: 'exchange-success', level: 'info',
      message: `[2-Exchange] Final token issued — audience=${mcpResourceUri} act=${!!finalClaims?.act} nestedAct=${nestedActOk}`,
      exchangeMethod: '2-exchange', mcpResourceUri,
      actPresent: !!finalClaims?.act, nestedActPresent: nestedActOk, audMatches,
    });

    return { token: finalToken, tokenEvents, userSub };

  } catch (err) {
    const ex2Idx = tokenEvents.findIndex(e => e.id === 'two-ex-exchange2-in-progress');
    if (ex2Idx !== -1) tokenEvents.splice(ex2Idx, 1);
    tokenEvents.push(buildTokenEvent(
      'two-ex-final-token',
      '2-Exchange #2 — Final exchange failed ❌',
      'failed',
      null,
      `Exchange #2 failed: ${err.message}. ` +
        'Check that act.sub on the Agent Exchanged Token matches AGENT_OAUTH_CLIENT_ID ' +
        'and that the act expression on Super Banking MCP Server resource server is correct.',
      { error: err.message, httpStatus: err.httpStatus, pingoneError: err.pingoneError,
        pingoneErrorDescription: err.pingoneErrorDescription, exchangeStep: '2-exchange' }
    ));
    void writeExchangeEvent({ type: 'exchange-failed', level: 'error',
      message: `[2-Exchange#2] Failed — ${err.message}`, pingoneError: err.pingoneError });
    throw createTokenExchangeError('delegation_chain_broken', {
      exchangeType: 'double',
      exchangeStep: '2-exchange',
      actorPresent: true,
      audience: twoExFinalAud,
      scopes: effectiveToolScopes,
      originalError: err
    }, err);
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
