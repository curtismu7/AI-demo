---
phase: 191
plan: 01
status: complete
completed_at: "2026-04-18"
---

# Summary — 191-01: OIDC Resource Server Page

## What Was Built

Created an OIDC-authenticated resource server page that displays the banking summary (account cards, balances, recent transactions) alongside decoded access and ID token claims. This page represents the real resource server endpoint — the target audience for the MCP server's dual token exchange.

## Key Files

### Created
- `banking_api_server/routes/resourceServer.js` — GET /api/resource-server/summary endpoint returning accounts + decoded token claims (raw tokens never sent to client)
- `banking_api_ui/src/components/ResourceServerPage.jsx` — Two-column React page: banking summary (left) + decoded tokens (right)
- `banking_api_ui/src/components/ResourceServerPage.css` — Dark theme styling with account cards, token panels, scope badges

### Modified
- `banking_api_server/server.js` — Mounted route at `/api/resource-server` with authenticateToken middleware
- `banking_api_ui/src/App.js` — Added import + route for `/resource-server`
- `banking_api_ui/src/components/AdminSideNav.jsx` — Added "OIDC Resource Server" nav item

## Key Decisions

- Reused `decodeJwtClaims` + `sanitizeClaims` from `agentMcpTokenService` for safe server-side token decoding (no raw tokens to client)
- Implemented ClaimRow, ScopesBadges, and CLAIM_GLOSSARY inline (self-contained, not imported from OAuthTokenDisplayPage) to avoid coupling
- `aud` claim highlighted in green when it matches the resource server's target audience
- `act` claim displayed in a blue-bordered box labeled "Agent Acting On Behalf"
- Token expiry countdown updates every second

## Verification

- `npm run build` exit code 0
- Backend: 401 returned for unauthenticated requests
- Frontend: route guarded by `user` check in App.js
