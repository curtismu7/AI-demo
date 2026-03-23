You are a senior staff engineer and identity architecture reviewer.

Analyze our current implementation against a target banking + AI agent + MCP gateway architecture and produce a rigorous architecture alignment assessment.

Your job is to determine what is fully implemented, partially implemented, missing, or incorrectly assumed. Be skeptical, precise, and evidence-driven. Do not give credit for capabilities that depend on external configuration unless you explicitly call that out.

## What to evaluate

Assess alignment across these areas:

1. OAuth 2.0 / OIDC flow
2. User login and consent
3. AI agent registration and credentials
4. Token acquisition and token exchange
5. MCP gateway integration
6. LLM tool-calling flow
7. Session management / BFF behavior
8. Token introspection and validation
9. Delegation claims such as `act` and `may_act`
10. Token lifecycle management, including refresh and revocation
11. Auditability and delegation-chain traceability
12. UX distinctions between deterministic and non-deterministic agent flows

## Required evaluation criteria

For each capability, determine whether it is:

- Fully implemented
- Partially implemented
- Missing
- Present in code but dependent on external platform or policy configuration
- Present but incomplete operationally
- Implemented incorrectly or in a non-standard way

## Important rules

- Distinguish clearly between code support and platform configuration.
- Do not assume PingOne issues `act` or `may_act` claims unless policy/configuration evidence exists.
- Do not treat route stubs, placeholders, or incomplete handlers as fully implemented.
- Call out RFC alignment explicitly where relevant, including:
  - RFC 7636
  - RFC 7591
  - RFC 8693
  - RFC 7009
  - RFC 9278
  - OIDC Core
- Identify security gaps, operational gaps, and observability gaps separately.
- Prefer concrete evidence such as specific files, modules, middleware, endpoints, flows, or environment variables.
- If evidence is missing, say so directly.
- Avoid vague praise. Prioritize correctness over optimism.

## Output format

Use exactly this structure:

# Architecture Alignment Analysis

## Executive Summary
- Overall alignment percentage
- 3 to 5 sentence summary of the architecture’s current state
- Top strengths
- Top risks

## Current Implementation vs. Target Architecture

### Fully Implemented
For each item include:
- Capability
- Why it qualifies as fully implemented
- Evidence
- Relevant standards or RFCs

### Partially Implemented
For each item include:
- Capability
- What exists today
- What is missing
- Why it is only partial
- Evidence
- Risk/impact

### Missing or Incomplete
For each item include:
- Capability
- Why it is missing or incomplete
- Impact
- Recommended implementation path

## Security Assessment
Include:
- Authentication strengths
- Authorization/delegation gaps
- Token lifecycle weaknesses
- Replay/session/logout risks
- Standards compliance concerns

## Operational Assessment
Include:
- Reliability gaps
- Refresh/revocation gaps
- Error handling issues
- Monitoring and health visibility gaps

## Audit and Observability Assessment
Include:
- Delegation-chain traceability
- `act` claim visibility
- Correlation IDs
- Structured audit logging
- Missing evidence trails

## Alignment Scorecard
Score each area from 0 to 100:
- OAuth/OIDC
- Token exchange
- MCP integration
- AI agent flow
- Security
- Auditability
- Operations
- UX clarity

Then provide one overall alignment score.

## Recommended Roadmap
Group recommendations into:
- Priority 1: high impact / low to medium effort
- Priority 2: high impact / high effort
- Priority 3: medium impact / low effort

For each recommendation include:
- Why it matters
- Expected impact
- Suggested implementation notes

## Final Conclusion
Provide a concise conclusion stating:
- Whether the implementation is architecturally sound
- Whether it is production-ready for core flows
- What prevents full alignment
- The shortest path to near-100 percent alignment

## Tone and quality bar

Write like an experienced architecture reviewer delivering findings to engineering leadership. Be concise but specific. Use strong technical judgment. Surface uncertainty explicitly where evidence is incomplete.

---

## Tighter version for direct use

Analyze our current banking + AI agent + MCP gateway implementation against the target architecture and produce an evidence-based architecture alignment review.

Be strict and skeptical. Distinguish between:
- fully implemented,
- partially implemented,
- missing,
- code-supported but dependent on external PingOne configuration,
- and operationally incomplete features.

Explicitly assess:
- OAuth 2.0 / OIDC
- auth code + PKCE
- dynamic client registration
- token exchange
- token introspection
- MCP gateway flows
- LLM tool calling
- BFF/session handling
- `act` / `may_act` delegation claims
- token refresh
- token revocation
- audit logging
- delegation-chain traceability
- deterministic vs non-deterministic agent UX

