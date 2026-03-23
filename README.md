# Banking Demo — PingOne Edition

Standalone AI-powered banking demo using PingOne for authentication and **RFC 8693 Token Exchange** so the AI agent can securely access banking data on behalf of users.

This is a **completely standalone** project — it can be handed to anyone and run independently.

## Components

| Component | Port | Description |
|---|---|---|
| `banking_api_ui` | 3000 | React frontend (admin + end-user dashboards) |
| `banking_api_server` | 3001 | Express REST API with PingOne OAuth |
| `banking_mcp_server` | 8080 | MCP tool server for the AI agent |
| `langchain_agent` | 8000 | LangChain + OpenAI AI banking agent |

## Quick Start

```bash
# 1. Start the API server
cd banking_api_server && npm install && npm run dev

# 2. Start the React UI
cd banking_api_ui && npm install && npm start

# 3. Configure PingOne credentials at http://localhost:3000/config
#    (no .env file needed — all config stored in SQLite via the UI)
```

## Configuration

Visit **http://localhost:3000/config** to enter your PingOne credentials.
Settings are stored encrypted in `banking_api_server/data/persistent/config.db` (SQLite locally)
or Vercel KV in production — **no `.env` file required**.

```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Banking Digital Assistant                    │
│                                                           │
│  banking_api_ui (:3000)   ←→   banking_api_server (:3001) │
│       React UI                  Express banking API        │
│                                    ↑ JWT validation        │
│                                    │ via PingOne JWKS      │
│                                                           │
│  langchain_agent (:8888)  ←→   banking_mcp_server (:8080) │
│    LangChain + OpenAI           MCP tools for banking      │
│           ↓ Token Exchange                                 │
│    oauth-playground (:3001)  (or PingOne directly)        │
└─────────────────────────────────────────────────────────┘
                        ↓
              PingOne (auth.pingone.com)
              Environment: b9817c16-...
```

## Key Changes from Original (ForgeRock/PingOne AI IAM Core → PingOne)

| Component | Before | After |
|---|---|---|
| AS endpoints | `openam-*.forgeblocks.com/am/oauth2/...` | `auth.pingone.com/{envId}/as/...` |
| Token validation | PingOne AI IAM Core introspection (HTTP call) | PingOne JWKS (JWT signature) |
| Token Exchange | Not implemented | RFC 8693 via `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` |
| MCP server config | `PINGONE_BASE_URL=*.pingidentity.com` | `PINGONE_BASE_URL=https://auth.pingone.com/{envId}/as` |

## Services

| Service | Port | Description |
|---|---|---|
| `banking_api_server` | 3001 | Express REST API — banking accounts, transactions, admin |
| `banking_api_ui` | 3000 | React frontend for admin/customer portal |
| `banking_mcp_server` | 8080 | TypeScript MCP server — exposes banking tools to AI agents |
| `langchain_agent` | 8888 | LangChain agent + WebSocket frontend |

## Quick Start

1. **Install dependencies** (first time only):
   ```bash
   cd banking_api_server && npm install
   cd ../banking_mcp_server && npm install
   cd ../banking_api_ui && npm install
   ```

2. **Start the banking API server** (primary service):
   ```bash
   cd banking_api_server && npm start
   ```

3. **Start the MCP server** (for AI agent tool calls):
   ```bash
   cd banking_mcp_server
   cp .env.development .env
   npm start
   ```

4. **Start the UI**:
   ```bash
   cd banking_api_ui && npm start
   ```

## Token Exchange Flow

The AI agent (langchain_agent / MCP server) uses **RFC 8693 Token Exchange** to exchange its own agent access token for a user-delegated banking token:

```
Agent → PingOne (client_credentials) → agent_access_token
Agent → /api/token-exchange (oauth-playground OR PingOne directly):
  grant_type = urn:ietf:params:oauth:grant-type:token-exchange
  subject_token = agent_access_token
  requested_token_type = urn:ietf:params:oauth:token-type:access_token
  audience = banking_api_enduser
  scope = banking:read banking:transactions:read
→ user_delegated_token
Agent → banking_api_server (with user_delegated_token)
```

