---
name: mcp-server
description: 'Super Banking MCP server (TypeScript): tool registration, session management, auth challenge handling, WebSocket protocol. USE FOR: add or modify MCP tools, BankingToolRegistry, BankingToolProvider, MCPMessageHandler, BankingSessionManager, tools/call, tools/list, initialize handshake, auth challenge flow, missing scope detection, local run on port 8080, Railway/Render/Fly remote deployment of MCP server. DO NOT USE FOR: OAuth token flows or PKCE (use oauth-pingone); PingOne Management API calls (use pingone-api-calls); TypeScript style rules (use typescript-banking).'
argument-hint: 'Describe the MCP tool or server feature you need to add or modify'
---

# MCP Server — Super Banking MCP Server

## Architecture

```
banking_api_ui (React)        ← NEVER calls MCP directly (token custody)
    │
    ▼
banking_api_server (BFF)      ← sole MCP client; exchanges T1→T2 via RFC 8693
    │
    ├─ WebSocket  ─────────────► banking_mcp_server  (always on)
    └─ HTTP POST /mcp ─────────► banking_mcp_server  (HTTP_MCP_TRANSPORT_ENABLED=true)

banking_mcp_server               ← TypeScript MCP server, both transports on one port
    │
    ├─ HttpMCPTransport          → POST /mcp Streamable HTTP + RFC 9728 metadata
    ├─ MCPMessageHandler         → routes initialize / tools/list / tools/call
    ├─ BankingToolRegistry       → static registry of all tool definitions
    ├─ BankingToolProvider       → executes tools, handles auth challenges
    ├─ BankingToolValidator      → JSON-Schema validates tool params
    ├─ AuthorizationChallengeHandler → detects missing scopes, generates OAuth challenge
    ├─ AuthenticationIntegration → validates inbound agent tokens (introspection + RFC 8707 aud)
    ├─ BankingSessionManager     → per-connection session (userTokens, CIBA state)
    └─ BankingAPIClient          → calls banking_api_server HTTP endpoints
```

> **Important:** the MCP server exposes **two transports** — WebSocket (always on) and HTTP (`POST /mcp` Streamable HTTP + RFC 9728 metadata, controlled by `HTTP_MCP_TRANSPORT_ENABLED`, default `true`). Both run on the same port simultaneously. The service cannot run on stateless serverless platforms (Lambda, Cloud Run with default settings) because WebSocket connections are stateful. Locally it binds to `localhost:8080` via `run.sh` — the MCP server uses plain HTTP/WS internally (no `api.ping.demo` cert needed); the **gateway** on `api.ping.demo:3005` is what the BFF dials. For remote hosting use an always-on platform: Railway, Render, or Fly.io.

---

## Ports, Schemes, and Audience Values — Source of Truth

All three are owned by **`demo_api_server/services/configStore.js`**. Values survive restarts because configStore persists to SQLite (`config.db`). `.env` values are the *bootstrap* layer — they seed configStore on first run; configStore is the runtime SoT.

### Ports

| Service | Port | Persisted in configStore? | Key |
|---|---|---|---|
| BFF API Server | `3001` | ✅ `port` (default `'3001'`) | `configStore.getEffective('port')` |
| UI (React CRA) | `4000` | No — hardcoded in `run.sh` | n/a |
| MCP Server | `8080` | Partial — embedded in `mcp_server_url` | `configStore.getEffective('mcp_server_url')` |
| MCP Invest Server | `8081` | No — run.sh only | n/a |
| MCP Gateway | `3005` | ✅ embedded in `mcp_gateway_http_url` | `configStore.getEffective('mcp_gateway_http_url')` |
| HITL Service | `3009` | No — run.sh only | n/a |
| Agent Service | `3006` | No — run.sh only | n/a |
| Python LangChain Agent (uvicorn) | `8888` | No — `PORT` env var | n/a — separate process |
| Python LangChain Agent (chat WS) | `8889` | No — `WEBSOCKET_PORT` env var | n/a — separate process |
| Python LangChain Agent (health) | `8890` | No — `HEALTH_HTTP_PORT` env var | n/a — separate process |

