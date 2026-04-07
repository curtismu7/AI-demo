---
created: "2026-04-04T18:04:37.686Z"
title: "Worker App config tab credentials lost on browser refresh"
area: "api"
files:
  - banking_api_ui/src/components/WorkerAppConfigTab.js
  - banking_api_server/routes/adminConfig.js
  - banking_api_server/services/configStore.js
---

## Problem

The Worker App config tab (`pingone_mgmt_client_id`, `pingone_mgmt_client_secret`, `pingone_mgmt_token_auth_method`) does not persist credentials across a browser refresh. The user enters credentials, clicks Save, sees "✓ Saved", but after refreshing the tab the fields are blank again.

Root cause candidates:

1. **`pingone_mgmt_client_id` / `pingone_mgmt_client_secret` not in `FIELD_DEFS` whitelist properly** — `POST /api/admin/config` filters keys against `FIELD_DEFS`. If the keys were not present when the POST ran, they would be silently discarded. Check that `pingone_mgmt_client_id`, `pingone_mgmt_client_secret`, `pingone_mgmt_token_auth_method` all appear in `FIELD_DEFS` in `configStore.js`.

2. **`configStore.setConfig` skips empty strings** — The service skips empty-string values. If the secret field is blank (masked), the save call may appear to succeed but not actually write anything.

3. **SQLite write path not reached** — On local dev the configStore writes to SQLite (`data/config.db`). If better-sqlite3 fails to initialize silently, values are stored in-memory only and lost on restart/refresh.

4. **GET /api/admin/config not returning new keys** — The masked GET response only includes keys that are in `FIELD_DEFS` with `public: true`. All three new mgmt keys are `public: true` — verify they actually appear in the GET response after a save.

## Solution

1. Add a `console.log` in `WorkerAppConfigTab.js`'s `useEffect` to log what `cfg` contains after GET to confirm the server is returning the keys.
2. Test the POST directly via curl:
   ```bash
   curl -s -X POST http://localhost:3001/api/admin/config \
     -H "Content-Type: application/json" \
     -d '{"pingone_mgmt_client_id":"test123"}' | jq .
   ```
   Then GET and confirm `pingone_mgmt_client_id` appears in response.
3. If POST silently discards the key, the bug is in `FIELD_DEFS` — the key may not have been in the map when `configStore` was first loaded (module cached before Phase 38 changes).
4. Fix: ensure all three new keys are verifiably in `FIELD_DEFS` and restart the server after the code change.
