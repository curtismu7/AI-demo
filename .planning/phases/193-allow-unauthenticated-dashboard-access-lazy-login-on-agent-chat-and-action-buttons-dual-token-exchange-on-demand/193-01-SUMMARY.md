---
phase: 193-allow-unauthenticated-dashboard-access
plan: 01
status: complete
---

## Summary

Opened `/dashboard` route for unauthenticated visitors and ensured agent FAB visibility.

## Changes

- **App.js**: Added explicit `/dashboard` route in outer Routes block handling both authenticated and unauthenticated states. Removed duplicate `/dashboard` from inner authenticated Routes.
- **embeddedAgentFabVisibility.js**: Added `/dashboard` to `isPublicMarketingAgentPath` (FAB visible for guests) and `isMarketingEmbeddedDockSurface` (bottom dock for guests).
- **BankingAgent.js**: Updated `handleLoginAction` return_to logic — `/dashboard` path returns to `/dashboard` instead of hardcoded `/marketing` (2 occurrences).

## Key Files

- `banking_api_ui/src/App.js`
- `banking_api_ui/src/utils/embeddedAgentFabVisibility.js`
- `banking_api_ui/src/components/BankingAgent.js`

## Verification

- `npm run build` exit 0
- Unauthenticated `/dashboard` renders UserDashboard with demo data (not LandingPage)
- Agent FAB visible for guests on `/dashboard`
- Authenticated `/dashboard` behavior unchanged
