# 243-01-SUMMARY.md — GatewayServer HTTP MCP ingress + RFC 9728 metadata

## What Was Built

Created `banking_mcp_gateway/src/server/GatewayServer.ts` — the gateway's HTTP
MCP ingress surface, satisfying D-01 (real standalone gateway), D-02 (gateway
owns RFC 9728 metadata), and the foundational enforcement requirement for D-05
(validate inbound `aud` = gateway audience before allowing any request to proceed).

## Files Changed

| File | Action | Notes |
|---|---|---|
| `banking_mcp_gateway/src/server/GatewayServer.ts` | Created | Core HTTP gateway class |
| `banking_mcp_gateway/src/index.ts` | Modified | Instantiates GatewayServer; shares `httpServer` with WebSocket server |
| `banking_mcp_gateway/package.json` | Modified | Added jest, ts-jest, @types/jest, supertest, @types/supertest |
| `banking_mcp_gateway/tests/gateway-server.test.ts` | Created | 12 tests, all passing |

## Key Design Decisions

**GatewayServer owns the http.Server** — the same `http.Server` instance is
passed to the existing WebSocket server (`wss`) so both WebSocket upgrades and
HTTP MCP requests are served on a single port.

**McpRequestMiddleware hook** — the extension point injected in Plan 243-02 to
add PingOne Authorize evaluation + RFC 8693 token exchange before forwarding:
```typescript
export type McpRequestMiddleware = (
  bearerToken: string, requestBody: Buffer,
  req: IncomingMessage, res: ServerResponse,
  forward: (upstreamToken: string, body: Buffer) => Promise<void>,
) => Promise<void>;
```

**Bearer extraction uses `extractBearerToken()` + `validateInboundToken()` from
existing `tokenValidator.ts`** — no new parsing logic.

**Upstream forwarding** — axios POST to `UPSTREAM_MCP_URL/mcp` with `validateStatus: () => true`
so all upstream status codes pass through. ECONNREFUSED/ETIMEDOUT → 502.

**RFC 9728 metadata** — The `/well-known/oauth-protected-resource` endpoint
returns the **gateway's own** `resource` claim (`config.gatewayResourceUri`).
It is NOT a proxy to the upstream MCP server metadata. This is a critical
security boundary (D-02).

## Verification Results

```
npm run build  → tsc clean (0 errors after String() cast fix for axios header type)
npm test       → 12/12 passing (1.361s)
```

**Tests cover:**
- `GET /.well-known/oauth-protected-resource` → 200, gateway audience, bearer_methods_supported, resource_name includes "gateway"
- `POST /mcp` no auth → 401 + WWW-Authenticate
- `POST /mcp` wrong aud → 401 + WWW-Authenticate
- `POST /mcp` expired token → 401 + WWW-Authenticate
- Gateway crash resistance (stays alive after 3 auth rejections)
- `POST /mcp` correct aud → reaches forwarding layer → 502 (upstream down, not 401 rejected)
- `GET /mcp` → 405
- `GET /health` → 200, `{ status: 'ok', service: 'banking-mcp-gateway' }`

## Exposed for Plan 243-02

- `McpRequestMiddleware` type — inject PingOne Authorize + exchange pipeline
- `GatewayServerOptions.requestMiddleware` — constructor injection point
- `GatewayServerOptions.upstreamMcpUrl` — override for tests
- `GatewayServer.httpServer` — expose for WebSocket server attachment

## Commit

`c72bcc36` feat(243-01): add GatewayServer HTTP MCP ingress + RFC 9728 metadata + tests
