---
name: oauth-pingone
description: 'Authoritative PingOne OAuth 2.0 / OIDC guide for ALL grant types. USE FOR: authentication, login, logout, Authorization Code + PKCE, Client Credentials, CIBA backchannel auth, Token Exchange, Device Authorization, refresh token, revocation, introspection, PAR, nonce, state, CSRF, id_token validation, act/may_act claims, scope enforcement, session management, DaVinci, PingOne app config checklist, OAuth error codes. DO NOT USE FOR: calling PingOne Management API to manage users or MFA (use pingone-api-calls); MCP server tool registration (use mcp-server).'
argument-hint: 'Describe the OAuth flow or token operation you need to implement'
---

# PingOne OAuth 2.0 / OIDC — Complete Implementation Guide
## BX Finance Banking Demo

---

## 0. Quick Reference — Grant Type Selector

| Scenario | Grant Type | Use In This Project |
|---|---|---|
| User signs in via browser redirect | `authorization_code` + PKCE S256 | Admin login (`/api/auth/login`), User login (`/api/auth/oauthuser/login`) |
| Server-side machine-to-machine | `client_credentials` | Agent actor token (`oauthService.getAgentClientCredentialsToken()`) |
| Out-of-band user approval (no browser) | CIBA (`urn:openid:params:grant-type:ciba`) | Step-up auth, transfer approval (`cibaService.js`) |
| Delegate user token to another audience | Token Exchange (`urn:ietf:params:oauth:grant-type:token-exchange`) | MCP server access (`oauthService.performTokenExchange()`) |
| IoT / limited-input device | Device Authorization (`urn:ietf:params:oauth:grant-type:device_code`) | Not yet wired but PingOne supports it since Feb 2024 |
| Refresh existing session | `refresh_token` | Auto-refresh middleware (`middleware/tokenRefresh.js`) |
| Revoke token on logout | RFC 7009 `/revoke` | Logout route (`oauthService.revokeToken()`) |
| Zero-trust token validation | RFC 7662 introspection | `middleware/tokenIntrospection.js` |
| Reduce redirect round-trip in high-security flows | PAR (`/par`) | Optional — PingOne supports, not yet implemented |

---

## 1. Project Auth Architecture

This project uses a **Backend For Frontend (BFF)** pattern:
- `banking_api_server` is the confidential client — it holds tokens in server-side sessions, never exposes them to the browser.
- `banking_api_ui` (React SPA) only ever receives opaque session cookies — never raw tokens.
- Two PingOne applications: **Admin client** (admin users/employees) and **User client** (bank customers).
- Tokens are stored in `req.session.oauthTokens` on the server, managed by `express-session`.

---

## 2. PingOne Endpoint Reference

All endpoints are under: `https://auth.pingone.{tld}/{envId}/as/`

| Endpoint | Method | Description |
|---|---|---|
| `/as/.well-known/openid-configuration` | GET | OIDC Discovery (caches all other URLs) |
| `/as/authorize` | GET | Start authorization / login redirect |
| `/as/token` | POST | Exchange code, refresh token, CIBA poll, client credentials, token exchange, device |
| `/as/revoke` | POST | RFC 7009 token revocation |
| `/as/introspect` | POST | RFC 7662 token introspection |
| `/as/userinfo` | GET | OIDC userinfo (Bearer token required) |
| `/as/jwks` | GET | JSON Web Key Set for id_token / access token signature verification |
| `/as/signoff` | GET | End SSO session (pass `id_token_hint`) |
| `/as/bc-authorize` | POST | CIBA backchannel authentication initiation |
| `/as/par` | POST | Pushed Authorization Request (PAR) — returns `request_uri` |
| `/as/device_authorization` | POST | Device Authorization Grant initiation |

### Region TLD Table

| Region | TLD |
|---|---|
| North America | `com` |
| Canada | `ca` |
| European Union | `eu` |
| Australia | `com.au` |
| Singapore | `sg` |
| Asia-Pacific | `asia` |

**In this project:** region is stored in `configStore` as `pingone_region` and defaults to `'com'`.  
Config pointer (lazy): `oauthConfig._base` = `https://auth.pingone.${region}/${envId}/as`

---

## 3. Environment Variables

