# Architecture Alignment Analysis
**Banking Demo — PingOne AI IAM Core**
**Date: March 23, 2026**

---

## Executive Summary

**Overall Alignment: 72%**

This implementation demonstrates strong OAuth 2.0/OIDC fundamentals with RFC 7636 (PKCE), RFC 8693 (token exchange including actor delegation), RFC 7662 (introspection), and RFC 7591 (dynamic client registration) all meaningfully implemented. The BFF pattern is hardened for serverless with HMAC-signed state cookies. The primary gaps are RFC 7009 token revocation (structurally absent), automatic token refresh (stored but not wired), distributed tracing (non-existent), and an MCP security gateway that exists only as a diagram. The implementation is architecturally sound for a demo but has three production-blocking gaps: no revocation, no refresh automation, and no actual MCP security gateway between BFF and MCP server.

**Top Strengths:**
- RFC 7636 PKCE S256 fully implemented and hardened for Vercel serverless with fallback cookie
- RFC 8693 token exchange implemented with both subject-only and actor (on-behalf-of) variants, including `act`/`may_act` claim parsing
- BFF pattern is correctly realized — tokens never reach the browser; session-restore cookie prevents cross-instance identity loss

**Top Risks:**
- No RFC 7009 revocation — logging out leaves access tokens valid at PingOne until natural expiry
- No automatic token refresh — expiry causes silent failures, not re-auth
- `may_act` validation is display-only in the UI; there is no enforcement gate at the MCP server that rejects tokens lacking the claim

---

## Current Implementation vs. Target Architecture

### Fully Implemented

#### OAuth 2.0 Authorization Code Flow
- Fully implemented for both admin (`routes/oauth.js`) and end-user (`routes/oauthUser.js`) clients with separate client IDs, scopes, and redirect URIs. State parameter generated and validated. Redirect URI origin validated before use.
- Evidence: `banking_api_server/routes/oauth.js` lines 26–88, `routes/oauthUser.js` lines 110–180
- Standards: RFC 6749 §4.1, OIDC Core 1.0 §3.1

#### PKCE S256 (RFC 7636)
- `generateCodeVerifier()` produces 64-byte hex (128-char) string. `generateCodeChallenge()` applies SHA256 then base64url — correct S256 derivation. Verifier stored in session and signed PKCE cookie; challenge sent in authorization URL. Verifier sent in token exchange request body.
- Evidence: `banking_api_server/services/oauthService.js` lines 87–105, `services/pkceStateCookie.js` lines 4–130
- Standards: RFC 7636 §4.1, §4.2

#### PKCE Cookie for Serverless Resilience
- HMAC-signed HTTP-only cookie (`_pkce`) stores state, codeVerifier, redirectUri. Callback recovers from cookie when in-memory session is on a different Vercel instance. Constant-time comparison (`crypto.timingSafeEqual`) prevents timing attacks.
- Evidence: `services/pkceStateCookie.js` full file

#### OIDC UserInfo / ID Token
- `getUserInfo()` called post-callback using access token. ID token stored in session (`idToken` field). Used for `id_token_hint` in RP-Initiated Logout.
- Evidence: `routes/oauth.js` line 138, `routes/oauthUser.js` line ~310
- Standards: OIDC Core 1.0 §5.3, §6

#### RFC 8693 Token Exchange — Subject-only
- `performTokenExchange()` in oauthService.js issues correct `urn:ietf:params:oauth:grant-type:token-exchange` grant with `subject_token`, `subject_token_type`, `audience`, and `scope`.
- Evidence: `services/oauthService.js` lines 160–190
- Standards: RFC 8693 §2.1

#### RFC 8693 Token Exchange — Actor (On-Behalf-Of)
- `performTokenExchangeWithActor()` adds `actor_token` and `actor_token_type`. Enabled via `USE_AGENT_ACTOR_FOR_MCP` env var + agent client-credentials token. Full token event pipeline (`agentMcpTokenService.js`) captures T1, actor token, T2.
- Evidence: `services/oauthService.js` lines 209–240, `services/agentMcpTokenService.js` lines 150–300
- Standards: RFC 8693 §4.1