The `oauth-playground` server (`/api/token-exchange`) has a full RFC 8693 implementation 
for PingOne — either run it alongside this app or implement the exchange directly.

## PingOne Configuration Required

In your PingOne environment (`b9817c16-9910-4415-b67e-4ac687da74d9`), you need:

1. **Worker App** (client_credentials) — for MCP server & agent token
   - Already configured: `66a4686b-9222-4ad2-91b6-03113711c9aa`

2. **Web Application** (auth_code + PKCE) — for user login
   - Already configured: `a4f963ea-0736-456a-be72-b1fa4f63f81f`

3. **Token Exchange** policy — allow the Worker App to exchange tokens
   - In PingOne: Applications → Policies → Token Exchange
   - Subject token issuer: same PingOne environment
   - Requested audience: `banking_api_enduser`

## MCP Security Gateway — Potential Architecture

> **Note:** This is not how the app is currently set up. It illustrates how an **MCP Security Gateway** 
> (as defined by Ping Identity) could be introduced to centralize identity enforcement between the 
> Banking Agent and the Banking MCP Server — without changing either endpoint's code.

```mermaid
flowchart LR
    subgraph Customer["🏦 Banking App Infrastructure"]
        direction TB
        GATEWAY["🔴 MCP Security Gateway\n(policy enforcement point)"]
        MCP_SERVER["Banking MCP Server\n:8080\ntools: balance · transfer · transactions"]
    end

    subgraph PingCloud["☁️ Ping"]
        PING["Ping Identity Platform\n(PingOne)\n• token validation\n• policy evaluation\n• step-up MFA decisions"]
    end

    BANKING_AGENT["🤖 Banking Agent\n(LangChain FAB)\n:8888"]

    BANKING_AGENT -- "1. MCP tool call\n(access_token in header)" --> GATEWAY
    GATEWAY -- "3. Forward validated\nrequest (adapted)" --> MCP_SERVER
    MCP_SERVER -- "tool result" --> GATEWAY
    GATEWAY -- "response" --> BANKING_AGENT
    GATEWAY <-- "2. Enforce identity &\nsecurity rules\n(token introspect, policy eval,\nstep-up triggers)" --> PING

    style GATEWAY fill:#c0392b,color:#fff,stroke:#922b21
    style PING fill:#e8a0a0,color:#333,stroke:#c0392b
    style BANKING_AGENT fill:#f0f0f0,stroke:#333
    style MCP_SERVER fill:#f0f0f0,stroke:#333
```

**How it would work in practice:**

| Step | Current (no gateway) | With MCP Security Gateway |
|---|---|---|
| 1. Agent calls MCP tool | Direct WebSocket to `:8080` | HTTPS call to gateway — MCP traffic intercepted |
| 2. Identity enforcement | MCP server validates token itself | Gateway calls PingOne to validate token, evaluate policies, trigger step-up MFA |
| 3. Downstream adaptation | Token passed as-is | Gateway can exchange token, strip/add claims, or adapt auth scheme for the MCP server |

**Key benefits this would add to the banking demo:**
- Centralised audit log of every MCP tool call
- Policy-driven step-up MFA before high-risk tools (e.g. `transfer_funds`)
- Token exchange at the gateway — MCP server never sees the user's raw token
- Swap out the MCP server without changing agent auth logic

---

## Environment Files

| File | Purpose |
|---|---|
| `banking_api_server/.env` | Banking API config (PingOne credentials, port) |
| `banking_mcp_server/.env.development` | MCP server config (copy to `.env` before running) |
| `langchain_agent/.env` | Agent config (OpenAI key, PingOne endpoints) |
| `banking_api_ui/.env` | React frontend config |