> The Python LangChain agent (`langchain_agent/`) is a **separate uvicorn process** with its own MCP connections (WebSocket or Streamable HTTP to port 8080). It is not the same as the BFF's inline Node.js agent. For Python agent details use the `langchain-agent` skill.

### HTTP vs HTTPS Scheme

Scheme is **part of the URL value** in configStore — not a separate flag. The canonical keys:

| Key | Default (local dev) | Env var alias |
|---|---|---|
| `mcp_server_url` | `ws://localhost:8080` | `MCP_SERVER_URL` |
| `mcp_gateway_http_url` | `https://api.ping.demo:3005` | `MCP_GATEWAY_HTTP_URL` |

The BFF's `mcpGatewayClient.js` reads `MCP_GATEWAY_HTTP_URL` (env) at startup; `mcpWebSocketClient.js` calls `configStore.getEffective('mcp_server_url')`. The health endpoint (`routes/health.js`) also reads `MCP_GATEWAY_HTTP_URL` and applies an HTTPS fallback with a dev `Agent({ rejectUnauthorized: false })` so the mkcert cert on `api.ping.demo:3005` is accepted.

> For local dev the gateway runs **HTTPS on `api.ping.demo:3005`** (mkcert). Always use `https://api.ping.demo:3005` as the default — never `http://localhost:3005`.

### Audience (aud) Values

All audience/resource-URI values are FIELD_DEFS entries in configStore — they persist to SQLite and can be set via the `/config` admin UI:

| configStore key | Purpose | Default |
|---|---|---|
| `PINGONE_RESOURCE_MCP_GATEWAY_URI` | T1→T2 exchange target (BFF → gateway) | `https://banking-mcp-gateway.banking-demo.com` |
| `PINGONE_RESOURCE_AGENT_GATEWAY_URI` | AI Agent actor CC token audience | `https://banking-agent-gateway.banking-demo.com` |
| `PINGONE_RESOURCE_MCP_SERVER_URI` | Gateway → MCP server re-exchange target | `''` (set in PingOne) |
| `enduser_audience` | BFF user token audience (T1) | `''` (set in PingOne) |
| `mcp_gw_resource_uri` | Alias of MCP gateway URI (used by gateway-side config) | `''` |
| `mcp_token_exchange_scopes` | Scopes requested in RFC 8693 exchange | `'read write mcp:invoke mortgage:read'` |

Reading pattern (always use `getEffective`, never `process.env` directly in route handlers):
```javascript
const gatewayAud = configStore.getEffective('pingone_resource_mcp_gateway_uri');
const mcpServerUrl = configStore.getEffective('mcp_server_url');       // ws(s)://...
const gatewayHttpUrl = configStore.getEffective('mcp_gateway_http_url'); // http(s)://...
```

Env vars (`PINGONE_RESOURCE_MCP_GATEWAY_URI`, `MCP_SERVER_URL`, `MCP_GATEWAY_HTTP_URL`) are bootstrap seeds — configStore reads them as fallbacks but the SQLite value takes precedence once set. Set values permanently via `/config` admin page or `configStore.setConfig({...})`.

---

## PingOne Identity — Authoritative Config

> Full details in [`docs/PINGONE_CONFIG.md`](../../../docs/PINGONE_CONFIG.md). Key facts reproduced here for quick reference.

### Applications (client IDs)

