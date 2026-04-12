---
phase: 132
plan: 01
status: complete
timestamp: 2026-04-12T12:45:00Z
executor: GitHub Copilot
---

# 132-01 Summary: Fix decodeJwtForDisplay in pingoneTestRoutes.js

## What Was Built

Added the missing `decodeJwtForDisplay` helper function to `banking_api_server/routes/pingoneTestRoutes.js`.

## Root Cause

The function was called at 7 locations in the file:
- Line 364: authz token endpoint
- Line 396: agent token endpoint  
- Line 448: exchange-user-to-mcp endpoint
- Line 499: exchange-user-agent-to-mcp endpoint
- Lines 555–556: exchange-user-to-agent-to-mcp (agent + mcp decoded)
- Line 588: worker-token endpoint

But was never defined, causing a `ReferenceError: decodeJwtForDisplay is not defined` on every token endpoint call.

## Fix Applied

Added at line 13 (after require block, before first router call):

```js
function decodeJwtForDisplay(token) {
  if (!token || typeof token !== 'string') { return null; }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) { return null; }
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { header, payload };
  } catch (_e) { return null; }
}
```

Returns `{ header, payload }` — matching `DecodedTokenPanel`'s expected destructuring shape. (Other helpers in the codebase return `{ header, claims }` — this was intentionally different.)

## Key Files

- **Modified:** `banking_api_server/routes/pingoneTestRoutes.js` — added function at line 22

## Commit

`1c3fc54` — fix(pingone-test): add missing decodeJwtForDisplay helper to pingoneTestRoutes

## Self-Check: PASSED

- `function decodeJwtForDisplay` present at line 22 ✓
- Returns `{ header, payload }` shape ✓
- Module loads without error (`node -e "require('./banking_api_server/routes/pingoneTestRoutes.js')"`) ✓
- No call sites modified ✓
