---
created: "2026-04-01T11:10:11.664Z"
title: "Token Endpoint Auth Method Selector on Demo Data Page"
area: "ui"
files:
  - banking_api_ui/src/components/DemoDataPage.js
  - banking_api_server/services/configStore.js
  - banking_api_server/services/oauthService.js
  - banking_api_server/config/oauth.js
---

## Problem

The BFF currently supports two token endpoint auth methods via the `admin_token_endpoint_auth_method` configStore key (`basic` / `post`) and the new `AGENT_TOKEN_ENDPOINT_AUTH_METHOD`, `AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD`, `MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD` env vars — but there is no UI to change them. Users must manually set env vars or prod-deploy to test different methods.

PingOne app config has four options for Token Endpoint Authentication Method:
- `NONE` — no client authentication (public clients)
- `CLIENT_SECRET_BASIC` — Authorization: Basic header (current default)
- `CLIENT_SECRET_POST` — client_id + client_secret in request body
- `CLIENT_SECRET_JWT` — signed JWT assertion (`client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`)
- `PRIVATE_KEY_JWT` — same assertion format but signed with a private key registered at PingOne

The demo currently only handles BASIC and POST. JWT-based methods require generating a signed assertion before each POST to `/as/token` — the BFF has no code for this yet.

## Solution

On the `/demo-data` page, add a **Token Authentication Method** section (similar to the existing Delegation Mode section) with:

1. **Radio buttons / select** for each method per client:
   - Admin / BFF client (`admin_token_endpoint_auth_method`)
   - Agent actor client (`AGENT_TOKEN_ENDPOINT_AUTH_METHOD`)
   - AI Agent client (`AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD`)
   - MCP Exchanger client (`MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD`)

2. **When `client_secret_jwt` or `private_key_jwt` is selected:**
   - Generate a JWT key pair in the BFF (RSA 2048 or EC P-256)
   - Store the private key in configStore (encrypted or env-only)
   - Display the public key / JWKS endpoint URL for registration in the PingOne app
   - Generate a signed `client_assertion` JWT on each token request (exp = now+60s, iss=sub=client_id, aud=tokenEndpoint, jti=uuid)
   - The JWT builder follows RFC 7523 §2.2

3. **Persist** the selection in configStore (new keys: `agent_token_endpoint_auth_method`, `ai_agent_token_endpoint_auth_method`, `mcp_exchanger_token_endpoint_auth_method`) so it survives restarts.

4. **BFF changes needed in oauthService.js:**
   - Extend `applyTokenEndpointAuth(clientId, clientSecret, method, body, headers)` (or a new overload) to handle `client_secret_jwt` and `private_key_jwt`:
     - Build `client_assertion` JWT (header: `alg: RS256/ES256`, payload: `iss, sub, aud, exp, jti`)
     - Sign with stored private key
     - Add `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` and `client_assertion=<jwt>` to request body
   - Use `jose` library (already in package.json) for signing — NOT `jsonwebtoken` (CJS/ESM issues in the BFF)

5. **Security notes:**
   - Private key must NEVER be sent to the browser — key generation and storage are server-side only
   - Display only the public key / JWKS JSON in the UI
   - `client_secret_jwt` uses HMAC (HS256, secret = clientSecret) — simpler but same client_secret must be registered
   - `private_key_jwt` requires the public key to be uploaded to PingOne Application → Token Endpoint settings

**Affected files (new/changed):**
- `banking_api_ui/src/components/DemoDataPage.js` — new section with method picker
- `banking_api_server/routes/demoData.js` (or similar) — GET/PATCH endpoints for auth method config
- `banking_api_server/services/configStore.js` — new configStore keys for each client's auth method
- `banking_api_server/services/oauthService.js` — extend `applyTokenEndpointAuth` / new `buildClientAssertion`
- `banking_api_server/config/oauth.js` — new `tokenEndpointAuthMethod` getters for agent/AI/MCP clients
- `banking_api_server/services/jwtAssertionService.js` — new: key generation, signing, JWKS output

---

## Implementation Detail — JWT auth methods (private_key_jwt / client_secret_jwt)

When a JWT auth method is selected in the UI the following must be implemented:

1. **BFF generates a key pair** using `jose` (already in `package.json`)
   — do NOT use `jsonwebtoken` (CJS/ESM mismatch in BFF)
   — RSA 2048 (`RS256`) or EC P-256 (`ES256`)
2. **Private key stays server-side only** — stored in configStore under an opaque PEM key, never serialised to the browser
3. **Public key / JWKS JSON displayed in UI** — copy-paste-ready block for the PingOne app's "Token Endpoint Authentication" settings
4. **`client_assertion` JWT built per-request (RFC 7523 §2.2)**
   - Header: `{ alg: 'RS256' }` (or `'ES256'` for P-256)
   - Payload: `{ iss: clientId, sub: clientId, aud: tokenEndpoint, exp: now+60, jti: uuid() }`
   - Added to body: `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` + `client_assertion=<signed JWT>`
   - `client_id` still included in body (PingOne requires it even with JWT client auth)

**New files / changes needed:**

- `banking_api_server/services/jwtAssertionService.js` — **new**
  - `generateKeyPair()` — generates RSA 2048 key pair via `jose`, returns `{ publicKey, privateKey }`
  - `exportJwks(publicKey)` — returns JWKS JSON suitable for PingOne registration
  - `exportPrivateKeyPem(privateKey)` — PEM string for configStore persistence
  - `importPrivateKeyPem(pem)` — re-import PEM for signing
  - `signClientAssertion(clientId, tokenEndpoint, privateKey)` — returns signed JWT string

- `banking_api_server/services/oauthService.js` — extend `applyTokenEndpointAuth`:
  - Add `case 'private_key_jwt'`: call `jwtAssertionService.signClientAssertion`; load private key from configStore
  - Add `case 'client_secret_jwt'`: HMAC-sign (HS256) using `clientSecret` as key, same payload shape
  - Both cases place `client_assertion_type` + `client_assertion` in request body; omit Authorization header

- **New configStore keys** (one PEM per client):
  - `bff_jwt_private_key_pem`
  - `agent_jwt_private_key_pem`
  - `ai_agent_jwt_private_key_pem`
  - `mcp_exchanger_jwt_private_key_pem`

- **New BFF route** e.g. `POST /api/admin/token-auth/generate-keypair?client=bff`:
  - Calls `jwtAssertionService.generateKeyPair()`
  - Persists PEM in configStore
  - Returns `{ jwks: { keys: [...] } }` for UI display

- `banking_api_ui/src/components/DemoDataPage.js` — new "Token Endpoint Authentication" section:
  - Per-client `<select>` (none / basic / post / client_secret_jwt / private_key_jwt)
  - When jwt method chosen: "Generate Keys" button → calls generate-keypair route → shows JWKS JSON + Copy button
  - Warning banner: "Private key is server-side only. Copy the public JWKS below into PingOne app → Token Endpoint settings before saving."
