---
phase: 259
title: "Gateway auth pipeline — introspection, amount-aware step-up, SSE decision reporting"
type: research
status: complete
date: 2026-05-01
---

# Research: Gateway Auth Pipeline — Introspection, Step-Up, SSE Reporting

## Context

The MCP Gateway (`:3005`, `banking_mcp_gateway/`) already has an auth pipeline in
`authorizeMcpRequest.ts`. It is NOT a pure pass-through. Current pipeline:

```
Bearer token arrives at POST /mcp
  ↓
1. jwt.decode() + GatewayTokenPolicy (sub, act chain, anti-bypass aud)
2. PingOneAuthorizeClient.evaluate() → PERMIT / DENY / INDETERMINATE
3. McpTokenExchangeClient.exchange() → next-hop token (aud = MCP server)
4. forward(exchangedToken, body) → upstream MCP server
```

## Gaps (what the user wants added)

### Gap 1 — No RFC 7662 introspection (only jwt.decode)

`authorizeMcpRequest.ts` line 84: `jwt.decode(bearerToken)` — no signature check,
no revocation check. A revoked/compromised token that is not yet expired passes through.

**Fix:** Add an `IntrospectionClient` step before `GatewayTokenPolicy.validate()`.
Call `POST /as/introspect`, confirm `active: true`, extract live claims.
Cache 30 s per token hash (same pattern as BFF `tokenIntrospectionService.js`).
If introspection endpoint not configured → warn + proceed (dev mode).

### Gap 2 — Transaction amount not passed to PingOne Authorize

`PingOneAuthorizeClient.evaluate()` sends:
- `DecisionContext`, `McpMethod`, `ToolName`, `ClientId`, `ActClientId`,
  `TokenScopes`, `TokenAudience`

It does NOT send the transaction `amount` from `params.arguments`. PingOne Authorize
cannot enforce `amount ≥ $250 → INDETERMINATE (step-up required)` without it.

The JSON-RPC body is parsed in `authorizeMcpRequest.ts`:
```ts
const { method = 'unknown', params } = parseJsonRpcBody(body);
const toolName = params?.name;
// params.arguments is available but not extracted or forwarded
```

**Fix:** Extract `params?.arguments` from the parsed body. Pass `TransactionAmount`,
`TransactionType`, and `ToAccountId` into the Authorize request body so the
DaVinci/PingAuthorize policy can evaluate per-transaction thresholds.

### Gap 3 — Gateway decisions invisible to the UI

`mcpGatewayClient.js` (BFF side) strips the response to `response.data?.result`.
The gateway has no way to send decision metadata back to the UI Token Chain.

**Root cause:** The gateway sits between BFF and MCP server. The browser
talks only to the BFF. The reporting path must go:

```
Gateway
  → embed gwAuditTrail in HTTP response headers
  → BFF mcpGatewayClient extracts headers
  → BFF builds tokenEvents entries (gw-introspection, gw-authorize, gw-exchange)
  → BFF publishes to mcpFlowSseHub
  → Browser receives via GET /api/mcp/tool/events SSE stream
```

## Proposed implementation

### A. Gateway — add introspection step

**New file:** `banking_mcp_gateway/src/auth/GatewayIntrospectionClient.ts`

```typescript
export interface IntrospectionResult {
  active: boolean;
  sub?: string;
  scope?: string;
  exp?: number;
  aud?: string | string[];
  client_id?: string;
}

export class GatewayIntrospectionClient {
  async introspect(token: string): Promise<IntrospectionResult> {
    // POST config.introspectionEndpoint with token
    // Cache by sha256(token) for 30 s
    // Return { active: false } on network error (fail-closed)
  }
}
```

**In `authorizeMcpRequest.ts`** — insert before GatewayTokenPolicy:
```typescript
// Step 0: RFC 7662 introspection
const introspResult = await introspectionClient.introspect(bearerToken);
if (!introspResult.active) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'token_inactive', message: 'Token is revoked or expired' }));
  auditTrail.introspection = { active: false };
  return;
}
auditTrail.introspection = { active: true, sub: introspResult.sub, exp: introspResult.exp };
```

### B. Gateway — pass transaction amount to Authorize

**In `authorizeMcpRequest.ts`** — extend `parseJsonRpcBody`:
```typescript
interface JsonRpcBody {
  method?: string;
  params?: {
    name?: string;
    arguments?: {
      amount?: number;
      transaction_type?: string;
      to_account_id?: string;
    };
  };
}
```

**In `PingOneAuthorizeClient.evaluate()`** — add amount parameters:
```typescript
async evaluate(decoded, method, toolName, toolArgs?: Record<string, unknown>) {
  const body = {
    parameters: {
      // ... existing fields ...
      TransactionAmount: String(toolArgs?.amount ?? ''),
      TransactionType: String(toolArgs?.transaction_type ?? toolName ?? ''),
      ToAccountId: String(toolArgs?.to_account_id ?? ''),
    },
  };
}
```

PingOne Authorize / DaVinci policy then evaluates:
- `TransactionAmount ≥ 250 AND ToolName = transfer_funds` → INDETERMINATE (step-up)
- `ToolName NOT IN allowed_tools_for_scope` → DENY

### C. Gateway — emit audit trail headers for BFF to pick up

**In `authorizeMcpRequest.ts`** — build audit trail as the pipeline runs:
```typescript
const auditTrail = {
  introspection: null as null | { active: boolean; sub?: string; exp?: number },
  authorize: null as null | { decision: string; reason?: string },
  exchange: null as null | { targetAud: string },
};
```

