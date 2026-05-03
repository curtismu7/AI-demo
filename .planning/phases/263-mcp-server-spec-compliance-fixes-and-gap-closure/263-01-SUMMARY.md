---
phase: 263-mcp-server-spec-compliance-fixes-and-gap-closure
plan: 01
status: complete
commit: e64d660e
---

# Summary — Plan 263-01: Server-side gap closure

## Tasks completed

1. **banking_api_server/routes/thresholds.js** (new) — GET/POST handlers for `/api/config/thresholds`; reads `confirm_threshold_usd` and `mfa_threshold_usd` from configStore.
2. **banking_api_server/services/configStore.js** — added `confirm_threshold_usd` and `mfa_threshold_usd` field definitions with defaults of 500 and env var aliases.
3. **banking_api_server/middleware/hitlGatewayMiddleware.js** — `getHitlThreshold()` now reads `mfa_threshold_usd` from `configStore.getEffective()` instead of hardcoded constant.
4. **banking_api_server/services/transactionConsentChallenge.js** — `getConfirmThreshold()` reads `confirm_threshold_usd` from configStore dynamically.
5. **banking_api_server/server.js** — logout clears `pendingConsents`, token chains, MCP audit, and app events; Bearer-token requests to `/api/transactions` bypass `requireSession`; thresholds route registered at `/api/config/thresholds`.

## Verification

- `configStore.getEffective('mfa_threshold_usd')` and `confirm_threshold_usd` calls confirmed present
- `thresholdsRoutes` import and `app.use` confirmed in server.js
- Bearer bypass conditional confirmed at transactions route
- Commit: e64d660e