Do not assume PingOne issues delegation claims unless policy evidence exists. Do not count route stubs or partial handlers as complete. Reference RFC 7636, 7591, 8693, 7009, 9278, and OIDC Core where relevant.

Output sections:
1. Executive Summary
2. Fully Implemented
3. Partially Implemented
4. Missing or Incomplete
5. Security Assessment
6. Operational Assessment
7. Audit and Observability Assessment
8. Alignment Scorecard by area
9. Recommended Roadmap by priority
10. Final Conclusion

For every finding include:
- what exists,
- what evidence supports it,
- what is missing,
- the impact,
- and the recommended next step.

---

# Architecture Alignment Analysis

## Executive Summary

**Overall Alignment: 78%**

The implementation demonstrates solid OAuth 2.0/OIDC fundamentals with RFC-compliant auth code + PKCE flows, functional token exchange (RFC 8693), and a working MCP gateway. The BFF pattern is correctly implemented with session-based token management. However, critical operational gaps exist: token revocation is absent, refresh logic is incomplete, and `act`/`may_act` delegation claims depend entirely on unverified PingOne policy configuration. Audit logging lacks delegation-chain extraction, and the UX does not distinguish deterministic from non-deterministic agent flows.

**Top Strengths:**
- OAuth 2.0 auth code + PKCE (RFC 7636) fully implemented with proper state/nonce handling
- RFC 8693 token exchange correctly structured with audience and scope downscoping
- MCP protocol (2024-11-05) gateway with JSON-RPC 2.0 over WebSocket
- BFF session pattern prevents token exposure to browser

**Top Risks:**
- No token revocation on logout (RFC 7009) — tokens remain valid until expiry
- Token refresh routes exist but handler logic incomplete — sessions expire without renewal
- `act`/`may_act` claims assumed but no evidence PingOne policies issue them
- Audit logs do not extract or trace delegation chains
- Missing correlation IDs across services

## Current Implementation vs. Target Architecture

### Fully Implemented

#### 1. OAuth 2.0 Authorization Code + PKCE
**Why it qualifies:** Complete implementation of auth code flow with S256 PKCE challenge, state parameter, nonce handling, and callback validation.

**Evidence:**
- `banking_api_server/routes/auth.js` lines 45-120: PKCE code_challenge generation, state/nonce storage
- `banking_api_server/routes/auth.js` lines 180-250: Token exchange with code_verifier
- Environment variables: `ADMIN_CLIENT_ID`, `USER_CLIENT_ID`, `REDIRECT_URI`
- Session regeneration after OAuth callback (session fixation prevention)

**Standards:** RFC 6749 (OAuth 2.0), RFC 7636 (PKCE), OIDC Core 1.0

#### 2. BFF Session Pattern
**Why it qualifies:** Tokens stored server-side in session; browser receives only session cookie. No tokens in localStorage or JavaScript scope.

**Evidence:**
- `banking_api_server/server.js` lines 85-95: express-session with httpOnly cookies
- `banking_api_server/routes/auth.js` lines 240-245: `req.session.accessToken` storage
- No client-side token storage in React app
- Session-based authentication middleware in all API routes

**Standards:** BFF pattern (IETF draft), OWASP session management

#### 3. JWKS-based Token Validation
**Why it qualifies:** Tokens validated using PingOne's public JWKS endpoint with signature verification.

**Evidence:**
- `banking_api_server/middleware/auth.js` lines 15-40: JWKS retrieval and caching
- `banking_mcp_server/src/middleware/auth.js` lines 25-60: JWT signature verification
- Environment variable: `PINGONE_JWKS_URI`

**Standards:** RFC 7517 (JWKS), RFC 7519 (JWT)

#### 4. MCP Protocol Gateway
**Why it qualifies:** Full MCP protocol implementation with initialize, tools/list, tools/call over WebSocket with JSON-RPC 2.0.

**Evidence:**
- `banking_mcp_server/src/server.js` lines 100-250: WebSocket server with JSON-RPC message handling
- `banking_mcp_server/src/handlers/toolsHandler.js`: tools/list and tools/call implementations
- `banking_mcp_server/src/tools/`: 8 banking tools (accounts, balance, transfer, etc.)
- Protocol version: `2024-11-05` in initialize response

**Standards:** MCP Protocol 2024-11-05, JSON-RPC 2.0