#### `act` / `may_act` Claim Parsing and Display
- BFF: `sanitizeClaims()` explicitly extracts both `may_act` and `act` from decoded tokens. `describeMayAct()` validates `may_act.client_id` matches BFF client. Token events exposed to frontend for educational display.
- MCP server: `TokenIntrospector.ts` logs actor/subject pair when `act` claim present.
- Evidence: `services/agentMcpTokenService.js` lines 45–130, `banking_mcp_server/src/auth/TokenIntrospector.ts` lines 100–120
- Standards: RFC 8693 §4.1, §4.2

#### Token Introspection (RFC 7662)
- BFF calls PingOne introspection endpoint (derived from token endpoint URL) with `token`, `client_id`, `client_secret`. Retry logic with exponential backoff (3 attempts). Circuit breaker pattern returns 503 when provider is down. Active check (`active: true`) and expiry check performed.
- MCP server independently introspects tokens, checks audience against `MCP_SERVER_RESOURCE_URI`.
- Evidence: `middleware/oauthErrorHandler.js` lines 327–400, `banking_mcp_server/src/auth/TokenIntrospector.ts` lines 28–130
- Standards: RFC 7662 §2

#### Dynamic Client Registration (RFC 7591) — LangChain Agent
- `DynamicClientRegistration.register_client()` POSTs client metadata to PingOne `client_registration_endpoint` including `client_name`, `redirect_uris`, `grant_types`, `scope` (includes `ai_agent`), `token_endpoint_auth_method`. Cleanup via `delete_client()` on session end. Retry with exponential backoff.
- Evidence: `langchain_agent/src/authentication/oauth_manager.py` lines 24–167
- Standards: RFC 7591 §3.1

#### OIDC CIBA (Client-Initiated Backchannel Authentication)
- Dedicated `routes/ciba.js` with `POST /bc-authorize`, polling endpoint, and status check. Used for step-up on high-value transactions. `CIBAPanel.js` in UI provides live walkthrough.
- Evidence: `banking_api_server/routes/ciba.js`
- Standards: OIDC CIBA 1.0

#### BFF Pattern / Session Management
- Tokens stored exclusively server-side. HMAC-signed `_auth` cookie restores user identity across Vercel serverless instances. Session regenerated after OAuth callback (prevents fixation). Optional Redis/Upstash persistent store.
- Evidence: `services/authStateCookie.js`, `server.js` lines 170–215

#### Audit Logging
- `activityLogger.js` middleware logs every request with user ID, action type, status, timing. Structured OAuth error logger categorizes events: `OAUTH_VALIDATION`, `TOKEN_INTROSPECTION`, `AUTHENTICATION`. MCP server logs actor/subject delegation chain on each tool call.
- Evidence: `middleware/activityLogger.js`, `middleware/oauthErrorHandler.js` lines 521–560

#### MCP Protocol Integration (WebSocket JSON-RPC)
- BFF connects to MCP server via WebSocket. Tool proxy at `/api/mcp/tool` accepts tool name + params, exchanges token if configured, forwards to MCP server. Protocol version `2024-11-05`.
- Evidence: `routes/mcpInspector.js`, `services/mcpWebSocketClient.js`

---

### Partially Implemented

#### Token Refresh (RFC 6749 §6)
- **What exists:** `refresh_token` received in OAuth callback and stored in `req.session.oauthTokens.refreshToken`. Token expiry stored in `expiresAt`.
- **What is missing:** No `/api/auth/refresh` endpoint. No middleware that checks `expiresAt` before forwarding requests and refreshes proactively. No client-side logic that detects 401 → trigger refresh → retry. Test coverage explicitly marks "UI automatic token refresh on expiration: `covered: false`".
- **Why partial:** Tokens die silently. The session becomes unusable without user re-authentication, which is never triggered automatically.
- **Evidence:** `routes/oauth.js` line 138 (storage), test comment in regression plan
- **Risk:** In production, users will experience unexplained failures ~1 hour post-login. For a demo, this surfaces as agent calls failing without clear error messaging.

