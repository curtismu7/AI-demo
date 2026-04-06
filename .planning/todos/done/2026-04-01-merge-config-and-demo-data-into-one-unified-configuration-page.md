---
created: "2026-04-01T11:28:24.407Z"
title: "Merge config and demo-data into one unified configuration page"
area: "ui"
files:
  - banking_api_ui/src/components/DemoDataPage.js
  - banking_api_ui/src/components/ConfigPage.js
  - banking_api_server/services/configStore.js
  - banking_api_server/routes/config.js
---

## Problem

There are currently two separate pages exposed to users for configuring the demo:

- **`/demo-data`** (`DemoDataPage.js`) — accounts, delegation mode, token auth method, MCP scopes, demo scenario, agent consent
- **`/config`** (`ConfigPage.js`) — PingOne environment settings, OAuth client IDs, feature flags, MCP resource URI, etc.

This split is confusing: users bounce between pages to configure related things (e.g. token auth method on demo-data, client IDs on config). There is also no audit of whether every configStore key that is currently writable from the BFF is actually surfaced in either page — some keys may be orphaned (configurable in code but not via UI) or duplicated (set in two places with inconsistent labels).

## Solution

1. **Audit phase** — before merging, do a full cross-reference:
   - List every key in `configStore.js` that has a setter (`setKey` / `PATCH /api/config` / `PATCH /api/demo-data`)
   - List every input/select/toggle rendered in `ConfigPage.js` and `DemoDataPage.js`
   - Identify: (a) keys with no UI, (b) UI controls with no configStore key, (c) keys whose BFF handler doesn't actually apply the value at call-time
   - Pay special attention to env-var-backed keys (e.g. auth method vars) — verify the BFF route reads from configStore and the runtime code calls `configStore.getEffective()` not raw `process.env`

2. **Merge into a single `/settings` or `/admin/config` route**, organised into collapsible sections:
   - **PingOne Environment** (env ID, region, client IDs, redirect URI)
   - **Token Exchange** (MCP resource URI, token auth methods per client, key generation)
   - **Agent & MCP** (agent scopes, MCP gateway audience, delegation mode flags)
   - **Feature Flags** (existing flag toggles, currently on a separate `/feature-flags` page — consider absorbing)
   - **Demo Scenario** (accounts, demo data reset, delegation mode)
   - **Developer / Debug** (verbose OAuth logging, exchange simulator link)

3. **Ensure every setting responds to the UI**:
   - Active `PATCH` route that writes to configStore
   - `configStore.getEffective()` used at call-time in the BFF service (not a cached value set only at startup)
   - UI reads the current value on mount and reflects it (no stale defaults)
   - Success/error toast on save

4. **Remove** the old `/demo-data` and `/config` routes (or redirect to the new page) once migration is verified.

**Key files to read during audit:**
- `banking_api_server/services/configStore.js` — full key registry + `getEffective` logic
- `banking_api_server/routes/config.js` — which keys are patchable via API
- `banking_api_server/routes/demoData.js` — which keys are patchable via demo-data API
- `banking_api_ui/src/components/ConfigPage.js` — current UI controls
- `banking_api_ui/src/components/DemoDataPage.js` — current UI controls
- Search codebase for `process.env.` usage in services that should be using `configStore.getEffective` instead
