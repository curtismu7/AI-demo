# Phase 267 Research: Wire Path A End-to-End Through MCP Gateway

**Date:** 2026-05-25
**Status:** Complete — most Phase 267 work is already implemented; this is a gap-closure and test-fix plan

---

## 1. What Was Already Built (Pre-planned Interim Work)

### 1.1 demo_mortgage_service (COMPLETE)
- `demo_mortgage_service/server.js` — Express app on :8082, single `GET /mortgage` route + 4 other vertical routes (retail, healthcare, gear, expense)
- X-API-Key middleware (constant-time compare), graceful shutdown, `/health` endpoint
- `run.sh` fully wired: LOG_MORTGAGE, PID_MORTGAGE, port 8082, SVC_LIST, wait_for_health
- CLAUDE.md updated with `demo_mortgage_service` as the 8th Node service

### 1.2 Gateway Routing (COMPLETE)
- `demo_mcp_gateway/src/router.ts`: `APIKEY_TOOLS` set includes `show_mortgage`, `show_large_purchase`, etc.
- `backendHttpUrl('apikey', 'show_mortgage', config)` returns `http://localhost:8082/mortgage`
- Other apikey tools return `''` (Gateway-only marker behavior preserved)
- `routeTool('show_mortgage')` returns `'apikey'`

### 1.3 Gateway Dispatch (COMPLETE)
- `demo_mcp_gateway/src/apiKeyDispatch.ts` — `buildApiKeyToolResult()` shared by BOTH WS and HTTP transports (BL-02 transport parity)
- WS handler (`index.ts`) calls `buildApiKeyToolResult` for apikey disposition
- HTTP middleware (`authorizeMcpRequest.ts`) calls `buildApiKeyToolResult` for apikey-routed tools before OLB forward
- Result includes `_meta.credentialPath`, `_meta.maskedApiKey`, `_meta.tokenEvents` with full evt chain
- Error handling: 401 → -32401, ECONNREFUSED → -32500

### 1.4 Scope Enforcement (COMPLETE)
- `scope-topology.json`: `show_mortgage` requires `["mortgage:read"]` (surface: gateway)
- `evaluateScopeDecisionLocally()` in `auth/toolScopes.ts` enforces this
- BOTH transports (WS `guardToolCall`, HTTP `PingOneAuthorizeClient.evaluate`) use the same local evaluation when PingOne Authorize is unconfigured
- `/.well-known/oauth-protected-resource` metadata includes `mortgage:read`

### 1.5 BankingAgent Dispatch Upgrade (COMPLETE)
- `demo_api_ui/src/components/BankingAgent.js` case `"mortgage_demo"` calls `callMcpTool("show_mortgage", {})`
- Full error handling: scope error → helpful message about re-login; backend error → generic message
- Navigates to `/path/mortgage` with `state: { mortgagePayload }`
- TokenChain events set from `mortgageResp.tokenEvents`

### 1.6 MortgagePathPage (COMPLETE)
- `demo_api_ui/src/components/MortgagePathPage.jsx` reads `location.state?.mortgagePayload`
- Renders mortgage data card + credential-swap explanation card with masked API key (last 4)
- Empty-state when no payload present

### 1.7 Architecture Diagrams (COMPLETE)
- `ArchitectureFlowPage.js`: `api-key-backend` node label = `banking_mortgage_service`, `aspirational: false`
- `mcp-security-gateway.mmd`: Path A node is `banking_mortgage_service :8082 (LIVE - Path A, Phase 267)`
- `architecture.mmd` and `i4ai-ref-arch.mmd`: mortgage service is live

### 1.8 Scope in PingOne / Token Flow (COMPLETE — but tests disagree)
- `scope-topology.json` scope name: `mortgage:read` (NOT `banking:mortgage:read`)
- `demo_api_server/config/scopes.js`: `MORTGAGE_READ: 'mortgage:read'`
- BankingAgent.js error message uses `mortgage:read`

---

## 2. What Is Broken (Failing Tests)

### 2.1 mortgageDispatch.test.ts — Scope Name Mismatch
**Root cause:** Tests assert `'banking:mortgage:read'` but `scope-topology.json` defines `'mortgage:read'`

