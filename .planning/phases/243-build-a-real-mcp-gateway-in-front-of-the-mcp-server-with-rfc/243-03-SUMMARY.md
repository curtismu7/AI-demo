# 243-03 SUMMARY — BFF + LangChain Gateway Cutover

**Phase:** 243-build-a-real-mcp-gateway  
**Plan:** 03  
**Commit:** c00badbf  
**Status:** COMPLETE

---

## What Was Built

### `banking_api_server/services/mcpGatewayClient.js` (new)

Gateway HTTP client used by the BFF to route MCP tool calls through the banking-mcp-gateway instead of calling the MCP server directly.

Key design:
- `callToolViaGateway(gatewayUrl, bearerToken, tool, params, opts)` — POSTs JSON-RPC 2.0 `tools/call` to `${gatewayUrl}/mcp`
- Sets `MCP-Protocol-Version: 2025-11-25`, `Authorization: Bearer <token>`, optional `mcp-session-id`
- Typed errors: `gateway_auth_failed` (401), `gateway_policy_denied` (403), `gateway_upstream_error` (5xx)
- Timeout from `MCP_GATEWAY_TIMEOUT_MS` env var (default 30 s)
- `getMcpGatewayHttpUrl()` helper reads `MCP_GATEWAY_HTTP_URL` env var (default `http://localhost:3005`)

### `banking_api_server/server.js` (patched)

`POST /api/mcp/tool` remote call block (lines ~1408–1430) cutover:

```
useGateway = !!process.env.MCP_GATEWAY_HTTP_URL
  → true  → mcpGatewayClient.callToolViaGateway(...)   [Phase 243 path]
  → false → http2McpBridge / mcpCallTool               [old path, backward compat]
```

- Response shape `{ result, tokenEvents, activeModel, activeProvider }` unchanged
- `appEventService.logEvent` updated to log `via: 'gateway' | 'direct'`
- mcpGatewayClient require added after http2McpBridge require (line 967)

### `langchain_agent/src/authentication/oauth_manager.py` (patched)

Line ~307: resource indicator for agent token requests now prefers `MCP_GW_RESOURCE_URI` (gateway audience) with fallback to `MCP_SERVER_RESOURCE_URI` for backward compatibility.

```python
# Before:
mcp_resource_uri = os.environ.get('MCP_SERVER_RESOURCE_URI')
# After:
mcp_resource_uri = os.environ.get('MCP_GW_RESOURCE_URI') or os.environ.get('MCP_SERVER_RESOURCE_URI')
```

LangChain endpoint routing: no code change needed — set env var:
```
MCP_SERVER_BANKING_ENDPOINT=http://localhost:3005/mcp
MCP_GW_RESOURCE_URI=<gateway-audience-uri>
```

---

## Security Properties Preserved

| Decision | Preserved |
|----------|-----------|
| D-03: Gateway handles token passing/exchange | ✅ BFF sends gateway-aud token; gateway exchanges to upstream |
| D-04: NO TOKENS TO LLM | ✅ `mcpAccessToken` not in `forward()` output; LangChain gets result only |
| D-05: aud = next hop only | ✅ Token to gateway has `aud = MCP_GW_RESOURCE_URI`; gateway issues OLB/invest-aud token to upstream |

---

## Env Vars Required for Gateway Path

| Var | Purpose | Example |
|-----|---------|---------|
| `MCP_GATEWAY_HTTP_URL` | Enable gateway routing (BFF) | `http://localhost:3005` |
| `MCP_GATEWAY_TIMEOUT_MS` | Per-call timeout (BFF, optional) | `30000` |
| `MCP_GW_RESOURCE_URI` | Gateway aud for LangChain resource indicator | `https://mcp-gw.example.com` |
| `MCP_SERVER_BANKING_ENDPOINT` | Gateway MCP URL for LangChain | `http://localhost:3005/mcp` |

---

## Verification

- `node -e "require('./services/mcpGatewayClient'); console.log('OK')"` → OK
- `npm run build` (banking_api_ui) → compiled with warnings (pre-existing, no errors)
- Legacy path (`MCP_GATEWAY_HTTP_URL` unset) untouched — zero breaking change to existing deployments
