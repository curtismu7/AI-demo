# Phase 245 Research — 403 Scope Trap & Token Introspection

**Phase:** 245 — 403 scope trap and token introspection
**Date:** 2026-04-27

---

## Executive Summary

Two independent concerns in this phase:

1. **403 Scope Trap (SCOPE-01/02/03):** When the MCP tool call layer returns a `mcp_scope_denied` error (code `mcp_insufficient_scope`), the agent currently dead-ends. The fix is to intercept the error in `bankingAgentLangGraphService.js` (heuristic path) and `mcpToolRegistry.js` (LangGraph tool wrapper path), perform an RFC 8693 token exchange requesting the missing scopes, and re-issue the tool call with the upgraded token — exactly once to avoid loops.

2. **Token Introspection Consolidation (INTROSPECT-01/02):** Two parallel introspection implementations exist — `middleware/tokenIntrospection.js` and `services/tokenIntrospectionService.js` — each with its own in-memory cache, different TTLs, and different credential resolution. The middleware's cache key is `token.substring(0, 20)` (collision risk). They must be consolidated so the middleware delegates to the service, and the service uses SHA-256 hash cache keys.

---

## Domain Research

### A. Pattern: AI Agent 403 Scope Upgrade (RFC 8693)

The industry-standard pattern for AI agent scope escalation is:

```
Agent receives 403 { error: "insufficient_scope", missingScopes: ["banking:write"] }
  ↓
Agent intercepts BEFORE surfacing to user
  ↓
BFF performs RFC 8693 Token Exchange:
  POST /as/token
  grant_type=urn:ietf:params:oauth:grant-type:token-exchange
  subject_token=<current_access_token>
  scope=<current_scopes> <missing_scopes>
  audience=<resource_server_uri>
  ↓
PingOne returns new access_token with expanded scope
  ↓
Retry original tool call with new token (exactly once)
  ↓
If still 403: surface error to user (cannot escalate further)
```

This is aligned with what the BFF already exposes via `oauthService.performTokenExchange()`. The missing piece is wiring it into the agent tool dispatch layer.

**Key constraint:** The scope upgrade MUST only happen once per tool call to prevent infinite retry loops. Track with a flag `_scopeUpgradeAttempted: true` on the error or a local boolean.

**Agentic Systems pattern (LLM AgentExecutor tools):** When a LangGraph tool node throws, the exception propagates to the executor. The correct place to intercept is inside the tool's `async (input, config) => {}` wrapper in `mcpToolRegistry.js`, not in the LangGraph graph itself. This keeps the scope upgrade logic co-located with the tool call and invisible to the LLM.

### B. Token Introspection Consolidation

**Current state (two implementations):**

| File | Cache key | TTL | Credentials | Issues |
|------|-----------|-----|-------------|--------|
| `middleware/tokenIntrospection.js` | `token.substring(0, 20)` — COLLISION RISK | 60s | `PINGONE_CLIENT_ID \|\| ADMIN_CLIENT_ID` (fallback) | Duplicate cache, insecure key |
| `services/tokenIntrospectionService.js` | `sha256(token)` | 30s | `PINGONE_WORKER_CLIENT_ID` | Cache never pruned (memory leak) |

**Target state:**
- `middleware/tokenIntrospection.js`: delegates to `tokenIntrospectionService.validateToken()`, removes its own `introspectToken()` and `introspectionCache`
- `services/tokenIntrospectionService.js`: adds `setInterval` eviction (60s), uses `PINGONE_WORKER_CLIENT_ID` consistently
- Single source of truth for all introspection calls

**RFC 7662 compliance check:** PingOne's `/as/introspect` returns `{ active: boolean, scope, sub, exp, aud, client_id }`. Active = false means revoked or expired. Both implementations already handle this correctly; the consolidation is a robustness/security fix, not a behavior change.

### C. Existing code anchor points

**403 scope denial path:**
- `banking_api_server/server.js:1527-1542` — catches `err.code === 'mcp_insufficient_scope'`, returns `{ error: 'mcp_scope_denied', missingScopes, requiredScopes, availableScopes }`
- `banking_api_server/utils/mcpToolRegistry.js:101-150` — `callMcpTool()` calls `/api/mcp/tool` but does NOT handle 403; throws generic error
- `banking_api_ui/src/components/BankingAgent.js:4040` — `sendAgentMessage` NL path handles `response.error === 'mcp_scope_denied'` to show consent modal in UI
- `banking_api_ui/src/services/bankingAgentService.js:241` — `callMcpTool` in service detects `mcp_scope_denied`

**Token exchange:**
- `banking_api_server/services/oauthService.js` — exports `performTokenExchange(token, audience, scopes)`
- `banking_api_server/services/enhancedTokenExchangeService.js` — higher-level wrapper
- `banking_api_server/services/agentMcpTokenService.js` — `exchangeTokenRfc8693()` used during MCP gateway path

**Introspection files:**
- `banking_api_server/middleware/tokenIntrospection.js` (187 lines) — used by server.js `/api/mcp/tool`
- `banking_api_server/services/tokenIntrospectionService.js` (206 lines) — used by MCP gateway

