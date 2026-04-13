---
created: 2026-04-08T12:25:05.837Z
title: Rename PINGONE CLIENT ID vars to include App or Worker type in name
area: database
files:
  - banking_api_server/.env
  - banking_api_server/env.example
  - banking_api_server/services/configStore.js:395-480
  - banking_api_server/services/resourceValidationService.js:50-75
  - banking_api_server/services/scopeAuditService.js:20-40
  - banking_api_server/services/pingOneClientService.js:40-55
  - banking_api_server/middleware/auth.js:15-35
  - api/handler.js
  - vercel.json
---

## Problem

The current env var names for the three primary PingOne applications do not reflect their
PingOne app type, making it harder to know what each credential is for at a glance.
The user wants the variable names to explicitly encode the PingOne application type:

| PingOne App Name | PingOne Type | Current .env Var | Desired .env Var |
|---|---|---|---|
| Super Banking Worker Token | WORKER | `PINGONE_CLIENT_ID` | `PINGONE_WORKER_CLIENT_ID` |
| Super Banking Admin App | WEB_APP | `PINGONE_ADMIN_CLIENT_ID` | `PINGONE_ADMIN_APP_CLIENT_ID` |
| Super Banking User App | WEB_APP | `PINGONE_USER_CLIENT_ID` | `PINGONE_USER_APP_CLIENT_ID` |

Corresponding secrets:
- `PINGONE_CLIENT_SECRET`         → `PINGONE_WORKER_CLIENT_SECRET`
- `PINGONE_ADMIN_CLIENT_SECRET`   → `PINGONE_ADMIN_APP_CLIENT_SECRET`
- `PINGONE_USER_CLIENT_SECRET`    → `PINGONE_USER_APP_CLIENT_SECRET`

This is a companion to the Phase 88/89 work that already renamed the AI Agent and MCP
Token Exchanger variables. Completing this pass means ALL PingOne app credentials in .env
will clearly encode their PingOne application type.

## Solution

1. **Update `.env`** — rename all three credential pairs with backward-compat comments.

2. **Update `env.example`** — same renames with comments showing PingOne app name + type.

3. **Update `configStore.js` fallback map** — add new canonical keys with old names as
   backward-compat aliases (same pattern used for the Phase 88 renames):
   ```js
   admin_client_id:  ['PINGONE_ADMIN_APP_CLIENT_ID', 'PINGONE_ADMIN_CLIENT_ID', ...],
   user_client_id:   ['PINGONE_USER_APP_CLIENT_ID',  'PINGONE_USER_CLIENT_ID',  ...],
   pingone_client_id: ['PINGONE_WORKER_CLIENT_ID',   'PINGONE_CLIENT_ID',       ...],
   pingone_mgmt_client_id: ['PINGONE_WORKER_CLIENT_ID', 'PINGONE_MGMT_CLIENT_ID', ...],
   ```

4. **Update all code** that reads `process.env.PINGONE_CLIENT_ID`,
   `process.env.PINGONE_ADMIN_CLIENT_ID`, `process.env.PINGONE_USER_CLIENT_ID` directly
   (not via configStore) to read from the new names with old-name fallback.
   Key files: `auth.js`, `oauthRoutes.js`, `resourceValidationService.js`, `scopeAuditService.js`.

5. **Update Vercel environment variables** — add new names in Vercel dashboard, keep old
   names temporarily for zero-downtime, then remove old names on next deploy cycle.

6. **Update `docs/ENVIRONMENT_MAPPING.md`** and `docs/PINGONE_ACTUAL_ENVIRONMENT.md`.

7. **Update tests** that set `process.env.PINGONE_ADMIN_CLIENT_ID` etc. directly.

8. **Run `npm run build`** in `banking_api_ui/` to confirm no UI breakage.

## Notes

- Keep old names as aliases in configStore until Vercel and any other deployed envs are
  migrated — same backward-compat approach used in ab9d1ee.
- The `PINGONE_WORKER_CLIENT_ID` name makes it obvious this is the Management API Worker
  app (type: WORKER in PingOne), not an OAuth login client.
