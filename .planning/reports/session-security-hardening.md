# Security Hardening Session — Agent Authorization Gate Fixes

**Session date:** 2026-05-05  
**Branch:** `main` (working tree changes, uncommitted)  
**Reviewer target:** Dev team verification before commit

---

## Summary

This session enforced three security invariants that were previously bypassable:

1. **MCP Gateway never silently bypassed** — health probe failure now fails closed
2. **Authorization never fails open** — `ff_authorize_fail_open` defaults to `false`
3. **Heuristic agent path never writes to dataStore directly** — all write operations now go through `/api/transactions` (enforcing scope, Authorize, and HITL)

---

## Files Changed

| File | Change type | Status |
|------|-------------|--------|
| `banking_api_server/services/bankingAgentLangGraphService.js` | Security fix (critical) | Working tree |
| `banking_api_server/services/agentMcpTokenService.js` | Security fix | Working tree |
| `banking_api_server/routes/transactions.js` | Security fix | Working tree |
| `banking_mcp_server/src/banking/BankingAPIClient.ts` | Bug fix | Working tree |
| `banking_api_server/data/bootstrapData.json` | Data | Working tree |
| `banking_api_server/data/runtimeData.json` | Data (runtime, not committed) | Working tree |

---

## Change 1 — Heuristic Path Authorization Bypass (Critical)

**File:** `banking_api_server/services/bankingAgentLangGraphService.js`

### Root cause

`executeHeuristicBanking()` matched natural-language transfer/deposit/withdrawal intents and executed them **directly against `dataStore`**, bypassing:
- Scope validation (`banking:write` required)
- PingOne Authorize / simulated policy evaluation
- HITL consent gate (428 threshold enforcement)
- MCP token exchange (RFC 8693)

This meant typing "transfer $5000 from checking to savings" in the agent chat executed the transfer immediately with no consent, no policy check, and no audit trail.

### Fix

Added `_callTransactionsApi(body, userToken)` — an internal loopback HTTP helper that POSTs to `/api/transactions` using the user's Bearer token. This goes through every gate the REST route enforces.

```js
// NEW: top of file
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

async function _callTransactionsApi(body, userToken) {
  if (!userToken) throw new Error('No user token — cannot call /api/transactions');
  const PORT = process.env.PORT || 3001;
  const certFile = path.join(__dirname, '../certs/api.pingdemo.com+2.pem');
  const useHttps = fs.existsSync(certFile);  // mirrors server.js startup logic
  const baseUrl = `${useHttps ? 'https' : 'http'}://localhost:${PORT}`;
  const config = {
    method: 'POST',
    url: `${baseUrl}/api/transactions`,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
    data: body,
    validateStatus: () => true,
  };
  if (useHttps) config.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  return axios(config);
}
```

**Transfer** handler — OLD (lines ~120-125):
```js
// BEFORE: direct dataStore writes, no auth
await dataStore.createTransaction({ userId, accountId: fromAcct.id, type: 'transfer_out', ... });
await dataStore.createTransaction({ userId, accountId: toAcct.id, type: 'transfer_in', ... });
await dataStore.updateAccountBalance(fromAcct.id, -amount);
await dataStore.updateAccountBalance(toAcct.id, amount);
return { reply: `✅ Transferred ...`, requiresConsent: false, ... };
```

**Transfer** handler — NEW:
```js
// AFTER: internal HTTP call, all gates enforced
const txRes = await _callTransactionsApi({
  fromAccountId: fromAcct.id,
  toAccountId: toAcct.id,
  amount,
  type: 'transfer',
  description: params.description || `Transfer from ${fromAcct.accountType} to ${toAcct.accountType}`,
}, userToken);

