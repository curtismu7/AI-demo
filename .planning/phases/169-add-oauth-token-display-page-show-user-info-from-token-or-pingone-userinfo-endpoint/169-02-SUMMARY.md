---
phase: 169-add-oauth-token-display-page-show-user-info-from-token-or-pingone-userinfo-endpoint
plan: 02
status: complete
---

## Summary

Added PingOne userinfo enrichment to the OAuth Token Display Page. The BFF calls PingOne's `/userinfo` endpoint using the session access token and returns enriched profile data. The frontend displays this in a new "Account Information" card alongside the JWT claims.

## What Changed

| File | Action |
|------|--------|
| `banking_api_server/routes/tokens.js` | **Modified** — Added `GET /api/tokens/userinfo` route + `axios` / `oauthUserConfig` imports |
| `banking_api_ui/src/services/userInfoService.js` | **Created** — `fetchEnrichedUserInfo()` using `bffAxios`, never throws |
| `banking_api_ui/src/components/OAuthTokenDisplayPage.jsx` | **Modified** — Added enriched state, useEffect, and "Account Information" card section |
| `banking_api_ui/src/components/OAuthTokenDisplayPage.css` | **Modified** — Added `.otdp-source-label` style |

## Deviations from Plan

| Plan Assumed | Actual | Reason |
|-------------|--------|--------|
| New route in `routes/oauth.js` at `POST /api/oauth/userinfo` | Added to `routes/tokens.js` as `GET /api/tokens/userinfo` | Tokens route already imported `getSessionAccessToken`, is auth-protected, and groups all token-related endpoints. GET is more appropriate for a read operation. |
| `fetch()` in userInfoService | `bffAxios` (project's BFF HTTP client) | Follows existing service pattern — bffAxios includes `withCredentials`, timeout, and correct baseURL |
| Component at `src/pages/OAuthTokenDisplayPage.tsx` | `src/components/OAuthTokenDisplayPage.jsx` | Aligned with Plan 169-01 deviation (project uses .jsx, no pages/ dir) |

## Verification

- `npm run build` → compiled successfully (+421B JS, +20B CSS)
