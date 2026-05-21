# Phase 260: Gap Analysis — Code vs Architecture Diagrams

**Date:** 2026-05-01
**Source:** Comparison of `banking_mcp_gateway/`, `banking_api_server/`, `banking_mcp_server/` against the gateway auth pipeline architecture diagrams.

---

## What's Fully Implemented ✅

| Diagram Step | What exists |
|---|---|
| Step 2 — Agent gets tool list from gateway | `tools/list` handler in `index.ts:198` — validates token, calls `guardToolsList`, aggregates from both backends |
| Step 2a — Authorize permit/deny on tools/list | `pingAuthorizeGuard.ts` + `PingOneAuthorizeClient` wired into `tools/list` path |
| Step 4a/7a — Gateway calls PingAuthorize | `PingOneAuthorizeClient.evaluate()` sends `DecisionContext`, `McpMethod`, `ToolName`, `ClientId`, `ActClientId`, `TokenScopes`, `TokenAudience`, plus `TransactionAmount`, `TransactionType`, `ToAccountId` |
| Step 8 — Gateway token exchange for MCP | `McpTokenExchangeClient.exchange()` does RFC 8693 exchange, routes `olb` vs `invest` by tool name via `router.ts` |
| Step 0 — RFC 7662 introspection | `GatewayIntrospectionClient.ts` exists, wired in `authorizeMcpRequest.ts` as step 0 |
| RFC 9728 metadata | `GET /.well-known/oauth-protected-resource` in `GatewayServer.ts` returns `authorization_servers`, `scopes_supported` |
| Multi-server routing (mcp-olb vs mcp-invest) | `router.ts` with `OLB_TOOLS` / `INVEST_TOOLS` sets, `backendResourceUri()` picks the right audience |
| Gateway audit trail → BFF → SSE → UI | `X-Gw-Audit-Trail` header flow: gateway → `mcpGatewayClient.js` → `server.js` → `mcpFlowSseHub` |
| Step 11c/11d — INDETERMINATE → HITL | Gateway returns `hitl_required` JSON, BFF maps to 428 step-up response |

---

## Gaps — Code vs Diagrams ⚠️

### Gap 1 — No subject (human) token → wrong JSON-RPC error format

**Diagram step 4b/4d:** When the agent calls with no human subject token, the gateway should return a JSON-RPC error with `required_scopes` in the `data` field:

```json
{
  "jsonrpc": "2.0",
  "id": "TX id",
  "error": {
    "code": -32001,
    "message": "Unauthorized",
    "data": {
      "error": "insufficient_scope",
      "error_description": "The access token does not have the required scope for this tool",
      "required_scopes": ["balance"],
      "provided_scopes": []
    }
  }
}
```

**Current code:** `GatewayTokenPolicy` and `authorizeMcpRequest.ts` return plain HTTP 401 JSON `{ error: "...", message: "..." }` — not JSON-RPC format, no `required_scopes` field. The `index.ts` WebSocket path does use `jsonRpcError()` helper correctly, but `GatewayServer.ts` (HTTP path) does not.

**Files:** `banking_mcp_gateway/src/server/GatewayServer.ts`, `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts`

---

### Gap 2 — Step 5/5a: `required_scopes` not propagated to UI/chatbot

**Diagram steps 5/5a:** The agent detects the 401 + `required_scopes`, informs the chatbot that the user needs to log in, and the app logs the user in obtaining a token with `may_act: agent1`.

**Current code:** The BFF's `server.js` handles `gateway_auth_failed` and `gateway_policy_denied` but maps them to generic errors. There is no path where `required_scopes` is propagated back to the UI so the agent/chatbot can guide the user to authenticate.

**Files:** `banking_api_server/server.js`

---

### Gap 3 — `may_act` claim missing from user login token

**Diagram step 5a:** The user's session token should carry `may_act: agent1` so the agent can perform RFC 8693 token exchange as a delegated actor.

**Current code:** The PKCE login flow in `authRoutes.js` does not include `may_act` in the authorization or token request. PingOne also needs to be configured to emit it. Without this claim, the delegated agent token exchange chain cannot be established.

**Files:** `banking_api_server/routes/authRoutes.js`, PingOne environment config

---

### Gap 4 — Step 6a: TX token missing transaction details (id, prompt)

