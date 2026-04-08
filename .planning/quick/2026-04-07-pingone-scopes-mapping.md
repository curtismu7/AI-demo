# PingOne Scopes Mapping — Complete Reference

**Date:** 2026-04-07  
**Purpose:** Clear, authoritative mapping of what scopes are on what apps/resource servers in PingOne.

---

## Quick Reference — Scope-to-App/Resource Matrix

| Scope | Type | Resource Server(s) | App(s) Using It | Purpose |
|-------|------|-------------------|-----------------|---------|
| `openid` | OIDC | All | Admin App, User App | OpenID Connect core |
| `profile` | OIDC | All | Admin App, User App | User profile attributes |
| `email` | OIDC | All | Admin App, User App | User email |
| `offline_access` | OIDC | All | Admin App, User App | Refresh token grant |
| `banking:read` | Business | Main Banking Resource Server | Admin App, User App | Read accounts/transactions |
| `banking:write` | Business | Main Banking Resource Server | Admin App, User App | Write transactions |
| `banking:transfer` | Business | Main Banking Resource Server | Admin App, User App | Execute transfers |
| `banking:admin` | Business | Main Banking Resource Server | Admin App only | Admin operations |
| `banking:agent:invoke` | Delegation | Main Banking Resource Server | Admin App only | AI Agent invocation |
| `p1:read:user` | PingOne API | PingOne API Resource Server | Admin App, Worker App | Read PingOne users |
| `p1:update:user` | PingOne API | PingOne API Resource Server | Admin App, Worker App | Update PingOne users |
| `admin:read` | Business | MCP Resource Server | Worker App | MCP admin read |
| `admin:write` | Business | MCP Resource Server | Worker App | MCP admin write |
| `admin:delete` | Business | MCP Resource Server | Worker App | MCP admin delete |
| `users:read` | Business | MCP Resource Server | Worker App | User read access |
| `users:manage` | Business | MCP Resource Server | Worker App | User management |

---

## PingOne Applications — What Scopes They Request

### 1. **Super Banking Admin App** (OIDC WEB_APP)

**Purpose:** OAuth login for admin users  
**Type:** Confidential Web Application  
**Grant Types:** AUTHORIZATION_CODE (with PKCE S256 required)  

**Requested Scopes:**
```
openid profile email offline_access
banking:read banking:write banking:transfer banking:admin
banking:agent:invoke
p1:read:user p1:update:user
```

**Resource Grants on Admin App:**
- ✅ Main Banking Resource Server — `openid`, `profile`, `email`, `offline_access`, `banking:read`, `banking:write`, `banking:transfer`, `banking:admin`, `banking:agent:invoke`
- ✅ PingOne API Resource Server — `p1:read:user`, `p1:update:user`

