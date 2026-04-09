---
created: 2026-04-09T13:26:46.674Z
title: Silently obtain worker token when executing PingOne scope update
area: api
files:
  - banking_api_server/services/pingoneScopeUpdateService.js:1-60
  - banking_api_server/routes/admin.js:POST /api/admin/pingone/update-scopes
  - banking_api_server/.env
---

## Problem

The PingOne scope update UI (Phase 101.1) currently requires admin to pass credentials or they must already be in environment variables. This adds friction:
- Credentials must be pre-configured in .env / Vercel config
- Error handling if credentials missing is reactive (fails during button click)
- User experience: button click might fail with "Missing credentials"

**Better approach**: Silently obtain worker app token using stored credentials, validate upfront, and provide early error messaging if tokens cannot be obtained.

## Solution

1. **Proactive token validation** — When PingOne scope update button is rendered, optionally validate that credentials exist and worker app can be authenticated. Cache token with short TTL (15-30 min).

2. **Silent token refresh** — `pingoneScopeUpdateService.fixScopeConfiguration()` checks if token is cached and valid before making scope update calls. If expired, refreshes silently. If credentials missing → clear error state before button action.

3. **Error messaging** — Display credential warnings on admin page load (if applicable), not just on button click:
   - Toast: "⚠️ PingOne credentials not configured" (if missing)
   - Toast: "✅ PingOne worker app authenticated" (if available)

4. **Implementation location**:
   - Service method: `getOrRefreshWorkerToken()` (returns cached token or fetches new via OAuth2 client credentials)
   - Route: Validate upfront, set response header with token status
   - UI: Check for credential warnings on component mount

**Files to update**:
- `pingoneScopeUpdateService.js` — Add token caching, refresh logic
- `admin.js` route — Validate credentials on startup
- `BankingAdminOps.js` — Show credential status on mount

**Related technical context**:
- Worker app = `PINGONE_CLIENT_ID` + `PINGONE_CLIENT_SECRET` (or renamed vars per pending todo)
- PingOne OAuth2 client credentials flow: POST `/as/token` with client ID + secret
- Token TTL typically 1 hour; cache for 30 min for safety