Failing tests:
- `show_mortgage requires banking:mortgage:read` — SSOT says `mortgage:read`
- `missing scope → DENY` — `missingScopes` is `['mortgage:read']` not `['banking:mortgage:read']`
- `scope present → PERMIT` — test passes token with `banking:mortgage:read` but gateway requires `mortgage:read` → DENY
- `irregular whitespace in the claim is tolerated` — same mismatch
- `both PERMIT when banking:mortgage:read is present` — WS/HTTP parity test fails
- `a banking:read-only tool still PERMITs with a basic bearer` — fails because test passes `banking:read` but gateway requires `read`

**Fix:** Update `mortgageDispatch.test.ts` to use current scope names from scope-topology.json:
- `'banking:mortgage:read'` → `'mortgage:read'`
- `'banking:read'` → `'read'`
- `'banking:write'` → `'write'`

### 2.2 scopeTopology.test.ts — Scope Name Mismatch
**Root cause:** Tests assert old `banking:*` prefix scopes, SSOT now uses unprefixed names

Failing tests:
- `create_transfer requires banking:write + banking:transfer` — SSOT says `['write', 'transfer']`
- `unknown tool falls back to [banking:read]` — SSOT fallback is `['read']`

**Fix:** Update assertions to match scope-topology.json:
- `['banking:write', 'banking:transfer']` → `['write', 'transfer']`
- `['banking:read']` → `['read']`

### 2.3 gateway-auth.test.ts, gateway-passthrough.test.ts, gateway-server.test.ts, gateway-get-delete-middleware.test.ts — Missing GatewayConfig Fields
**Root cause:** `GatewayConfig` interface was extended with `introspectionClientId` and `introspectionClientSecret` fields (post-Phase 267), but test `stubConfig` objects don't include them → TypeScript compile errors (TS2739)

**Fix:** Add `introspectionClientId: ''` and `introspectionClientSecret: ''` to every `stubConfig` / `stubConfigNoAuthz` constant in these 4 test files

---

## 3. What Is Not Yet Done

### 3.1 PingOne Console Checklist
CONTEXT.md item 5: A console task checklist documenting PingOne setup steps for `mortgage:read` scope. The REGRESSION_PLAN.md §4 (2026-05-18 "Bootstrap MCP-app create crash + user-app mortgage scope") shows the scope IS in the topology and bootstrap was fixed. A brief documentation note is still valuable as part of the phase summary.

### 3.2 REGRESSION_PLAN.md §4 Entry
Phase 267 does not yet have a proper §4 entry for the test fixes.

---

## 4. Validation Architecture

### Test commands to verify completion
```bash
# Gateway tests — must be 0 failures
cd demo_mcp_gateway && npm test

# Mortgage service tests
cd demo_mortgage_service && npm test

# UI build — must exit 0
cd demo_api_ui && npm run build
```

### Behavioral verification
1. Run `./run.sh` — all 8 services start (including demo_mortgage_service on :8082)
2. Log in, type "show mortgage data" in agent chat
3. Agent calls `show_mortgage` → gateway swap → `/path/mortgage` rendered with mortgage card + masked API key
4. TokenChain shows: inbound bearer → scope PERMIT (mortgage:read) → credential swap → outbound X-API-Key call

---

## 5. Pattern Notes

### Test stub pattern for GatewayConfig
All test files that define a `GatewayConfig` stub must include ALL fields from the interface. The minimal additions needed for files broken by `introspectionClientId`/`introspectionClientSecret`:
```typescript
// Add to every stubConfig that is missing these:
introspectionClientId: '',
introspectionClientSecret: '',
```

### Scope name convention
All gateway scopes are now short-form without `banking:` prefix:
- `read`, `write`, `transfer` — core banking
- `mortgage:read`, `largepurchase:read`, etc. — feature scopes
- `ai_agent`, `ai:agent:read` — agent scopes
This is the SSOT in `scope-topology.json` and is reflected in `demo_api_server/config/scopes.js`.

---

## RESEARCH COMPLETE

Phase 267 core work is done. The remaining tasks are:
1. Fix 2 test files with wrong scope names (`mortgageDispatch.test.ts`, `scopeTopology.test.ts`)
2. Fix 4 test files with missing `GatewayConfig` fields (TS2739 compile errors)
3. Add REGRESSION_PLAN.md §4 entry for this fix batch
