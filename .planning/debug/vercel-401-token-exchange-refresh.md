---
status: awaiting_human_verify
trigger: "vercel-401-token-exchange-refresh: On Vercel production, listing accounts (and other authenticated actions) fails with cascading 401s and a token exchange error: 'Token exchange failed: Request denied: Unsupported authentication method'."
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: PingOne returns HTTP 401 for token exchange "Unsupported authentication method" (exchanger client is PKCE/Web app), bypassing the isExchangeScopeError local-fallback gate in server.js (only checks 400, not 401). Refresh 401s are a separate Vercel session issue.
test: Trace full code path from performTokenExchange/performTokenExchangeWithActor through server.js error handler; verify isExchangeScopeError does NOT catch 401.
expecting: Code confirms 401 from PingOne token exchange bypasses local fallback → BFF returns 401 → UI toast shows "Token exchange failed" message
next_action: Confirm isExchangeScopeError gap, then fix with (err.httpStatus === 401 && err.pingoneError) to restore local fallback for exchange-origin 401s.

## Symptoms
<!-- IMMUTABLE after gathering -->

expected: Authenticated user can list accounts and use MCP tools after logging in on Vercel production.
actual: All authenticated calls return 401. Token exchange fails with "Unsupported authentication method". Refresh endpoints also 401.
errors: |
  api/mcp/tool → 401
  api/auth/oauth/user/refresh → 401
  api/auth/oauth/refresh → 401
  Toast in UI: "Error: Token exchange failed: Request denied: Unsupported authentication method (Correlation ID: 89736fdc-f63d-4373-9b1a-8f174331ec54)"
