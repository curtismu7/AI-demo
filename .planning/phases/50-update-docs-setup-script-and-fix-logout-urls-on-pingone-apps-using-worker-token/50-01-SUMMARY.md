---
phase: 50
plan: "01"
status: executed
executed: 2026-04-05
---

# Phase 50-01 Summary — Docs + Logout URL Fix

## What was done

Created `pingoneAppConfigService.js` for programmatic PingOne app config management (read, update, fix logout URLs, audit), REST API routes, comprehensive documentation.

### Files created
- `banking_api_server/services/pingoneAppConfigService.js` — getAppConfig, updateAppConfig, fixLogoutUrls, auditAppConfig
- `banking_api_server/routes/appConfig.js` — REST API for admin app config management
- `docs/PINGONE_APP_CONFIG.md` — comprehensive PingOne app configuration reference (Admin app, User app, Worker app, Resource Server, mayAct attribute, automated config)

### Files modified
- `banking_api_server/server.js` — imported appConfigRoutes, mounted at `/api/admin/app-config`
- `docs/SETUP.md` — added logout troubleshooting section, audit section, API reference table

### API endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/app-config/admin` | GET | Get Admin OIDC app PingOne config |
| `/api/admin/app-config/user` | GET | Get User OIDC app PingOne config |
| `/api/admin/app-config/fix-logout-urls` | POST | Fix logout URLs on both apps |
| `/api/admin/app-config/audit/all` | GET | Audit both apps for common issues |

### pingoneAppConfigService.js exports
- `getAppConfig(appId)` — reads full PingOne app config via Management API
- `updateAppConfig(appId, config)` — PUT full app config update
- `fixLogoutUrls(appId, publicAppUrl)` — adds postLogoutRedirectUris + signOffUrl
- `auditAppConfig(appId)` — checks for missing logout URIs, PKCE, grant types, localhost URIs

### Audit checks
- postLogoutRedirectUris present
- redirectUris includes localhost
- PKCE enforcement is S256_REQUIRED
- AUTHORIZATION_CODE grant enabled
- Token endpoint auth method not NONE

## Verification
- Server loads OK
- `npm run build` → exit 0
