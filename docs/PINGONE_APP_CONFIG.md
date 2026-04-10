# PingOne Application Configuration Reference

> Required PingOne app settings for the Super Banking demo. Use the [Setup Wizard](/config → PingOne Setup tab) to auto-provision, or follow this guide for manual setup.

---

## 1. Admin OIDC App ("Super Banking Admin App")

| Setting | Value |
|---------|-------|
| **Type** | `WEB_APP` |
| **Grant Types** | `AUTHORIZATION_CODE` |
| **Token Endpoint Auth** | `CLIENT_SECRET_BASIC` |
| **PKCE Enforcement** | `S256_REQUIRED` |
| **Response Type** | `CODE` |

### Redirect URIs

```
{PUBLIC_APP_URL}/api/auth/oauth/callback
http://localhost:3000/api/auth/oauth/callback
http://localhost:3001/api/auth/oauth/callback
http://localhost:4000/api/auth/oauth/callback
```

### Post-Logout Redirect URIs

```
{PUBLIC_APP_URL}
{PUBLIC_APP_URL}/login
http://localhost:3000
http://localhost:3001
```

### Scopes (via Resource Grants)

- `openid`, `profile`, `email`, `offline_access`
- `banking:general:read`, `banking:general:write`, `banking:admin:full`, `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write`
- `banking:ai:agent:read` (Phase 69.1 standardization)
- `p1:read:user`, `p1:update:user`

**Note:** Use `banking:ai:agent:read` (NOT `banking:agent:invoke`) per Phase 69.1 scope naming standardization. See [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](./PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) for authoritative scope definitions.

### Token Exchange

Enable **Token Exchange** grant type if using 1-exchange or 2-exchange delegation.

### Attribute Mappings

| PingOne Attribute | Expression |
|-------------------|------------|
| `sub` | `${user.id}` |
| `may_act` | `(#root.user.mayAct != null ? #root.user.mayAct : null)` |

The `may_act` mapping is **critical** for token exchange delegation. Without it, the subject token will not contain the `may_act` claim and token exchange will fail with `invalid_request`.

---

## 2. User OIDC App ("Super Banking User App")

| Setting | Value |
|---------|-------|
| **Type** | `WEB_APP` |
| **Grant Types** | `AUTHORIZATION_CODE` |
| **Token Endpoint Auth** | `CLIENT_SECRET_BASIC` |
| **PKCE Enforcement** | `S256_REQUIRED` |
| **Response Type** | `CODE` |

### Redirect URIs

```
{PUBLIC_APP_URL}/api/auth/oauth/user/callback
http://localhost:3000/api/auth/oauth/user/callback
http://localhost:3001/api/auth/oauth/user/callback
http://localhost:4000/api/auth/oauth/user/callback
```

### Post-Logout Redirect URIs

Same as Admin app.

### Scopes

- `openid`, `profile`, `email`, `offline_access`
- `banking:ai:agent:read` (critical for agent delegation)
- `banking:general:read`, `banking:general:write`, `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write`

**Note:** Must include `banking:ai:agent:read` for agent delegation to work. See [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](./PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) for authoritative scope definitions.

### Attribute Mappings

Same as Admin app — include the `may_act` mapping.

---

## 3. Worker App (Management API)

| Setting | Value |
|---------|-------|
| **Type** | `WORKER` |
| **Grant Types** | `CLIENT_CREDENTIALS` |
| **Token Endpoint Auth** | `CLIENT_SECRET_BASIC` |

### Required Scopes

The worker app needs Management API scopes to provision users and read app configs:

- `p1:read:user`, `p1:update:user`, `p1:create:user`, `p1:delete:user`
- `p1:read:user:password`, `p1:update:user:password`
- `p1:read:application`, `p1:update:application`
- `p1:read:resource`, `p1:create:resource`

### Environment Variables

```
PINGONE_MGMT_CLIENT_ID=<worker-app-client-id>
PINGONE_MGMT_CLIENT_SECRET=<worker-app-client-secret>
```

Falls back to `PINGONE_CLIENT_ID` / `PINGONE_CLIENT_SECRET` if management-specific vars are not set.

---

## 4. Resource Server ("Super Banking API")

| Setting | Value |
|---------|-------|
| **Audience** | `banking_api_enduser` |
| **Type** | `CUSTOM` |

### Scopes

| Scope | Description |
|-------|-------------|
| `banking:general:read` | Read banking data |
| `banking:general:write` | Write banking data |
| `banking:admin:full` | Admin operations |
| `banking:accounts:read` | Read account details |
| `banking:transactions:read` | Read transaction history |
| `banking:transactions:write` | Create/modify transactions |
| `banking:ai:agent:read` | Agent delegation scope |
| `banking:ai:agent:write` | Agent write delegation |
| `banking:ai:agent:admin` | Agent admin delegation |

**Note:** Use Phase 69.1 scope naming standardization. See [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](./PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) for authoritative scope definitions.

---

## 5. AI Agent App (Optional — for 2-Exchange)

| Setting | Value |
|---------|-------|
| **Type** | `WORKER` |
| **Grant Types** | `CLIENT_CREDENTIALS` |

Used only for the 2-exchange delegation path where the AI Agent obtains its own token first.

```
AGENT_OAUTH_CLIENT_ID=<agent-app-client-id>
AGENT_OAUTH_CLIENT_SECRET=<agent-app-client-secret>
```

---

## 6. mayAct Custom Attribute

The `mayAct` attribute is a **custom JSON attribute** on PingOne user profiles. It controls which OAuth client is permitted to act on behalf of the user during RFC 8693 token exchange.

### Setting mayAct

**Via Demo UI:** Navigate to `/demo-data` → click "Enable may_act"

**Via API:**
```bash
curl -X PATCH http://localhost:3001/api/demo/may-act \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"enabled": true, "mode": "1exchange"}'
```

### mayAct Values

| Mode | Value | Used For |
|------|-------|----------|
| 1-exchange | `{"client_id": "<admin_client_id>"}` | BFF exchanges user token directly |
| 2-exchange | `{"client_id": "<agent_client_id>"}` | Agent exchanges first, then BFF |
| Disabled | `null` | No delegation permitted |

### Diagnosing mayAct Issues

```bash
curl http://localhost:3001/api/demo/may-act/diagnose \
  -H "Cookie: <session>"
```

Returns a structured report checking:
1. **User attribute** — is `mayAct` set on the PingOne user record?
2. **App mapping** — does the OIDC app have a `may_act` attribute mapping?

Both must pass for `may_act` to appear in the subject token.

---

## 7. Automated Configuration

### Fix Logout URLs

```bash
POST /api/admin/app-config/fix-logout-urls
Body: { "publicAppUrl": "https://your-domain.vercel.app" }
```

Automatically adds correct `postLogoutRedirectUris` and `signOffUrl` to both Admin and User apps.

### Audit App Config

```bash
GET /api/admin/app-config/audit/all
```

Checks both apps for common issues: missing logout URIs, PKCE not enforced, missing grant types, etc.

### Setup Wizard

Navigate to `/config` → **PingOne Setup** tab to auto-provision all apps, resource server, scopes, and demo users from a single form.
