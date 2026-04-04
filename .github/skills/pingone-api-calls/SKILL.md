---
name: pingone-api-calls
description: 'Patterns for calling PingOne Management API from banking_api_server. USE FOR: read user, update user attributes, p1:read:user, p1:update:user, list users, create user, delete user, MFA device enrollment, enable/disable MFA, PingOne Management API /v1/environments, /users endpoint, worker app token calls, admin PingOne REST API, new service file, new route calling PingOne, error handling for PingOne responses. DO NOT USE FOR: OAuth login, token exchange, or session flows (use oauth-pingone); MCP server tools (use mcp-server); Vercel config (use vercel-banking).'
argument-hint: 'Describe the PingOne API call you need to make (e.g. read user, update MFA)'
---

# Calling the Banking API Server (PingOne Proxy Layer)

## Architecture Overview

```
Browser / UI
    │  (cookies only, no tokens)
    ▼
banking_api_server  ← Backend-for-Frontend (BFF): holds all tokens server-side
    │
    ├─ /api/auth/*        → PingOne AS  (auth.pingone.{region}/{envId}/as/*)
    ├─ /api/auth/ciba/*   → PingOne CIBA (bc-authorize, token polling)
    └─ Internal services  → PingOne Management API (api.pingone.{region}/v1/*)
```

The UI **never** calls PingOne directly — it always calls `banking_api_server` which proxies to PingOne. Tokens are stored in server-side sessions (`req.session.oauthTokens`), never in the response body.

---

## Config Access (Server-Side)

**Never hardcode URLs or credentials.** All PingOne config comes from `configStore.getEffective()`:

```javascript
const configStore = require('../services/configStore');
const oauthConfig = require('../config/oauth'); // lazy getters backed by configStore

// Auth Server endpoints (lazy, config-driven)
oauthConfig.tokenEndpoint        // https://auth.pingone.{region}/{envId}/as/token
oauthConfig.authorizationEndpoint
oauthConfig.cibaEndpoint          // .../bc-authorize
oauthConfig.jwksEndpoint
oauthConfig.userInfoEndpoint

// Client credentials
oauthConfig.clientId
oauthConfig.clientSecret

// Raw config values
const envId  = configStore.getEffective('pingone_environment_id');
const region = configStore.getEffective('pingone_region') || 'com';

const authBase = `https://auth.pingone.${region}/${envId}/as`;
const apiBase  = `https://api.pingone.${region}/v1`;
```

---

## Pattern: Management API (worker client_credentials)

Use for provisioning/management calls (user CRUD, app registration, etc.):

```javascript
'use strict';
const axios = require('axios');
const configStore = require('../services/configStore');

async function getManagementToken() {
  const envId        = configStore.getEffective('pingone_environment_id');
  const region       = configStore.getEffective('pingone_region') || 'com';
  const clientId     = configStore.getEffective('pingone_client_id');     // worker app
  const clientSecret = configStore.getEffective('pingone_client_secret');

  if (!envId || !clientId || !clientSecret) {
    throw new Error('PingOne admin credentials not configured');
  }

  const tokenUrl = `https://auth.pingone.${region}/${envId}/as/token`;
  const response = await axios.post(
    tokenUrl,
    'grant_type=client_credentials',
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );
  return response.data.access_token;
}

async function callPingOneManagementApi(path) {
  const envId  = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';
  const token  = await getManagementToken();

  const url = `https://api.pingone.${region}/v1/environments/${envId}${path}`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
  return data;
}
```

---

## Pattern: Auth Server Token Operations

Use `oauthService` for auth-server calls (token exchange, refresh, revoke):

```javascript
const oauthService = require('../services/oauthService');

// Token exchange (RFC 8693) — T1 → T2 scoped for MCP
const mcpToken = await oauthService.performTokenExchange(
  req.session.oauthTokens.access_token,
  process.env.MCP_SERVER_AUDIENCE,
  ['banking:read', 'banking:write']
);

// Refresh
const refreshed = await oauthService.refreshAccessToken(
  req.session.oauthTokens.refresh_token
);

// Revoke (RFC 7009)
await oauthService.revokeToken(req.session.oauthTokens.refresh_token, 'refresh_token');
```

---

## Pattern: CIBA (Backchannel Auth)

```javascript
const cibaService = require('../services/cibaService');

const { auth_req_id, expires_in, interval } = await cibaService.initiateBackchannelAuth(
  loginHint,        // user's email or sub
  bindingMessage,   // short string shown in push/email
  'openid profile email banking:write',
  acrValues         // e.g. 'Multi_factor' for step-up
);