#### Correlation ID / Request Tracing
- **What exists:** `generateRequestId()` in `oauthErrorHandler.js` creates random IDs included in error responses.
- **What is missing:** No `X-Request-ID` or `X-Correlation-ID` header injected at ingress; IDs not propagated to MCP server, Banking API, or PingOne calls; no structured logging field linking BFF → MCP → Banking API request chains.
- **Why partial:** IDs exist in isolation — they cannot be used to trace a user action end-to-end across systems.
- **Evidence:** `middleware/oauthErrorHandler.js` lines 81–85
- **Risk:** Debugging production incidents requires manual log correlation.

#### `may_act` Enforcement
- **What exists:** `describeMayAct()` validates the claim and exposes validation status to the frontend UI as an educational display.
- **What is missing:** No hard enforcement gate at the MCP server that rejects user tokens lacking a valid `may_act` claim. The MCP server introspects the token but does not block requests where `may_act` is absent.
- **Why partial:** Display ≠ enforcement. An agent acting on a token that never had `may_act` issued by PingOne will succeed silently.
- **Evidence:** `services/agentMcpTokenService.js` lines 80–130, `banking_mcp_server/src/auth/TokenIntrospector.ts` lines 100–120 (no rejection logic)
- **Risk:** Demonstrates delegation flow incorrectly — the core security invariant of `may_act` is that the actor is *pre-authorized*; without enforcement this is just a label.

#### Rate Limiting on Auth Endpoints
- **What exists:** General request logging and circuit breaker in introspection error handler.
- **What is missing:** No `express-rate-limit` middleware applied to `/api/auth/*` paths. Login endpoint could be brute-forced. Token introspection endpoint has no rate cap.
- **Evidence:** No `rateLimit()` calls visible on auth route registrations in server.js.
- **Risk:** Demo exposure; not a blocked deployment risk.

---

### Missing or Incomplete

#### Token Revocation (RFC 7009)
- **Why missing:** Logout route at `/api/auth/logout` destroys the Express session and redirects to PingOne signoff. No call to `POST /token/revoke` with the access token or refresh token.
- **Impact:** Logged-out tokens remain valid at PingOne until `expires_in` elapses (~1 hour). If a token is intercepted after logout, it is still usable against the Banking API and MCP server until expiry. This is a material security gap.
- **Recommended implementation:** In the logout handler, before `session.destroy()`, extract `req.session.oauthTokens.accessToken` and `refreshToken`, POST both to the PingOne revocation endpoint (`/token/revoke`) with `client_id`, then destroy session.

#### Automatic Token Refresh
- **Why missing:** refresh_token is stored but there is no middleware that checks expiry timestamps before forwarding requests to downstream services.
- **Impact:** After ~1 hour (PingOne default), all agent calls fail with 401 errors that surface to users as unexplained MCP errors. No silent re-auth cycle exists.
- **Recommended implementation:** Add a `refreshIfNeeded()` middleware that runs before `/api/mcp/*` routes, compares `oauthTokens.expiresAt` against `Date.now() + 5min`, and calls the refresh grant. Set `NO_REFRESH_TOKEN` flag if PingOne client is public-only.

