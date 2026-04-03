# PingOne applications & scopes — Super Banking banking demo

Operational guide: which **PingOne OAuth / worker applications** match this codebase, which **config keys** store their **client IDs**, and which **scopes** must exist on each app. Pair with **[`PINGONE_AUTHORIZE_PLAN.md`](./PINGONE_AUTHORIZE_PLAN.md)** for Authorize product APIs and BFF context.

**Source of truth in code:** `banking_api_server/config/oauth.js`, `config/oauthUser.js`, `config/scopes.js`, `services/configStore.js`, `services/oauthService.js` (token exchange), `utils/oauthAuthorizeResource.js` (authorize URL `resource` handling).

---

## 1. Application matrix

| Role in this demo | Where you store **Client ID** (Config UI `/config` or env) | Purpose |
|-------------------|-----------------------------------------------------------|---------|
| **Admin browser login** | `admin_client_id` | Staff OAuth → `/admin`. **Same** client (`oauthService`) performs **RFC 8693 token exchange** to MCP: requests use this app’s `client_id` / `client_secret` at the token endpoint. |
| **Customer browser login** | `user_client_id` | Customer OAuth + PKCE → `/dashboard` (`oauthUser` config). |
| **Management / bootstrap worker** | `pingone_client_id` | **PingOne Management API** (users, apps, probes)—**not** SPA login. Different scopes (e.g. `p1:read:user`). |
| **Agent actor** (optional) | `AGENT_OAUTH_CLIENT_ID` | **Client credentials** only; optional **`actor_token`** for subject+actor token exchange toward MCP. |

---

## 2. Scope sets the BFF requests

Exact names must exist on the corresponding PingOne application (and underlying Resource, if you use a custom API Resource).

### Customer app (`user_client_id`)

For default **`user_role`** = `customer` in config:

- **OIDC:** `openid` `profile` `email` `offline_access`
- **Banking API:** `banking:read` `banking:write` `banking:accounts:read` `banking:transactions:read` `banking:transactions:write`

Other **`user_role`** values (`readonly`, `admin`, `ai_agent`) change the banking list per `config/scopes.js` → `USER_TYPE_SCOPES`.

### Admin app (`admin_client_id`)

- **OIDC:** `openid` `profile` `email` `offline_access`
- **Banking API:** `banking:admin` `banking:read` `banking:write` `banking:accounts:read` `banking:transactions:read` `banking:transactions:write`

### MCP delegation (policy, not a second authorize scope list)

- **`agent_mcp_allowed_scopes`** (or env `AGENT_MCP_ALLOWED_SCOPES`): subset of scopes the BFF may request on the **exchanged** MCP access token. Must be consistent with what the **user** token was allowed at login (`services/agentMcpScopePolicy.js`).

### Agent worker (`AGENT_OAUTH_CLIENT_ID`)

- Default client-credentials **`scope`** in code: `openid`, overridable via **`AGENT_OAUTH_CLIENT_SCOPES`**.

---

## 3. `invalid_scope` — multiple resources

The BFF sends **OIDC scopes + custom `banking:*` scopes** in a **single** `/authorize` request. PingOne may treat those as **multiple resource servers** if `resource` (RFC 8707) is used inconsistently.

- **Implementation:** `buildPingOneAuthorizeResourceQueryParam` in `banking_api_server/utils/oauthAuthorizeResource.js` **does not** append `&resource=` on authorize when both OIDC and custom API scopes are present—avoiding PingOne’s *“May not request scopes for multiple resources”* for that shape.
- **`ENDUSER_AUDIENCE`:** Still used for **post-issuance** JWT **`aud`** validation in `middleware/auth.js` where configured; it is **not** required on the authorize URL for this mixed-scope pattern.

---

## 4. Directions for PingOne administrators

### A. Resource and custom scopes