| Role | App Name | Client ID |
|---|---|---|
| User/customer login | Demo User App | `b7d00976-405f-4c55-914a-a3ebe8f369d8` |
| Admin login | Demo Admin App | `3937cbfd-8824-4f0d-adb2-178702fe9518` |
| RFC 8693 actor (Exchange #1) | Demo AI Agent | `d21c5124-8ac5-43d1-81f2-31a7ec649b96` |
| MCP Gateway CC actor (Exchange #2) | Demo MCP Gateway | `3fc5ec99-48dd-42d2-b5fd-ec34055769d2` |
| Management API worker | Demo Worker Token App | `15881ac7-4d83-4cbf-9ab0-4d7cda31fab8` |
| _(legacy — do not use as actor)_ | Demo MCP Exchanger | `d3f8fead-b81d-46f9-bba5-051e493cea0e` |

### Resource Servers (audience values)

| Token hop | Resource Name | Audience (`aud`) |
|---|---|---|
| T1 — user access token | Demo API | `enduser.ping.demo` |
| T2 — gateway-scoped (Exchange #1 output) | Demo MCP Gateway | `mcpgateway.ping.demo` |
| T3 — MCP-scoped (Exchange #2 output) | Demo MCP Server | `mcpserver.ping.demo` |
| Actor CC token (Exchange #1 actor) | Demo Agent Gateway | `agentgateway.ping.demo` |

### may_act — Critical Rules

`may_act` on T1 (user token) authorises the RFC 8693 exchange. Two invariants that MUST hold:

1. **Correct actor:** `may_act.sub` MUST equal `d21c5124-8ac5-43d1-81f2-31a7ec649b96` (Demo AI Agent). The old value `d3f8fead` (Demo MCP Exchanger) is wrong — do not revert.
2. **Must be a JSON object:** PingOne SpEL value MUST use map literal syntax `#{'sub': 'd21c5124...'}`. A JSON string like `{"sub":"..."}` causes double-encoding in the JWT (`"may_act": "{\"sub\":\"...\"}"`) which fails RFC 8693 §4.1.

Both `Demo API` and `Demo MCP Server` resources have this attribute. Both must be identical.

To fix in PingOne via management API (worker token uses CLIENT_SECRET_BASIC):
```bash
ENV=d02d2305-f445-406d-82ee-7cdbf6eeabfd
MGT_TOKEN=$(curl -s -X POST "https://auth.pingone.com/${ENV}/as/token" \
  -u "15881ac7-4d83-4cbf-9ab0-4d7cda31fab8:<worker_secret>" \
  -d "grant_type=client_credentials" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")

# Demo API (enduser.ping.demo) — attribute 92e68eb5
curl -X PUT "https://api.pingone.com/v1/environments/${ENV}/resources/9b0f9ae4-463c-458e-9c5e-7e1dd8e6323d/attributes/92e68eb5-0d49-4273-ba20-0c529f5cfa0e" \
  -H "Authorization: Bearer $MGT_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"may_act","value":"#{'\''sub'\'': '\''d21c5124-8ac5-43d1-81f2-31a7ec649b96'\''}"}'

# Demo MCP Server (mcpserver.ping.demo) — attribute 077c586f
curl -X PUT "https://api.pingone.com/v1/environments/${ENV}/resources/8fb4d1a8-3896-4a26-bf56-b678f2fcf15e/attributes/077c586f-dfdb-42a6-acc9-cb5836a7adad" \
  -H "Authorization: Bearer $MGT_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"may_act","value":"#{'\''sub'\'': '\''d21c5124-8ac5-43d1-81f2-31a7ec649b96'\''}"}'
```

After any PingOne change: sign out and sign back in to get a fresh token.

---

## Adding a New Tool

### 1. Register in `BankingToolRegistry.ts`

```typescript
// src/tools/BankingToolRegistry.ts
export class BankingToolRegistry {
  private static readonly TOOLS: Record<string, BankingToolDefinition> = {

    my_new_tool: {
      name: 'my_new_tool',
      description: 'Human-readable description for the AI agent',
      requiresUserAuth: true,          // false for public/query operations
      requiredScopes: ['banking:write'],  // flat scopes — see toolScopeMap.ts
      handler: 'executeMyNewTool',     // method name on BankingToolProvider
      inputSchema: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'Account ID (UUID, use the "id" field from get_my_accounts)',
            minLength: 1
          },
          amount: {
            type: 'number',
            description: 'Amount in dollars',
            minimum: 0.01,
            multipleOf: 0.01
          }
        },
        required: ['account_id', 'amount'],
        additionalProperties: false    // always false — reject unknown params
      }
    },

  };
}
```

**Scope reference** (real scope names from `src/tools/toolScopeMap.ts` — flat, not nested):

| Scope | Tools | Action |
|---|---|---|
| `banking:read` | `get_my_accounts`, `get_account_balance`, `get_sensitive_account_details`, `get_my_transactions`, `query_user_by_email`, `sequential_think` | Read accounts, balances, transactions, sensitive details |
| `banking:write` | `create_deposit`, `create_withdrawal`, `create_transfer` | Mutating banking operations |

Unknown tools fall back to `['banking:read']` (safe default — read-only) via `getScopesForTool()`. There is no "empty scopes / no OAuth" path in the current registry.

### 2. Implement handler in `BankingToolProvider.ts`

```typescript
// src/tools/BankingToolProvider.ts
async executeMyNewTool(
  params: Record<string, unknown>,
  session: Session,
  agentToken?: string
): Promise<BankingToolResult> {
  const { account_id, amount } = params;
  if (!account_id || typeof account_id !== 'string') {
    return { type: 'text', text: 'Error: account_id is required', success: false };
  }

  try {
    const result = await this.apiClient.post('/api/transactions/my-op', {
      accountId: account_id, amount,
    }, session);
    return { type: 'text', text: JSON.stringify(result, null, 2), success: true };
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const challenge = await this.authChallengeHandler.generateAuthorizationChallenge(
        session.sessionId, ['banking:write'],
      );
      return { type: 'text', text: 'Authorization required', success: false, authChallenge: challenge };
    }
    if (err instanceof BankingAPIError) {
      return { type: 'text', text: `Banking error: ${err.message}`, success: false, error: err.message };
    }
    throw err;
  }
}
```

---

## Tool Result Format

```typescript
export interface BankingToolResult extends ToolResult {
  type: 'text';          // always 'text'
  text: string;          // human/AI-readable content
  success?: boolean;
  error?: string;
  authChallenge?: AuthorizationRequest;  // set when auth is needed
}

// ✅ Success
return { type: 'text', text: JSON.stringify(data, null, 2), success: true };
// ✅ Error
return { type: 'text', text: `Error: ${message}`, success: false, error: message };
// ✅ Auth required
return { type: 'text', text: 'Authorization required', success: false, authChallenge: challenge };
```

---

## Session Management

```typescript
// BankingSession structure
interface BankingSession extends SessionData {
  userTokens?: UserTokens[];     // array — one per scope set
  userEmail?: string;            // injected at connection time (for CIBA)
  sessionStats?: SessionStats;
}

interface UserTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;           // space-separated scopes this token covers
  issuedAt: Date;
}

// In tool handlers:
const session = await this.sessionManager.getSession(sessionId);
const tokens = session.userTokens ?? [];
const validToken = this.findTokenForScopes(tokens, requiredScopes);
await this.sessionManager.associateUserTokens(sessionId, newTokens);
```

---

## Authorization Challenge Flow

When a tool needs scopes the session doesn't have:

```typescript
// 1. Detect — called automatically before execution
const { challengeNeeded, challenge } = await this.authChallengeHandler
  .detectAuthorizationChallenge(session, tool.requiredScopes);

// 2. Challenge type returned to UI
interface AuthorizationChallenge {
  type: 'oauth_authorization_required';
  authorizationUrl: string;  // PingOne /authorize URL with PKCE
  state: string;
  scope: string;
  sessionId: string;
  expiresAt: Date;
  instructions: string;
}

// 3. After UI completes auth, sends back:
interface AuthorizationCodeRequest {
  sessionId: string;
  authorizationCode: string;
  state: string;
}
// Handler exchanges code for tokens and associates with session
```

---

## MCP Protocol Message Flow

```typescript
// MCPMessageHandler routes:
switch (message.method) {
  case 'initialize':   // Handshake — returns serverInfo + capabilities
  case 'tools/list':   // Returns BankingToolRegistry.getAllTools()
  case 'tools/call':   // Executes tool via BankingToolProvider
}

interface MessageHandlerContext {
  connectionId: string;
  agentToken?: string;  // T2 Bearer token from banking_api_server
  session?: BankingSession;
  userEmail?: string;
  sendNotification?: (notification: object) => void;
}
```

---

## CIBA in MCP Server (Step-Up)

```typescript
// CIBAPendingRequest (stored in BankingSession)
interface CIBAPendingRequest {
  authReqId: string;
  initiatedAt: number;   // epoch ms
  expiresAt: number;
  interval: number;      // poll interval seconds
  userEmail: string;
  requiredScope: string;
}
// 1. MCP server calls banking_api_server POST /api/auth/ciba/initiate
// 2. Stores auth_req_id in session, sends notification to UI
// 3. Polls banking_api_server GET /api/auth/ciba/poll/:authReqId
// 4. On approval, tokens added to session, tool execution continues
```

---

## BankingAPIClient — Calling the API Server

```typescript
import { BankingAPIClient } from '../banking/BankingAPIClient';

// GET with session token
const accounts = await this.apiClient.get('/api/accounts', session);
// POST with body
const result = await this.apiClient.post('/api/transactions/transfer', {
  fromAccountId, toAccountId, amount,
}, session);
// apiClient picks the right token from session.userTokens automatically
// Throws BankingAPIError on non-2xx, AuthenticationError on 401/403
```

---

## Deployment

### Local (default)

`run-bank.sh` starts `banking_mcp_server` on `localhost:8080` alongside the BFF. The **BFF** (not the React UI — token custody rule means the SPA never talks to MCP directly) dials it via `PINGONE_MCP_SERVER_URL=ws://localhost:8080` set in `banking_api_server/.env`. No remote host needed for local development on `api.ping.demo`.

```bash
cd banking_mcp_server
npm run build:clean   # rm -rf dist && tsc
npm run start:prod    # NODE_ENV=production node dist/index.js
```

### Remote (when sharing the demo)

WebSocket requires an always-on host — pick one:

| Platform | Free tier | Deploy command |
|----------|-----------|----------------|
| Railway | ~$5/mo | `railway up` |
| Render | Free (sleeps 15min) | Connect GitHub repo |
| Fly.io | Free (3 shared VMs) | `fly deploy` |

Required env vars on the MCP host (names match `banking_mcp_server/.env.example` — see it for the full list):

```bash
# Banking API backend
BANKING_API_BASE_URL=https://api.ping.demo:3001   # or wherever the BFF is reachable

# PingOne — endpoints are explicit on the MCP server, not auto-resolved
PINGONE_BASE_URL=https://auth.pingone.${region}/${environmentId}
PINGONE_AUTHORIZATION_ENDPOINT=https://auth.pingone.${region}/${environmentId}/as/authorize
PINGONE_TOKEN_ENDPOINT=https://auth.pingone.${region}/${environmentId}/as/token
PINGONE_INTROSPECTION_ENDPOINT=https://auth.pingone.${region}/${environmentId}/as/introspect
PINGONE_CLIENT_ID=<mcp-server-client-id>
PINGONE_CLIENT_SECRET="<mcp-server-client-secret>"

# HTTP transport (RFC 9728 + Streamable HTTP)
HTTP_MCP_TRANSPORT_ENABLED=true
MCP_RESOURCE_URL=https://your-mcp-host                # appears in WWW-Authenticate + RFC 9728 metadata
MCP_SERVER_RESOURCE_URI=https://your-mcp-host         # RFC 8707 audience validation on inbound tokens
MCP_ALLOWED_ORIGINS=https://api.ping.demo:4000        # comma-separated; blank = allow all

# Server
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=8080
```

After deploying remotely: set `PINGONE_MCP_SERVER_URL=wss://your-mcp-host` in the BFF's env (`banking_api_server/.env`) so it can dial the WebSocket.

---

## See Also

- [oauth-pingone skill](../oauth-pingone/SKILL.md) — RFC 8693 token exchange details, scope mechanics
- [bff-sessions skill](../bff-sessions/SKILL.md) — session/token custody on the BFF side (sole MCP client)
- [hitl-consent skill](../hitl-consent/SKILL.md) — `mcpToolAuthorizationService` confirm vs step-up gates, banking_hitl_service handoff
- [regression-guard skill](../regression-guard/SKILL.md) — REGRESSION_PLAN §1 entries that touch MCP tool flow
- [typescript-banking skill](../typescript-banking/SKILL.md) — TS style for the `banking_mcp_server/src/` package