---

## Architecture Decisions

### Decision A-1: Where to intercept 403 for scope upgrade

**Option 1:** In `callMcpTool()` (BFF internal tool dispatcher, `mcpToolRegistry.js`)  
**Option 2:** In `callMcpToolInternal()` (direct WebSocket path)  
**Option 3:** In `processAgentMessage` / `executeHeuristicBanking` in `bankingAgentLangGraphService.js`

**Recommendation: Option 1** — modify `callMcpTool()` in `mcpToolRegistry.js`. This is the central dispatcher for all MCP tool calls from the agent layer. Adding scope upgrade here:
- Covers both heuristic and LangGraph paths
- Requires the BFF's user token to be passed through (already available via `agentToken`)
- Keeps scope upgrade logic out of the LLM reasoning loop

**Token exchange API to use:** `oauthService.performTokenExchange(currentToken, mcpAudience, [...currentScopes, ...missingScopes])`

### Decision A-2: Scope upgrade once-only guard

Use a `scopeUpgradeAttempted` boolean flag local to the `callMcpTool()` function, before the first call. If the upgraded token also returns 403, propagate the original scope error to the caller without retrying.

### Decision B-1: Consolidation approach

Modify `middleware/tokenIntrospection.js` to delegate to `tokenIntrospectionService.validateToken()`. Keep the exported function signatures for backward compat.

Fix `tokenIntrospectionService.js`:
1. Cache key: already SHA-256 (correct) ✅
2. Add `setInterval` eviction every 60s
3. Fix type guard: `if (typeof token !== 'string' || !token.trim()) return { valid: false };`
4. Fix `logAppEvent` to use `EVENT_CATEGORIES.TOKEN_INTROSPECTION` (import needed)

---

## Don't Hand-Roll

- Do NOT reimplement the RFC 8693 exchange — use `oauthService.performTokenExchange()` (already tested, already wired to PingOne)
- Do NOT add a new HTTP call for introspection — use `tokenIntrospectionService.validateToken()` through the consolidated middleware

---

## Common Pitfalls

1. **Retry loops:** Without a `scopeUpgradeAttempted` guard, a misconfigured PingOne policy could cause infinite 403 → exchange → 403 cycles. Hard-code max 1 retry.
2. **Audience mismatch:** Token exchange must use the same `audience` (MCP resource server URI) as the original call. Read it from `process.env.MCP_SERVER_RESOURCE_URI`.
3. **Stale cache after scope upgrade:** After a successful token exchange, the introspection cache for the old token must not interfere. New token = new cache entry — no issue since SHA-256 key is token-specific.
4. **Double middleware cache:** If `middleware/tokenIntrospection.js` is not fully consolidated, a revoked token could be active in one cache and invalid in another. The consolidation must remove the middleware's local cache entirely.

---

## Impact Assessment

### Files to modify:

| File | Change |
|------|--------|
| `banking_api_server/utils/mcpToolRegistry.js` | Add scope upgrade + retry in `callMcpTool()` |
| `banking_api_server/middleware/tokenIntrospection.js` | Delete local cache + `introspectToken()`, delegate to service |
| `banking_api_server/services/tokenIntrospectionService.js` | Add `setInterval` eviction, type guard, fix logAppEvent |
| `banking_api_ui/src/components/BankingAgent.js` | Update `mcp_scope_denied` handler to show "Upgraded scope & retried" message path (minor UX) |

### No changes needed:
- `oauthService.js` — already has `performTokenExchange`
- `bankingAgentLangGraphService.js` — scope upgrade happens before it sees the result
- `server.js` — `mcp_scope_denied` return stays for edge cases where upgrade fails

---

## Validation Architecture

### SCOPE-01: 403 trapped and retried
- Trigger: call a tool requiring `banking:write` with a `banking:read`-only token
- Expected: agent silently upgrades token and returns successful tool result
- Test: `mcpToolRegistry.js` unit test mocking `performTokenExchange` + second `callMcpToolInternal` succeeding

### SCOPE-02: Upgrade failure surfaced cleanly
- Trigger: exchange succeeds but upgraded token still returns 403
- Expected: error message to user with scope details, NO retry loop
- Test: mock exchange succeeds, second call returns 403 → verify only 2 total calls, not 3+

### SCOPE-03: No token exchange for non-scope 403s
- Trigger: 403 for delegation error (wrong `act` claim) — NOT a scope error
- Expected: error propagated directly, no exchange attempted
- Test: err.code !== 'mcp_insufficient_scope' → no exchange call

### INTROSPECT-01: Consolidated introspection single cache
- Verify `middleware/tokenIntrospection.js` no longer has its own `introspectionCache` Map
- Verify all introspection calls go through `tokenIntrospectionService.validateToken()`

### INTROSPECT-02: Cache eviction runs
- Verify `setInterval` in `tokenIntrospectionService.js` with 60s interval
- Verify expired entries (Date.now() >= expiresAt) are removed