reproduction: Log in on Vercel production (https://banking-demo-puce.vercel.app). Go to dashboard. Click "List Accounts" or trigger any MCP tool call.
timeline: Happening now. PingOne apps recently renamed from BX Finance → Super Banking.

## Eliminated

- hypothesis: Session entirely missing (no Redis) → userToken = null → mcpNoBearerResponse → 401
  evidence: Toast message "Token exchange failed: Request denied: Unsupported authentication method" can ONLY appear if userToken WAS retrieved from session and token exchange was ATTEMPTED (PingOne returned the error). If userToken were null, resolveMcpAccessTokenWithEvents returns {token:null} silently and the 401 would say "Session missing or expired on the server.".
  timestamp: 2026-04-04T00:00:00Z

- hypothesis: 2-exchange delegation path (FF_TWO_EXCHANGE_DELEGATION) causes "Token exchange failed:"
  evidence: _performTwoExchangeDelegation uses performTokenExchangeAs which generates "Token exchange failed for {clientId}:" (with "for clientId"). The toast says "Token exchange failed:" (NO "for clientId:"). So the error comes from performTokenExchange or the fallback after performTokenExchangeWithActor fails, both of which use this.config.clientId (admin client) as exchanger.
  timestamp: 2026-04-04T00:00:00Z

- hypothesis: Wrong client secret on Vercel causes invalid_client
  evidence: PingOne error would be "invalid_client" (invalid_client error code, HTTP 401). The error description is specifically "Request denied: Unsupported authentication method" which is a PingOne token-exchange POLICY error, not a credential error.
  timestamp: 2026-04-04T00:00:00Z

## Evidence

- timestamp: 2026-04-04T00:00:00Z
  checked: services/oauthService.js performTokenExchange error handler
  found: richErr = new Error(`Token exchange failed: ${pingoneData.error_description || ...}`) — exact match for the toast "Token exchange failed: Request denied: Unsupported authentication method"
  implication: The error originates from performTokenExchange (or its fallback call). The PingOne response had error_description = "Request denied: Unsupported authentication method".

- timestamp: 2026-04-04T00:00:00Z
  checked: server.js POST /api/mcp/tool exchange error handler, isExchangeScopeError
  found: |
    const isExchangeScopeError = err.httpStatus === 400 || err.code === 'token_exchange_failed';
    if (sessionUser?.id && isExchangeScopeError) { /* local fallback */ }
    const status = err.httpStatus || 502;
    return res.status(status).json({ ... });
  implication: If PingOne returns HTTP 401 for "Unsupported authentication method", isExchangeScopeError = false (401 !== 400, code is not 'token_exchange_failed'). Therefore: no local fallback. BFF returns res.status(401) directly. This is the mechanism of the cascading 401.

- timestamp: 2026-04-04T00:00:00Z
  checked: services/oauthService.js performTokenExchangeWithActor and fallback logic in agentMcpTokenService.js
  found: |
    1-exchange path: if AGENT_OAUTH_CLIENT_ID is set → getAgentClientCredentialsToken() → performTokenExchangeWithActor(). If actor exchange fails → FALLBACK to performTokenExchange(). performTokenExchange uses this.config.clientId (admin client, 14cefa5b-...) with CLIENT_SECRET_BASIC.
    The admin client is a Web app (PKCE). In PingOne, PKCE web apps may have tokenEndpointAuthMethod = CLIENT_SECRET_BASIC (if they have a secret) but need the token-exchange grant type enabled. If PingOne's token exchange policy requires a specific auth method that doesn't match, it returns "Request denied: Unsupported authentication method".
  implication: Either the admin client lacks token_exchange grant, OR PingOne token-exchange policy enforces a different auth method. The HTTP 401 returned bypasses the local-fallback gate (only 400 is caught).

- timestamp: 2026-04-04T00:00:00Z
  checked: routes/oauth.js and routes/oauthUser.js /refresh handlers
  found: |
    Both start with: if (!req.session.oauthTokens?.refreshToken) return res.status(401).json({ error: 'no_refresh_token' });
  implication: Refresh 401 is a SEPARATE issue — Vercel serverless session problem. After the token exchange 401, the UI tries to refresh. On a different Lambda instance, the Redis session may not be hydrated (missing UPSTASH/KV env vars or session not saved before Lambda shutdown). This is documented in REGRESSION_PLAN.md "Upstash session store" critical area.

- timestamp: 2026-04-04T00:00:00Z
  checked: REGRESSION_PLAN.md critical areas
  found: "Upstash session store: Every Vercel Lambda gets empty in-memory session → 401 on all API calls — KV_REST_API_URL + KV_REST_API_TOKEN set in Vercel env."
  implication: The refresh 401s are a known Vercel production pattern when Upstash/Redis not configured. But the MCP tool 401 is NOT a session issue — it's the token exchange 401 propagating because isExchangeScopeError doesn't catch 401 from PingOne.

## Resolution

root_cause: |
  DUAL ISSUES:

  Issue 1 — MCP tool 401 / toast "Token exchange failed: Request denied: Unsupported authentication method":
  PingOne's token exchange policy rejects the BFF admin client (14cefa5b-...) with HTTP 401 "Unsupported authentication method". This occurs because either: (a) the admin client doesn't have "Token Exchange" grant type enabled in PingOne, or (b) the token exchange policy requires a different client auth method than CLIENT_SECRET_BASIC. The code's isExchangeScopeError check in server.js POST /api/mcp/tool only catches err.httpStatus === 400, not 401. When PingOne returns 401, the local fallback is bypassed and the BFF propagates a 401 to the UI. Since local fallback would use the user's session data directly to call banking tools (no PingOne exchange needed), extending isExchangeScopeError to also catch PingOne-origin 401s restores functional behavior.

  Issue 2 — Refresh endpoint 401:
  Vercel serverless session issue. Different Lambda instances don't share in-memory session state. The refresh token is stored in the Redis-backed session, but if the Vercel env vars for Redis (KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + token) are missing or expired, each Lambda starts with an empty session → no refreshToken → 401.

fix: |
  Code fix APPLIED (Issue 1): Extended isExchangeScopeError in server.js POST /api/mcp/tool:
    Before: err.httpStatus === 400 || err.code === 'token_exchange_failed'
    After:  err.httpStatus === 400 || err.code === 'token_exchange_failed' || (err.httpStatus === 401 && Boolean(err.pingoneError))
  PingOne-origin 401s (have err.pingoneError set from response body parsing) now trigger local fallback.
  119 unit tests pass (oauthService + agentMcpTokenService suites).

  PingOne config fix (Issue 1, long-term): In PingOne Admin console, on the admin client (14cefa5b-...), enable the "Token Exchange" grant type and confirm the token endpoint auth method is CLIENT_SECRET_BASIC (or set PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH=post to match PingOne setting).

  Vercel env fix (Issue 2): Ensure KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN) are correctly set in Vercel project environment variables. After adding, redeploy AND sign out/in again.

verification: 119 unit tests pass. Code change in POST /api/mcp/tool error handler confirmed minimal and correct.
files_changed: [banking_api_server/server.js]