#### 5. OIDC ID Token Handling
**Why it qualifies:** ID tokens validated, parsed, and used for user identity with proper claims extraction.

**Evidence:**
- `banking_api_server/routes/auth.js` lines 220-235: ID token validation and claims extraction
- User object constructed from `sub`, `email`, `name` claims
- ID token signature verified against JWKS

**Standards:** OIDC Core 1.0

### Partially Implemented

#### 1. RFC 8693 Token Exchange
**What exists:** Token exchange endpoint called with correct parameters (grant_type, subject_token, audience, scope).

**What is missing:** No verification that PingOne actually issues `act` or `may_act` claims in the exchanged token. Code assumes delegation claims but does not validate their presence.

**Why partial:** The BFF sends RFC 8693-compliant requests, but there is no evidence (config files, PingOne policy screenshots, token inspection logs) that the response includes delegation claims. The code path for consuming `act` claims exists but may never execute.

**Evidence:**
- `banking_api_server/services/agentMcpTokenService.js` lines 45-80: Token exchange call with correct parameters
- Environment variable: `MCP_SERVER_RESOURCE_URI` (optional, controls whether exchange happens)
- **Missing:** No logged examples of tokens with `act` claim; no PingOne policy configuration documented

**Risk/Impact:** Medium. If PingOne does not issue `act` claims, the delegation chain is invisible. Audit trails will not show "BFF acting on behalf of user." The architecture assumes delegation but cannot prove it.

**Standards:** RFC 8693 (partial compliance — request format correct, response claim structure unverified)

#### 2. Token Introspection (RFC 7662)
**What exists:** MCP server calls PingOne introspection endpoint to validate tokens.

**What is missing:** Introspection not used consistently across all services. Banking API validates JWT signatures locally but does not introspect. No centralized introspection middleware.

**Why partial:** MCP server introspects, but the Banking API trusts signature-valid JWTs without checking revocation status or active flag.

**Evidence:**
- `banking_mcp_server/src/middleware/auth.js` lines 70-95: Introspection call to PingOne
- `banking_api_server/middleware/auth.js`: Only JWKS validation, no introspection
- Environment variable: `PINGONE_INTROSPECTION_ENDPOINT`

**Risk/Impact:** Medium. A revoked token with valid signature could still access Banking API until expiry. Zero-trust principle violated.

**Standards:** RFC 7662 (partial — implemented in MCP, missing in Banking API)

#### 3. CIBA (Client-Initiated Backchannel Authentication)
**What exists:** CIBA flow implemented with backchannel authorize, polling, and email-based consent.

**What is missing:** Error handling for expired auth_req_id, no retry logic for transient failures, no user-facing status beyond "waiting."

**Why partial:** Core flow works but lacks production-grade resilience and UX polish.

**Evidence:**
- `banking_api_server/routes/auth.js` lines 300-400: `/bc-authorize` and polling logic
- `banking_api_ui/src/components/UserDashboard.js` lines 200-250: CIBA UI with polling
- Environment variable: `CIBA_ENABLED`

**Risk/Impact:** Low. CIBA works for happy path but may confuse users or fail silently on edge cases.

**Standards:** OIDC CIBA 1.0 (partial — core flow implemented, error handling incomplete)

#### 4. LLM Tool Calling
**What exists:** LangChain agent with MCP tool integration, tool discovery, and invocation.

**What is missing:** No deterministic agent mode clearly separated in code or UX. Non-deterministic (LLM) flow is primary; deterministic flow not exposed.

**Why partial:** The architecture diagram shows both deterministic and non-deterministic paths, but the implementation only surfaces the LLM path prominently.

**Evidence:**
- `langchain_agent/src/agents/langchain_mcp_agent.py` lines 150-300: LangChain agent with tool calling
- MCP tools registered and callable
- **Missing:** Separate deterministic agent class or UI toggle

**Risk/Impact:** Low. Functional but UX does not match architecture intent.

**Standards:** N/A (architectural pattern, not RFC)

### Missing or Incomplete

#### 1. Token Revocation (RFC 7009)
**Why missing:** No call to PingOne's revocation endpoint on logout. Session cleared but token remains valid.

**Impact:** High security risk. Logged-out users' tokens can be replayed until expiry (typically 1 hour). Violates zero-trust and session termination best practices.

**Recommended path:**
```javascript
// In logout handler
await axios.post(process.env.PINGONE_REVOCATION_ENDPOINT, {
  token: req.session.accessToken,
  client_id: process.env.ADMIN_CLIENT_ID,
  client_secret: process.env.ADMIN_CLIENT_SECRET
});
```
Add error handling and log revocation status.

