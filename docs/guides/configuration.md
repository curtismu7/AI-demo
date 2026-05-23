<!-- generated-by: gsd-doc-writer -->

# Configuration Reference Guide

This guide covers all configuration systems in BX Finance: environment variables, the runtime configStore, vault-based secrets, and per-service configuration.

---

## Quick Start

The standard configuration flow is:

1. **Vault (Phase 269)** — encrypted at-rest secrets (highest priority)
2. **LMDB configStore** — persistent runtime configuration via `/config` UI
3. **`.env` environment variables** — local development and deployment defaults
4. **Built-in defaults** — fallbacks for unconfigured optional settings

**For local development:**
```bash
cp banking_api_server/.env.example banking_api_server/.env
# Fill in required secrets (PingOne client IDs/secrets, session secret)
./run-demo.sh
```

**For production (Vercel):**
- Use Encrypted Environment Variables (vault is skipped on Vercel)
- `VAULT_PATH` and `VAULT_PASSWORD` are ignored when `VERCEL=1`

---

## Environment Variables: BFF (banking_api_server)

The BFF (`banking_api_server`) is the sole source of configuration for all 8 services via shared `.env` and configStore.

### PingOne Core Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_ENVIRONMENT_ID` | Yes | — | Your PingOne environment UUID (Admin → Environments → Settings) |
| `PINGONE_REGION` | No | `com` | PingOne region TLD: `com` (default), `eu`, `ca`, `com.au`, `asia`, `sg` |

### PingOne OAuth Applications

#### Admin OAuth App (BFF token exchange actor)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_ADMIN_CLIENT_ID` | Yes | — | Web Application for BFF ↔ PingOne OAuth |
| `PINGONE_ADMIN_CLIENT_SECRET` | Yes | — | Client secret (must be quoted if special chars: `~`, `-`, `.`) |
| `PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH` | No | `basic` | Auth method: `basic` (header) or `post` (form body) |
| `PINGONE_ADMIN_REDIRECT_URI` | No | Auto-derived | OAuth callback URL; auto-derived from `PINGONE_PUBLIC_APP_URL` unless overridden |

#### User OAuth App (end-user login)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_USER_CLIENT_ID` | Yes | — | Web Application for user OIDC login |
| `PINGONE_USER_CLIENT_SECRET` | Yes | — | Client secret (must be quoted if special chars) |
| `PINGONE_USER_REDIRECT_URI` | No | Auto-derived | OAuth callback URL; auto-derived from `PINGONE_PUBLIC_APP_URL` unless overridden |

#### AI Agent Credentials (RFC 8693 2-Exchange)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_AI_AGENT_CLIENT_ID` | Yes | — | AI_AGENT app for Step 1 actor token (2-exchange) |
| `PINGONE_AI_AGENT_CLIENT_SECRET` | Yes | — | Client secret (must be quoted) |

#### MCP Token Exchanger (RFC 8693 Token Exchange)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` | Yes | — | AI_AGENT app for token exchange to MCP resource |
| `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET` | Yes | — | Client secret (must be quoted) |
| `PINGONE_MCP_TOKEN_EXCHANGER_AUTH_METHOD` | No | `basic` | Auth method: `basic` (header) or `post` (form body) |

#### Worker / Management API App (PingOne API access)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_WORKER_TOKEN_CLIENT_ID` | Yes | — | WORKER app for Management API (read users, audit) |
| `PINGONE_WORKER_TOKEN_CLIENT_SECRET` | Yes | — | Client secret (must be quoted) |
| `PINGONE_WORKER_TOKEN_AUTH_METHOD` | No | `basic` | Auth method: `basic` or `post` |
| `PINGONE_MGMT_CLIENT_ID` | No | — | Alternative name for management API client ID (fallback) |
| `PINGONE_MGMT_CLIENT_SECRET` | No | — | Alternative name for management API client secret (fallback) |

### PingOne Resource Servers (Token Audiences)