```bash
# PingOne Core
PINGONE_AUTH_URL=https://auth.pingone.com/{environmentId}/as
PINGONE_ENV_ID=<envId>
PINGONE_REGION=com  # com | ca | eu | com.au | sg | asia

# Admin (confidential) client — WEB_APP type, Authorization Code + PKCE
ADMIN_CLIENT_ID=<admin-app-client-id>
ADMIN_CLIENT_SECRET=<admin-app-client-secret>
ADMIN_REDIRECT_URI=https://your-domain.com/api/auth/oauth/callback

# User (public/confidential) client — WEB_APP or NATIVE_APP type
USER_CLIENT_ID=<user-app-client-id>
USER_CLIENT_SECRET=<user-app-client-secret>    # omit for public client (PKCE only)
USER_REDIRECT_URI=https://your-domain.com/api/auth/oauthuser/callback

# Token exchange / MCP delegation (RFC 8693)
ENDUSER_AUDIENCE=<resource-server-audience-for-user-tokens>
MCP_SERVER_AUDIENCE=<resource-server-audience-for-mcp-tokens>
MCP_RESOURCE_URI=<mcp-server-resource-uri>

# Agent OAuth (client credentials for actor token in token exchange)
AGENT_OAUTH_CLIENT_ID=<agent-client-id>
AGENT_OAUTH_CLIENT_SECRET=<agent-client-secret>
AGENT_OAUTH_CLIENT_SCOPES=openid

# CIBA
CIBA_ENABLED=true
CIBA_TOKEN_DELIVERY_MODE=poll  # poll | ping
CIBA_BINDING_MESSAGE=Banking App Authentication
STEP_UP_ACR_VALUE=<davinci-policy-acr-value>  # e.g. Multi_factor

# Security
SKIP_TOKEN_SIGNATURE_VALIDATION=false  # MUST be false in production
```

---

## 4. Authorization Code + PKCE Flow (Primary BFF Pattern)

**PingOne app requirements:**
- `type: WEB_APP`, `grantTypes: ["authorization_code", "refresh_token"]`
- `pkceEnforcement: S256_REQUIRED`
- `tokenEndpointAuthMethod: CLIENT_SECRET_BASIC`
- `redirectUris` must include the BFF callback URL

### 4a. Step 1 — Initiate Login

```javascript
const crypto = require('crypto');
const { oauthService } = require('../services/oauthService');
const { setPkceCookie } = require('../services/pkceStateCookie');
const { validateRedirectUriOrigin } = require('../services/oauthRedirectUris');

router.get('/login', (req, res) => {
  const state = oauthService.generateState(); // crypto.randomBytes(32).hex
  const codeVerifier = oauthService.generateCodeVerifier(); // crypto.randomBytes(64).hex
  const nonce = crypto.randomBytes(16).toString('hex'); // OIDC replay protection
  const redirectUri = getAdminRedirectUri(req);

  // Validate redirect_uri origin — prevent open redirect
  const uriCheck = validateRedirectUriOrigin(redirectUri);
  if (!uriCheck.ok) return res.status(400).json({ error: 'invalid_redirect_uri' });

  // Store in session AND signed cookie (Vercel serverless cross-instance fallback)
  req.session.oauthState = state;
  req.session.oauthCodeVerifier = codeVerifier;
  req.session.oauthRedirectUri = redirectUri;
  req.session.oauthNonce = nonce;
  setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, isProd());

  const authUrl = oauthService.generateAuthorizationUrl(state, codeVerifier, redirectUri, nonce);

  // Save session BEFORE redirect (required for async stores like Upstash/Redis)
  req.session.save(err => {
    if (err) return res.status(500).json({ error: 'session_save_failed' });
    res.redirect(authUrl);
  });
});
```

**Authorization URL parameters:**
```
GET https://auth.pingone.{tld}/{envId}/as/authorize
  ?response_type=code
  &client_id={clientId}
  &redirect_uri={redirectUri}
  &scope=openid profile email
  &state={random-hex-64}
  &code_challenge={sha256base64url(verifier)}
  &code_challenge_method=S256
  &nonce={random-hex-32}
  &acr_values=Single_Factor      // optional: PingOne predefined or DaVinci policy name
  &login_hint=admin              // optional: hint to PingOne login UI
```

### 4b. Step 2 — Callback: Exchange Code for Tokens

