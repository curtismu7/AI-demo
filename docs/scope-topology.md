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
| `ai_agent` | medium | Super Banking API | AI agent identity |

## Resources

### Super Banking API

`banking:read`, `banking:write`, `banking:transfer`, `banking:accounts:read`, `banking:transactions:read`, `banking:mortgage:read`, `banking:ai:agent:read`, `ai_agent`

### Super Banking MCP Server

`banking:mcp:invoke`

## App Grants

### Super Banking User App

`banking:ai:agent:read`, `banking:read`, `banking:write`, `banking:transfer`, `banking:mortgage:read`

### Super Banking Admin App

`banking:read`, `banking:write`, `banking:transfer`, `banking:accounts:read`, `banking:transactions:read`, `banking:mortgage:read`, `banking:ai:agent:read`, `ai_agent`

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