if (txRes.status === 428) {
  const body = txRes.data;
  // requiresConsent: false keeps the route on the 200 path where bankingAgentRoutes.js
  // lines 280-284 add the hitl shape the frontend checks (normalized.error === 'hitl_required')
  return { reply: body.error_description || 'This transfer requires your approval...', 
           success: false, requiresConsent: false, error: 'hitl_required',
           hitl: body.hitl || { type: 'consent' }, hitl_threshold_usd: ...,
           fromAccountId: fromAcct.id, toAccountId: toAcct.id,
           transactionAmount: amount, transactionType: 'transfer', ... };
}
if (txRes.status === 403) { ... deny response ... }
if (txRes.status >= 400) { ... generic error response ... }
return { reply: `Transferred **$${amount.toFixed(2)}** ...`, success: true, ... };
```

Same pattern applied to **deposit** and **withdrawal** handlers.

### Why `requiresConsent: false` on 428

`bankingAgentRoutes.js` line 189 checks `response.requiresConsent` and short-circuits to a bare 428 without `error: 'hitl_required'`. The frontend (`BankingAgent.js` line 4054) checks `normalized.error === 'hitl_required'` to trigger the consent modal. Setting `requiresConsent: false` keeps the route on the 200 path where lines 280-284 enrich the response body with `hitl` and `hitl_threshold_usd`.

### Verify

1. Start API server
2. Log in as `bankuser`
3. In agent chat, type: `"Transfer $700 from checking to savings"`
4. **Expected:** Consent modal appears (HITL gate fires at $250+ threshold)
5. **Before fix:** Transfer executed immediately, balance changed, no consent

---

## Change 2 — MCP Gateway Fails Open on Health Probe Error

**File:** `banking_api_server/services/agentMcpTokenService.js`

### Root cause

When the MCP Gateway health probe failed (network error, gateway down), the code silently set `_bypassCache = { devBypass: true }` and proceeded without the gateway. An attacker or misconfiguration could cause the gateway to be unreachable, routing all MCP tool calls through the direct path without gateway-level authorization.

### Fix

Gateway bypass now requires `ff_mcp_gateway_required === 'false'` (explicit opt-out). Default is **fail closed**.

```js
// BEFORE
} catch (err) {
  console.warn(`[TwoExchange] Gateway health probe failed — falling back to mcp-server audience`);
  _bypassCache = { devBypass: true, ts: now };
  return mcpServerAud;
}

// AFTER
} catch (err) {
  const allowBypass = configStore.get('ff_mcp_gateway_required') === 'false';
  if (!allowBypass) {
    console.error(`[TwoExchange] Gateway health probe failed and MCP Gateway is required.`);
    throw new Error(`MCP Gateway unavailable and bypass not permitted. ${err.message}`);
  }
  console.warn(`[TwoExchange] Gateway health probe failed — bypassing gateway (ff_mcp_gateway_required=false)`);
  _bypassCache = { devBypass: true, ts: now };
  return mcpServerAud;
}
```

### Feature flag

| Flag | Default | Effect |
|------|---------|--------|
| `ff_mcp_gateway_required` | `true` (enforced) | Set to `'false'` to allow gateway bypass on probe failure |

---

## Change 3 — Authorization Fails Open by Default

**File:** `banking_api_server/routes/transactions.js` (line ~416)

### Root cause

`ff_authorize_fail_open` defaulted to `true`, meaning if PingOne Authorize returned an error (network issue, misconfiguration), transactions were allowed through silently.

### Fix

```js
// BEFORE
const AUTHORIZE_FAIL_OPEN = configStore.get('ff_authorize_fail_open') !== 'false'; // default true

// AFTER
// Authorization is ALWAYS ENFORCED — errors are fail-closed by default.
// Only set ff_authorize_fail_open=true to bypass on error (security risk).
const AUTHORIZE_FAIL_OPEN = configStore.get('ff_authorize_fail_open') === 'true'; // default false (fail-closed)
```

### Feature flag

| Flag | Default | Effect |
|------|---------|--------|
| `ff_authorize_fail_open` | `false` (enforced) | Set to `'true'` to allow transactions when Authorize is unavailable |

---

## Change 4 — BankingAPIClient 428 Handler (MCP Server)

**File:** `banking_mcp_server/src/banking/BankingAPIClient.ts`

### Root cause

`getSensitiveAccountDetails` 428 handler only recognized `body.step_up_required` responses. Any other 428 (including `hitl_required`) fell through to a stub that hardcoded `step_up_required: true`.

### Fix

Return the full 428 body if present; fall back to a generic `hitl_required` response.

```ts
// BEFORE: only handled step_up_required
if (body && body.step_up_required) {
  return body;  // partial
}
return { step_up_required: true, error: 'step_up_required', ... };  // stub

