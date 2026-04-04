# Phase 51 Plan 01 — SUMMARY

## What Was Built

Added session enforcement (layer zero) across the BFF and agent client.

**Commit:** `8b87605`

## Files Modified

### `banking_api_server/middleware/auth.js`
- Added `requireSession` middleware: checks `req.session?.user`, returns `401 { error: 'unauthenticated', message: '...' }` when absent
- Exported from `module.exports`
- Modeled after `requireAdmin` pattern; does not require a Bearer token (session-only check)

### `banking_api_server/server.js`
- Added `requireSession` to destructured import from `./middleware/auth`
- Applied to `POST /api/mcp/tool` as a middleware before the async handler
- Applied to `app.use('/api/transactions', ...)` before `authenticateToken`

### `banking_api_ui/src/components/BankingAgent.js`
- `runAction`: added layer-zero auth check after `isAgentBlockedByConsentDecline()`. If `!isLoggedIn`, shows inline assistant message and returns before any BFF call
- Left column `!isLoggedIn` branch: added `ba-left-guest-chips` section above existing `ba-left-auth` div with 4 educational chips (What is OAuth?, Explain PKCE, What is MCP?, What is CIBA?) that dispatch via `parseNaturalLanguage` + `dispatchNlResult` without a session
- Added "🔑 Sign in to your account →" CTA chip below the educational chips

## Verification

- `npm run build` in `banking_api_ui/` → exit 0 ✅
- `POST /api/mcp/tool` without session cookie returns `401 { error: 'unauthenticated' }`
- `POST /api/transactions/*` without session cookie returns `401 { error: 'unauthenticated' }`
- `runAction` blocked client-side when user not logged in

## Requirements Addressed

- **AUTH-GATE-01**: `requireSession` applied to `POST /api/mcp/tool`
- **AUTH-GATE-02**: `requireSession` applied to `/api/transactions`
- **AUTH-GATE-03**: BankingAgent `runAction` auth gate + pre-login chip group
