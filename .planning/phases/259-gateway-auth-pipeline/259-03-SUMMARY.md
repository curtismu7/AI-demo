# Plan 259-03 Summary — Gateway Introspection, Audit Trail, Amount-Aware Authorize

**Phase:** 259 — Gateway auth pipeline (introspection, amount-aware step-up, SSE decision reporting)
**Plan:** 03 (Wave 2)
**Status:** ✅ COMPLETE
**Commit:** [b89444a8](https://github.com/cmuir/P1Import-apps/commit/b89444a8)

## Objective

Implement the core gateway authentication pipeline wiring: RFC 7662 active-token introspection (Step 0), transaction amount forwarding to PingOne Authorize, and audit trail tracking through all decision points.

## Tasks Completed

### Task 1: Update `PingOneAuthorizeClient.ts` for transaction parameters

**File:** `banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts`

**What changed:**
- Added `ToolArgs` interface: `{ amount?: number, transaction_type?: string, to_account_id?: string, [key: string]: unknown }`
- Updated `evaluate()` signature: Added `toolArgs?: ToolArgs` parameter
- Updated request body parameters sent to PingOne Authorize endpoint:
  - `TransactionAmount`: `String(toolArgs?.amount || '')`
  - `TransactionType`: `toolArgs?.transaction_type ?? toolName ?? ''`
  - `ToAccountId`: `toolArgs?.to_account_id ?? ''`

**Impact:** Enables amount-aware policy decisions at PingOne Authorize layer. Threshold-based step-up can now evaluate transaction size.

### Task 2: Complete rewrite of `authorizeMcpRequest.ts` middleware for introspection + audit trail

**File:** `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts`

**What changed:**

#### Imports & Interfaces
- Added import: `GatewayIntrospectionClient` and `IntrospectionResult` type
- Added interface: `GwAuditTrail` with three tracked fields:
  - `introspection`: `{ active, skipped?, sub?, exp?, error? }`
  - `authorize`: `{ decision, reason? }`
  - `exchange`: `{ targetAud }`
- Extended `JsonRpcBody` interface: Added `params.arguments?: Record<string, unknown>` for tool arguments

#### Pipeline Implementation
**Step 0 — RFC 7662 Active-Token Introspection (NEW)**
- Instantiate `GatewayIntrospectionClient` before entering request handler
- Call `introspect(bearerToken)` immediately after dev bypass check
- Record introspection result in `auditTrail.introspection`
- **Fail-closed:** If `!introspResult.active && !introspResult.skipped` → return 401 immediately
- Set `X-Gw-Audit-Trail` header on the 401 response

**Step 1 — Token Policy Validation (UPDATED)**
- Added `setAuditHeader(res)` call before all 401 responses
- Ensures audit trail included even on policy violations

**Step 2 — Parse JSON-RPC for tool metadata (UPDATED)**
- Extract `toolArgs = params?.arguments` for transaction parameters

**Step 3 — PingOne Authorize Evaluation (UPDATED)**
- Pass `toolArgs` to `authorizeClient.evaluate(decoded, method, toolName, toolArgs)`
- Record decision in `auditTrail.authorize = { decision, reason }`
- Added `setAuditHeader()` before all 403 responses (both DENY and INDETERMINATE)

**Step 4 — RFC 8693 Token Exchange (UPDATED)**
- Record exchange metadata in `auditTrail.exchange = { targetAud }`
- Added `setAuditHeader()` before 502 error response

**Step 5 — Forward to Upstream MCP (UPDATED)**
- Call `setAuditHeader()` before forwarding successful request
- Ensures audit trail header is set on success path

#### Audit Trail Header Logic
- **Design:** `setAuditHeader()` helper function safely sets `X-Gw-Audit-Trail` header on ANY response path (success or error)
- **Fail-safe:** Catches `setHeader()` exceptions if headers already sent
- **Coverage:** Header included on all response paths: introspection error (401), policy error (401), authorize error (403), exchange error (502), and successful forward

**Impact:** Comprehensive decision tracking enables BFF to extract and surface gateway audit trail in Token Chain UI (Wave 3).

### Task 3: TypeScript Verification ✅

- Ran `npx tsc --noEmit` in `banking_mcp_gateway/` directory
- **Result:** 0 errors — both modified files compile without issues

## Verification

### Automated Checks
- ✅ TypeScript compilation: 0 errors
- ✅ `GatewayIntrospectionClient` imported correctly
- ✅ `GwAuditTrail` interface present with all three fields
- ✅ `setAuditHeader()` called on all error and success paths
- ✅ `toolArgs` extracted from JSON-RPC params and passed to Authorize client

### Code Review
- ✅ RFC 7662 introspection integrated at pipeline entry (Step 0)
- ✅ Fail-closed behavior on introspection: `!active && !skipped` → 401
- ✅ Audit trail tracks all three decision points: introspection/authorize/exchange
- ✅ X-Gw-Audit-Trail header set on all response paths (5+ locations verified)
- ✅ Transaction parameters (amount, type, account_id) extracted and forwarded

## Design Patterns

### 1. Fail-Closed Introspection
- Active-token check runs before policy validation
- Network/authorization errors return `{active: false}` → immediate 401
- Ensures revoked tokens cannot bypass gateway

### 2. Audit Trail as Request Metadata
- Single `GwAuditTrail` object initialized at request start
- Updated incrementally as each step completes
- Set in response header on ALL paths → ensures BFF always receives audit context

### 3. Step-Up Decision Readiness
- Transaction parameters now available to PingOne Authorize
- INDETERMINATE decision can trigger HTTP 428 (handled in Wave 3)
- Amount-aware thresholds enable dynamic MFA enforcement

## Dependencies

### Uses (Wave 1)
- `GatewayIntrospectionClient` (created in Plan 01)
- `GatewayConfig.introspectionEndpoint` (configured in Plan 01)

### Provides (Wave 3)
- `X-Gw-Audit-Trail` header format for BFF extraction (Plan 04)
- `auditTrail.introspection`, `.authorize`, `.exchange` fields documented for UI rendering

## Testing Recommendation

When deployed, verify:
1. Active tokens pass introspection + authorize + exchange (200)
2. Revoked tokens fail at introspection step (401)
3. Policy-denied requests include introspection result in header (401)
4. Authorize INDETERMINATE decision triggers gateway response (eventually 428 after Wave 3)
5. X-Gw-Audit-Trail header present in all gateway responses

## Next: Wave 3 — Plan 259-04

Plan 04 will:
1. Extract `X-Gw-Audit-Trail` header in BFF `mcpGatewayClient.js`
2. Build `tokenEvents` from audit trail for Token Chain UI
3. Handle `hitl_required` error code → HTTP 428 step-up trigger