```javascript
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // If PingOne returned an error (user denied, policy failed, etc.)
  if (error) {
    console.error('[callback] PingOne error:', error, error_description);
    return res.redirect(`${getFrontendOrigin(req)}/login?error=${encodeURIComponent(error)}`);
  }

  // State validation — prefer session, fall back to PKCE cookie (serverless)
  const pkceData = req.session.oauthState === state
    ? { codeVerifier: req.session.oauthCodeVerifier, redirectUri: req.session.oauthRedirectUri, nonce: req.session.oauthNonce }
    : readPkceCookie(req);  // validates HMAC signature internally

  if (!pkceData || pkceData.state !== state) {
    return res.redirect(`${getFrontendOrigin(req)}/login?error=invalid_state`);
  }

  const tokens = await oauthService.exchangeCodeForToken(
    code, pkceData.codeVerifier, pkceData.redirectUri
  );
  // Token request: grant_type=authorization_code, code={code}, redirect_uri={uri},
  // client_id={id}, code_verifier={verifier},  Authorization: Basic base64(id:secret)

  // Verify nonce in id_token to prevent replay attacks
  const idTokenClaims = jwt.decode(tokens.id_token);
  if (idTokenClaims.nonce !== pkceData.nonce) {
    return res.redirect(`${getFrontendOrigin(req)}/login?error=nonce_mismatch`);
  }

  // BFF: store tokens server-side, never send to browser
  req.session.oauthTokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresAt: Date.now() + ((tokens.expires_in || 3600) * 1000),
    tokenType: tokens.token_type,
  };
  req.session.oauthType = 'admin';
  req.session.user = { ...idTokenClaims, role: determineRole(idTokenClaims) };

  clearPkceCookie(res, isProd());
  res.redirect(`${getFrontendOrigin(req)}/dashboard`);
});
```

### 4c. PKCE Code Challenge Generation

```javascript
// code_verifier: crypto.randomBytes(64).toString('hex') — 128 hex chars / 256 bits
// code_challenge: base64url(sha256(verifier))
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}
// PingOne requires code_challenge_method=S256 when pkceEnforcement=S256_REQUIRED
```

---

## 5. Client Credentials Grant

Used for machine-to-machine auth where no user is involved.

**PingOne app requirements:**
- `type: WORKER` or `SERVICE`
- `grantTypes: ["client_credentials"]`
- `tokenEndpointAuthMethod: CLIENT_SECRET_BASIC`

```javascript
// services/oauthService.js — getAgentClientCredentialsToken()
const body = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: process.env.AGENT_OAUTH_CLIENT_ID,
  client_secret: process.env.AGENT_OAUTH_CLIENT_SECRET,
  scope: process.env.AGENT_OAUTH_CLIENT_SCOPES || 'openid',
});
const response = await axios.post(tokenEndpoint, body.toString(), {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});
// Returns: { access_token, token_type: 'Bearer', expires_in }
// No refresh_token and no id_token in client_credentials response
```

**Preferred auth method:** Use `Authorization: Basic base64(clientId:clientSecret)` header instead of body params (`CLIENT_SECRET_BASIC`).

---

## 6. CIBA — Client-Initiated Backchannel Authentication

Used for step-up auth and out-of-band user approval without a browser redirect.

**Flow:** BFF initiates → PingOne delivers challenge to user (email / device push via DaVinci) → BFF polls token endpoint

**PingOne app requirements:**
- Enable CIBA grant type on the application
- Delivery mode: `poll` (server polls) or `ping` (PingOne POSTs to notification endpoint)
- Configure a DaVinci policy for challenge delivery
- For step-up: `STEP_UP_ACR_VALUE` env var matching your DaVinci policy ACR

**Grant type URN:** `urn:openid:params:grant-type:ciba`

### 6a. Initiate CIBA

```
POST https://auth.pingone.{tld}/{envId}/as/bc-authorize
Authorization: Basic base64(clientId:clientSecret)
Content-Type: application/x-www-form-urlencoded

login_hint=user@email.com
&scope=openid profile email
&binding_message=BX Finance — Approve Transfer
&acr_values=Multi_factor                        // optional step-up ACR
// For ping mode only: &client_notification_token=<random-32-bytes-hex>
```

Response: `{ auth_req_id, expires_in, interval }`

### 6b. Poll for Tokens

```
POST https://auth.pingone.{tld}/{envId}/as/token
Authorization: Basic base64(clientId:clientSecret)

grant_type=urn:openid:params:grant-type:ciba
&auth_req_id={authReqId}
```

