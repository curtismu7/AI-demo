---
created: 2026-04-14T08:51:37.119Z
title: Ensure authorize scopes match PingOne app config
area: auth
files:
  - banking_api_server/config/oauthUser.js:30-50
  - banking_api_server/config/oauth.js:38-42
  - banking_api_server/config/scopes.js:12-28
  - banking_api_server/services/pingoneProvisionService.js:497-545
---

## Problem

The scopes requested at `/authorize` during user login don't match what's actually configured on the PingOne apps. There are 3 conflicting vocabularies:

1. **`BANKING_SCOPES` in scopes.js** uses consolidated names: `banking:general:read`, `banking:general:write`, `banking:ai:agent`
2. **PingOne resource servers** (created by provisioning) use: `banking:read`, `banking:write`, `banking:ai:agent:read`
3. **oauthUser.js ENDUSER_AUDIENCE path** requests a hardcoded `banking:ai:agent:read` but the non-ENDUSER_AUDIENCE path uses `getScopesForUserType()` which returns the wrong `banking:general:*` names

When the user logs in:
- If `ENDUSER_AUDIENCE` **is set**: only gets `['profile', 'email', 'offline_access', 'banking:ai:agent:read']` — no banking read/write scopes at all
- If `ENDUSER_AUDIENCE` **is not set**: `getScopesForUserType('customer')` returns `['banking:general:read', 'banking:general:write', 'banking:ai:agent']` — but PingOne has `banking:read`, `banking:write`, `banking:ai:agent:read`, so PingOne will reject or silently drop them

User confirmed PingOne app has the right scopes configured. Need to ensure the code requests exactly those scopes.

## Solution

Pick Option A (match what PingOne actually has) as the canonical vocabulary:

1. Update `BANKING_SCOPES` in `scopes.js`:
   - `BANKING_READ` → `'banking:read'` (not `banking:general:read`)
   - `BANKING_WRITE` → `'banking:write'` (not `banking:general:write`)
   - `AI_AGENT` → `'banking:ai:agent:read'` (not `banking:ai:agent`)

2. Fix `oauthUser.js` ENDUSER_AUDIENCE path to include banking read/write scopes:
   ```js
   return ['profile', 'email', 'offline_access', 'banking:ai:agent:read', 'banking:read', 'banking:write'];
   ```

3. Update `USER_TYPE_SCOPES` mappings to use the corrected `BANKING_SCOPES` values

4. Verify `oauth.js` admin path also requests the correct scope names

5. Remove legacy `banking:agent:invoke` from `scopeAuditService.js`, `resourceValidationService.js`, `configStore.js`

6. Update doc to match (separate todo already exists)

Related: 9 scope mismatches identified in debug audit (see conversation)
