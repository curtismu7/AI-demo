# Scope Topology (generated — do not edit by hand)

> Source of truth: `scope-topology.json`. Regenerate with `npm run scopes:doc`.

## Scopes

| Scope | Risk | Resource | Description |
|---|---|---|---|
| `read` | low | Super Banking API | Read accounts, balances, transactions |
| `write` | high | Super Banking API | Write operations (deposit/withdrawal/transfer) |
| `transfer` | high | Super Banking API | Execute fund transfers |
| `accounts:read` | low | Super Banking API | Read account information and balances |
| `transactions:read` | low | Super Banking API | Read transaction history and details |
| `mortgage:read` | low | Super Banking API | Read mortgage/feature-specific data (banking vertical) |
| `ai:agent:read` | medium | Super Banking API | Agent invocation permission |
| `mcp:invoke` | medium | Super Banking MCP Server | Invoke MCP tools via the gateway (RFC 8693 exchange) |
| `agent:invoke` | medium | Super Banking Agent Gateway | Invoke the Agent Gateway (Two-Exchange Step 1 audience) |
| `ai_agent` | medium | Super Banking API | AI agent identity |
| `admin:read` | medium | Super Banking API | Read access to administrative data |
| `admin:write` | high | Super Banking API | Write access to administrative operations |
| `admin:delete` | critical | Super Banking API | Delete operations for administrative tasks |
| `users:read` | medium | Super Banking API | Read access to user management data |
| `users:manage` | high | Super Banking API | Full user management capabilities |

## Resources

### Super Banking API

Audience: `enduser.ping.demo`

Native scopes: `read`, `write`, `transfer`, `accounts:read`, `transactions:read`, `mortgage:read`, `ai:agent:read`, `ai_agent`, `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`

### Super Banking MCP Server

Audience: `mcpserver.ping.demo`

Native scopes: `mcp:invoke`

Mirrored scopes (RFC 8693 exchange-hop, ARCHITECTURE-TRUTHS T-10): `read`, `write`, `mortgage:read`, `ai:agent:read`, `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`

### Super Banking MCP Gateway

Audience: `mcpgateway.ping.demo`

Native scopes: `mcp:invoke`

Mirrored scopes (RFC 8693 exchange-hop, ARCHITECTURE-TRUTHS T-10): `read`, `write`, `transfer`, `mortgage:read`

### Super Banking Agent Gateway

Audience: `agentgateway.ping.demo`

Native scopes: `agent:invoke`

## Servers

| Service | Resource | Validates aud | Gates on tool scopes | Notes |
|---|---|---|---|---|
| `demo_api_server` | Super Banking API | `enduser.ping.demo` | no | BFF / token custodian. Performs RFC 8693 two-exchange delegation (user token -> mcpgateway.ping.demo). |
| `demo_mcp_gateway` | Super Banking MCP Gateway | `mcpgateway.ping.demo` | yes | MCP Gateway. Validates inbound aud === mcpgateway.ping.demo and enforces per-tool requiredScopes (getScopesForGatewayTool) on the inbound bearer BEFORE credential swap. Therefore every gateway-surface tool scope MUST be mirrored onto the Super Banking MCP Gateway resource (ARCHITECTURE-TRUTHS T-10). |
| `demo_mcp_server` | Super Banking MCP Server | `mcpserver.ping.demo` | yes | Backend MCP tool server. Receives the gateway re-exchanged token (aud === mcpserver.ping.demo); banking tool scopes are mirrored here for exchange hop #3. |
| `demo_agent_service` | Super Banking Agent Gateway | `agentgateway.ping.demo` | no | Agent Gateway (Two-Exchange Step 1 audience for the AI Agent client-credentials token). |

## App Grants

### Super Banking User App

Type: `WEB_APP`  ·  Grants: `authorization_code`, `refresh_token`, `token_exchange`

Granted scopes: `ai:agent:read`, `read`, `write`, `transfer`, `mortgage:read`

### Super Banking Admin App

Type: `WEB_APP`  ·  Grants: `authorization_code`, `refresh_token`, `token_exchange`

Granted scopes: `read`, `write`, `transfer`, `accounts:read`, `transactions:read`, `mortgage:read`, `ai:agent:read`, `ai_agent`, `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`

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

Granted scopes: `read`, `write`, `mcp:invoke`

### Super Banking AI Agent

Type: `WEB_APP`  ·  Grants: `client_credentials`, `token_exchange`

Granted scopes: `agent:invoke`

### Super Banking Agent

Type: `WORKER`  ·  Grants: `client_credentials`

Granted scopes: — (none; resource-server or worker app)

### Super Banking Worker

Type: `WORKER`  ·  Grants: `client_credentials`

Granted scopes: — (none; resource-server or worker app)

## Tool → Scope Dependencies

| Tool | Surface | Required Scopes | Challenge |
|---|---|---|---|
| `get_my_accounts` | gateway | `read` | — |
| `get_account_balance` | gateway | `read` | — |
| `get_my_transactions` | gateway | `read` | — |
| `get_sensitive_account_details` | gateway | `read` | — |
| `sequential_think` | gateway | `read` | — |
| `get_investment_balance` | gateway | `read` | — |
| `get_investment_accounts` | gateway | `read` | — |
| `get_portfolio_summary` | gateway | `read` | — |
| `show_mortgage` | gateway | `mortgage:read` | — |
| `create_deposit` | gateway | `write` | step_up |
| `create_withdrawal` | gateway | `write` | step_up |
| `create_transfer` | gateway | `write` `transfer` | step_up |
| `query_user_by_email` | exchange-only | `ai_agent` | — |
| `admin_list_all_users` | exchange-only | `admin:read` `users:read` | — |
| `admin_get_user_details` | exchange-only | `admin:read` `users:read` | — |
| `admin_delete_user` | exchange-only | `admin:write` `admin:delete` `users:manage` | — |
| `admin_manage_accounts` | exchange-only | `admin:write` `users:manage` | — |
| `admin_view_audit_logs` | exchange-only | `admin:read` | — |
| `admin_system_status` | exchange-only | `admin:read` | — |
| `lookup_customer` | exchange-only | `admin:read` `users:read` | — |
| `get_customer_profile` | exchange-only | `admin:read` `users:read` | — |
| `get_customer_accounts` | exchange-only | `admin:read` `users:read` | — |
| `get_customer_transactions` | exchange-only | `admin:read` `users:read` | — |
| `freeze_account` | exchange-only | `admin:write` `users:manage` | — |
| `reset_customer_password` | exchange-only | `admin:write` `users:manage` | — |
| `adjust_balance` | exchange-only | `admin:write` `users:manage` | — |
| `delete_customer` | exchange-only | `admin:write` `admin:delete` `users:manage` | — |
| `list_accounts` | legacy-alias | `read` | — |
| `list_transactions` | legacy-alias | `read` | — |
| `transfer` | legacy-alias | `write` | — |
| `deposit` | legacy-alias | `write` | — |
| `withdraw` | legacy-alias | `write` | — |