Register these in PingOne as Resource Servers; they define the `aud` (audience) claim in tokens:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_AUDIENCE_ENDUSER` | No | `https://banking-api.banking-demo.com` | End-user banking API audience (1-exchange) |
| `PINGONE_RESOURCE_MCP_SERVER_URI` | No | `https://banking-mcp-server.banking-demo.com` | MCP server audience (1-exchange final) |
| `PINGONE_RESOURCE_AGENT_GATEWAY_URI` | No | `https://banking-agent-gateway.banking-demo.com` | Agent gateway (2-exchange Step 1 actor) |
| `AI_AGENT_INTERMEDIATE_AUDIENCE` | No | — | 2-exchange Step 2 output audience (Agent intermediate) |
| `PINGONE_RESOURCE_MCP_GATEWAY_URI` | No | `https://banking-mcp-gateway.banking-demo.com` | MCP gateway (2-exchange Step 3 actor) |
| `PINGONE_RESOURCE_TWO_EXCHANGE_URI` | No | `https://banking-resource-server.banking-demo.com` | 2-exchange final output audience |
| `PINGONE_RESOURCE_LANGCHAIN_AGENT_URI` | No | `https://banking-langchain-agent.banking-demo.com` | LangChain agent (Path A) audience |

### Session & Security

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_SESSION_SECRET` | Yes | — | Strong random secret for Express session signing; generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CONFIG_ENCRYPTION_KEY` | No | Falls back to `SESSION_SECRET` | Custom encryption key for configStore secrets at rest (LMDB) |

### Server Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | BFF port (must match CRA proxy target in `banking_api_ui`) |
| `NODE_ENV` | No | `development` | `development` or `production` (controls various safety features) |

### Frontend URLs

| Variable | Required | Default | Description |
|---|---|---|---|
| `REACT_APP_CLIENT_URL` | No | `https://api.ping.demo:4000` | UI origin (where users open the app) |
| `PINGONE_PUBLIC_APP_URL` | No | `https://api.ping.demo:4000` | Public origin for OAuth callbacks; auto-derives redirect URIs |
| `FRONTEND_ADMIN_URL` | No | `https://api.ping.demo:4000/admin` | Admin dashboard URL |
| `FRONTEND_DASHBOARD_URL` | No | `https://api.ping.demo:4000/dashboard` | Customer dashboard URL |

### MCP Server Connection

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_MCP_SERVER_URL` | No | `http://localhost:8000` | URL of banking_mcp_server (local dev; configStore default) |

### Feature Flags

| Variable | Required | Default | Description |
|---|---|---|---|
| `FF_TWO_EXCHANGE_DELEGATION` | No | `true` | Enable 2-exchange RFC 8693 delegation (Subject → Agent → MCP) |
| `FF_AUTHORIZE_ENABLED` | No | `false` | Enable PingAuthorize for transaction approval |
| `FF_AUTHORIZE_SIMULATED` | No | `true` | Use simulated (in-process) Authorize when enabled (development) |
| `FF_HITL_ENABLED` | No | `true` | Require human approval (HITL) for high-value agent transactions |
| `FF_HEURISTIC_ENABLED` | No | `true` | Use fast heuristic path for banking chips; when false, all queries use LLM |
| `FF_SKIP_TOKEN_EXCHANGE` | No | `false` | Skip RFC 8693 — pass user token directly to MCP (demo mode) |
| `FF_INJECT_SCOPES` | No | `false` | BFF-inject banking scopes when absent from user token (dev only) |
| `FF_INJECT_AUDIENCE` | No | `false` | BFF-add MCP resource URI to aud claim when absent (dev only) |
| `FF_OIDC_ONLY_AUTHORIZE` | No | `false` | Strip banking:* scopes in /authorize to fix multi-resource errors |