| Response error | Meaning | Action |
|---|---|---|
| `authorization_pending` | User hasn't responded yet | Retry after `interval` seconds |
| `slow_down` | Polling too fast | Increase interval by 5s (max 30s) |
| `access_denied` | User denied | Abort, notify user |
| `expired_token` | auth_req_id expired | Start new CIBA flow |
| _(success)_ | `{ access_token, id_token, refresh_token, ... }` | Store in BFF session |

### 6c. cibaService.js Route Pattern

```javascript
router.post('/initiate', authenticateToken, async (req, res) => {
  const loginHint = req.body.login_hint || req.session.user?.email;
  const result = await initiateBackchannelAuth(
    loginHint,
    req.body.binding_message || 'BX Finance Authentication',
    req.body.scope || 'openid profile email',
    req.body.acr_values,  // e.g. process.env.STEP_UP_ACR_VALUE
  );
  req.session.cibaAuthReqId = result.auth_req_id;
  req.session.save(() => res.json(result));
});

router.get('/poll/:authReqId', authenticateToken, async (req, res) => {
  try {
    const tokens = await pollForTokens(req.params.authReqId);
    req.session.oauthTokens = tokens;  // BFF: tokens stay server-side
    res.json({ status: 'approved' });
  } catch (err) {
    const code = err.response?.data?.error;
    if (code === 'authorization_pending') return res.json({ status: 'pending' });
    if (code === 'access_denied')         return res.json({ status: 'denied' });
    if (code === 'slow_down')             return res.json({ status: 'slow_down' });
    throw err;
  }
});
```

---

## 7. Token Exchange — RFC 8693

Used to mint a scoped delegated token for a specific audience (e.g., MCP server).

**PingOne setup:**
1. User's T1 token must contain `may_act: { client_id: <bff-client-id> }` — configure in PingOne token customization
2. Enable `urn:ietf:params:oauth:grant-type:token-exchange` grant on BFF admin client
3. Configure a custom resource server with the target audience URI

**Grant type URN:** `urn:ietf:params:oauth:grant-type:token-exchange`
**Token type URN:** `urn:ietf:params:oauth:token-type:access_token`

### 7a. Simple Token Exchange (subject only)

```javascript
// services/oauthService.js — performTokenExchange()
// T1 (user access token) → T2 (MCP-scoped delegated token)
const body = new URLSearchParams({
  grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
  subject_token: userAccessToken,           // T1 — end-user's token
  subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  audience: process.env.MCP_SERVER_AUDIENCE,
  scope: 'banking:read banking:write',
  client_id: process.env.ADMIN_CLIENT_ID,
  client_secret: process.env.ADMIN_CLIENT_SECRET,
});
// T2: sub = user sub (unchanged), act = { client_id: <bff-client-id> }
// This is delegation, NOT impersonation
```

### 7b. Token Exchange with Actor Token (subject + actor)

```javascript
// services/oauthService.js — performTokenExchangeWithActor()
const body = new URLSearchParams({
  grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
  subject_token: userAccessToken,           // who the action is FOR
  subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  actor_token: agentClientCredToken,        // who performs the action
  actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  audience: process.env.MCP_SERVER_AUDIENCE,
  scope: 'banking:read banking:write',
  client_id: process.env.ADMIN_CLIENT_ID,
  client_secret: process.env.ADMIN_CLIENT_SECRET,
});
// T3: sub = user sub, act = { sub: <agent-sub>, client_id: <agent-id> }
```

### 7c. act / may_act Claims (RFC 8693 §4.1)

```javascript
// T1 (user token) must contain:
{ sub: "user-guid", may_act: { client_id: "bff-admin-client-id" } }

// T2 (exchanged token) will contain:
{ sub: "user-guid", act: { client_id: "bff-admin-client-id" } }

// Middleware validation (actClaimValidator.js):
function validateActClaim(actClaim) {
  if (!actClaim) return { valid: false, reason: 'act claim absent' };
  return { valid: !!(actClaim.client_id || actClaim.sub || actClaim.iss), actor: actClaim };
}
function validateMayActClaim(mayActClaim, expectedClientId) {
  if (mayActClaim?.client_id !== expectedClientId)
    return { valid: false, reason: 'may_act.client_id mismatch' };
  return { valid: true };
}
```

---

## 8. Device Authorization Grant

For devices with limited input (TV, CLI, IoT). PingOne supports this since Feb 2024.

