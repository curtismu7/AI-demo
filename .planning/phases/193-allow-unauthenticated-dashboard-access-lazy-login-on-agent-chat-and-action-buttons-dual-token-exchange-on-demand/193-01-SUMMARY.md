---
phase: 193-allow-unauthenticated-dashboard-access
plan: 01
status: complete
---

## Summary

Opened `/dashboard` route for unauthenticated visitors, removed forced OAuth login from customer flows on the marketing page, and ensured agent FAB visibility. Only "Try as Admin" triggers OAuth login — all customer paths navigate directly to `/dashboard` with lazy auth on demand.

## Changes

- **App.js**: Added explicit `/dashboard` route in outer Routes block handling both authenticated and unauthenticated states. Removed duplicate `/dashboard` from inner authenticated Routes.
- **embeddedAgentFabVisibility.js**: Added `/dashboard` to `isPublicMarketingAgentPath` (FAB visible for guests) and `isMarketingEmbeddedDockSurface` (bottom dock for guests).
- **BankingAgent.js**: Updated `handleLoginAction` return_to logic — `/dashboard` path returns to `/dashboard` instead of hardcoded `/marketing` (2 occurrences).
- **LandingPage.js**: Changed `handleCustomerLogin` from OAuth redirect (`/api/auth/oauth/user/login`) to `navigate("/dashboard")` — no forced auth. Added "Explore Demo" button in header nav and hero CTA section linking to `/dashboard`. Only `handleAdminLogin` still triggers OAuth (`/api/auth/oauth/login`).
- **LandingPage.css**: Added `.hero-cta-explore` style (semi-transparent white-bordered button).
- **configHostnameService.js**: Fixed `DEFAULT_HOSTNAME` from `https://api.pingdemo.com:3002` to `https://api.pingdemo.com` (was causing redirect_uri mismatch with PingOne).

## Key Files

- `banking_api_ui/src/App.js`
- `banking_api_ui/src/utils/embeddedAgentFabVisibility.js`
- `banking_api_ui/src/components/BankingAgent.js`
- `banking_api_ui/src/components/LandingPage.js`
- `banking_api_ui/src/components/LandingPage.css`
- `banking_api_server/services/configHostnameService.js`

## Verification

- `npm run build` exit 0
- Unauthenticated `/dashboard` renders UserDashboard with demo data (not LandingPage)
- Agent FAB visible for guests on `/dashboard`
- Marketing page "Try as Customer" and "Explore Demo" navigate to `/dashboard` without OAuth
- Marketing page "Try as Admin" still triggers OAuth login
- Lazy auth: clicking actions requiring auth (balance, transactions) triggers login on demand
- Authenticated `/dashboard` behavior unchanged
