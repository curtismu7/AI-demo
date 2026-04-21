# Phase 213-01 Summary — DevTools Panel Fixes

## What was built

### `banking_api_ui/src/components/UnifiedTokenFlowInspector.jsx` (patched)
- Added `showClose` prop to `UnifiedTokenFlowInspector` (default: undefined)
- Computed `effectiveShowClose = showClose !== false && showToggle !== false`
- Escape key handler now checks `effectiveShowClose` before calling `handleClose()`
- `×` close button wrapped in `{effectiveShowClose && (...)}` — hidden when `showToggle={false}`
- **Effect:** When embedded in DevToolsDashboard with `showToggle={false}`, the panel can no longer be permanently dismissed

### `banking_api_ui/src/components/McpTrafficPage.js` (patched)
- `fetchTraffic()` now checks `res.status === 401` before the generic `!res.ok` guard
- 401 sets `setError('unauthenticated')` instead of `setError('HTTP 401')`
- Error render: `unauthenticated` shows 🔒 icon + "Sign in to view MCP traffic" friendly state
- All other HTTP errors still show the red `⚠️ {error}` banner

### `banking_api_ui/src/components/DevToolsDashboard.jsx` (patched)
- Inspector tab panel wrapper `overflow` changed from `'hidden'` to `'auto'`
- Allows UTFI sections to scroll within constrained DevToolsDashboard height

## Verification
- `npm run build` → exit 0 ✅
- Build size: no significant change