**PingOne app requirements:** `type: CUSTOM_APP`, `grantTypes: ["device_code", "refresh_token"]`, `tokenEndpointAuthMethod: NONE`, optionally `devicePathId` (short alias like `activate`)

**Grant type URN:** `urn:ietf:params:oauth:grant-type:device_code`

```javascript
// Step 1: POST /as/device_authorization
// body: client_id={id} & scope=openid profile email
// Response: { device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }
// Show user: "Go to {verification_uri} and enter code {user_code}"

// Step 2: Poll /as/token
// grant_type=urn:ietf:params:oauth:grant-type:device_code & device_code={device_code} & client_id={id}
// Loop on authorization_pending, respect slow_down, stop on success/access_denied/expired_token
```

---

## 9. Token Refresh (RFC 6749 §6)

```javascript
// middleware/tokenRefresh.js — refreshIfExpiring()
// Silent auto-refresh 5 minutes before access token expiry
async function refreshIfExpiring(req, res, next) {
  const tokens = req.session?.oauthTokens;
  if (!tokens?.refreshToken) return next();
  if (tokens.accessToken === '_cookie_session') return next(); // local session

  const MARGIN = 5 * 60 * 1000;
  if (!tokens.expiresAt || (Date.now() + MARGIN) < tokens.expiresAt) return next();

  const tokenData = await oauthUserService.refreshAccessToken(tokens.refreshToken);

  // PingOne rotates refresh tokens — always store the new one
  req.session.oauthTokens = {
    ...tokens,
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token || tokens.refreshToken,
    idToken:      tokenData.id_token || tokens.idToken,
    expiresAt:    Date.now() + ((tokenData.expires_in || 3600) * 1000),
  };
  req.session.save(err => { if (err) console.error('[tokenRefresh] save error:', err); });
  next(); // non-fatal — always continue
}
// Token request: grant_type=refresh_token & refresh_token={token} + client auth
```

**Enable `additionalRefreshTokenReplayProtectionEnabled`** on the PingOne app to automatically revoke access tokens when a replayed refresh token is detected.

---

## 10. Token Revocation — RFC 7009

Always revoke on logout. Revoke both the refresh token AND the access token.

```javascript
// services/oauthService.js — revokeToken()
async revokeToken(token, tokenType) {
  if (!token) return;
  const revocationEndpoint = this.config.tokenEndpoint.replace(/\/as\/token$/, '/as/revoke');
  const body = new URLSearchParams({ token, client_id: this.config.clientId });
  if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
  if (tokenType) body.set('token_type_hint', tokenType); // 'access_token' | 'refresh_token'
  await axios.post(revocationEndpoint, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000,
  }).catch(err => console.warn('[RFC7009] revocation failed (non-fatal):', err.message));
}

router.post('/logout', async (req, res) => {
  const { oauthTokens } = req.session;
  await oauthService.revokeToken(oauthTokens?.refreshToken, 'refresh_token');
  await oauthService.revokeToken(oauthTokens?.accessToken,  'access_token');
  req.session.destroy(() => { clearAuthCookie(res, isProd()); res.json({ ok: true }); });
});
```

**PingOne constraints:** PingOne API resource tokens cannot be revoked. `id_token` cannot be revoked. Only custom resource tokens are revocable.

---

## 11. Token Introspection — RFC 7662

```javascript
const response = await axios.post(
  `${PINGONE_AUTH_BASE}/introspect`,
  new URLSearchParams({ token, token_type_hint: 'access_token' }),
  { auth: { username: clientId, password: clientSecret },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 }
);
// { active: true, sub, scope, client_id, aud, exp, iss, token_type }
// { active: false }  ← revoked, expired, or unknown token
// See middleware/tokenIntrospection.js — caches results for 60s per token prefix
```

---

## 12. PAR — RFC 9126

```javascript
// Step 1: POST /as/par  (same params as /authorize, sent server-to-server)
// Response: { request_uri: 'urn:ietf:params:oauth:request_uri:...', expires_in: 60 }
// Step 2: Redirect with only client_id + request_uri
res.redirect(`${AUTH_BASE}/authorize?client_id=${CLIENT_ID}&request_uri=${encodeURIComponent(requestUri)}`);
```

---

## 13. OIDC ID Token Validation