**Diagram step 6a:** The TX token (aud: mcp-gw) should contain transaction details like `tx_id` and `prompt` — not just `aud/scope/act`. These are passed into PingAuthorize as context for per-transaction policy decisions.

**Current code:** `McpTokenExchangeClient` does a bare RFC 8693 exchange with only `subject_token`, `subject_token_type`, `requested_token_type`, and `audience`. No transaction context is carried in the token or the exchange request.

**Files:** `banking_mcp_gateway/src/auth/McpTokenExchangeClient.ts`

---

### Gap 5 — MCP server does NOT do a second token exchange for Resource (step 9)

**Diagram steps 9/9a:** `mcp-olb.ping.demo` is supposed to perform another RFC 8693 exchange to obtain a token targeted at `olb-resource.ping.demo` before calling the banking API. The final token reaching the resource has the full delegation chain: `sub: user1, aud: olb-resource, act: agent1`. For the invest MCP server, it uses a vault to fetch an API key instead (step 9a).

**Current code:** `banking_mcp_server/BankingToolProvider.ts` calls the banking API directly using the token it receives from the gateway. There is no second token exchange step. The 3-hop token chain (`gateway → mcp → resource`) shown in the diagram is only 2 hops in practice (`gateway → mcp`).

**Files:** `banking_mcp_server/src/BankingToolProvider.ts` (or equivalent tool handler)

---

### Gap 6 — HTTP path (`GatewayServer`) vs WebSocket path (`index.ts`) have diverged

The `index.ts` WebSocket gateway and `GatewayServer.ts` HTTP gateway have diverged in auth handling:

| Capability | `index.ts` (WebSocket) | `GatewayServer.ts` (HTTP) |
|---|---|---|
| JSON-RPC error format | ✅ `jsonRpcError()` helper with `data` payload | ❌ Plain HTTP JSON only |
| HITL challenge creation | ✅ Creates challenge, returns `challengeId` | ❌ Returns 403 `hitl_required`, no challenge |
| `guardToolsList` / `guardToolCall` | ✅ | ❌ (uses `authorizeMcpRequest` middleware instead) |
| Introspection (RFC 7662) | ❌ Not in WS path | ✅ Via `GatewayIntrospectionClient` |

The diagrams show a single gateway — it is unclear which transport is canonical. The HTTP path has more complete auth infrastructure; the WebSocket path has more complete error/HITL responses.

**Files:** `banking_mcp_gateway/src/index.ts`, `banking_mcp_gateway/src/server/GatewayServer.ts`

---

### Gap 7 — RFC 9728 `scopes_supported` is hardcoded, not tool-aware

**Diagram (RFC 9728 metadata box):** The protected resource metadata should reflect the actual scopes required — e.g., `balance` for read tools, `transfer` for write tools. Agents use this to know what scopes to request before calling.

**Current code:** `GatewayServer.ts` returns a hardcoded `GATEWAY_SCOPES` array (`banking:read`, `banking:write`, `banking:admin`, `ai_agent`). This does not match the scope names used in the diagram (`balance`, `transfer`) and is not tool-aware.

**Files:** `banking_mcp_gateway/src/server/GatewayServer.ts`

---

## Summary Table

| # | Gap | Severity | Files |
|---|---|---|---|
| 1 | JSON-RPC error format with `required_scopes` (HTTP path) | Medium | `GatewayServer.ts`, `authorizeMcpRequest.ts` |
| 2 | `required_scopes` propagated to UI/chatbot | Medium | `server.js` |
| 3 | `may_act` claim in user login token | High | `authRoutes.js`, PingOne config |
| 4 | TX details (id, prompt) in token exchange | Low | `McpTokenExchangeClient.ts` |
| 5 | MCP server second token exchange for Resource | High | `BankingToolProvider.ts` |
| 6 | HTTP vs WebSocket gateway divergence | Medium | `GatewayServer.ts` vs `index.ts` |
| 7 | `scopes_supported` hardcoded vs tool-aware | Low | `GatewayServer.ts` |

**Biggest architectural gap:** Gap 5 — the diagram shows a 3-hop token chain (`gateway → mcp → resource`) but the code only does 2 hops. Gap 3 (`may_act` in login) is a prerequisite for the full delegated agent flow to work at all.
