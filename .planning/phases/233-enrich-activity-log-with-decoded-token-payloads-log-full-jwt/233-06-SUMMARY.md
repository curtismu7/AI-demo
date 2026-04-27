---
plan: 233-06
status: complete
completed_at: 2026-04-26
commit: 7a2bf1b7
---

# Summary — 233-06: OAuth Callback PKCE + Session Snapshot logEvents

## What was done
- Added `const { decodeJwt } = require('../utils/tokenUtils');` and `const crypto = require('crypto');` imports to `banking_api_server/routes/oauth.js`
- Enriched `callback-success` logEvent with:
  - `jwtFullDecode: _idTokenDecoded` — decoded id_token header + claims
  - `response: { hasAccessToken, hasIdToken, tokenType }` — presence flags only
  - `pkce: { code_challenge_method: 'S256', code_challenge_length }` — PKCE metadata
  - `idTokenClaims: { sub, email, acr }` — extracted from decoded id_token
- Added `auth_lifecycle/session-snapshot` logEvent on login (inside `session.save()` callback): `{ sessionId_hash, event: 'login', role, hasAccessToken, hasIdToken, hasRefreshToken }`
  - `sessionId_hash` is `crypto.createHash('sha256').update(req.session.id).digest('hex').slice(0, 8)` — no raw session ID
- Added `auth_lifecycle/session-snapshot` logEvent on logout (inside `session.destroy()` callback): `{ event: 'logout', role: null, hasAccessToken: false, hasIdToken: false, hasRefreshToken: false }`

## Files changed
- `banking_api_server/routes/oauth.js`

## Verification
- No raw tokens or session IDs in any log field
- Session hash is one-way, 8-char truncated — safe for correlation without exposure