1. In **PingOne Admin** → **Environment** → **Resources** (or **APIs** / custom resource, per your console version):
   - Define a **Resource** for the Banking API (name arbitrary).
   - Create **custom scopes** with **exact** strings:  
     `banking:admin` `banking:read` `banking:write` `banking:accounts:read` `banking:transactions:read` `banking:transactions:write` `ai_agent` (if used).

### B. Admin OIDC application (matches `admin_client_id`)

- **Grant types:** Authorization Code; **PKCE** if the template is a public / SPA-style admin entry (or match how you deploy).
- **Redirect URIs:** Must match **`admin_redirect_uri`** (e.g. `https://<host>/api/auth/oauth/callback`).
- **Scopes:** All OIDC + all **admin** banking scopes from §2.
- **Token endpoint authentication:** Must match **`admin_token_endpoint_auth_method`** (`basic` vs `post`).
- **RFC 8693 Token Exchange:** Enable on this app if the demo uses **MCP token exchange** (BFF uses `oauthService` = admin config for `performTokenExchange` / `performTokenExchangeWithActor`).

### C. Customer OIDC application (matches `user_client_id`)

- Code + PKCE as appropriate for your app type.
- **Redirect URIs:** **`user_redirect_uri`** (e.g. `https://<host>/api/auth/oauth/user/callback`).
- **Scopes:** OIDC + **customer** banking scopes from §2.
- If **`offline_access`** is required, ensure app + sign-on policy allow **refresh tokens**.

### D. Optional agent actor app (`AGENT_OAUTH_CLIENT_ID`)

- **Client type:** Worker; **grant:** Client Credentials.
- **Scopes:** Per **`AGENT_OAUTH_CLIENT_SCOPES`** (often `openid`).

### E. Management worker (`pingone_client_id`)

- Separate from SPA apps; grant only **Management API** permissions your bootstrap / admin tools need.

### F. Token exchange and `may_act`

If you use **subject + actor** exchange: PingOne must allow the **admin** exchange client (and policy) to accept the **subject** token and optional **`actor_token`**, including **`may_act`** / actor rules per your PingOne version—see product docs and **`oauthService.performTokenExchangeWithActor`**.

---

## 5. Deployment alignment

| Variable / config | Role |
|-------------------|------|
| `ENDUSER_AUDIENCE` | Optional: JWT **`aud`** check for user tokens; `https://api.pingone.com` often accepted when unset custom RS—see `middleware/auth.js` and **`REGRESSION_PLAN.md`**. |
| `MCP_RESOURCE_URI` / `mcp_resource_uri` | Audience / resource URI for **exchanged** MCP tokens (must match what PingOne allows on token exchange). |
| `MIN_USER_SCOPES_FOR_MCP_EXCHANGE` | Optional floor on distinct scopes on user token before exchange (`services/agentMcpTokenService.js`). |

---

## 6. Verification checklist

1. **Admin sign-in:** No `invalid_scope` from PingOne; access token includes expected `scope` (and acceptable `aud` for your rules).
2. **Customer sign-in:** Same.
3. **MCP tool path:** Delegated token succeeds or fails with a clear exchange error (not authorize).
4. **Config UI:** `admin_client_id` and `user_client_id` match the two OIDC apps; redirect URIs exactly match the deployed BFF (scheme, host, path, port).

---

## 7. Testing note

Jest suites mock `/login` redirects and do not call PingOne’s `/authorize`. **`invalid_scope` from PingOne** is only observed against a live tenant. Unit tests cover **`resource`** query construction (`src/__tests__/oauthAuthorizeResource.test.js`).

---

## See also

- [`PINGONE_AUTHORIZE_PLAN.md`](./PINGONE_AUTHORIZE_PLAN.md) — Authorize product, decision endpoints, BFF overview.
- [`banking_api_server/OAUTH_SCOPE_CONFIGURATION.md`](../banking_api_server/OAUTH_SCOPE_CONFIGURATION.md) — scope names and user-type mappings (may overlap env var naming with older examples).
- [`REGRESSION_PLAN.md`](../REGRESSION_PLAN.md) — audience / OAuth do-not-break notes.
