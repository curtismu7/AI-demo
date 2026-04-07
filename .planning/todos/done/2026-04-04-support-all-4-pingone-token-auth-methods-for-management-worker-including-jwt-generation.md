---
created: "2026-04-04T18:04:37.686Z"
title: "Support all 4 PingOne token auth methods for management worker including JWT generation"
area: "api"
files:
  - banking_api_server/services/pingOneClientService.js
  - banking_api_server/services/configStore.js
  - banking_api_ui/src/components/WorkerAppConfigTab.js
---

## Problem

PingOne worker apps support 4 token endpoint authentication methods:

1. **None** — no client authentication (public client)
2. **Client Secret Basic** — credentials in Authorization header ✅ implemented
3. **Client Secret Post** — credentials in request body ✅ implemented
4. **Client Secret JWT** — signed JWT using a shared client_secret (`client_secret_jwt`)
5. **Private Key JWT** — signed JWT using an asymmetric private key (`private_key_jwt`)

The Worker App config tab currently only supports Basic and Post. If a user's management worker app is configured to use `client_secret_jwt` or `private_key_jwt`, the Test Connection will always fail with a 401.

The JWT-based methods require:
- A JWT signed with `RS256` or `ES256` (private key JWT) or `HS256` (client secret JWT)
- Claims: `iss` = client_id, `sub` = client_id, `aud` = token endpoint URL, `jti` = random UUID, `exp` = now + 5 min
- For `private_key_jwt`: a stored RSA/EC private key (PEM format). Should be generated or pasted by the user.

## Solution

1. **configStore.js** — Add fields:
   - `pingone_mgmt_token_auth_method` — extend to accept `none`, `basic`, `post`, `client_secret_jwt`, `private_key_jwt`
   - `pingone_mgmt_private_key` — PEM-format private key for `private_key_jwt` (secret field)

2. **pingOneClientService.js** — Update `getManagementToken()`:
   - `none` → send `grant_type=client_credentials` with no credentials
   - `client_secret_jwt` → sign JWT with `HS256` using `clientSecret`, include in `client_assertion` param
   - `private_key_jwt` → sign JWT with `RS256`/`ES256` using stored PEM, include in `client_assertion` param
   - Use `jsonwebtoken` (already in package.json) or `jose` for JWT signing

3. **WorkerAppConfigTab.js** — UI additions:
   - Extend dropdown to show all 4 methods (None, Basic, Post, Client Secret JWT, Private Key JWT)
   - When `private_key_jwt` selected: show textarea for PEM private key + "Generate Key Pair" button
   - "Generate Key Pair" calls a new BFF endpoint `POST /api/admin/config/generate-keypair` that returns a fresh RSA 2048 key pair. Private key saved to configStore, public key shown to user to register in PingOne.
   - When `client_secret_jwt` selected: no extra fields needed (uses existing `pingone_mgmt_client_secret`)

4. **New BFF route** in `adminConfig.js`:
   - `POST /api/admin/config/generate-keypair` — generates RSA 2048 key pair using Node.js `crypto.generateKeyPairSync`, saves private key PEM to configStore `pingone_mgmt_private_key`, returns `{ publicKeyPem, jwk }` so user can register the JWK in PingOne.

Note: `jsonwebtoken` is already a dependency in `banking_api_server/package.json`.