### HITL (Human-In-The-Loop) Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONFIRM_THRESHOLD_USD` | No | `250` | Dollar amount triggering manual confirmation (HITL) |
| `MFA_THRESHOLD_USD` | No | `500` | Dollar amount triggering MFA step-up |
| `STEP_UP_METHOD` | No | `email` | Step-up mechanism: `email` (OIDC re-auth) or `ciba` (back-channel) |
| `STEP_UP_AMOUNT_THRESHOLD` | No | `500` | Amount triggering step-up |
| `MAX_TRANSACTION_AMOUNT` | No | `1000` | Hard limit for all transaction types (blocks anything over this) |

### Agent & MCP Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `agent_mcp_allowed_scopes` | No | `banking:read banking:write ...` | Space-separated scopes the agent is permitted (advisory; real gating via PingAuthorize) |
| `agent_ui_mode` | No | `standard` | UI mode for agent display |
| `agent_mode` | No | — | Five-mode provider: `langchain-only`, `heuristic-only`, `full`, `offline`, or empty string |

### Token Exchange & Introspection (RFC 8693 / RFC 7662)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SCOPES` | No | `openid` | Scopes for MCP Exchanger client credentials token |
| `pingone_token_exchange_auth_method` | No | `post` | Auth method for token exchange: `post` or `basic` |
| `pingone_mcp_token_exchanger_cc_auth_method` | No | `post` | Auth method for MCP Exchanger client credentials: `post` or `basic` |
| `PINGONE_INTROSPECTION_ENDPOINT` | No | — | RFC 7662 introspection endpoint (for token validation) |
| `PINGONE_WORKER_CLIENT_ID` | No | — | Worker app for introspection (can be same as `PINGONE_WORKER_TOKEN_CLIENT_ID`) |
| `PINGONE_WORKER_CLIENT_SECRET` | No | — | Worker app secret for introspection |

### Debug & Logging

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_DEBUG_OAUTH` | No | `true` | Log OAuth flow details |
| `DEBUG_TOKENS` | No | `true` | Log token claims and exchanges (development only) |
| `DEBUG_SCOPES` | No | `true` | Log scope validation checks |
| `SKIP_TOKEN_SIGNATURE_VALIDATION` | No | `false` | Skip JWKS validation (dev only; exits with error if `true` in production) |
| `log_level` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |

### Helix LLM Provider

| Variable | Required | Default | Description |
|---|---|---|---|
| `HELIX_API_KEY` | No | — | Helix API key (can be provided via `/setup` UI or `HELIX_*.json` file) |
| `HELIX_BASE_URL` | No | `https://openam-helix.forgeblocks.com` | Helix tenant base URL |
| `HELIX_ENVIRONMENT_ID` | No | `fe213c3c-9c1d-4bdb-954a-a22879dad26d` | Helix environment ID |
| `HELIX_AGENT_ID` | No | `LLM2` | Helix agent name |
| `HELIX_PROMPT_FIELD_ID` | No | `textInputa7c39a0e8292` | Helix form field ID for prompt injection |

### Multi-IDP / Custom OAuth Endpoints

For non-PingOne IDPs, override the auto-computed endpoints:

| Variable | Required | Default | Description |
|---|---|---|---|
| `oauth_authorization_endpoint` | No | Computed from `PINGONE_ENVIRONMENT_ID` + `PINGONE_REGION` | Custom OAuth /authorize endpoint |
| `oauth_token_endpoint` | No | Computed endpoint | Custom OAuth /token endpoint |
| `oauth_userinfo_endpoint` | No | Computed endpoint | Custom OIDC /userinfo endpoint |
| `oauth_jwks_uri` | No | Computed endpoint | Custom JWKS URI for token signature validation |
| `oauth_issuer` | No | Computed issuer | Custom token issuer (must match `iss` claim) |
| `oauth_discovery_endpoint` | No | Computed endpoint | Custom OIDC discovery endpoint |
| `oauth_discovery_enabled` | No | `false` | When `true`, use discovery endpoint to resolve OAuth URLs |

### Role Mapping

