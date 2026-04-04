---
created: 2026-04-04T14:27:57.622Z
title: Handle access token expiry mid-MFA challenge flow
area: auth
files:
  - banking_api_server/routes/mfa.js
  - banking_api_server/services/mfaService.js
  - banking_api_ui/src/components/UserDashboard.js
---

## Problem

All three MFA BFF routes (`POST /challenge`, `PUT /challenge/:daId`, `GET /challenge/:daId/status`) use `req.session.oauthTokens?.accessToken` as the bearer token for PingOne `deviceAuthentications` API calls. The user's access token has a finite TTL (typically 60 minutes, but configurable in PingOne).

If the access token expires between the time the challenge is initiated (`POST /challenge`) and when the user completes verification (`PUT /challenge/:daId` with OTP), the PingOne API call will fail with 401. Currently `mfaService._wrapError()` will surface a 401 error that the UI shows as a generic MFA error — the user has no way to know their session needs refreshing, and the challenge is lost.

This is especially relevant for:
- Long TOTP or push sessions where the user sets down the phone
- FIDO2 delays where the user fumbles with a hardware key
- Demo users who walk away and come back to the OTP modal still open

## Solution

### Option A: Refresh before MFA calls
In `mfa.js` routes, before each `mfaService.*` call, check if the access token is close to expiry. If so, attempt a silent refresh using the stored `refreshToken`:

```javascript
// Before mfaService call in each route:
const { accessToken, refreshToken, expiresAt } = req.session.oauthTokens || {};
if (!accessToken) return res.status(401).json({ error: 'no_session' });

// If token expires in < 2 minutes, refresh first
if (expiresAt && Date.now() > expiresAt - 120_000 && refreshToken) {
  try {
    const refreshed = await tokenService.refreshAccessToken(refreshToken);
    req.session.oauthTokens = { ...req.session.oauthTokens, ...refreshed };
    await new Promise((r, j) => req.session.save(e => e ? j(e) : r()));
  } catch (_) { /* proceed with current token; refresh failure is non-fatal */ }
}
```

### Option B: Detect 401 from PingOne, return distinct error code  
In `_wrapError()` in `mfaService.js`, detect `status === 401` and set `err.code = 'token_expired'`.
In `mfa.js` error handlers, return `{ error: 'token_expired', message: 'Session expired. Please refresh and try again.' }`.
In `UserDashboard.js`, catch `error === 'token_expired'` → close modal + `notifyError` with "Your session expired. Please log in again." + optionally trigger re-auth.

### Recommended
Option B for now (phase 53 scope) — minimal, surfaces a clear error. Option A is a stretch goal.

## Files to change
- `banking_api_server/services/mfaService.js` — `_wrapError()`: detect 401, set `err.code = 'token_expired'`
- `banking_api_server/routes/mfa.js` — error handlers: surface `token_expired` code distinctly
- `banking_api_ui/src/components/UserDashboard.js` — catch `token_expired` across all MFA handlers, show re-auth message