**Evidence:** `banking_api_server/routes/auth.js` lines 450-460: Logout clears session but no revocation call.

#### 2. Token Refresh
**Why incomplete:** Routes exist (`/api/auth/refresh`) but handler logic is stubbed. No automatic refresh before expiry.

**Impact:** High UX impact. Users logged out unexpectedly when tokens expire (typically 1 hour). No graceful session extension.

**Recommended path:**
- Implement refresh token exchange in `/api/auth/refresh`
- Add client-side timer to refresh 5 minutes before expiry
- Store refresh token in session alongside access token
- Implement refresh token rotation per RFC 6749 best practices

**Evidence:** `banking_api_server/routes/auth.js` lines 500-510: Route defined, handler returns 501 Not Implemented.

#### 3. Delegation-Chain Audit Logging
**Why missing:** Logs exist but do not extract or record `act` claims. No structured audit events with delegation chain.

**Impact:** Medium compliance risk. Cannot answer "who acted on behalf of whom" in audit reviews. Delegation chain invisible.

**Recommended path:**
- Extract `act` claim from tokens in middleware
- Log structured events: `{ user: sub, actor: act.client_id, action, resource, timestamp }`
- Add correlation IDs across BFF → MCP → Banking API
- Centralize logs in audit database or SIEM

**Evidence:** `banking_api_server/middleware/logging.js`: Generic request logging, no `act` claim extraction.

#### 4. Correlation IDs
**Why missing:** No request correlation IDs propagated across services.

**Impact:** Medium operational risk. Cannot trace a single user request through BFF → MCP → Banking API in logs.

**Recommended path:**
- Generate correlation ID in BFF on request entry
- Propagate via `X-Correlation-ID` header
- Log correlation ID in all services
- Include in error responses for debugging

**Evidence:** No correlation ID generation or propagation found in codebase.

#### 5. Health and Readiness Endpoints
**Why incomplete:** Basic health checks exist but do not verify PingOne connectivity, MCP server availability, or token service health.

**Impact:** Low operational risk. Cannot detect upstream failures proactively.

**Recommended path:**
- Add `/health/live` (process alive) and `/health/ready` (dependencies healthy)
- Check PingOne JWKS reachability, MCP WebSocket connection, database connectivity
- Return 503 if not ready

**Evidence:** `banking_api_server/server.js` line 500: Basic `/health` returns 200 always.

## Security Assessment

**Authentication Strengths:**
- OAuth 2.0 auth code flow with PKCE prevents authorization code interception
- State and nonce parameters prevent CSRF and replay attacks
- Session regeneration after login prevents session fixation
- JWKS-based signature validation ensures token authenticity
- BFF pattern prevents XSS token theft

**Authorization/Delegation Gaps:**
- **Critical:** `act`/`may_act` claims assumed but not verified. Delegation chain may not exist in practice.
- **High:** No scope enforcement middleware. Tokens accepted if signature valid, regardless of scope.
- **Medium:** Token introspection not universal — Banking API trusts signatures without checking active status.

**Token Lifecycle Weaknesses:**
- **Critical:** No token revocation on logout (RFC 7009). Tokens valid until expiry even after session ends.
- **High:** No token refresh. Sessions expire without renewal, forcing re-authentication.
- **Medium:** No token expiry buffer. Requests may fail mid-session as token expires.

**Replay/Session/Logout Risks:**
- **High:** Revoked sessions' tokens remain valid. Attacker with stolen token can replay until expiry.
- **Medium:** No detection of concurrent sessions. Same user can have unlimited active sessions.
- **Low:** Session cookies lack SameSite=Strict (set to Lax). Minor CSRF risk.

**Standards Compliance Concerns:**
- RFC 7009 (Token Revocation): Not implemented
- RFC 8693 (Token Exchange): Request compliant, response claim structure unverified
- RFC 7662 (Introspection): Partial — MCP only, not Banking API

## Operational Assessment

**Reliability Gaps:**
- No circuit breakers for PingOne API calls. Failures cascade without fallback.
- No retry logic with exponential backoff for transient errors.
- No rate limiting on token exchange or introspection calls.

**Refresh/Revocation Gaps:**
- Token refresh handler stubbed — users cannot extend sessions.
- No revocation on logout — security and compliance gap.
- No refresh token rotation — refresh tokens never expire or rotate.