// Poll (returns tokens when approved)
const tokens = await cibaService.pollForTokens(auth_req_id);
// throws { error: 'authorization_pending' } while waiting
// throws { error: 'access_denied' } on denial
```

---

## Calling the API Server from the UI

The React UI calls `/api/*` routes — never PingOne directly. Use service layer, never `fetch` in components.

```javascript
// src/services/authService.js
export const getSession = () =>
  fetch('/api/auth/session', { credentials: 'include' }).then(r => r.ok ? r.json() : null);

export const loginAdmin = () => { window.location.href = '/api/auth/oauth/login'; };
export const loginUser  = () => { window.location.href = '/api/auth/oauthuser/login'; };
export const logout     = () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });

// CIBA from UI
export async function initiateCiba(bindingMessage, scope, acrValues) {
  const resp = await fetch('/api/auth/ciba/initiate', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ binding_message: bindingMessage, scope, acr_values: acrValues }),
  });
  if (!resp.ok) throw new Error(`CIBA initiate failed: ${resp.status}`);
  return resp.json(); // { auth_req_id, expires_in, interval }
}

export async function pollCiba(authReqId) {
  const resp = await fetch(`/api/auth/ciba/poll/${authReqId}`, { credentials: 'include' });
  if (!resp.ok) throw new Error(`Poll failed: ${resp.status}`);
  return resp.json(); // { status: 'pending' | 'approved' | 'denied' }
}
```

---

## Available Server API Routes

| Route | Auth Required | Description |
|-------|---------------|-------------|
| `GET  /api/auth/oauth/login` | No | Start admin login (PKCE) |
| `GET  /api/auth/oauthuser/login` | No | Start user login (PKCE) |
| `GET  /api/auth/oauth/callback` | No | Admin OAuth callback |
| `GET  /api/auth/oauthuser/callback` | No | User OAuth callback |
| `GET  /api/auth/session` | No | Returns current session user info |
| `POST /api/auth/logout` | No | Revoke tokens + destroy session |
| `POST /api/auth/ciba/initiate` | Yes | Start CIBA backchannel flow |
| `GET  /api/auth/ciba/poll/:authReqId` | Yes | Poll CIBA approval status |
| `GET  /api/auth/ciba/status` | No | Check if CIBA is enabled |
| `GET  /api/auth/oauth/redirect-info` | No | Debug: shows registered redirect URIs |
| `GET  /api/accounts` | Yes | List user's bank accounts |
| `GET  /api/transactions` | Yes | List transactions |
| `POST /api/transactions/transfer` | Yes | Initiate transfer |
| `GET  /api/admin/users` | Admin | PingOne user directory (via Management API) |
| `POST /api/admin/client-registration` | Admin | Create PingOne app (CIMD flow) |
| `GET  /api/config` | Admin | Read app config |
| `POST /api/config` | Admin | Update app config |

---

## Error Handling for PingOne Calls

Always surface PingOne's error fields — don't swallow them:

```javascript
try {
  const response = await axios.post(tokenUrl, body, { headers, timeout: 10000 });
  return response.data;
} catch (err) {
  const pingoneError = err.response?.data?.error;
  const pingoneDesc  = err.response?.data?.error_description;
  const status       = err.response?.status;

  console.error('[MyService] PingOne error:', { pingoneError, pingoneDesc, status });

  const msg = pingoneError
    ? `PingOne error: ${pingoneError}${pingoneDesc ? ' — ' + pingoneDesc : ''}`
    : err.message;

  const wrapped = new Error(msg);
  wrapped.pingoneError = pingoneError;
  wrapped.status = status;
  throw wrapped;
}
```

In route handlers, propagate status codes:

```javascript
router.post('/my-route', authenticateToken, async (req, res) => {
  try {
    const result = await myPingOneService.doSomething(req.session.oauthTokens);
    res.json(result);
  } catch (err) {
    const status = err.status === 401 ? 401 : err.status === 403 ? 403 : 502;
    res.status(status).json({
      error: err.pingoneError || 'upstream_error',
      message: err.message,
    });
  }
});
```

---

## PingOne API Reference

> **Canonical docs:** `https://developer.pingidentity.com/pingone-api/`
> MFA-specific: `https://developer.pingidentity.com/pingone-api/mfa/`
> Auth APIs: `https://developer.pingidentity.com/pingone-api/auth/`
> Platform SSO APIs: `https://developer.pingidentity.com/pingone-api/platform/`

### Auth Server (AS) — `https://auth.pingone.{region}/{envId}/as/`

| Endpoint | Use |
|----------|-----|
| `/authorize` | Start PKCE flow |
| `/token` | Exchange code, refresh, token-exchange, client_credentials, CIBA poll |
| `/revoke` | RFC 7009 revocation |
| `/bc-authorize` | CIBA initiate |
| `/userinfo` | OIDC user claims |
| `/jwks` | Public keys for JWT validation |
| `/.well-known/openid-configuration` | Discovery |

### Management API — `https://api.pingone.{region}/v1/environments/{envId}/`

| Endpoint | Use |
|----------|-----|
| `/applications` | List / create OAuth apps |
| `/applications/{id}/secret` | Fetch client secret |
| `/users` | Create / list directory users |
| `/users/{id}` | Read / update user |

### Regions

| Config value | Auth base | API base |
|-------------|-----------|----------|
| `com` (default) | `auth.pingone.com` | `api.pingone.com` |
| `eu` | `auth.pingone.eu` | `api.pingone.eu` |
| `ca` | `auth.pingone.ca` | `api.pingone.ca` |
| `asia` | `auth.pingone.asia` | `api.pingone.asia` |

---

## Security Rules

- ✅ All PingOne calls go through `banking_api_server` — never from the browser
- ✅ Client secrets read from `configStore.getEffective()` — not `process.env` in route files
- ✅ Management API tokens are short-lived, obtained per-request via client_credentials
- ✅ `timeout: 10000` on all `axios` calls
- ✅ Check `configStore.isConfigured()` before PingOne calls; return graceful error if not set up
- ❌ Never log `access_token`, `client_secret`, or `code_verifier` values
- ❌ Never pass raw tokens to `res.json()` — store in `req.session.oauthTokens`
