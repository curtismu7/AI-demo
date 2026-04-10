# PingOne Resources × Applications × Scopes — Complete Matrix

**📋 AUTHORITATIVE SOURCE OF TRUTH** for PingOne resource servers, OAuth applications, and scope configurations in the Super Banking demo.

**This document is the single source of truth for:**
- All PingOne resource servers and their scopes
- All OAuth applications (Admin, User, Worker, Agent)
- Scope naming standards (Phase 69.1)
- Environment variable mappings
- Verification checklists

**End-user documentation that references this source of truth:**
- [SETUP.md](./SETUP.md) — Complete setup guide for developers
- [PINGONE_APP_CONFIG.md](./PINGONE_APP_CONFIG.md) — App configuration reference

**Related technical docs:**
- [PINGONE_APP_SCOPE_MATRIX.md](./PINGONE_APP_SCOPE_MATRIX.md) — Application setup guide (grant types, redirect URIs, PingOne console directions)
- [PINGONE_NAMING_STANDARDIZATION_AUDIT.md](./PINGONE_NAMING_STANDARDIZATION_AUDIT.md) — Phase 69.1 scope naming conventions (**authoritative**)
- [ENVIRONMENT_MAPPING_AUD_AUDIT.md](./ENVIRONMENT_MAPPING_AUD_AUDIT.md) — Audience validation by component

---

## 1. PingOne Resource Servers

### Main Banking Resource Server

| Property | Value |
|----------|-------|
| **PingOne Console Path** | Applications → Resources (or **APIs** in some versions) |
| **Resource Name** | Main Banking API (or custom name, e.g., "Super Banking API") |
| **Resource URI (Audience)** | `https://resource.pingdemo.com` (example; yours may differ) |
| **Type** | Custom resource server |
| **Purpose** | OAuth token audience for end-user (customer/admin) login + RFC 8693 token exchange |
| **Token Audience** | Set on user access tokens via `resource=...` parameter at `/authorize` and `/token` |

**Scopes Defined on This Resource:**

| Scope | Description | User Types |
|-------|-------------|-----------|
|-------|-------------|-----------|
| `openid` | OIDC scope (built-in) | All |
| `profile` | User profile claims | All |
| `email` | Email claim | All |
| `offline_access` | Refresh token support | Admin, Customer, AI_Agent |
| `banking:general:read` | Read banking data | All |
| `banking:general:write` | Write banking data | Admin, Customer, AI_Agent |
| `banking:admin:full` | Admin operations | Admin only |
| `banking:admin:read` | Admin read-only | Admin only |
| `banking:admin:write` | Admin write | Admin only |
| `banking:accounts:read` | Read account details | All |
| `banking:transactions:read` | Read transaction history | All |
| `banking:transactions:write` | Create/modify transactions | Admin, Customer, AI_Agent |
| `banking:sensitive:read` | Sensitive data access | Admin only |
| `banking:sensitive:write` | Sensitive data modification | Admin only |
| **`banking:ai:agent:read`** | **Agent delegation scope** (Phase 69.1 name) | Admin, AI_Agent, Customer (2-exchange) |
| `banking:ai:agent:write` | Agent write delegation | Admin, AI_Agent |
| `banking:ai:agent:admin` | Agent admin delegation | Admin only |
| `ai_agent` | Agent identity marker | AI_Agent only |

---

### MCP Resource Server

| Property | Value |
|----------|-------|
| **PingOne Console Path** | Applications → Resources |
| **Resource Name** | MCP Server (or custom name, e.g., "Super Banking MCP Server") |
| **Resource URI (Audience)** | Via `MCP_SERVER_RESOURCE_URI` env var; example: `https://banking-mcp-server.banking-demo.com` |
| **Type** | Custom resource server |
| **Purpose** | RFC 8693 exchanged token audience (narrowed scopes for MCP server) |
| **Token Audience** | Set by BFF during RFC 8693 exchange when `MCP_SERVER_RESOURCE_URI` is configured |

**Scopes Defined:**

| Scope | Description | Used By |
|-------|-------------|---------|
| `admin:read` | Read admin/system data | Exchanged tokens for MCP |
| `admin:write` | Modify admin settings | Exchanged tokens for MCP |
| `admin:delete` | Delete resources | Exchanged tokens for MCP |
| `users:read` | Read user profiles | Exchanged tokens for MCP |
| `users:manage` | Manage user accounts | Exchanged tokens for MCP |
| `banking:general:read` | Read banking data | Exchanged tokens for MCP |
| `banking:general:write` | Write banking data | Exchanged tokens for MCP |

---

### PingOne API (Built-in)

