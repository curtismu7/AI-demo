# Scope Vocabulary — Canonical Registry

> **Single source of truth** for all OAuth 2.0 scope definitions in the Super Banking demo.
> Phase 146 (Scope Vocabulary Alignment) — Decision D-02, D-03.

---

## Canonical Scope List

| Scope Name | Type | Description | Resource Server |
|-----------|------|-------------|-----------------|
| `banking:read` | Core | Read-only access to accounts, balances, and transactions | Main Banking API |
| `banking:write` | Core | Write access for deposits, withdrawals, transfers | Main Banking API |
| `banking:admin` | Core | Full administrative access (admin UI, stats, settings) | Main Banking API |
| `banking:sensitive` | Core | Sensitive data access (PII, account details) | Main Banking API |
| `banking:ai:agent` | Core | AI agent identification on banking resource tokens | Main Banking API |
| `ai_agent` | Identity | Legacy identity marker for agent OAuth clients | OIDC (no resource server) |
| `banking:accounts:read` | Compound | Read-only accounts view | Main Banking API |
| `banking:transactions:read` | Compound | Read-only transactions view | Main Banking API |
| `banking:transactions:write` | Compound | Write transactions (deposits, withdrawals, transfers) | Main Banking API |

**Core scopes** are the canonical names used in new code. **Compound scopes** are kept for backward compatibility and will be deprecated in a future phase.

---

## Resource Server Mapping

### Main Banking API

- **Audience URI:** Configured via `PINGONE_AUDIENCE_ENDUSER` env var (default: `https://banking-api.banking-demo.com`)
- **PingOne Resource:** Custom resource server created via PingOne Management API or admin console
- **Scopes issued:** `banking:read`, `banking:write`, `banking:admin`, `banking:sensitive`, `banking:ai:agent`, plus compound variants
- **Enforcement:** BFF middleware `requireScopes()` + row-level ownership checks on transaction routes

### Agent Gateway (2-Exchange)

- **Audience URI:** Configured via `PINGONE_RESOURCE_AGENT_GATEWAY_URI` env var
- **Scopes issued:** `banking:agent:invoke`, `ai_agent`
- **Purpose:** Step 1 of 2-exchange flow (actor token for RFC 8693)

### MCP Server

- **Audience URI:** Configured via `pingone_resource_mcp_server_uri` in configStore
- **Scopes issued:** Narrowed via RFC 8693 token exchange from Main Banking API scopes
- **Purpose:** Delegated access token for MCP tool execution

---

## Route Enforcement Index

> **Note:** Transaction `/my` routes intentionally skip `requireScopes()` — see [REGRESSION_PLAN.md §1](../REGRESSION_PLAN.md).
> Tokens without a custom resource server lack `banking:*` scopes, so row-level ownership checks are used instead.

| Route | Required Scope(s) | Enforcement | Notes |
|-------|-------------------|-------------|-------|
| `GET /api/accounts` | `banking:read` | `requireScopes()` | All accounts (admin) or own accounts (customer) |
| `GET /api/accounts/my` | `banking:read` | `requireScopes()` | User's own accounts |
| `POST /api/transactions/deposit` | `banking:write` | `requireScopes()` | Deposit to own account |
| `POST /api/transactions/withdraw` | `banking:write` | `requireScopes()` | Withdraw from own account |
| `POST /api/transactions/transfer` | `banking:write` | `requireScopes()` | Transfer between accounts |
| `GET /api/transactions/my` | _(none)_ | Row-level ownership | Intentional — no `requireScopes()` per REGRESSION_PLAN §1 |
| `GET /api/admin/*` | `banking:admin` | `requireScopes()` | Admin-only endpoints |
| `POST /api/admin/*` | `banking:admin` | `requireScopes()` | Admin-only endpoints |
| `GET /api/users/me` | `banking:read` | `requireScopes()` | Current user profile |

See [SCOPE_AUTHORIZATION.md](SCOPE_AUTHORIZATION.md) for middleware usage patterns and code examples.

---

## User Type Scope Assignments

| User Type | Scopes |
|-----------|--------|
| **Admin** | `banking:admin`, `banking:read`, `banking:write`, `banking:sensitive`, `banking:ai:agent` |
| **Customer** | `banking:read`, `banking:write`, `banking:ai:agent` |
| **Read-only** | `banking:read` |
| **AI Agent** | `ai_agent`, `banking:ai:agent`, `banking:read`, `banking:write` |

Defined in `config/scopes.js` → `USER_TYPE_SCOPES`.

---

## Scope Injection (Demo Mode)

When PingOne resource server is not configured, the BFF can inject banking scopes for demo purposes via feature flag `ff_inject_scopes`:

- **Flag:** `ff_inject_scopes` (configStore / Feature Flags UI)
- **Behavior:** When enabled, if the user token lacks `banking:read`/`banking:write`, the BFF injects them in memory before token exchange
- **Tracking:** Injected scope names stored in `claims.injected_scope_names` array
- **UI:** Token Chain displays ⚡ INJECTED badge per scope (see Phase 146 Plan 03)
- **Security:** Flag only writable by admin; injection is logged to tokenEvents and exchange audit

See also: `ff_inject_may_act` (similar pattern for RFC 8693 `may_act` claim injection).

---

## Deprecation Path

### Old → New Scope Names (Phase 146)

| Old Name | New Canonical Name | Status |
|----------|--------------------|--------|
| `banking:general:read` | `banking:read` | **Replaced** in `config/scopes.js` |
| `banking:general:write` | `banking:write` | **Replaced** in `config/scopes.js` |

### Compound Scopes (Future Deprecation)

| Scope | Status | Notes |
|-------|--------|-------|
| `banking:accounts:read` | Accepted | Still recognized by middleware for backward compatibility |
| `banking:transactions:read` | Accepted | Still recognized by middleware for backward compatibility |
| `banking:transactions:write` | Accepted | Still recognized by middleware for backward compatibility |

These compound scopes will be fully removed in a future phase. New code should use `banking:read` and `banking:write`.

---

## Related Documentation

- [OAUTH_SCOPE_CONFIGURATION.md](OAUTH_SCOPE_CONFIGURATION.md) — PingOne environment setup and OAuth app configuration
- [SCOPE_AUTHORIZATION.md](SCOPE_AUTHORIZATION.md) — Middleware enforcement patterns and code examples
- [SCOPE_CONFIGURATION_README.md](SCOPE_CONFIGURATION_README.md) — Quick start for scope setup
- `config/scopes.js` — Scope constants and user type mappings (code)
- `services/configStore.js` — Feature flag `ff_inject_scopes` for demo mode
- [REGRESSION_PLAN.md](../REGRESSION_PLAN.md) §1 — Protected areas (transaction routes, scope enforcement)
