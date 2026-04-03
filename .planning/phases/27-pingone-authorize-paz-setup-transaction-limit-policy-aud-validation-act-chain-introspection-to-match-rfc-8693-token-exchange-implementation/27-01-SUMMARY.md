# Phase 27 — Plan 01 Summary

**Status:** Complete  
**Commit:** d683b21

## What was built

Fixed RFC 8693 actor claim extraction and updated PAZ service documentation.

## Files modified

### `banking_api_server/services/mcpToolAuthorizationService.js`
- Added PAZ Trust Framework parameter mapping comment block above claim extraction
- Fixed `actClientId` extraction: `claims.act.client_id || ''` → `claims.act.client_id || claims.act.sub || ''`
- RFC 8693 §4.1: `act.sub` is the canonical actor identifier; `act.client_id` is PingOne-specific extension

```js
// RFC 8693 §4.1: act.sub is the canonical actor identifier.
// act.client_id is PingOne-specific; fall back to act.sub when absent.
const actClientId = claims.act && typeof claims.act === 'object'
  ? String(claims.act.client_id || claims.act.sub || '')
  : '';
```

### `banking_api_server/services/pingOneAuthorizeService.js`
- Updated `@param` JSDoc for `actClientId`: now documents `act.sub` RFC 8693 canonical form
- Updated `@param` JSDoc for `nestedActClientId`: now documents two-hop RFC 8693 form
- Added inline comments to `parameters` block mapping JWT claims → PAZ attributes
- Updated bootstrap MCP endpoint description to include Trust Framework attribute names

### `banking_api_server/jest.config.js`
- Fixed pre-existing bug: `maxWorkers: undefined` → `...(process.env.CI === 'true' ? { maxWorkers: 2 } : {})` (Jest 29 rejects `undefined`)

## Test results
- `mcpToolAuthorizationService.test.js` — 10/10 PASS ✅
- `authorize-gate.test.js` — pre-existing failure (unrelated `server.js` duplicate declaration at line 981, not introduced by this phase)