| Variable | Required | Default | Description |
|---|---|---|---|
| `admin_role` | No | `admin` | Role name for admins (stored in token or mapped claim) |
| `user_role` | No | `customer` | Role name for regular users |
| `admin_username` | No | — | Comma-separated PingOne usernames that always receive admin role |
| `admin_population_id` | No | — | PingOne population ID whose members are treated as admin |
| `PINGONE_ADMIN_ROLE_CLAIM` | No | — | Token claim containing role info (e.g., custom attribute) |
| `oauth_role_claim_name` | No | `population_id` | Which claim contains role (for custom IDPs): `population_id`, `roles`, `groups`, etc. |
| `oauth_role_claim_value_admin` | No | — | Value in that claim indicating admin (for custom IDPs) |
| `oauth_role_claim_value_customer` | No | — | Value in that claim indicating customer (for custom IDPs) |
| `oauth_role_claim_is_array` | No | `false` | Whether the role claim is an array of values (for custom IDPs) |

### Authorize (Decision Engine)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINGONE_AUTHORIZE_ENABLED` | No | `false` | Enable PingAuthorize as decision engine for transactions |
| `PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID` | No | — | PingAuthorize Decision Endpoints API ID (preferred) |
| `PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID` | No | — | Second decision endpoint for MCP-first-tool delegation (optional) |
| `PINGONE_AUTHORIZE_POLICY_ID` | No | — | Legacy: PingAuthorize policy ID (used when decision endpoint ID not set) |
| `PINGONE_AUTHORIZE_WORKER_CLIENT_ID` | No | — | WORKER app for PingAuthorize API calls |
| `PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET` | No | — | Worker app secret for Authorize |

### CIBA (Client-Initiated Backchannel Authentication)

| Variable | Required | Default | Description |
|---|---|---|---|
| `CIBA_ENABLED` | No | `false` | Enable CIBA for step-up authentication |
| `CIBA_TOKEN_DELIVERY_MODE` | No | `poll` | `poll` or `push` (push requires notification endpoint) |
| `CIBA_BINDING_MESSAGE` | No | `Banking App Authentication` | Message shown in push notification |
| `CIBA_NOTIFICATION_ENDPOINT` | No | — | Webhook URL for push notifications (when using push mode) |
| `CIBA_POLL_INTERVAL_MS` | No | `5000` | Milliseconds between polling for auth result |
| `CIBA_AUTH_REQUEST_EXPIRY` | No | `300` | Seconds before CIBA request expires |

### Redis Session Store (HA / Multi-Process)

For scaling beyond single-process dev, use Redis:

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | No | — | Redis connection URL (node-redis wire protocol): `redis://localhost:6379` |
| `KV_URL` | No | — | Upstash REST KV URL (Vercel production): `https://rest-...com` |

On Vercel, `KV_URL` (Upstash) is preferred; locally, `REDIS_URL` activates TCP Redis. LMDB is the fallback for local dev.

### Vault (Phase 269)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VAULT_PATH` | No | `./secrets.vault` (repo root) | Path to encrypted vault file (omit on Vercel) |
| `VAULT_PASSWORD` | No | — | Password to unlock vault (omit on Vercel; deleted from `process.env` after unlock) |

The vault is encrypted-at-rest storage for secrets. It is **skipped on Vercel** when `VERCEL=1` (Encrypted Environment Variables are used instead).

**Quote secrets in `.env`** if they contain special characters (`~`, `-`, `.`):
```bash
VAULT_PASSWORD="your-strong-passphrase-here"
PINGONE_ADMIN_CLIENT_SECRET="x6Ee...8u0_w8F9a.qA9-j47z"
```

### PostHog Observability

| Variable | Required | Default | Description |
|---|---|---|---|
| `posthog_api_key` | No | — | PostHog API key for analytics (if using PostHog) |
| `posthog_host` | No | `https://us.i.posthog.com` | PostHog endpoint |

### Demo Credentials (Local Dev Only)

| Variable | Required | Default | Description |
|---|---|---|---|
| `demo_username` | No | — | Pre-filled username hint on marketing login page |
| `demo_password` | No | — | Pre-filled password hint on marketing login page |
| `demo_admin_username` | No | — | Admin demo username |
| `demo_admin_password` | No | — | Admin demo password |

