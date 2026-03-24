---
name: mcp-server
description: 'BX Finance MCP server (TypeScript): tool registration, session management, auth challenge handling, WebSocket protocol. USE FOR: add or modify MCP tools, BankingToolRegistry, BankingToolProvider, MCPMessageHandler, BankingSessionManager, tools/call, tools/list, initialize handshake, auth challenge flow, missing scope detection, Railway/Render/Fly deployment of MCP server. DO NOT USE FOR: OAuth token flows or PKCE (use oauth-pingone); PingOne Management API calls (use pingone-api-calls); Vercel deployment (use vercel-banking); TypeScript style rules (use typescript-banking).'
argument-hint: 'Describe the MCP tool or server feature you need to add or modify'
---

# MCP Server — BX Finance Banking MCP Server

## Architecture

```
banking_api_ui (React)
    │  WebSocket (wss://mcp-server-host)
    ▼
banking_mcp_server           ← TypeScript MCP server (must run on always-on host)
    │
    ├─ MCPMessageHandler     → routes initialize / tools/list / tools/call
    ├─ BankingToolRegistry   → static registry of all tool definitions
    ├─ BankingToolProvider   → executes tools, handles auth challenges
    ├─ AuthorizationChallengeHandler → detects missing scopes, generates OAuth challenge
    ├─ BankingSessionManager → per-connection session (userTokens, CIBA state)
    └─ BankingAPIClient      → calls banking_api_server HTTP endpoints
```

> **Important:** Vercel does NOT support persistent WebSocket connections. The MCP server must be deployed separately on Railway, Render, or Fly.io. Set `MCP_SERVER_URL=wss://...` in Vercel env vars.

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
      requiredScopes: ['banking:transactions:write'],  // PingOne scopes needed
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

**Scope reference:**

| Scope | Action |
|-------|--------|
| `banking:accounts:read` | Get accounts, balances |
| `banking:transactions:read` | Get transactions |
| `banking:transactions:write` | Deposit, withdrawal, transfer |
| (empty `[]`) | Public/query, no OAuth required |

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
        session.sessionId, ['banking:transactions:write'],
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

The MCP server is **not** on Vercel. Use an always-on WebSocket host:

| Platform | Free tier | Deploy command |
|----------|-----------|----------------|
| Railway | ~$5/mo | `railway up` |
| Render | Free (sleeps 15min) | Connect GitHub repo |
| Fly.io | Free (3 shared VMs) | `fly deploy` |

```bash
cd banking_mcp_server
npm run build:clean   # rm -rf dist && tsc
npm run start:prod    # NODE_ENV=production node dist/index.js

# Required env vars on MCP host:
BANKING_API_URL=https://banking-demo-puce.vercel.app
PINGONE_AUTH_URL=https://auth.pingone.com/{envId}/as
ADMIN_CLIENT_ID=...
ADMIN_CLIENT_SECRET=...
PORT=8080
```

After deploying: set `MCP_SERVER_URL=wss://your-mcp-host` in Vercel project settings.
