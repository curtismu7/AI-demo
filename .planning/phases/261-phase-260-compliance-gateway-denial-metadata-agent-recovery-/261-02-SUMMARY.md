# 261-02 SUMMARY — Wave 2: Agent Error Propagation + Recovery Branching

**Status:** Complete  
**Commit:** `5235f7c9`  
**Phase:** 261 — Compliance: Gateway Denial Metadata + Agent Recovery

---

## What Was Done

### Task 1: mcpGatewayClient.ts + tokenResolver.ts

**`banking_agent_service/src/mcpGatewayClient.ts`**
- Added `McpGatewayError` class exported from the module. Preserves the full JSON-RPC error structure: `code: number`, `message: string`, `data?: unknown`.
- Changed `callTool()` to `throw new McpGatewayError(code, message, data)` instead of the previous `throw new Error(message)` which discarded code and data.

**`banking_agent_service/src/tokenResolver.ts`**
- Added optional `requestedScopes?: string[]` parameter to `resolveGatewayToken()`.
- Cache key changed from `hash(userToken)` to `hash(userToken):sortedScopes` so different scope requirements get different cached tokens. Backward compatible — callers passing no scopes share one cache entry as before.

### Task 2: agentOrchestrator.ts — Recovery Branches

**`banking_agent_service/src/agentOrchestrator.ts`**
- Imported `McpGatewayError` from `./mcpGatewayClient`.
- Added `LoginRequiredError` (exported) — thrown when gateway returns error code `-32403`. Carries `requiredScopes: string[]` and `loginRequired: true`.
- Added `HitlRequiredError` (exported) — thrown when gateway returns error code `-32002`. Carries `challengeId`, `challengeType: 'consent' | 'step_up'`, `expiresAt`.
- Both Anthropic and OpenAI tool call paths now wrapped in try/catch that:
  - Catches `McpGatewayError` and branches on `code`
  - `-32403` → throws `LoginRequiredError(d.required_scopes)`
  - `-32002` → throws `HitlRequiredError(d.challengeId, d.challenge_type, d.expiresAt)`
  - All other errors re-thrown unchanged

---

## Verification Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Exit 0 ✅ |
| `McpGatewayError` occurrences in mcpGatewayClient.ts | 3 ✅ (≥2) |
| `LoginRequiredError` + `-32403` in agentOrchestrator.ts | 6 ✅ (≥2) |
| `HitlRequiredError` + `-32002` in agentOrchestrator.ts | 6 ✅ (≥2) |
| `scopeKey`/`requestedScopes` in tokenResolver.ts | 3 ✅ (≥2) |

---

## Files Modified

| File | Change |
|---|---|
| `banking_agent_service/src/mcpGatewayClient.ts` | +McpGatewayError class; callTool() throws it |
| `banking_agent_service/src/tokenResolver.ts` | +requestedScopes param; scope-aware cache key |
| `banking_agent_service/src/agentOrchestrator.ts` | +LoginRequiredError, +HitlRequiredError; recovery catch in both Anthropic + OpenAI tool paths |

---

## Contracts for Wave 3

Wave 3 (BFF structured responses) depends on these exported error types:

```typescript
// From banking_agent_service/src/agentOrchestrator.ts
export class LoginRequiredError extends Error {
  readonly requiredScopes: string[];
  readonly loginRequired = true as const;
}
export class HitlRequiredError extends Error {
  readonly challengeId: string;
  readonly challengeType: 'consent' | 'step_up';
  readonly expiresAt: string;
}
```

The BFF (`bankingAgentRoutes.js`) should `catch` these from the agent service response and map them to structured HTTP responses — see 261-03-PLAN.md.

---

## Must-Haves Verified

- ✅ `mcpGatewayClient.callTool()` preserves `error.code` and `error.data` from gateway responses
- ✅ `tokenResolver.ts` cache key includes sorted scopes (scope-aware cache)
- ✅ `agentOrchestrator` branches on `-32403` (login_required) and `-32002` (hitl_required) error codes
- ✅ Agent throws a typed recovery error that the BFF (Wave 3) can parse