### UI Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `UI_INDUSTRY_PRESET` | No | `bx_finance` | Industry preset: `bx_finance`, `retail`, `medical` (affects colors/logo) |
| `show_education_panel` | No | `true` | Show education/token-chain panel in UI |
| `enable_token_chain_display` | No | `true` | Display token exchange events in Token Chain panel |
| `max_token_chain_history` | No | `50` | Max token events to keep in memory |
| `active_vertical` | No | `banking` | Active industry vertical: `banking`, `retail`, `workforce` |

---

## Environment Variables: Per-Service Configuration

### MCP Gateway (banking_mcp_gateway)

The gateway typically symlinks to the BFF's `.env` (created by `run-demo.sh`). Additional gateway-specific vars:

| Variable | Required | Default | Description |
|---|---|---|---|
| `MCP_GW_CLIENT_ID` | No | — | Gateway's own OAuth client ID (for delegated exchanges) |
| `MCP_GW_CLIENT_SECRET` | No | — | Gateway client secret (must be quoted) |
| `MCP_GW_RESOURCE_URI` | No | — | Gateway's resource URI (audience for gateway tokens) |
| `MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD` | No | — | Auth method: `post` or `basic` |
| `MCP_OLB_WS_URL` | No | `ws://localhost:8080` | WebSocket URL for OLB (banking_mcp_server) |
| `MCP_INVEST_WS_URL` | No | `ws://localhost:8081` | WebSocket URL for Invest (banking_mcp_invest) |
| `GW_TOOL_CALL_TIMEOUT_MS` | No | `30000` | Per-tool execution timeout (ms) |

### MCP Server (banking_mcp_server)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Environment: `development` or `production` |
| `LOG_LEVEL` | No | `INFO` | Log level: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `MCP_SERVER_HOST` | No | `localhost` | Bind hostname for WebSocket |
| `MCP_SERVER_PORT` | No | `8080` | WebSocket port |
| `MCP_RESOURCE_URL` | No | `http://localhost:8080` | Public base URL (RFC 9728 metadata) |
| `HTTP_MCP_TRANSPORT_ENABLED` | No | `true` | Enable HTTP POST `/mcp` transport (alongside WebSocket) |
| `MCP_ALLOWED_ORIGINS` | No | — | CORS origins allowed to POST `/mcp` (comma-separated; blank = all) |
| `TOOL_CALL_TIMEOUT_MS` | No | `30000` | Max ms per tool execution (Spec: MCP 2025-11-25) |
| `BANKING_API_BASE_URL` | No | `https://api.ping.demo:3001` | BFF endpoint for banking API calls |
| `BANKING_API_TIMEOUT` | No | `30000` | BFF request timeout (ms) |
| `ENCRYPTION_KEY` | No | — | 64+ char encryption key for token storage (openssl rand -base64 48) |

### Mortgage Service (banking_mortgage_service)

| Variable | Required | Default | Description |
|---|---|---|---|
| `MORTGAGE_SERVICE_PORT` | No | `8082` | HTTP port for mortgage API |
| `MORTGAGE_SERVICE_HOST` | No | `127.0.0.1` | Bind host (loopback only) |
| `MORTGAGE_SERVICE_API_KEY` | No | `demo-mortgage-key-0000` | Shared secret for gateway authentication |

---

## ConfigStore: Runtime Configuration (LMDB / Vault)

The `configStore` singleton in `banking_api_server/services/configStore.js` manages persistent config via:

1. **Vault** (highest priority) — encrypted-at-rest secrets (Phase 269)
2. **LMDB** (`data/persistent/lmdb/`) — persistent values set via `/config` UI
3. **Environment variables** — .env fallbacks
4. **Built-in defaults** — from `FIELD_DEFS` in configStore.js

### Public ConfigStore Fields

All of the environment variables above are also available via `configStore.get(key)` and `configStore.getEffective(key)`.

