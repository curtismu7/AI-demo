# Scope Topology (generated — do not edit by hand)

> Source of truth: `scope-topology.json`. Regenerate with `npm run scopes:doc`.

## Scopes

| Scope | Risk | Resource | Description |
|---|---|---|---|
| `banking:read` | low | Super Banking API | Read accounts, balances, transactions |
| `banking:write` | high | Super Banking API | Write banking operations (deposit/withdrawal) |
| `banking:transfer` | high | Super Banking API | Execute fund transfers |
| `banking:accounts:read` | low | Super Banking API | Read account information and balances |
| `banking:transactions:read` | low | Super Banking API | Read transaction history and details |
| `banking:mortgage:read` | low | Super Banking API | Read mortgage account data (Phase 267 Path A api-key disposition) |
| `banking:ai:agent:read` | medium | Super Banking API | Agent invocation permission |
| `banking:mcp:invoke` | medium | Super Banking MCP Server | Invoke MCP tools via the gateway (RFC 8693 exchange) |
| `banking:agent:invoke` | medium | Super Banking Agent Gateway | Invoke the Agent Gateway (Two-Exchange Step 1 audience) |
| `ai_agent` | medium | Super Banking API | AI agent identity |
| `admin:read` | medium | Super Banking API | Read access to administrative data |
| `admin:write` | high | Super Banking API | Write access to administrative operations |
| `admin:delete` | critical | Super Banking API | Delete operations for administrative tasks |
| `users:read` | medium | Super Banking API | Read access to user management data |
| `users:manage` | high | Super Banking API | Full user management capabilities |

## Resources

### Super Banking API

Audience: `banking_api_enduser`

Native scopes: `banking:read`, `banking:write`, `banking:transfer`, `banking:accounts:read`, `banking:transactions:read`, `banking:mortgage:read`, `banking:ai:agent:read`, `ai_agent`, `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`

### Super Banking MCP Server

Audience: `mcp-server.bxf.com`

Native scopes: `banking:mcp:invoke`

Mirrored scopes (RFC 8693 exchange-hop, ARCHITECTURE-TRUTHS T-10): `banking:read`, `banking:write`, `banking:mortgage:read`, `banking:ai:agent:read`, `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`

### Super Banking MCP Gateway

Audience: `mcp-gw.bxf.com`

Native scopes: `banking:mcp:invoke`

Mirrored scopes (RFC 8693 exchange-hop, ARCHITECTURE-TRUTHS T-10): `banking:read`, `banking:write`, `banking:transfer`, `banking:mortgage:read`

### Super Banking Agent Gateway

Audience: `agent-gateway.bxf.com`

Native scopes: `banking:agent:invoke`

## Servers

| Service | Resource | Validates aud | Gates on tool scopes | Notes |
|---|---|---|---|---|
| `banking_api_server` | Super Banking API | `banking_api_enduser` | no | BFF / token custodian. Performs RFC 8693 exchange #1 (user token -> mcp-gw.bxf.com audience). |
| `banking_mcp_gateway` | Super Banking MCP Gateway | `mcp-gw.bxf.com` | yes | MCP Gateway. Validates inbound aud === mcp-gw.bxf.com and enforces per-tool requiredScopes (getScopesForGatewayTool) on the inbound bearer BEFORE credential swap. Therefore every gateway-surface tool scope MUST be mirrored onto the Super Banking MCP Gateway resource (ARCHITECTURE-TRUTHS T-10). |
| `banking_mcp_server` | Super Banking MCP Server | `mcp-server.bxf.com` | yes | Backend MCP tool server. Receives the gateway re-exchanged token (aud === mcp-server.bxf.com); banking tool scopes are mirrored here for exchange hop #3. |
| `banking_agent_service` | Super Banking Agent Gateway | `agent-gateway.bxf.com` | no | Agent Gateway (Two-Exchange Step 1 audience for the AI Agent client-credentials token). |

## App Grants

### Super Banking User App

Type: `WEB_APP`  ·  Grants: `authorization_code`, `refresh_token`, `token_exchange`

Granted scopes: `banking:ai:agent:read`, `banking:read`, `banking:write`, `banking:transfer`, `banking:mortgage:read`

### Super Banking Admin App

Type: `WEB_APP`  ·  Grants: `authorization_code`, `refresh_token`, `token_exchange`

Granted scopes: `banking:read`, `banking:write`, `banking:transfer`, `banking:accounts:read`, `banking:transactions:read`, `banking:mortgage:read`, `banking:ai:agent:read`, `ai_agent`, `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`

### Super Banking MCP Server

Type: `WEB_APP`  ·  Grants: `client_credentials`

Is resource server: `Super Banking MCP Server`

Granted scopes: — (none; resource-server or worker app)

### Super Banking MCP Gateway

Type: `WEB_APP`  ·  Grants: `client_credentials`, `token_exchange`

Is resource server: `Super Banking MCP Gateway`

Granted scopes: — (none; resource-server or worker app)

### Super Banking MCP Exchanger

Type: `WEB_APP`  ·  Grants: `token_exchange`

Granted scopes: `banking:read`, `banking:write`, `banking:mcp:invoke`

### Super Banking AI Agent

Type: `WEB_APP`  ·  Grants: `client_credentials`, `token_exchange`

Granted scopes: `banking:agent:invoke`

### Super Banking Agent

Type: `WORKER`  ·  Grants: `client_credentials`

Granted scopes: — (none; resource-server or worker app)

### Super Banking Worker

Type: `WORKER`  ·  Grants: `client_credentials`

Granted scopes: — (none; resource-server or worker app)

## Tool → Scope Dependencies

| Tool | Surface | Required Scopes | Challenge |
|---|---|---|---|
| `get_my_accounts` | gateway | `banking:read` | — |
| `get_account_balance` | gateway | `banking:read` | — |
| `get_my_transactions` | gateway | `banking:read` | — |
| `get_sensitive_account_details` | gateway | `banking:read` | — |
| `sequential_think` | gateway | `banking:read` | — |
| `get_investment_balance` | gateway | `banking:read` | — |
| `get_investment_accounts` | gateway | `banking:read` | — |
| `get_portfolio_summary` | gateway | `banking:read` | — |
| `show_mortgage` | gateway | `banking:mortgage:read` | — |
| `create_deposit` | gateway | `banking:write` | step_up |
| `create_withdrawal` | gateway | `banking:write` | step_up |
| `create_transfer` | gateway | `banking:write` `banking:transfer` | step_up |
| `query_user_by_email` | exchange-only | `ai_agent` | — |
| `admin_list_all_users` | exchange-only | `admin:read` `users:read` | — |
| `admin_get_user_details` | exchange-only | `admin:read` `users:read` | — |
| `admin_delete_user` | exchange-only | `admin:write` `admin:delete` `users:manage` | — |
| `admin_manage_accounts` | exchange-only | `admin:write` `users:manage` | — |
| `admin_view_audit_logs` | exchange-only | `admin:read` | — |
| `admin_system_status` | exchange-only | `admin:read` | — |
| `list_accounts` | legacy-alias | `banking:read` | — |
| `list_transactions` | legacy-alias | `banking:read` | — |
| `transfer` | legacy-alias | `banking:write` | — |
| `deposit` | legacy-alias | `banking:write` | — |
| `withdraw` | legacy-alias | `banking:write` | — |
| `banking_get_account_balance` | legacy-alias | `banking:read` | — |
| `banking_create_transfer` | legacy-alias | `banking:write` | — |