| Property | Value |
|----------|-------|
| **PingOne Console Path** | Applications → Resources (built-in; cannot modify scopes) |
| **Resource Name** | PingOne API |
| **Resource URI** | `https://api.pingone.com` (built-in, fixed) |
| **Type** | Built-in OIDC resource |
| **Purpose** | Management API access for worker/admin tools |
| **Token Audience** | Automatic when app requests PingOne API scopes |

**Scopes Used** (from PingOne's built-in set):

| Scope | Description |
|-------|-------------|
| `p1:read:user` | Read user profiles |
| `p1:update:user` | Update user profiles |
| `p1:read:environment` | Read environment metadata |
| `p1:create:user` | Create new users |
| `p1:delete:user` | Delete users |

---

## 2. Applications × Resources × Scopes

### Admin OAuth Application

| Property | Value |
|----------|-------|
| **App Name** | Super Banking Admin App |
| **Client ID Config** | `admin_client_id` (env var or Admin UI → Config) |
| **Grant Types** | Authorization Code (+ PKCE if public client) |
| **Redirect URI Config** | `admin_redirect_uri` |
| **Example Redirect** | `https://yourdomain.com/api/auth/oauth/callback` |
| **Token Endpoint Auth** | `basic` or `post` (per `admin_token_endpoint_auth_method` config) |
| **RFC 8693 Token Exchange** | ✅ Enabled (BFF uses this app for exchange to MCP) |
| **Resource** | Main Banking Resource Server |

**Scopes Requested at `/authorize`:**

```
openid profile email offline_access banking:general:read banking:general:write banking:admin:full banking:accounts:read banking:transactions:read banking:transactions:write
```

**Scopes on App (granted in PingOne Console):**

All scopes on **Main Banking Resource Server**:

- ✅ `openid`, `profile`, `email`, `offline_access` (Main Banking Resource)
- ✅ `banking:general:read`, `banking:general:write`, `banking:admin:full`, `banking:admin:read`, `banking:admin:write` (Main Banking Resource)
- ✅ `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` (Main Banking Resource)
- ✅ RFC 8693 token exchange **enabled** on this app

**Uses Audience:** `https://resource.pingdemo.com` (or value of `ENDUSER_AUDIENCE` if set)

---

### Customer OAuth Application

| Property | Value |
|----------|-------|
| **App Name** | Super Banking User App |
| **Client ID Config** | `user_client_id` (env var or Admin UI → Config) |
| **Grant Types** | Authorization Code + PKCE (public client — no secret) |
| **Redirect URI Config** | `user_redirect_uri` |
| **Example Redirect** | `https://yourdomain.com/api/auth/oauth/user/callback` |
| **Refresh Token Support** | ✅ If `offline_access` enabled in sign-on policy |
| **RFC 8693 Token Exchange** | ✅ Can use exchanged token for 2-exchange delegation |
| **Resource** | Main Banking Resource Server |

**Scopes Requested at `/authorize`:**

```
openid profile email offline_access banking:ai:agent:read banking:general:read banking:general:write banking:accounts:read banking:transactions:read banking:transactions:write
```

**Critical:** Must include **`banking:ai:agent:read`** for agent delegation to work.

**Scopes on App (granted in PingOne):**

Based on `user_role` config:

| `user_role` | Scopes Granted (on Main Banking Resource Server) |
|---|---|
| `customer` ✅ | `banking:general:read`, `banking:general:write`, `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` |
| `readonly` | `banking:general:read`, `banking:accounts:read`, `banking:transactions:read` |
| `admin` | `banking:admin:full`, `banking:general:read`, `banking:general:write`, `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` |
| `ai_agent` | **`banking:ai:agent:read`**, `banking:general:read`, `banking:general:write`, `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` |

**Uses Audience:** `https://resource.pingdemo.com` or value of `ENDUSER_AUDIENCE` (if set)

---

### Management Worker Application

| Property | Value |
|----------|-------|
| **App Name** | Worker App (or custom, e.g., "Super Banking Worker") |
| **Client ID Config** | `pingone_client_id` (env var or Admin UI → Config) |
| **Client Type** | Worker (confidential) |
| **Grant Type** | Client Credentials (server-to-server only) |
| **Token Endpoint Auth** | Basic auth (client_id:client_secret) |
| **Resource** | PingOne API |
| **RFC 8693 Token Exchange** | ❌ Not used for exchange (management only) |

**Scopes Granted:**

- `p1:read:user`
- `p1:update:user`
- (+ any other Management API scopes required by your bootstrap/admin tools)

**Uses Audience:** `https://api.pingone.com` (fixed/built-in)

---

### Optional: Agent MCP Exchanger Application

| Property | Value |
|----------|-------|
| **App Name** | Agent MCP Exchanger (or custom) |
| **Client ID Config** | `AGENT_OAUTH_CLIENT_ID` (env var only) |
| **Client Type** | Worker (confidential) |
| **Grant Type** | Client Credentials (server-to-server only) |
| **Resources** | Main Banking Resource Server + MCP Resource Server |
| **RFC 8693 Token Exchange** | ✅ Can act as exchange client |
| **Purpose** | Optional actor token for 2→3-step exchange chains |

**Scopes Granted:**

- `banking:ai:agent:read`, `banking:general:read`, `banking:general:write`, `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` (Main Banking)
- `admin:read`, `admin:write`, `users:read`, `users:manage`, `banking:general:read`, `banking:general:write` (MCP Resource)

**Uses Audiences:**
- Main: `https://resource.pingdemo.com`
- MCP: Value of `MCP_SERVER_RESOURCE_URI` env var

---

## 3. Scope Standardization (Phase 69.1)

Per **[PINGONE_NAMING_STANDARDIZATION_AUDIT.md](./PINGONE_NAMING_STANDARDIZATION_AUDIT.md)** Phase 69.1, scopes are **standardized** as follows:

### Naming Convention

| Concept | Scope Name | Notes |
|---------|-----------|-------|
| **Agent delegation** (Phase 69.1) | `banking:ai:agent:read` | NOT `agent:invoke`, NOT `banking:agent:invoke` |
| Agent write | `banking:ai:agent:write` | Full write permission for agent |
| Agent admin | `banking:ai:agent:admin` | Admin permission for agent |
| AI Agent identity | `ai_agent` | Marker scope; used in `act` claims |

### Why Phase 69.1 Names Matter

- **Consistency** across all banking scopes: `banking:*` prefix
- **Clarity** that scopes apply to the "ai agent" subdomain: `ai:agent`
- **Direction** for future enhancements: `banking:ai:*`, `banking:compliance:*`, etc.
- **Avoids confusion** with short names like `agent:invoke`

### Legacy/Wrong Names (DO NOT USE)

| ❌ Wrong Name | ✅ Correct Name | Why Wrong |
|---|---|---|
| `agent:invoke` | `banking:ai:agent:read` | No banking prefix; unclear scope purpose |
| `banking:agent:invoke` | `banking:ai:agent:read` | Inconsistent naming (no `ai:` subdomain); "invoke" implies RPC, not OAuth |
| `ai_agent` (as delegation scope) | `banking:ai:agent:read` | `ai_agent` is an identity scope, not a permission scope |

---

## 4. Multi-Resource Scope Requests

When the BFF requests scopes from **multiple resource servers** in a single `/authorize` call:

**Pattern:** Combining OIDC + custom banking scopes

```
openid profile email offline_access banking:general:read banking:general:write banking:accounts:read banking:transactions:read
```

**PingOne Behavior:**
- OIDC scopes belong to the **built-in OIDC resource**
- Banking scopes belong to the **custom Main Banking Resource Server**
- Without explicit `resource=` parameter, PingOne may return **`invalid_scope`** error: *"May not request scopes for multiple resources"*

**Solution (Implemented in BFF):**

Per `banking_api_server/utils/oauthAuthorizeResource.js`:
- When **both** OIDC + custom banking scopes are in the request, do **NOT** append `&resource=` to the authorize URL
- PingOne accepts this mixed-scope pattern without the parameter
- For single-resource requests (all OIDC or all banking), `&resource=` is **optional** but recommended

**Important:** This is NOT a `ENDUSER_AUDIENCE` issue. See [PINGONE_APP_SCOPE_MATRIX.md](./PINGONE_APP_SCOPE_MATRIX.md) §3 for details.

---

## 5. Audience (RFC 8707) Binding

Each access token issued by PingOne carries an `aud` claim that **binds** the token to a specific resource server:

### At OAuth Token Issuance

| Situation | `aud` Value | Set By |
|-----------|-----------|--------|
| `resource=https://resource.pingdemo.com` on `/authorize` | `https://resource.pingdemo.com` | PingOne (RFC 8707) |
| No `resource=` parameter | PingOne app's default audience (varies) | PingOne |
| `resource=https://api.pingone.com` | `https://api.pingone.com` | PingOne (built-in) |

### At RFC 8693 Token Exchange

The BFF **exchanges** a user token (Main Banking audience) for a **narrowed token** (MCP audience) when `MCP_SERVER_RESOURCE_URI` is set:

| Step | Subject Token `aud` | Exchanged Token `aud` | Resource Used |
|---|---|---|---|
| 1. User login | `https://resource.pingdemo.com` | — | Main Banking |
| 2. BFF exchange request | (sent as `subject_token`) | — | — |
| 3. PingOne processes exchange | — | `https://banking-mcp-server.banking-demo.com` (or value of `MCP_SERVER_RESOURCE_URI`) | MCP Resource |
| 4. MCP server validates `aud` | — | Must match `MCP_SERVER_RESOURCE_URI` | MCP Resource |

---

## 6. Environment Variable Reference

| Variable | Scope | Value | Used By | Notes |
|----------|-------|-------|---------|-------|
| `admin_client_id` | Admin OAuth | PingOne app client ID | BFF (oauthService) | RFC 8693 token exchange client |
| `admin_redirect_uri` | Admin OAuth | `https://yourdomain.com/api/auth/oauth/callback` | BFF | Registered in PingOne app |
| `user_client_id` | Customer OAuth | PingOne app client ID | BFF (oauthUser service) | PKCE public client |
| `user_redirect_uri` | Customer OAuth | `https://yourdomain.com/api/auth/oauth/user/callback` | BFF | Registered in PingOne app |
| `pingone_client_id` | Management | PingOne worker app client ID | Admin tools, bootstrap | For `p1:*` scopes |
| `ENDUSER_AUDIENCE` | User Token | Example: `banking_jk_enduser` | BFF + Auth middleware | Optional: JWT `aud` validation |
| `PINGONE_RESOURCE_MCP_SERVER_URI` | MCP Exchange | Example: `https://banking-mcp-server.banking-demo.com` | BFF (agentMcpTokenService) | RFC 8693 exchanged token audience |
| `AGENT_OAUTH_CLIENT_ID` | Agent Actor | PingOne worker app client ID | BFF (optional) | For 2→3-step exchange chain |
| `AGENT_OAUTH_CLIENT_SCOPES` | Agent Actor | Space-separated scopes | BFF | Defaults to `openid` if unset |
| `user_role` | Customer Scopes | `customer` (default), `readonly`, `admin`, `ai_agent` | BFF (config/scopes.js) | Determines scope set per config/USER_TYPE_SCOPES |

---

## 7. Quick Verification Checklist

### In PingOne Admin Console

#### Main Banking Resource Server

- [ ] Exists with correct name (e.g., "Super Banking API")
- [ ] URI matches `PINGONE_RESOURCE_*` or `ENDUSER_AUDIENCE` (if set)
- [ ] All `banking:*` scopes defined (see §1 table above)
- [ ] `banking:ai:agent:read` ✅ present (NOT `agent:invoke`, NOT `banking:agent:invoke`)
- [ ] `ai_agent` scope defined

#### MCP Resource Server

- [ ] Exists with correct name
- [ ] URI matches `MCP_SERVER_RESOURCE_URI` env var
- [ ] All `admin:*` and `users:*` scopes defined

#### Super Banking Admin App

- [ ] Granted **all** Main Banking Resource Server scopes
- [ ] RFC 8693 token exchange **enabled**
- [ ] Redirect URI matches `admin_redirect_uri` config

#### Super Banking User App

- [ ] Granted `banking:ai:agent:read` ✅ (critical for agent delegation)
- [ ] Granted all other required Main Banking scopes per `user_role`
- [ ] Redirect URI matches `user_redirect_uri` config
- [ ] **NOT** granted `agent:invoke` ❌ or `banking:agent:invoke` ❌

#### Worker App

- [ ] Granted `p1:read:user`, `p1:update:user` on PingOne API resource

---

## 8. Troubleshooting

### "Agent scope not in token"

**Symptom:** Modal shows "Missing Required Scopes: banking:ai:agent:read" when customer tries agent action

**Check:**
1. Does Super Banking User App have `banking:ai:agent:read` in PingOne Console? (NOT `agent:invoke`)
2. If added recently, customer must **sign out and back in** to get new token
3. Use Token Chain panel on dashboard to verify `banking:ai:agent:read` is in the token

### "Invalid scope" at authorization

**Symptom:** PingOne returns `invalid_scope` error on `/authorize` request

**Check:**
1. Are you mixing OIDC + custom banking scopes?
2. Does the app have those scopes **granted** in PingOne Console?
3. Are scope names spelled exactly as defined in the Resource?

---

## 9. Related Files

- `banking_api_server/config/scopes.js` — Code-based scope definitions
- `banking_api_server/config/oauthUser.js` — Customer OAuth scope requests
- `banking_api_server/config/oauth.js` — Admin OAuth scope requests
- `services/agentMcpScopePolicy.js` — Scope narrowing policy for MCP exchange
- `banking_api_server/utils/oauthAuthorizeResource.js` — `resource=` parameter handling
- `banking_api_server/middleware/auth.js` — Scope validation + audience checking