**Admin UI access:** Open `/config` to edit any non-secret field at runtime. Changes are persisted to LMDB.

### Secret Fields (Encrypted at Rest)

These are encrypted when stored in LMDB, decrypted in memory:

- `PINGONE_ADMIN_CLIENT_SECRET`
- `PINGONE_USER_CLIENT_SECRET`
- `PINGONE_SESSION_SECRET`
- `PINGONE_AGENT_CLIENT_SECRET`
- `PINGONE_AI_AGENT_CLIENT_SECRET`
- `PINGONE_MANAGEMENT_CLIENT_SECRET`
- `helix_api_key`
- `demo_password`, `demo_admin_password`
- `mcp_gw_client_secret`

Encryption key: `CONFIG_ENCRYPTION_KEY` env var, or falls back to `SESSION_SECRET`.

### Configuration Precedence (getEffective)

For **bootstrap keys** (session, encryption, vault, node_env, port, environment_id, region):
1. `.env` variables (always win)
2. LMDB (if persisted)
3. Built-in defaults

For **all other keys**:
1. Vault (if unlocked)
2. LMDB (if persisted)
3. `.env` variables
4. Built-in defaults

---

## Vercel Deployment Configuration

### Environment Variable Setup

On Vercel, use **Encrypted Environment Variables** — no vault, no `.env` file:

1. Go to **Project Settings → Environment Variables**
2. Add all required `PINGONE_*` and other secrets
3. Set them for **Production** and **Preview**
4. Redeploy

### Key Differences from Local Dev

| Aspect | Local | Vercel |
|---|---|---|
| Session store | LMDB | Upstash REST KV (via `KV_URL`) |
| Vault | Optional (Phase 269) | Skipped (set `VERCEL=1` check) |
| Build | CRA dev server | Static build + serverless functions |
| OAuth origin | `https://api.ping.demo:4000` | `<!-- VERIFY: vercel-production-domain -->` (set in `/config` → Domain) |

### Required Vercel Env Vars

Minimum set for production:
```bash
PINGONE_ENVIRONMENT_ID=<uuid>
PINGONE_REGION=com
PINGONE_USER_CLIENT_ID=<uuid>
PINGONE_USER_CLIENT_SECRET=<secret>
PINGONE_ADMIN_CLIENT_ID=<uuid>
PINGONE_ADMIN_CLIENT_SECRET=<secret>
PINGONE_SESSION_SECRET=<random-hex>
PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID=<uuid>
PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET=<secret>
KV_URL=https://rest-...ctl.upstash.io  # Upstash REST endpoint
HELIX_API_KEY=<key>                       # If using Helix
```

### Domain / Public URL

After deploying to Vercel, use the provided `.vercel.app` domain (or custom domain):

1. Go to **Admin UI → `/config`**
2. Set **Domain** to the Vercel domain
3. This auto-derives OAuth callback URIs and updates PingOne Redirect URIs (via bootstrap logic)

---

## Local Development Hosts & HTTPS

### Default Host: `api.ping.demo`

The canonical local dev host is `https://api.ping.demo` (HTTPS via mkcert):

- **BFF:** `https://api.ping.demo:3001`
- **UI:** `https://api.ping.demo:4000`
- **MCP:** `ws://localhost:8080` (loopback, HTTP)

### One-Time Setup

```bash
# Add to /etc/hosts (or equivalent on Windows/macOS)
echo '127.0.0.1  api.ping.demo' | sudo tee -a /etc/hosts

# Install mkcert and generate cert
brew install mkcert
mkcert -install
mkcert api.ping.demo localhost
# → Creates api.ping.demo.pem + api.ping.demo-key.pem

# Copy to banking_api_ui (CRA proxy serves HTTPS)
mv api.ping.demo.pem banking_api_ui/
mv api.ping.demo-key.pem banking_api_ui/
```

Then `run-demo.sh` launches the UI with HTTPS on port 4000.

### Overriding the Default Host

