---
plan: 38-02
phase: 38-family-delegation
status: complete
completed: 2026-04-04
commit: 788bbb6
---

# Plan 38-02 Summary: Worker App Config Tab

## What Was Built

**GET /api/admin/config/worker-test** — New route in `adminConfig.js`. Calls `probeManagementApiAccess()` from `pingoneBootstrapService`. Returns `{ ok: true, environmentId, appName, applicationCount }` on success or `{ ok: false, error, hint }` on failure. Always HTTP 200.

**WorkerAppConfigTab.js** — New React component with:
- Three editable fields: `pingone_environment_id`, `pingone_client_id`, `pingone_client_secret` (password type)
- Hydrates values from GET /api/admin/config on mount
- Save button → POST /api/admin/config
- Test Connection button → GET /api/admin/config/worker-test, shows green/red result inline

**Config.js** — Updated:
- Added `import WorkerAppConfigTab from './WorkerAppConfigTab'`
- Tab bar now always visible (removed `hostedOn === 'vercel'` gate)
- Added "Worker App" tab button with same active/inactive styling as existing tabs
- Added `{activeTab === 'worker' && <WorkerAppConfigTab />}` render condition
- Fixed setup tab condition to `activeTab === 'setup'` (hides when any other tab is active)

## Key Files

- `banking_api_server/routes/adminConfig.js` (modified)
- `banking_api_ui/src/components/WorkerAppConfigTab.js` (new)
- `banking_api_ui/src/components/Config.js` (modified)

## Verification

- `node -e "require('./routes/adminConfig')"` → loads OK ✓
- `grep 'worker-test' adminConfig.js` → shows route ✓
- `npm run build` → exit 0 ✓