// AFTER: handles any 428 body
if (body) {
  return body as Record<string, unknown>;  // pass through hitl_required, step_up_required, etc.
}
return { ok: false, error: 'hitl_required', consentRequired: true, message: '...' };
```

---

## Change 5 — Checking Account Balances (Demo Data)

**File:** `banking_api_server/data/bootstrapData.json`

Checking accounts seeded with $10,000 so demo transfers don't fail immediately from insufficient balance.

| Account | Before | After |
|---------|--------|-------|
| user 1 checking (id: "1") | $2,500 | $10,000 |
| user 2 checking (id: "3") | $3,200.50 | $10,000 |

`banking_api_server/data/runtimeData.json` also updated (same accounts). **Note:** `runtimeData.json` is the live store. Stop the API server before editing it — the server holds accounts in memory and overwrites the file on shutdown.

---

## Agent Path Flow After Fix

Every write operation now enforces the i4ai sequence diagram security gates:

| Trigger | Path | Scope | Authorize | HITL |
|---------|------|-------|-----------|------|
| Chip (read) | `/api/mcp/tool` → token exchange → mcpLocalTools | read-only | — | — |
| Chip prefill / User types NL | `/api/banking-agent/nl` → `runAction` → `callMcpTool` → `/api/mcp/tool` → token exchange → mcpLocalTools | `banking:write` | ✅ | ✅ all writes blocked |
| Agent heuristic write (post-auth replay) | `_callTransactionsApi` → `/api/transactions` | `banking:write` | ✅ Authorize | ✅ 428 on threshold |
| Agent LLM → LangGraph → MCP tools | mcpLocalTools `hitlBlocksLocalWrite` | ✅ | ✅ | ✅ all writes blocked |
| Test chips (transfer_600_test) | direct `/api/transactions` | ✅ | ✅ | ✅ |

---

## How to Verify Changes Are Present (Git)

```bash
# See all modified files vs last commit
git diff --stat HEAD

# Confirm heuristic fix is present (should show _callTransactionsApi, NOT dataStore.createTransaction)
grep -n "_callTransactionsApi\|dataStore.createTransaction" \
  banking_api_server/services/bankingAgentLangGraphService.js

# Confirm fail-closed defaults
grep -n "ff_authorize_fail_open\|ff_mcp_gateway_required" \
  banking_api_server/routes/transactions.js \
  banking_api_server/services/agentMcpTokenService.js

# See full diff for any specific file
git diff HEAD -- banking_api_server/services/bankingAgentLangGraphService.js
git diff HEAD -- banking_api_server/services/agentMcpTokenService.js
git diff HEAD -- banking_api_server/routes/transactions.js
git diff HEAD -- banking_mcp_server/src/banking/BankingAPIClient.ts
```

---

## Committing the Changes

These changes are **not yet committed**. To commit:

```bash
# Stage the security-relevant files (do NOT stage sessions.db or runtimeData.json)
git add banking_api_server/services/bankingAgentLangGraphService.js
git add banking_api_server/services/agentMcpTokenService.js
git add banking_api_server/routes/transactions.js
git add banking_mcp_server/src/banking/BankingAPIClient.ts
git add banking_api_server/data/bootstrapData.json

git commit -m "feat(security): close agent authorization bypass and fail-closed defaults

- bankingAgentLangGraphService: replace direct dataStore writes with
  _callTransactionsApi internal loopback — enforces scope, Authorize, HITL
- agentMcpTokenService: MCP gateway health probe failure now fails closed;
  bypass requires ff_mcp_gateway_required=false (default: enforce)
- transactions.js: ff_authorize_fail_open defaults false (fail-closed)
- BankingAPIClient: 428 handler returns full body for hitl_required + step_up_required
- bootstrapData: seed checking accounts to \$10,000 for demo"
```

---

## What Was NOT Changed

- Read operations (accounts, balance, transactions) in `executeHeuristicBanking` still read from `dataStore` directly — acceptable since these are user-scoped reads for an authenticated user and carry no write risk
- `runtimeData.json` — not to be committed (live runtime state, changes on every transaction)
- No UI changes in this session
