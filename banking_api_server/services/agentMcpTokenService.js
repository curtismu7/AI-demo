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

const DEBUG = process.env.DEBUG_AGENT_MCP === 'true';
function debugLog(...args) {
  if (DEBUG) {
    console.log('[AGENT_MCP_DEBUG]', ...args);
  }
}

// Always log critical errors regardless of DEBUG flag
function errorLog(...args) {
  console.error('[AGENT_MCP_ERROR]', ...args);
}

// Always log critical warnings regardless of DEBUG flag
function warnLog(...args) {
  console.warn('[AGENT_MCP_WARN]', ...args);
}

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
const { trackTokenEvent } = require('./tokenChainService');
const { trackToken } = require('./apiCallTrackerService');

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
  console.log('[AGENT_MCP] === RESOLVE MCP ACCESS TOKEN START ===');
  console.log('[AGENT_MCP] Tool:', tool);
  console.log('[AGENT_MCP] Session ID:', req.sessionID);
  console.log('[AGENT_MCP] Session exists:', !!req.session);
  console.log('[AGENT_MCP] Session keys:', req.session ? Object.keys(req.session) : 'none');
  
  const tokenEvents = [];
  let userToken = getSessionBearerForMcp(req);

  console.log('[AGENT_MCP] User token from session:', userToken ? 'PRESENT' : 'MISSING');

  if (!userToken) {
    errorLog('ERROR: No user token in session - returning null');
    console.log('[AGENT_MCP] oauthTokens present:', !!req.session?.oauthTokens);
    console.log('[AGENT_MCP] oauthTokens keys:', req.session?.oauthTokens ? Object.keys(req.session.oauthTokens) : 'none');
    return { token: null, tokenEvents, userSub: null };
  }

  // ── Admin Token Detection ────────────────────────────────────────────────
  // Check if this is an admin session and use admin token as subject token
  const shouldUseAdmin = adminTokenService.shouldUseAdminTokenForTool(req, tool);
  console.log('[AGENT_MCP] Should use admin token:', shouldUseAdmin);
  
  if (shouldUseAdmin) {
    const adminToken = adminTokenService.getAdminTokenFromSession(req.session);
    console.log('[AGENT_MCP] Admin token from session:', adminToken ? 'PRESENT' : 'MISSING');
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

  // ── Scope resolution: no fallbacks (RFC 8693 §2.1 + RFC 8707) ────────────
  // Two explicit paths — no silent fallbacks, no hard-coded defaults:
  //
  // Path A — Direct intersection: user token carries at least one tool scope
  //   → finalScopes = toolCandidateScopes ∩ userTokenScopes
  //
  // Path B — Delegation: user token carries banking:ai:agent:read
  //   → PingOne token-exchange policy on the MCP resource decides whether to
  //     grant the tool's scopes from the delegation scope. Pass toolCandidateScopes
  //     directly and let PingOne adjudicate.
  //
  // Anything else → fail fast with a clear error message.
  //
  // DELEGATION_ONLY_SCOPES are NOT valid resource-access scopes on the MCP server
  // — they cannot be used as exchange scopes themselves.
  const DELEGATION_ONLY_SCOPES = new Set(['banking:ai:agent:read', 'ai_agent']);

  const userTokenScopes = new Set(
    (typeof userAccessTokenClaims?.scope === 'string'
      ? userAccessTokenClaims.scope.split(' ')
      : (userAccessTokenClaims?.scope || [])
    ).filter(Boolean)
  );

  // Path A: direct intersection
  const directScopes = toolCandidateScopes.filter(
    (s) => userTokenScopes.has(s) && !DELEGATION_ONLY_SCOPES.has(s)
  );

  // Path B: user holds the delegation scope; PingOne policy decides
  const userHasDelegationScope = userTokenScopes.has('banking:ai:agent:read');

  let finalScopes;
  let scopeResolutionPath;

  if (directScopes.length > 0) {
    // Path A: use the exact intersection — no guessing
    finalScopes = directScopes;
    scopeResolutionPath = 'direct-intersection';
  } else if (userHasDelegationScope) {
    // Path B: delegation — pass tool scopes, PingOne policy decides
    finalScopes = toolCandidateScopes.filter((s) => !DELEGATION_ONLY_SCOPES.has(s));
    scopeResolutionPath = 'delegation-via-agent-invoke';
    if (finalScopes.length === 0) {
      const userScopesStr = [...userTokenScopes].join(' ') || '(none)';
      const err = new Error(
        `Token exchange failed: tool ${tool} has no non-delegation candidate scopes. ` +
        `Tool scopes: [${toolCandidateScopes.join(', ')}]. User scopes: [${userScopesStr}].`
      );
      err.code = 'no_exchangeable_scopes';
      err.httpStatus = 403;
      err.tokenEvents = tokenEvents;
      throw err;
    }
  } else {
    // No path — fail fast, never silently downgrade
    const userScopesStr = [...userTokenScopes].join(' ') || '(none)';
    const requiredBase = 'banking:ai:agent:read (delegation) or one of: ' + toolCandidateScopes.join(', ');
    const err = new Error(
      `Token exchange blocked: user token [${userScopesStr}] lacks required scopes for tool ${tool}. ` +
      `Need ${requiredBase}. Sign in again with the correct PingOne app and scopes.`
    );
    err.code = 'missing_exchange_scopes';
    err.httpStatus = 403;
    err.tokenEvents = tokenEvents;
    err.missingScopes = toolCandidateScopes;
    err.userScopes = userScopesStr;
    throw err;
  }

  // RFC 8707: validate scopes against target audience — fail fast if invalid
  const scopeValidation = configStore.validateScopeAudience(finalScopes, mcpResourceUri);
  finalScopes = scopeValidation.scopes;

  void writeExchangeEvent({
    type: 'scope-resolution',
    level: 'info',
    message: `[${scopeResolutionPath}] Scopes for tool ${tool}: [${finalScopes.join(', ')}]`,
    tool,
    path: scopeResolutionPath,
    userScopes: [...userTokenScopes].join(' '),
    finalScopes,
    audience: mcpResourceUri,
  });

  // Alias: downstream code references effectiveToolScopes
  const effectiveToolScopes = finalScopes;

  // ── Scope debug log ─────────────────────────────────────────────────────
  console.log(
    '[TokenExchange:DEBUG] tool=%s | path=%s | userScopes=[%s] | toolCandidates=[%s] | finalScopes=[%s] | audience=%s',
    tool,
    scopeResolutionPath,
    [...userTokenScopes].join(',') || '(none)',
    toolCandidateScopes.join(','),
    finalScopes.join(','),
    mcpResourceUri || '(not set)'
  );

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
      console.warn('[RFC 8693 SECURITY] Subject mismatch in token exchange', {
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

    // Record exchanged token into tokenChainService so /api/token-chain/current returns live data
    if (exchangedToken && userSub) {
      trackTokenEvent({
        eventType: 'exchange',
        token: exchangedToken,
        userId: userSub,
        description: `RFC 8693 token exchange → MCP access token (audience=${mcpResourceUri}, method=${exchangeMethod})`,
        additionalData: { mcpResourceUri, exchangeMethod, tool },
      }).catch(err => {
        console.error('[TokenExchange] Failed to track token event:', err.message);
      });
      
      // Track token for API call display (separate from token chain)
      trackToken(req.session?.id || 'default', {
        token: exchangedToken,
        tokenType: 'exchanged_token',
        description: `MCP Access Token (${exchangeMethod})`
      });
    }

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

    // RFC 8693 §5.2: Structured error code for audit log and operator diagnostics
    const { errorCode: rfc8693Code, errorDetails: rfc8693Details } = mapErrorToStructuredResponse(err);

    // Write failure to cross-Lambda Redis audit log (fire-and-forget)
    void writeExchangeEvent({
      type: 'exchange-failed',
      level: 'error',
      message: `[TokenExchange] Failed — error_code=${rfc8693Code} — ${failParts}`,
      error_code: rfc8693Code,
      oauth_error: rfc8693Details.oauth_error,
      http_status: rfc8693Details.http_status,
      category: rfc8693Details.category,
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
  // ── RFC 8693 §2.1: Two-Exchange Delegation Configuration Validation
  let configResult;
  try {
    configResult = configStore.validateTwoExchangeConfig();
  } catch (configErr) {
    tokenEvents.push(buildTokenEvent(
      'two-exchange-config-invalid',
      '2-Exchange Configuration — Invalid',
      'failed', null, configErr.message,
      { rfc: 'RFC 8693 §2.1', code: configErr.code }
    ));
    throw configErr;
  }

  // Extract validated configuration - no hard-coded defaults
  const aiAgentClientId       = configResult.credentials.aiAgentClientId;
  const mcpExchangerClient    = configResult.credentials.mcpClientId;
  const agentGatewayAud       = configResult.audiences.agentGatewayAud;
  const intermediateAud       = configResult.audiences.intermediateAud;
  const mcpGatewayAud         = configResult.audiences.mcpGatewayAud;
  const twoExFinalAud         = configResult.audiences.finalAud;
  const aiAgentClientSecret   = process.env.PINGONE_AI_AGENT_CLIENT_SECRET || process.env.AI_AGENT_CLIENT_SECRET;
  const mcpExchangerSecret    = process.env.AGENT_OAUTH_CLIENT_SECRET;
  const aiAgentAuthMethod     = (configStore.get('ai_agent_token_endpoint_auth_method') || process.env.AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();
  const mcpExchangerAuthMethod = (configStore.get('mcp_exchanger_token_endpoint_auth_method') || process.env.MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();

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
      `AI Agent client credentials failed: ${err.message}.
      Remediation steps:
      1. Verify configStore has 'ai_agent_client_id' OR PINGONE_AI_AGENT_CLIENT_ID env var is set
      2. Verify PINGONE_AI_AGENT_CLIENT_SECRET OR AI_AGENT_CLIENT_SECRET env var is set
      3. Check PingOne Admin → Applications → Super Banking AI Agent → OAuth settings
      4. Verify Client Credentials grant is enabled on the OAuth app
      5. If recently modified, restart the server for env changes to take effect`,
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
    const { errorCode: ex1Code, errorDetails: ex1Details } = mapErrorToStructuredResponse(err);
    void writeExchangeEvent({ type: 'exchange-failed', level: 'error',
      message: `[2-Exchange#1] Failed — error_code=${ex1Code} — ${err.message}`,
      error_code: ex1Code, oauth_error: ex1Details.oauth_error, http_status: ex1Details.http_status,
      category: ex1Details.category, exchangeStep: '1', pingoneError: err.pingoneError });
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
      `MCP Service client credentials failed: ${err.message}.
      Remediation steps:
      1. Verify configStore has 'mcp_oauth_client_id' OR AGENT_OAUTH_CLIENT_ID env var is set
      2. Verify AGENT_OAUTH_CLIENT_SECRET env var is set
      3. Check PingOne Admin → Applications → MCP Token Exchanger → OAuth settings
      4. Verify Client Credentials grant is enabled and correct audience (${mcpGatewayAud}) is configured
      5. Ensure MCP_GATEWAY_AUDIENCE env var is set correctly
      6. Restart server if recently modified`,
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
    const { errorCode: ex2Code, errorDetails: ex2Details } = mapErrorToStructuredResponse(err);
    void writeExchangeEvent({ type: 'exchange-failed', level: 'error',
      message: `[2-Exchange#2] Failed — error_code=${ex2Code} — ${err.message}`,
      error_code: ex2Code, oauth_error: ex2Details.oauth_error, http_status: ex2Details.http_status,
      category: ex2Details.category, pingoneError: err.pingoneError });
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 56-05 Enhancement: Structured Error Code Responses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map error context to RFC 8693 standardized error code.
 * Uses ERROR_CODES from configStore to provide structured error information.
 *
 * @param {Error|string} error - Error object or message
 * @param {object} context - Additional error context (pingoneError, etc.)
 * @returns {object} {errorCode: string, errorDetails: object, message: string}
 */
function mapErrorToStructuredResponse(error, context = {}) {
  const errorMessage = (error?.message || error?.pingoneError || String(error) || 'Unknown error').toLowerCase();
  
  let errorCode = 'server_error'; // Default
  
  // Map common error patterns to RFC 8693 codes
  if (errorMessage.includes('invalid_client') || errorMessage.includes('client_id')) {
    errorCode = 'invalid_client';
  } else if (errorMessage.includes('invalid_grant') || errorMessage.includes('grant')) {
    errorCode = 'invalid_grant';
  } else if (errorMessage.includes('invalid_scope') || errorMessage.includes('scope')) {
    errorCode = 'invalid_scope';
  } else if (errorMessage.includes('unauthorized') || errorMessage.includes('not authorized')) {
    errorCode = 'unauthorized_client';
  } else if (errorMessage.includes('token_expired') || errorMessage.includes('expired')) {
    errorCode = 'token_expired';
  } else if (errorMessage.includes('invalid_token')) {
    errorCode = 'invalid_token';
  } else if (errorMessage.includes('may_act')) {
    errorCode = 'may_act_validation_failed';
  } else if (errorMessage.includes('subject')) {
    errorCode = 'subject_mismatch';
  } else if (errorMessage.includes('access_denied')) {
    errorCode = 'access_denied';
  } else if (errorMessage.includes('insufficient_scope')) {
    errorCode = 'insufficient_scope';
  }
  
  // Get error details from configStore (already imported at top of file)
  const errorDetails = configStore.getErrorDetails(errorCode);
  
  return {
    errorCode,
    errorDetails,
    message: error?.message || error?.pingoneErrorDescription || 'Token exchange failed',
  };
}

module.exports.mapErrorToStructuredResponse = mapErrorToStructuredResponse;