**Error Handling Issues:**
- Generic error messages returned to client. No distinction between auth failure types.
- No structured error logging. Errors logged as strings, not JSON with context.
- CIBA polling errors not surfaced to user. Infinite wait on failure.

**Monitoring and Health Visibility Gaps:**
- No metrics on token exchange success/failure rates.
- No alerting on introspection failures or JWKS fetch errors.
- No dashboard for active sessions, token expiry distribution, or delegation chain usage.
- Health endpoint does not verify dependencies.

## Audit and Observability Assessment

**Delegation-Chain Traceability:**
- **Missing:** No extraction of `act` claim from tokens.
- **Missing:** No logging of "user X via actor Y" in audit events.
- **Missing:** No visualization or query capability for delegation chains.
- **Impact:** Cannot answer compliance questions about delegation. Audit trail incomplete.

**`act` Claim Visibility:**
- **Assumed but unverified:** Code paths exist to consume `act` claims, but no evidence they are present in tokens.
- **No validation:** Even if present, `act` claims not validated against expected actor list.
- **No logging:** `act` claims not extracted or logged anywhere.

**Correlation IDs:**
- **Missing:** No correlation ID generation or propagation.
- **Impact:** Cannot trace requests across BFF → MCP → Banking API.
- **Workaround:** Timestamps and user IDs can partially correlate, but not reliably.

**Structured Audit Logging:**
- **Partial:** Logs exist but unstructured (plain text, not JSON).
- **Missing:** No audit-specific log stream separate from application logs.
- **Missing:** No immutable audit log storage or SIEM integration.
- **Impact:** Difficult to query, analyze, or prove compliance.

**Missing Evidence Trails:**
- No proof that `act` claims are issued by PingOne.
- No logged examples of delegation chains in production.
- No documentation of PingOne policy configuration for token exchange.
- No test cases validating delegation claim presence.

## Alignment Scorecard

| Area | Score | Rationale |
|------|-------|-----------|
| **OAuth/OIDC** | 95/100 | Auth code + PKCE, JWKS, ID tokens fully implemented. Missing only revocation. |
| **Token Exchange** | 70/100 | RFC 8693 request format correct. Response delegation claims unverified. No evidence of `act` issuance. |
| **MCP Integration** | 90/100 | Protocol fully implemented. Token introspection works. Missing only correlation IDs. |
| **AI Agent Flow** | 75/100 | LLM tool calling works. CIBA implemented. Deterministic flow not separated. |
| **Security** | 65/100 | Strong auth fundamentals. Critical gaps: no revocation, no refresh, delegation claims unverified. |
| **Auditability** | 50/100 | Basic logging exists. Missing delegation-chain extraction, correlation IDs, structured audit events. |
| **Operations** | 60/100 | Works for happy path. Missing refresh, health checks incomplete, no metrics/alerting. |
| **UX Clarity** | 70/100 | Functional but does not distinguish deterministic vs non-deterministic agent modes. |

**Overall Alignment: 78/100**

## Recommended Roadmap

### Priority 1: High Impact / Low to Medium Effort

#### 1. Implement Token Revocation (RFC 7009)
**Why it matters:** Security and compliance requirement. Tokens must be invalidated on logout.

**Expected impact:** Eliminates token replay risk after logout. Aligns with zero-trust principles.

