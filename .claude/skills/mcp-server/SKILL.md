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

> **Important:** the MCP server exposes **two transports** — WebSocket (always on) and HTTP (`POST /mcp` Streamable HTTP + RFC 9728 metadata, controlled by `HTTP_MCP_TRANSPORT_ENABLED`, default `true`). Both run on the same port simultaneously. The service cannot run on stateless serverless platforms (Lambda, Cloud Run with default settings) because WebSocket connections are stateful. Locally it binds to `localhost:8080` via `run-bank.sh` — the MCP server uses plain HTTP/WS internally (no `api.ping.demo` cert needed); the BFF on `api.ping.demo:3001` is what dials it. For remote hosting use an always-on platform: Railway, Render, or Fly.io. Set `PINGONE_MCP_SERVER_URL=wss://your-mcp-host` in the BFF's env (`banking_api_server/.env`, default `ws://localhost:8080`) so `banking_api_server` can dial it.

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