After `forward()` completes (success or error), inject into the response before writing:
```typescript
res.setHeader('X-Gw-Audit-Trail', JSON.stringify(auditTrail));
```

> **Security note:** `X-Gw-Audit-Trail` is a BFF-to-gateway-internal header, never exposed to the browser. The BFF strips it before sending anything to the client. No token values — only decision metadata.

### D. BFF — extract audit trail and build tokenEvents

**In `mcpGatewayClient.js`** — after the axios call:
```javascript
const auditHeader = response.headers['x-gw-audit-trail'];
let gwAuditTrail = null;
if (auditHeader) {
  try { gwAuditTrail = JSON.parse(auditHeader); } catch {}
}
return { result: response.data?.result ?? response.data, gwAuditTrail };
```

**In `server.js`** `/api/mcp/tool` handler — after the gateway call succeeds, build events:
```javascript
if (gwAuditTrail?.introspection) {
  tokenEvents.push(buildTokenEvent('gw-introspection', 'user-token-introspection', {
    eventStatus: gwAuditTrail.introspection.active ? 'active' : 'failed',
    introspectionResult: gwAuditTrail.introspection,
    label: '🔍 Gateway — RFC 7662 Token Introspection',
  }));
}
if (gwAuditTrail?.authorize) {
  tokenEvents.push(buildTokenEvent('gw-authorize', 'agent-authorize', {
    eventStatus: gwAuditTrail.authorize.decision,
    label: `🛡️ Gateway — PingOne Authorize (${gwAuditTrail.authorize.decision})`,
    extra: { decision: gwAuditTrail.authorize.decision, reason: gwAuditTrail.authorize.reason },
  }));
}
if (gwAuditTrail?.exchange) {
  tokenEvents.push(buildTokenEvent('gw-exchange', 'exchanged-token', {
    label: '🔄 Gateway — RFC 8693 Next-Hop Exchange',
    extra: { targetAud: gwAuditTrail.exchange.targetAud },
  }));
}
```

These events flow into the existing mcpFlowSseHub → UI Token Chain.

### E. UI — add badge + edu card for new gateway event IDs

**`ApiTrafficPanel.js`** — add to `icons` map:
```javascript
'gw-introspection': { label: 'GW INTROSPECT', cls: 'TOKEN-VERIFY' },
'gw-authorize':     { label: 'GW AUTHZ', cls: 'TOKEN-EXCHANGE' },
'gw-exchange':      { label: 'GW EXCHANGE', cls: 'TOKEN-EXCHANGE' },
```

**`TokenChainDisplay.js`** — add `gw-introspection` to `JWKS_VERIFIED_IDS` (or new
`INTROSPECTION_IDS`) and `CLAIMS_STRIP_IDS` so the edu card and inline claims render.

---

## Step-up from the gateway

When PingOne Authorize returns `INDETERMINATE` (amount > threshold), the gateway
currently returns `403 { error: 'hitl_required' }`. The BFF already has logic in
`server.js` to handle `gateway_policy_denied` — but it doesn't distinguish
`hitl_required` from a hard deny.

**Fix in BFF `server.js`:** When gateway 403 body has `error: 'hitl_required'`,
trigger the same HITL/step-up path as the current direct-BFF step-up:
```javascript
if (err.gatewayErrorCode === 'hitl_required') {
  // same path as the existing HTTP 428 / CIBA step-up flow
  return res.status(428).json({
    error: 'step_up_required',
    message: 'Gateway policy requires step-up authentication for this transaction',
    source: 'gateway_authorize',
  });
}
```

This means the BFF's existing step-up modal is reused — no new UI needed.

---

## Files to change

### banking_mcp_gateway/src/
| File | Change |
|---|---|
| `auth/GatewayIntrospectionClient.ts` | NEW — RFC 7662 introspection with 30 s cache |
| `auth/PingOneAuthorizeClient.ts` | Add `toolArgs` param, send `TransactionAmount/Type/ToAccountId` |
| `middleware/authorizeMcpRequest.ts` | Wire introspection, audit trail object, inject `X-Gw-Audit-Trail` response header |
| `config.ts` | Add `introspectionEndpoint` field |

### banking_api_server/
| File | Change |
|---|---|
| `services/mcpGatewayClient.js` | Extract `X-Gw-Audit-Trail` header, return `{ result, gwAuditTrail }` |
| `server.js` `/api/mcp/tool` | Convert `gwAuditTrail` → tokenEvents; handle `hitl_required` as step-up 428 |

### banking_api_ui/src/components/
| File | Change |
|---|---|
| `ApiTrafficPanel.js` | Add 3 new badge IDs |
| `TokenChainDisplay.js` | Add `gw-introspection`, `gw-authorize`, `gw-exchange` to CLAIMS_STRIP_IDS + edu boxes |

---

## Env vars to add (gateway)

```
GW_INTROSPECTION_ENDPOINT=https://auth.pingone.com/{envId}/as/introspect
# can reuse PINGONE_INTROSPECTION_ENDPOINT from BFF .env
```

---

## What does NOT change

- The existing HITL / step-up UI modals — reused via 428 BFF response
- Token chain SSE infrastructure — mcpFlowSseHub already works
- MCP server (`:8080`) — no changes
- LangChain agent (`:8888`) — no changes
- BFF introspection of the user token at login — unchanged
