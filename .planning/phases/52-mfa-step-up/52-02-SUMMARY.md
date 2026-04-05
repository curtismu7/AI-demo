# Phase 52-02 Summary — Step-up Config Fixes

**Committed:** 5ea686c  
**Status:** COMPLETE

## Changes Made

### `banking_api_server/config/runtimeSettings.js`
- `stepUpAmountThreshold` default changed from `|| 250` → `|| 0` (D-02: threshold 0 = always-on)
- Added `pingonesMfaPolicyId: process.env.PINGONE_MFA_POLICY_ID || ''` to settings object (automatically included in `allowedKeys` Set)

### `banking_api_server/services/mcpLocalTools.js`
- Fixed nullish coalescing bug: `|| 250` → `?? 0` in `checkLocalStepUp()`
- `|| 250` caused threshold=0 to silently fall back to 250, defeating always-on intent
- `?? 0` only falls back for null/undefined, not numeric zero

### `banking_api_server/routes/oauthUser.js`
- Removed `maskedEmail` construction (regex masking)
- Changed response from `{ maskedEmail }` → `{ email: user.email || '' }` in `/initiate-otp`
- Full email now returned to UI for display in OTP modal (per plan requirement)

### `banking_api_server/routes/ciba.js`
- Added `req.session.stepUpVerified = true;` in CIBA poll approval branch (line 191)
- Previously missing: CIBA approval stored tokens but never set stepUpVerified
- Fixed: subsequent MCP tool calls after CIBA approval no longer blocked by step-up gate

### `banking_api_ui/src/components/SecuritySettings.js`
- `stepUpAmountThreshold.min`: 1 → 0
- `stepUpAmountThreshold.description`: added "Set to 0 to require step-up on ALL transactions"
- Added `stepUpMethod` to `FIELD_META` with `type: 'select'`, options: email OTP / PingOne MFA / CIBA push
- Added `'stepUpMethod'` to `fieldOrder` (after `stepUpTransactionTypes`)
- Added `select` renderer block in JSX (renders native `<select>` element)
- Build verified: `npm run build` → exit 0

## Verification

```
grep "|| 0" runtimeSettings.js → line 14 ✅
grep "?? 0" mcpLocalTools.js → line 47 ✅  
grep "email: user.email" oauthUser.js → line 843 ✅
grep "stepUpVerified = true" ciba.js → line 191 ✅
grep "stepUpMethod" SecuritySettings.js → lines 35, 211, 309 ✅
npm run build → Compiled successfully ✅
```