To use a different host (e.g., `localhost`), edit during dev via `/config` UI:
1. Admin → `/config`
2. Set **Domain** to `localhost:4000`
3. Restart services

The BFF and UI auto-derive URLs from this setting. **Code never hardcodes** `localhost` or `api.ping.demo` in route handlers (REGRESSION_PLAN §1).

---

## Feature Flags & Simulated Modes

Feature flags are toggled at runtime via `/config` UI or environment variables:

### Authorization (PingAuthorize)

- **`FF_AUTHORIZE_ENABLED`** — Gate transfers/withdrawals behind PingAuthorize decision engine
- **`FF_AUTHORIZE_SIMULATED`** — When `true` + `FF_AUTHORIZE_ENABLED`, run in-process simulated Authorize (education; no external PingOne call)
  - **`SIMULATED_AUTHORIZE_CONFIRM_AMOUNT`** — Amount triggering CONFIRM decision (default: 250)
  - **`SIMULATED_AUTHORIZE_DENY_AMOUNT`** — Amount triggering DENY decision (default: 2000)
  - **`SIMULATED_AUTHORIZE_STEPUP_AMOUNT`** — Amount triggering STEPUP decision (default: 500)
- **`FF_AUTHORIZE_DEPOSITS`** — Apply authorization to deposit requests (default: false)
- **`FF_AUTHORIZE_FAIL_OPEN`** — When true + auth service unavailable, allow transaction (default: false)

### HITL (Human-In-The-Loop)

- **`FF_HITL_ENABLED`** — Require human approval for high-value agent transactions (default: true)
- **`confirm_threshold_usd`** — Amount triggering HITL (default: 250)

### Token Exchange & Delegation

- **`FF_TWO_EXCHANGE_DELEGATION`** — Enable 2-exchange (User → Agent → MCP) delegation (default: true)
- **`FF_SKIP_TOKEN_EXCHANGE`** — Skip RFC 8693 exchange; pass user token directly to MCP (demo mode; default: false)
- **`FF_INJECT_SCOPES`** — BFF-inject banking scopes when absent from token (dev only; default: false)
- **`FF_INJECT_AUDIENCE`** — BFF-add MCP resource to `aud` when absent (dev only; default: false)
- **`FF_OIDC_ONLY_AUTHORIZE`** — Strip banking:* scopes in /authorize to fix multi-resource errors (default: false)

### Agent & Heuristic

- **`FF_HEURISTIC_ENABLED`** — Use fast heuristic path for chips (when false, all queries go through LLM)
- **`agent_mode`** — Five-mode provider: `langchain-only`, `heuristic-only`, `full`, `offline`, or empty

### Token Validation

- **`enableMayActSupport`** — Validate RFC 8693 `may_act` claims from PingOne token policies (default: true)
- **`SKIP_TOKEN_SIGNATURE_VALIDATION`** — Skip JWKS validation (dev only; **exits if true in production**)
- **`skip_token_signature_validation`** — Configstore version (default: false)

---

## Troubleshooting Configuration

### Missing Credentials Error

**Symptom:** "Credentials not configured" or OAuth flow fails to start

**Fix:**
1. Check that `banking_api_server/.env` exists and is not empty
2. Verify `PINGONE_ENVIRONMENT_ID`, `PINGONE_ADMIN_CLIENT_ID`, `PINGONE_ADMIN_CLIENT_SECRET` are set
3. If using vault: check `VAULT_PASSWORD` is correct and `secrets.vault` exists
4. Restart the BFF: `./run-demo.sh stop && ./run-demo.sh`

### Token Exchange Failures

**Symptom:** Token chain panel shows "Token exchange failed" or MCP tool calls fail

**Checklist:**
1. Verify `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` / `CLIENT_SECRET` are set
2. Verify `PINGONE_RESOURCE_MCP_SERVER_URI` is registered in PingOne as a Resource Server
3. Check logs: `/tmp/bank-api-server.log` for `[McpExchangerToken]` lines
4. If using 2-exchange: verify `PINGONE_AI_AGENT_CLIENT_ID` / `CLIENT_SECRET` are set