**Implementation notes:**
- Add revocation call in logout handler
- Revoke both access and refresh tokens
- Log revocation success/failure
- Handle revocation endpoint errors gracefully (log but don't block logout)
- Estimated effort: 4-8 hours

#### 2. Verify and Document `act` Claim Issuance
**Why it matters:** Entire delegation architecture depends on this. Currently assumed but unproven.

**Expected impact:** Confirms whether delegation chain is real or theoretical. Informs next steps.

**Implementation notes:**
- Perform token exchange in test environment
- Inspect returned token for `act` claim
- Document PingOne policy configuration required
- If missing, either configure PingOne or remove delegation assumptions from architecture
- Estimated effort: 2-4 hours

#### 3. Add Correlation IDs
**Why it matters:** Essential for debugging and tracing requests across services.

**Expected impact:** Enables end-to-end request tracing. Improves incident response time.

**Implementation notes:**
- Generate UUID in BFF on request entry
- Propagate via `X-Correlation-ID` header to MCP and Banking API
- Log correlation ID in all services
- Include in error responses
- Estimated effort: 4-6 hours

### Priority 2: High Impact / High Effort

#### 4. Complete Token Refresh Implementation
**Why it matters:** Users should not be logged out unexpectedly. Sessions should extend gracefully.

**Expected impact:** Improves UX significantly. Reduces re-authentication friction.

**Implementation notes:**
- Implement `/api/auth/refresh` handler with refresh token exchange
- Store refresh token in session alongside access token
- Add client-side timer to refresh 5 minutes before expiry
- Implement refresh token rotation per RFC 6749 best practices
- Handle refresh failures (expired refresh token → force re-login)
- Estimated effort: 16-24 hours

#### 5. Implement Delegation-Chain Audit Logging
**Why it matters:** Compliance and security visibility. Must be able to answer "who did what on behalf of whom."

**Expected impact:** Enables audit trail analysis. Supports compliance reporting.

**Implementation notes:**
- Extract `act` claim from tokens in middleware
- Log structured JSON events: `{ user, actor, action, resource, timestamp, correlationId }`
- Create separate audit log stream
- Add query API for audit events
- Consider immutable storage (append-only log or SIEM)
- Estimated effort: 20-30 hours

#### 6. Extend Token Introspection to All Services
**Why it matters:** Zero-trust principle. Every service should verify token is active, not just well-formed.

**Expected impact:** Prevents revoked tokens from being accepted. Closes security gap.

**Implementation notes:**
- Add introspection middleware to Banking API
- Cache introspection results (1-5 minutes) to reduce PingOne load
- Handle introspection endpoint failures gracefully
- Log introspection failures for alerting
- Estimated effort: 12-16 hours

### Priority 3: Medium Impact / Low Effort

#### 7. Improve Health Checks
**Why it matters:** Enables proactive detection of upstream failures.

**Expected impact:** Faster incident detection. Better operational visibility.

**Implementation notes:**
- Add `/health/ready` endpoint
- Check PingOne JWKS reachability, MCP WebSocket, database connectivity
- Return 503 if dependencies unhealthy
- Integrate with load balancer health checks
- Estimated effort: 4-6 hours

#### 8. Add Scope Enforcement Middleware
**Why it matters:** Tokens should be validated for correct scope, not just signature.

**Expected impact:** Prevents privilege escalation. Enforces least-privilege principle.

**Implementation notes:**
- Create middleware to extract and validate `scope` claim
- Reject requests if required scope missing
- Log scope validation failures
- Document required scopes per endpoint
- Estimated effort: 6-8 hours

#### 9. Separate Deterministic Agent Flow in UX
**Why it matters:** Architecture diagram shows both flows. UX should match.

**Expected impact:** Clearer user experience. Aligns implementation with design.

**Implementation notes:**
- Add UI toggle or separate page for deterministic agent
- Create deterministic agent class (no LLM, direct tool mapping)
- Document when to use each mode
- Estimated effort: 8-12 hours

## Final Conclusion

**Architecturally sound:** Yes. The core OAuth 2.0 + OIDC implementation is RFC-compliant, the BFF pattern is correctly applied, token exchange is structurally correct, and the MCP gateway follows protocol specifications. The foundation is solid.

**Production-ready for core flows:** Partially. The authentication and authorization flows work correctly for the happy path. However, critical operational gaps (no revocation, no refresh) and unverified delegation claims make this not fully production-ready. It is suitable for demo or pilot but requires hardening for production.

**What prevents full alignment:**
1. **Token revocation missing** — security and compliance gap
2. **`act`/`may_act` claims unverified** — delegation architecture assumed but not proven
3. **Token refresh incomplete** — poor UX, sessions expire without renewal
4. **Audit logging lacks delegation-chain extraction** — compliance gap
5. **No correlation IDs** — operational visibility gap

**Shortest path to near-100% alignment:**
1. **Week 1:** Implement token revocation (Priority 1.1) and verify `act` claim issuance (Priority 1.2)
2. **Week 2:** Add correlation IDs (Priority 1.3) and complete token refresh (Priority 2.4)
3. **Week 3-4:** Implement delegation-chain audit logging (Priority 2.5) and extend introspection (Priority 2.6)
4. **Week 5:** Add scope enforcement (Priority 3.8) and improve health checks (Priority 3.7)

This roadmap addresses the critical security gaps (revocation, refresh), proves or disproves the delegation architecture (`act` claims), and closes the major operational and audit gaps. Estimated total effort: 60-90 hours of focused engineering work.

The implementation is 78% aligned with the target architecture. With the Priority 1 and Priority 2 work completed, alignment would reach 95%+. The architecture is fundamentally correct; the gaps are in operational completeness and evidence of delegation claim issuance.