**Token Endpoint Auth:** `CLIENT_SECRET_BASIC`  
**Redirect URIs:** See [PINGONE_APP_CONFIG.md](../docs/PINGONE_APP_CONFIG.md#1-admin-oidc-app)

---

### 2. **Super Banking User App** (OIDC WEB_APP)

**Purpose:** OAuth login for end-users (banking customers)  
**Type:** Confidential Web Application  
**Grant Types:** AUTHORIZATION_CODE (with PKCE S256 required)  

**Requested Scopes:**
```
openid profile email offline_access
banking:read banking:write banking:transfer
```

**Resource Grants on User App:**
- ✅ Main Banking Resource Server — `openid`, `profile`, `email`, `offline_access`, `banking:read`, `banking:write`, `banking:transfer`
- ❌ PingOne API — **NOT included** (users don't manage PingOne)
- ❌ `banking:agent:invoke` — **NOT included** (users use agent through 2-exchange delegation)

**Token Endpoint Auth:** `CLIENT_SECRET_BASIC`  
**Redirect URIs:** See [PINGONE_APP_CONFIG.md](../docs/PINGONE_APP_CONFIG.md#2-user-oidc-app)

---

### 3. **Super Banking MCP Token Exchanger** (Worker / Machine App)

**Purpose:** Server-to-server token exchange for MCP server access + PingOne API calls  
**Type:** WORKER (Client Credentials)  
**Grant Types:** CLIENT_CREDENTIALS, TOKEN_EXCHANGE

**Requested Scopes:**
```
admin:read admin:write admin:delete
users:read users:manage
p1:read:user p1:update:user
banking:read banking:write
```

**Resource Grants on MCP Token Exchanger:**
- ✅ MCP Resource Server — `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`, `banking:read`, `banking:write`
- ✅ PingOne API Resource Server — `p1:read:user`, `p1:update:user`

**Role:** Acts as **Exchanger** for RFC 8693 token exchange with `act` claim  
**Token Endpoint Auth:** `CLIENT_SECRET_BASIC`

---

### 4. **Super Banking AI Agent App** (Optional — 2-Exchange Only)

**Purpose:** OAuth actor token for RFC 8693 Exchange #1 (AI Agent delegation)  
**Type:** WORKER or NATIVE_APP (Client Credentials)  
**Grant Types:** CLIENT_CREDENTIALS, TOKEN_EXCHANGE

**Requested Scopes:**
```
banking:agent:invoke
```

**Resource Grants on AI Agent App:**
- ✅ Super Banking AI Agent Resource Server — `banking:agent:invoke`

**Role:** Acts as **Subject Token Exchanger** in 2-exchange delegation chain  
**Only needed if:** `ff_two_exchange_delegation=true` and `ENDUSER_AUDIENCE` is set to AI Agent resource

---

## Resource Servers — What Scopes They Define

### 1. **Main Banking Resource Server**

**Audience URI:** `https://resource.pingdemo.com` (or custom via `ENDUSER_AUDIENCE`)

**Defined Scopes:**
| Scope | Description |
|-------|-------------|
| `banking:read` | Read-only access to accounts and transactions |
| `banking:write` | Write access to banking operations |
| `banking:transfer` | Execute transfer operations |
| `banking:admin` | Admin-level banking operations |
| `banking:agent:invoke` | Permission to invoke AI agent on behalf of user |
| `banking:read:sensitive` | Access to sensitive PII (SSN, routing numbers) |

**Used By Applications:**
- ✅ Super Banking Admin App — ALL scopes
- ✅ Super Banking User App — `banking:read`, `banking:write`, `banking:transfer`
- ✅ Super Banking AI Agent App — `banking:agent:invoke`

**Key Flows:**
- User login (Admin or User App) → receives token with their assigned scopes
- Delegation flow (2-exchange) → User → AI Agent → MCP with `act` claim

---

### 2. **MCP Resource Server** (Super Banking MCP Gateway)

**Audience URI:** `https://mcp-server.pingdemo.com` (or custom via `MCP_RESOURCE_URI`)

**Defined Scopes:**
| Scope | Description |
|-------|-------------|
| `admin:read` | Read admin resources |
| `admin:write` | Write admin resources |
| `admin:delete` | Delete admin resources |
| `users:read` | Read user records |
| `users:manage` | Manage user records (create, update) |
| `banking:read` | Read banking operations (result token) |
| `banking:write` | Write banking operations (result token) |

**Used By Applications:**
- ✅ MCP Token Exchanger (Worker) — all scopes
- ⚠️ **Important:** Do NOT include `banking:agent:invoke` on this resource server — it lives only on Main Banking Resource Server
  
**Key Flows:**
- Exchange #2 (RFC 8693) → Subject Token (from AI Agent) → MCP token with narrowed scopes (`banking:read`, `banking:write`)
- MCP tools validate token audience matches `https://mcp-server.pingdemo.com`

---

### 3. **PingOne API Resource Server** (Built-in)

**Audience URI:** `https://api.pingone.com` (or default: `https://api.pingone.com`)

**Defined Scopes:**
| Scope | Description |
|-------|-------------|
| `p1:read:user` | Read PingOne user attributes |
| `p1:update:user` | Update PingOne user attributes (including `mayAct`) |
| `p1:read:environment` | Read environment configuration |
| *(others)* | Additional PingOne API scopes |

**Used By Applications:**
- ✅ Super Banking Admin App — `p1:read:user`, `p1:update:user`
- ✅ Super Banking MCP Token Exchanger — `p1:read:user`, `p1:update:user`

**Key Flows:**
- Worker app calls `POST /api/users/{id}/attributes/mayAct` to set delegation permissions
- Setup wizard uses `p1:update:user` to configure test users

---

### 4. **Super Banking AI Agent Resource Server** (2-Exchange Only)

**Audience URI:** `https://ai-agent.pingdemo.com` (or custom)

**Defined Scopes:**
| Scope | Description |
|-------|-------------|
| `banking:agent:invoke` | AI Agent can invoke on behalf of user |

**Used By Applications:**
- ✅ Super Banking User App (Exchange #1 subject token) — `banking:agent:invoke`
- ✅ Super Banking AI Agent App (Explorer/Actor) — receives `banking:agent:invoke`

**Key Flows:**
- User logs in with `banking:agent:invoke` scope when `ENDUSER_AUDIENCE` = `https://ai-agent.pingdemo.com`
- Exchange #1 uses this token as subject, exchanges to MCP Gateway audience

---

## Request Scopes — What Gets Requested During OAuth

### When User Logs In (Admin App)

**Authorization Request Parameters:**
```
GET /auth/oauth/authorize
  ?client_id={ADMIN_CLIENT_ID}
  &response_type=code
  &scope=openid%20profile%20email%20offline_access%20banking:read%20banking:write%20banking:transfer%20banking:admin%20banking:agent:invoke%20p1:read:user%20p1:update:user
  &redirect_uri=https://example.com/api/auth/oauth/callback
  &state={random}
  &code_challenge={pkce_hash}
  &code_challenge_method=S256
```

**PingOne Returns in Access Token:**
- ✅ `openid`, `profile`, `email`, `offline_access` (OIDC profiles always included)
- ✅ `banking:read`, `banking:write`, `banking:transfer`, `banking:admin`
- ✅ `banking:agent:invoke`
- ✅ `p1:read:user`, `p1:update:user`
- ✅ `may_act` claim (from User attribute, if set)

---

### When User Logs In (User App)

**Authorization Request Parameters:**
```
GET /auth/oauth/user/authorize
  ?client_id={USER_CLIENT_ID}
  &response_type=code
  &scope=openid%20profile%20email%20offline_access%20banking:read%20banking:write%20banking:transfer
  &redirect_uri=https://example.com/api/auth/oauth/user/callback
  &state={random}
  &code_challenge={pkce_hash}
  &code_challenge_method=S256
```

**PingOne Returns in Access Token:**
- ✅ `openid`, `profile`, `email`, `offline_access`
- ✅ `banking:read`, `banking:write`, `banking:transfer`
- ❌ `banking:agent:invoke` — NOT here (users don't request it)
- ❌ `banking:admin` — NOT here (users don't have admin scope)
- ✅ `may_act` claim (if user is an agent)

---

### When Using ENDUSER_AUDIENCE (MCP/Agent Flow)

If `ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com`:

**Authorization Request Parameters:**
```
GET /auth/oauth/user/authorize
  ?client_id={USER_CLIENT_ID}
  &response_type=code
  &scope=profile%20email%20offline_access%20banking:agent:invoke
  &resource=https://ai-agent.pingdemo.com
  &redirect_uri=https://example.com/api/auth/oauth/user/callback
  &state={random}
  &code_challenge={pkce_hash}
  &code_challenge_method=S256
```

⚠️ **Note:** `openid` is **omitted** (PingOne rejects "multiple resources" when both OIDC and custom resource are requested)

**PingOne Returns in Access Token:**
- ✅ `profile`, `email`, `offline_access`
- ✅ `banking:agent:invoke`
- ❌ `openid` — omitted (custom resource prevents OIDC profile)
- ✅ `aud` = `https://ai-agent.pingdemo.com` (RFC 8707 audience binding)
- ✅ `may_act` claim (if set on user)

---

## Common Mistakes — And How to Avoid Them

| Mistake | Problem | Fix |
|---------|---------|-----|
| Adding `banking:agent:invoke` to **MCP Resource Server** | Token exchange fails with `invalid_scope` — scope not defined on output resource | Add `banking:agent:invoke` **only** on Main Banking Resource Server |
| Not setting `may_act` attribute mapping on app | Token exchange 401 — no `may_act` claim in subject token | Add `may_act` mapping on **both Admin and User OIDC apps** |
| Using `openid` scope when `ENDUSER_AUDIENCE` is set | Authorization fails with `invalid_scope: May not request scopes for multiple resources` | Omit `openid` when targeting a custom resource server; use: `profile email offline_access banking:agent:invoke` |
| Admin app missing `banking:agent:invoke` | BFF can't request token exchange in 1-exchange flow | Add `banking:agent:invoke` to Admin app Resource Grants |
| User app has `banking:agent:invoke` | Unnecessary (users don't use agent directly); confuses scope model | User app should have ONLY: `banking:read`, `banking:write`, `banking:transfer` + OIDC profiles |
| MCP app missing `TOKEN_EXCHANGE` grant type | Exchange #1 or #2 fails with `grant_type not supported` | Add **Token Exchange** grant type to MCP Token Exchanger app |

---

## Environment Variables — Scope Bindings

| Env Var | Values | Affects | Example |
|---------|--------|---------|---------|
| `ENDUSER_AUDIENCE` | Resource server URI or empty | Which resource scopes are requested on User login | `https://ai-agent.pingdemo.com` → requests `banking:agent:invoke` only |
| `MCP_RESOURCE_URI` | MCP resource server URI | Token exchange output audience | `https://mcp-server.pingdemo.com` → exchanges to this aud |
| `MCP_TOKEN_EXCHANGE_SCOPES` | Space-separated scopes | What scopes to request in exchange | `banking:read banking:write` → exchange narrows to these |
| `ALLOW_AGENT_INVOKE_EXCHANGE` | `true` / `false` | Bypass pre-check for `banking:agent:invoke` | `true` → allows users with `agent:invoke` to attempt exchange immediately |

---

## Summary: The Correct Scope Configuration

**Minimum (1-Exchange Flow):**
1. ✅ **Main Banking Resource Server** — define `banking:read`, `banking:write`, `banking:agent:invoke`
2. ✅ **Admin App** — grant all Main Banking scopes + PingOne API scopes
3. ✅ **User App** — grant `banking:read`, `banking:write`, `banking:transfer` + OIDC profiles
4. ✅ **MCP App** — grant `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`

**Full (2-Exchange Flow):**
1. All above +
2. ✅ **AI Agent Resource Server** — define `banking:agent:invoke`
3. ✅ **AI Agent App** — grant `banking:agent:invoke` from AI Agent resource
4. ✅ **MCP App** — **add** `TOKEN_EXCHANGE` grant type

**Environment Setup:**
- 1-exchange: `ENDUSER_AUDIENCE` empty (default)
- 2-exchange: `ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com`
- Both: Set `MCP_RESOURCE_URI` to MCP server audience

---

**Status:** ✅ Complete  
**Next:** Use this mapping to verify your PingOne configuration in the console or setup wizard.
