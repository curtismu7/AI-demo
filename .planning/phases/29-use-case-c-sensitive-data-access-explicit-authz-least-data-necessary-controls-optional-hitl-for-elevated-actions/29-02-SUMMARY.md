# 29-02 SUMMARY — BFF Sensitive Data Authorization Gate

## What was done
Created the server-side authorization infrastructure for the sensitive account data flow.

## Files created/modified
- `banking_api_server/services/sensitiveDataService.js` (**new**) — Exports `checkSensitiveAccess`, `grantSensitiveConsent`, `revokeSensitiveConsent`. Implements scope check + PAZ evaluation (FAIL_OPEN=false) + 60s session consent token lifecycle.
- `banking_api_server/routes/sensitiveBanking.js` (**new**) — Express router with `POST /sensitive-consent` and `GET /sensitive-details`.
- `banking_api_server/server.js` — Added `require('./routes/sensitiveBanking')` and `app.use('/api/accounts', authenticateToken, sensitiveBankingRoutes)`.

## Key decisions
- Gate order: session consent → scope check → PAZ (simulated or live)
- FAIL_OPEN=false: PAZ unconfigured causes denial (paz_not_configured reason)
- `banking:read` broad scope also satisfies the sensitive check (in addition to `banking:sensitive:read`)
- Consent key: `req.session.sensitiveReadConsent = { grantedAt, expiresAt, userId }` with 60s TTL

## Verification
- `node /tmp/verify_plan02.js` → PASS: all 3 exports present, both routes registered
- `grep sensitiveBanking banking_api_server/server.js` → confirms registration