```javascript
// 1. Decode header → get kid
// 2. Fetch JWKS from /as/jwks → select key matching kid (use jwks-rsa package)
// 3. Verify signature: jwt.verify(idToken, publicKey, { algorithms: ['RS256'] })
// 4. Verify iss === `https://auth.pingone.${region}/${envId}/as`
// 5. Verify aud contains client_id
// 6. Verify exp * 1000 > Date.now()
// 7. Verify nonce === sessionNonce  (replay prevention)
// 8. (Optional) Verify acr if step-up was requested
// 9. (Optional) Verify at_hash against access token
```

`SKIP_TOKEN_SIGNATURE_VALIDATION=true` skips steps 2–3. **Never set in production — server will refuse to start.**

---

## 14. Scope Configuration

| Scope | Client | Purpose |
|---|---|---|
| `openid` | All | Required for OIDC / id_token |
| `profile` | Admin, User | name, given_name, family_name |
| `email` | Admin, User | email, email_verified |
| `offline_access` | User | Adds refresh_token |
| `banking:read` | User | Read accounts/transactions |
| `banking:write` | User | Transfer/payment actions |
| `banking:admin` | Admin | User management, admin config |
| `p1:read:user` | Worker | Read PingOne directory |
| `p1:update:user` | Worker | Update user attributes |
| `p1:update:userMfaEnabled` | Worker | Enable/disable MFA |

---

## 15. PingOne Application Configuration Checklist

| Setting | Admin Client | User Client | Agent Client |
|---|---|---|---|
| App type | `WEB_APP` | `WEB_APP` | `WORKER` |
| Grant types | `authorization_code`, `refresh_token`, `token-exchange`, CIBA | `authorization_code`, `refresh_token` | `client_credentials` |
| PKCE enforcement | `S256_REQUIRED` | `S256_REQUIRED` | N/A |
| Token endpoint auth | `CLIENT_SECRET_BASIC` | `CLIENT_SECRET_BASIC` | `CLIENT_SECRET_BASIC` |
| Redirect URIs | `/api/auth/oauth/callback` | `/api/auth/oauthuser/callback` | N/A |
| Token exchange | ✅ Enable | ✗ | ✗ |
| CIBA | ✅ Enable | ✗ | ✗ |

---

## 16. Common PingOne Error Codes

| Error | Cause | Resolution |
|---|---|---|
| `invalid_client` | Wrong credentials or auth method | Use `CLIENT_SECRET_BASIC` (header), not body params |
| `invalid_grant` | Code reused or wrong `code_verifier` | Fresh PKCE per request |
| `access_denied` | User denied or policy blocked | Surface to user; do not retry |
| `authorization_pending` | CIBA user hasn't responded | Keep polling |
| `slow_down` | Polling too fast | Increase interval by 5s (max 30s) |
| `expired_token` | CIBA `auth_req_id` expired | Start new CIBA flow |
| `invalid_scope` | Scope not in PingOne resource grants | Add scope in PingOne console |
| `invalid_redirect_uri` | URI not registered | Register exact URI in PingOne app |
| `interaction_required` | Session expired / MFA needed | Redirect with `acr_values` |

---

## 17. Security Checklist

- ✅ PKCE S256 on every authorization code flow
- ✅ State validated on every callback (CSRF prevention)
- ✅ Nonce validated in id_token (replay attack prevention)
- ✅ Redirect URIs validated server-side before constructing auth URL
- ✅ Tokens in server-side session only — never in localStorage or response body
- ✅ RFC 7009 revocation on logout (both access + refresh tokens)
- ✅ `SKIP_TOKEN_SIGNATURE_VALIDATION=false` enforced in production
- ✅ `act`/`may_act` claims validated on token-exchanged tokens
- ✅ Scope enforcement middleware on all resource routes
- ✅ `additionalRefreshTokenReplayProtectionEnabled` enabled on PingOne app
- ❌ Never use implicit flow
- ❌ Never log raw tokens
- ❌ Never expose `client_secret` to the browser
- ❌ Never skip CIBA `slow_down`
- ❌ Never use `prompt=none` without handling `interaction_required`

---

## See Also

- [.cursor/rules/oauth-references/python-java.md](../../.cursor/rules/oauth-references/python-java.md) — Python Flask + Java Spring Security examples
- [pingone-api-calls skill](../pingone-api-calls/SKILL.md) — PingOne Management API (users, MFA)
- [vercel-banking skill](../vercel-banking/SKILL.md) — Vercel session + Upstash setup
- [mcp-server skill](../mcp-server/SKILL.md) — MCP tool auth challenge, token chain
