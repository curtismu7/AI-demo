---
phase: 195-phase-172-security-hardening
plan: 01
status: complete
---

# Phase 195 Summary: Phase 172 Security Hardening — act Claim Validation, Status Codes, Fallback Removal, and Test Coverage

## Context

Code review of the dual-token / Phase 172 implementation against the original design decisions (D-01 through D-04) identified four categories of gaps. This phase closes all of them.

## What Was Done

### Fix 1 — DELEGATION_CLAIM_MISSING status code 403 → 401 (HIGH)

**Files:** `banking_api_server/services/errorSchemaService.js`, `banking_api_server/src/services/errorSchemaService.js`

Changed `DELEGATION_CLAIM_MISSING` from 403 Forbidden to 401 Unauthorized in both the CJS and ESM copies of the status code map. Missing `act` is an authentication failure (delegation was not proven), not an authorization failure. Both middleware files consume this via `getStatusCode()` / `STATUS_CODE_MAP`, so the fix propagates automatically.

### Fix 2 — `act` claim structural validation (HIGH)

**Files:** `banking_api_server/middleware/delegationErrorMiddleware.js`, `banking_api_server/src/middleware/delegationErrorMiddleware.js`

Added a structural check after the presence check in both CJS and ESM middleware versions. When `act` is present but malformed (not an object, or missing both `sub` and `client_id`), the middleware now returns 403 `INSUFFICIENT_PERMISSIONS` with an RFC 8693 §2.2 teaching message. Previously `act: {}` or `act: null` would silently pass through.

### Fix 3 — Remove subject-only fallback in 1-exchange path (MEDIUM)

**File:** `banking_api_server/services/agentMcpTokenService.js`

Deleted the `if (actorToken)` subject-only fallback block (previously lines 1028–1047). When the actor exchange fails the service now hard-throws the original error (D-04). The fallback was counterproductive: a token without an `act` claim would have been rejected by the banking API's `requireDelegation` check anyway, producing a confusing two-step failure instead of a clear early error.

### Fix 4 — D-02 act claim validation at MCP server boundary (HIGH)

**File:** `banking_mcp_server/src/tools/BankingToolProvider.ts`

After `tokenExchangeService.exchangeToken()` succeeds, the provider now decodes the returned JWT payload and validates that `act.sub` or `act.client_id` is a non-empty string before the token is cached or forwarded to `BankingAPIClient`. If the check fails the tool call hard-errors with a clear RFC 8693 message. This implements D-02 at the MCP server boundary without touching shared banking routes used by the browser. Added private `decodeJwtPayload()` helper method.

### Fix 5 — Token exchange test coverage (HIGH)

**File:** `banking_mcp_server/tests/tools/BankingToolProvider.test.ts`

Added `describe('token exchange (D-01, D-02, D-04)')` block with 5 tests and `tokenCache.clear()` isolation in `beforeEach`/`afterEach`:

| Test | Validates |
|---|---|
| D-04: exchange throws → hard fail | Raw user token never forwarded to API |
| D-02: no `act` claim | Hard fail before cache or API call |
| D-02: empty `act: {}` | Hard fail before cache or API call |
| D-01: delegation token used for API call | Exchanged token used, never raw session token |
| D-01: cache hit on second call | `exchangeToken` called exactly once across two tool calls |

All 5 new tests pass. Build exits 0.

## Artifacts Modified

| File | Change |
|---|---|
| `banking_api_server/services/errorSchemaService.js` | `DELEGATION_CLAIM_MISSING: 403 → 401` |
| `banking_api_server/src/services/errorSchemaService.js` | Same |
| `banking_api_server/middleware/delegationErrorMiddleware.js` | Added `act` structural validation block |
| `banking_api_server/src/middleware/delegationErrorMiddleware.js` | Same |
| `banking_api_server/services/agentMcpTokenService.js` | Removed subject-only fallback; hard-throw on actor exchange failure |
| `banking_mcp_server/src/tools/BankingToolProvider.ts` | D-02 act claim check after exchange; `decodeJwtPayload()` helper |
| `banking_mcp_server/tests/tools/BankingToolProvider.test.ts` | 5 new token exchange tests + `tokenCache` isolation |

## Phase 172 D-Decision Coverage After This Phase

| Decision | Status |
|---|---|
| D-01: Lazy + TTL-cached exchange, auto re-exchange | ✅ Implemented + tested |
| D-02: Banking API validates `act` required | ✅ Enforced at MCP boundary + structural check in middleware |
| D-03: Scope narrowing per tool | ✅ Implemented (unchanged) |
| D-04: Hard fail on exchange error, no raw token fallback | ✅ Enforced in both BFF and MCP server; fallback removed |

## Verification

- `cd banking_mcp_server && npm run build` → exit 0 (TypeScript clean)
- `npx jest tests/tools/BankingToolProvider.test.ts` → 5 new tests pass, 24 existing pass
