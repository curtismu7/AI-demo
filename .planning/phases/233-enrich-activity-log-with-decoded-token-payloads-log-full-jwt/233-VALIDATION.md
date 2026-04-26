---
phase: 233
slug: enrich-activity-log-with-decoded-token-payloads-log-full-jwt
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 233 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (banking_api_ui), Node.js manual require checks (banking_api_server) |
| **Run command** | `cd banking_api_ui && npm run build` |
| **Coverage tool** | N/A — integration and build verification |

---

## Wave 0 Gates (must pass before any Wave 1 work)

- [ ] `banking_api_server/utils/tokenUtils.js` exists and exports `decodeJwt(token)`
- [ ] `node -e "require('./banking_api_server/utils/tokenUtils.js')"` exits cleanly
- [ ] `decodeJwt('invalid')` returns `null` without throwing
- [ ] `decodeJwt(validJwt)` returns `{ header: {...}, claims: {...} }`

---

## Validation Dimensions

### D1 — tokenUtils.js extraction
- `grep -r "decodeJwtClaims" banking_api_server/services/agentMcpTokenService.js` returns 0 hits (old function removed/replaced)
- `grep "decodeJwt" banking_api_server/utils/tokenUtils.js` confirms export present

### D2 — JWT decode enrichment at call sites
- `grep -c "jwtFullDecode" banking_api_server/routes/oauth.js` ≥ 1
- `grep -c "jwtFullDecode" banking_api_server/services/cibaService.js` ≥ 1
- `grep -c "jwtFullDecode" banking_api_server/services/agentMcpTokenService.js` ≥ 1
- `grep -c "jwtFullDecode" banking_api_server/services/agentTokenService.js` ≥ 1

### D3 — Frontend POST endpoint
- `grep -n "POST.*app-events\|app-events.*POST" banking_api_server/server.js` or route file confirms route mounted
- `node -e "require('./banking_api_server/server.js')"` (if possible) exits cleanly

### D4 — ActivityLogs.js display
- `npm run build` in banking_api_ui exits 0
- No new `console.error` regressions on login flow

### D5 — Event deduplication
- Grep audit confirms no same-action event fired from both route AND service for any single call path