#### MCP Security Gateway
- **Why missing:** `mcp-security-gateway.mmd` is a Mermaid diagram sketch of a theoretical APIM proxy. No actual gateway, API Management instance, or reverse proxy sits between the BFF and MCP server. The MCP WebSocket connection is direct, not gated.
- **Impact:** No centralized rate limiting, request logging, or policy enforcement layer between BFF and MCP server. If MCP server URL is known, direct calls bypass BFF token exchange entirely (depends on MCP server's own introspection enforcement).
- **Recommended implementation:** Deploy APIM, Envoy, or a lightweight Express proxy between BFF and MCP server that validates the Bearer token before forwarding. Alternatively document explicitly that MCP server introspection IS the enforcement layer.

#### Distributed Tracing / OpenTelemetry
- **Why missing:** No trace context propagation exists. Activity logger writes to a local store; MCP server logs separately. No OpenTelemetry SDK, no W3C `traceparent` header injection.
- **Impact:** Cannot reconstruct any user action sequence across BFF → MCP → Banking API from logs alone. Critical for incident response in production.
- **Recommended implementation:** Add `@opentelemetry/sdk-node` to the BFF, instrument Express middleware, propagate `traceparent` header to MCP server and all downstream PingOne calls.

---

## Security Assessment

**Authentication Strengths:**
- PKCE S256 correctly implemented and serverless-hardened — replay of authorization codes without verifier is blocked
- State parameter validated before code exchange — CSRF protection is functional
- Session fixation prevented by `req.session.regenerate()` post-callback
- HMAC-signed cookies (`_auth`, `_pkce`) use `crypto.timingSafeEqual` — timing-safe

**Authorization / Delegation Gaps:**
- `may_act` claim is parsed and displayed but **not enforced** as a gate at the MCP server. An agent token without `may_act` will still succeed.
- Scope narrowing in token exchange is configured by environment variable. If `MCP_RESOURCE_URI` is not set, the full user token (T1) is forwarded directly to the MCP server without scope reduction — broader-than-necessary token surface.
- The MCP server's audience check (`MCP_SERVER_RESOURCE_URI`) is the only resource-server-level guard; it can be bypassed if the variable is not set.

**Token Lifecycle Weaknesses:**
- No RFC 7009 revocation means tokens outlive sessions by up to the full `expires_in` window
- No refresh automation means session validity is opaque — users receive error messages instead of re-authentication prompts
- `_cookie_session` stub in `restoreSessionFromCookie()` marks sessions as "authenticated" for `/status` checks without a real access token — routes requiring an actual token will fail with different errors than unauthenticated ones, creating ambiguous error paths

**Replay / Session / Logout Risks:**
- Admin → Customer role-switch now calls `clearAuthCookie()` (recent fix), preventing old identity from being restored. This is correct.
- `_auth` cookie has no binding to the access token's `jti` — a valid cookie paired with an expired token will briefly report "authenticated" until the next actual API call fails
- PingOne CIBA polling: if polling timeout is misconfigured, a prior CIBA authorization request could be consumed by a different request cycle

**Standards Compliance Concerns:**
- `login_hint` is hardcoded as `'bankuser'` (user) and `'admin'` (admin) — acceptable for demo, not for production
- No `nonce` parameter in OIDC authorization requests — acceptable without implicit flow but reduces replay protection for ID tokens

---

## Operational Assessment

**Reliability Gaps:**
- No health monitoring on the MCP WebSocket connection — if the connection drops, BFF silently returns errors
- Vercel in-memory session fallback (no Redis) means concurrent requests from the same user may land on different cold-start instances and get inconsistent session state despite the `_auth` cookie fallback

**Refresh / Revocation Gaps:**
- Tokens expire silently; no proactive refresh cycle; no revocation on logout (as noted above)
- `refresh_token` is stored in the session — if session is lost (Redis eviction, cold start), the refresh token cannot be recovered

**Error Handling:**
- `oauthErrorHandler.js` is thorough with circuit breaker, retry, and structured logging — this is a genuine strength
- MCP tool errors surface as `"MCP server unreachable"` messages in the UI — useful for demo but doesn't distinguish token errors from connectivity errors

**Monitoring / Health Visibility Gaps:**
- No uptime check on PingOne OIDC endpoints
- No alert when token exchange fails repeatedly (circuit breaker logs to console but doesn't emit metric)
- Activity logs stored in SQLite on Vercel — ephemeral on serverless; no persistent log drain configured

---

## Audit and Observability Assessment

**Delegation-Chain Traceability:**
- The BFF captures T1 `may_act` claim and T2 `act` claim in token event objects that are sent to the frontend for display. This is educational but not a persistent audit trail — it lives in the UI event stream, not in a durable log store.
- The MCP `TokenIntrospector.ts` logs `actor: ${actorClientId}, subject: ${tokenInfo.sub}` — present in MCP server stdout but not in a structured, queryable store.

**`act` Claim Visibility:**
- Present in token events exposed to the UI via `agentMcpTokenService.js`. Frontend displays act claim details in the BankingAgent panel. This is demo-grade visibility only.

**Correlation IDs:**
- Generated per error response but not injected as request context at ingress. Cannot correlate a UI action (e.g., "transfer $500") to a specific BFF log entry, token exchange call, and MCP tool invocation.

**Structured Audit Logging:**
- `activityLogger.js` produces structured records with user ID, action type, status, timing. This is genuinely good for a BFF audit log.
- Missing: structured log entries for token exchange (RFC 8693 grant) with T1 `jti`, T2 `jti`, actor client, subject user, scopes granted/narrowed.

**Missing Evidence Trails:**
- No persistent record of which agent (by DCR client ID) performed a banking tool call on behalf of which user
- No immutable audit event model — logs are console/SQLite, overwritable
- No log correlation between BFF `activityLogger` and MCP server `TokenIntrospector` for the same user action

---

## Alignment Scorecard

| Area | Score |
|---|---|
| OAuth/OIDC | 90 |
| Token Exchange (RFC 8693) | 82 |
| MCP Integration | 70 |
| AI Agent Flow | 78 |
| Security | 62 |
| Auditability | 55 |
| Operations | 50 |
| UX Clarity | 80 |
| **Overall** | **72** |

---

## Recommended Roadmap

### Priority 1 — High Impact / Low–Medium Effort

#### 1. Token Revocation on Logout (RFC 7009)
- **Why it matters:** Logged-out tokens remain valid. This is a security fail that any auditor will flag immediately.
- **Expected impact:** Closes the post-logout attack window. Brings logout into RFC compliance.
- **Implementation:** In `server.js` `/api/auth/logout` handler, add `POST /token/revoke` for both `access_token` and `refresh_token` using the existing axios client before `session.destroy()`. Two calls, ~15 lines of code.

#### 2. Automatic Token Refresh Middleware
- **Why it matters:** Silent expiry produces confusing errors and breaks demo scenarios after ~1 hour.
- **Expected impact:** Sessions survive beyond token TTL. Agent calls succeed without user re-auth.
- **Implementation:** Add `refreshIfNeeded` async middleware applied to `/api/mcp/*` and `/api/banking/*`. Checks `req.session.oauthTokens.expiresAt - Date.now() < 300000`. If true, calls PingOne token endpoint with `grant_type: refresh_token`. Stores new tokens. 40–60 lines.

#### 3. `may_act` Enforcement Gate at MCP Server
- **Why it matters:** The entire delegation story is undermined if the claim is display-only. The MCP server should reject tokens where `may_act.client_id` does not match the known BFF client ID.
- **Expected impact:** Correct security semantics for the demo — shows that `may_act` is an authorization, not just metadata.
- **Implementation:** In `TokenIntrospector.ts`, add check: if `requireMayAct` config is true and `tokenInfo.may_act?.client_id !== KNOWN_BFF_CLIENT_ID`, throw `403 Forbidden`. Environment variable to toggle for backward compat.

#### 4. Correlation ID Propagation
- **Why it matters:** Unable to trace any user action across BFF, MCP, and Banking API. Demo debugging is painful; production would be untenable.
- **Expected impact:** Full request chain traceable from browser → BFF → token exchange → MCP tool call.
- **Implementation:** Add Express middleware that reads or generates `X-Request-ID`, stores in `req.requestId`, injects as header in all outgoing axios/fetch calls. Inject into MCP WebSocket tool call payload as `correlationId`.

---

### Priority 2 — High Impact / High Effort

#### 5. Persistent Session Store (Redis)
- **Why it matters:** Vercel cold starts + ephemeral in-memory sessions cause intermittent auth failures despite the `_auth` cookie workaround. The cookie only restores identity, not the access token — API calls will still fail.
- **Expected impact:** Deterministic session behavior; full access token available on every instance; refresh token survives serverless restarts.
- **Implementation:** Set `UPSTASH_REDIS_REST_URL` in Vercel environment and connect `connect-redis`. The code already supports this (redisStore wiring in server.js) — it just needs the environment variable.

#### 6. Structured Delegation Audit Trail
- **Why it matters:** No persistent record links "agent client X acted on behalf of user Y using T2 scoped to Z."
- **Expected impact:** Compliance-grade audit log; enables full delegation chain replay.
- **Implementation:** Emit structured JSON audit events from `agentMcpTokenService.js` and `TokenIntrospector.ts` to a durable log store (Upstash, Logtail, Axiom). Fields: `timestamp`, `user_sub`, `actor_client_id`, `t1_jti`, `t2_jti`, `scopes`, `tool_invoked`, `result_status`.

---

### Priority 3 — Medium Impact / Low Effort

#### 7. `nonce` in OIDC Authorization Request
- **Why it matters:** ID token replay protection; required for strict OIDC conformance.
- **Implementation:** Generate random nonce, store in session, add `nonce` to authorization URL params, verify `nonce` in ID token claims after userinfo call. ~10 lines in oauthService.js.

#### 8. Remove `SKIP_TOKEN_SIGNATURE_VALIDATION` from Production Path
- **Why it matters:** This env var disables introspection entirely — catastrophic if set accidentally in production.
- **Implementation:** Add startup assertion that rejects app initialization if `SKIP_TOKEN_SIGNATURE_VALIDATION=true` when `NODE_ENV=production`. ~3 lines.

#### 9. Rate Limiting on Auth Endpoints
- **Why it matters:** Login and token exchange endpoints have no brute-force protection.
- **Implementation:** Apply `express-rate-limit` to `/api/auth/*` routes — 20 requests/IP/minute. Already a dependency of Express ecosystem; 5 lines of config.

---

## Standards Compliance Table

| RFC / Standard | Capability | Status | Evidence |
|---|---|---|---|
| RFC 6749 §4.1 | Authorization Code Flow | ✅ Yes | `routes/oauth.js` #L35–120 |
| RFC 7636 | PKCE S256 | ✅ Yes | `services/pkceStateCookie.js` #L87 |
| RFC 7519 + 7517 | JWT / Token Signatures | ✅ Yes | `middleware/auth.js` token decoding |
| OIDC Core 1.0 | UserInfo / ID Token | ✅ Yes | `routes/oauth.js` #L138 getUserInfo() |
| OIDC CIBA 1.0 | Backchannel Auth | ✅ Yes | `routes/ciba.js` |
| RFC 7662 | Token Introspection | ✅ Yes | `middleware/oauthErrorHandler.js` #L327 |
| RFC 8693 §2.1 | Token Exchange (Subject) | ✅ Yes | `services/oauthService.js` #L160 |
| RFC 8693 §4.1 | Token Exchange (Actor) | ✅ Yes | `services/oauthService.js` #L209 |
| RFC 8693 §4.1/4.2 | `act` / `may_act` Claims | ✅ Parsed, ⚠️ Not enforced | `services/agentMcpTokenService.js` #L80 |
| RFC 7591 | Dynamic Client Reg | ✅ Yes (Agent) | `langchain_agent/oauth_manager.py` #L40 |
| RFC 7009 | Token Revocation | ❌ No | Logout only clears session |
| RFC 6749 §6 | Token Refresh | ⚠️ Partial | Tokens stored, no auto-refresh |
| BFF Pattern | Session / Token Isolation | ✅ Yes | `services/authStateCookie.js` |
| MCP 2024-11-05 | MCP Protocol | ✅ Yes | `routes/mcpInspector.js` |
| W3C TraceContext | Distributed Tracing | ❌ No | Not implemented |

---

## Final Conclusion

The implementation is **architecturally sound for its stated purpose** — a banking demo showcasing OAuth 2.0, token exchange, CIBA, and MCP agent patterns with PingOne. The core flows — Authorization Code + PKCE, token exchange with actor delegation, CIBA step-up, BFF pattern with session hardening — are correctly implemented and standards-aligned. The PKCE serverless resilience work is notably well-engineered.

**It is not production-ready** for the following reasons: token revocation on logout is absent (RFC 7009), refresh automation does not exist (sessions expire silently), the MCP security gateway is a diagram rather than deployed infrastructure, and there is no distributed trace context making incident response difficult.

**What prevents full alignment:**
1. RFC 7009 revocation — ~40 lines, no architectural changes required
2. Token refresh middleware — ~60 lines, no architectural changes required
3. `may_act` enforcement at MCP server — ~20 lines with a feature flag
4. Redis session store config — already wired in code, needs one environment variable
5. Correlation IDs — one middleware file, three injection points

**Shortest path to near-100% alignment:** Five items, none requiring new services. Items 1–3 are pure code; item 4 is a Vercel environment variable; item 5 is a single middleware file. Combined engineering effort is approximately one focused sprint. No new infrastructure required if Upstash Redis (already conditionally wired) is provisioned.