### Session Not Persisting

**Symptom:** Session lost after page reload or multiple requests

**Fix:**
1. Verify `PINGONE_SESSION_SECRET` is set and not empty
2. Check session store:
   - Local: LMDB at `banking_api_server/data/sessions.db` (auto-created)
   - Vercel: `KV_URL` (Upstash) must be set
3. Restart the BFF

### OAuth Redirect Mismatch

**Symptom:** "Redirect URI mismatch" error from PingOne

**Fix:**
1. Check PingOne Console → Applications → [App] → Redirect URIs
2. Verify they match the values in `.env`:
   - Admin app: `{PINGONE_PUBLIC_APP_URL}/api/auth/oauth/callback`
   - User app: `{PINGONE_PUBLIC_APP_URL}/api/auth/oauth/user/callback`
3. Use `/config` UI to update the domain dynamically (which updates PingOne via bootstrap)

### ConfigStore Locked / Decrypt Failures

**Symptom:** Secrets show empty or decrypt errors in logs

**Fix:**
1. If using vault: verify `VAULT_PASSWORD` matches the original password
2. If vault corrupted: re-run `npm run vault:set` with correct master password
3. Last resort: delete `banking_api_server/data/persistent/config.db` and restart (loses persisted config, reverts to `.env`)

---

## Configuration Files Checklist

- ✅ `banking_api_server/.env` — BFF + shared config for all 8 services
- ✅ `banking_api_server/data/persistent/lmdb/` — Persisted values (LMDB)
- ✅ `banking_api_server/services/configStore.js` — Config loading logic and FIELD_DEFS
- ✅ `banking_api_server/services/vaultLoader.js` — Vault unlock at startup
- ✅ `secrets.vault` — Encrypted secrets (Phase 269; optional)
- ✅ `banking_mcp_gateway/.env` — Symlink to BFF's `.env` (created by run-demo.sh)
- ✅ `banking_mcp_server/.env.development` — MCP-specific vars (typically copied from BFF `.env`)
- ✅ `banking_mortgage_service/.env.example` — Mortgage service config template

---

## Security Best Practices

1. **Quote secrets in `.env`:**
   ```bash
   PINGONE_ADMIN_CLIENT_SECRET="x6Ee...8u0_w8F9a.qA9-j47z"  # ~ . - need quotes
   VAULT_PASSWORD="your-strong-passphrase"
   ```

2. **Never commit `.env` or secrets to git:**
   - `.env` is in `.gitignore` — safe
   - Use `secrets.vault` (Phase 269) for encrypted-at-rest storage
   - Or use platform vaults (Vercel Encrypted Variables, railway, etc.)

3. **Rotate secrets regularly:**
   - Use `/config` UI to update credentials at runtime (persisted to LMDB + vault)
   - Or regenerate in PingOne and update `.env`, then restart

4. **Token validation:**
   - Keep `SKIP_TOKEN_SIGNATURE_VALIDATION=false` in production
   - Verify `PINGONE_JWKS_URI` resolves (or auto-derived from environment_id + region)

5. **Session security:**
   - Generate a strong random `PINGONE_SESSION_SECRET` (32 bytes, hex-encoded)
   - Change it periodically to invalidate all user sessions

6. **Authorization gating:**
   - Always use `configStore.getEffective()` for security-critical defaults (not `.get()`)
   - Use `fail-safe` defaults (e.g., deny by default, allow only when explicitly enabled)

---

## Further Reading

- **ENVIRONMENT_MAPPING.md** — PingOne application and resource server names → .env variables
- **REGRESSION_PLAN.md §1** — Protected config files and critical OAuth redirect validation
- **CLAUDE.md** — Node.js runtime version pinning, vault management, setup:fresh command
- **`.env.example`** — Inline comments for each variable (definitive reference)
- **configStore.js** — FIELD_DEFS object (all known config keys + defaults)
