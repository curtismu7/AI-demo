---
plan: 233-03
status: complete
completed_at: 2026-04-26
commit: 5dac5a17
---

# Summary — 233-03: CIBA logEvent Enrichment

## What was done
- Added `const { decodeJwt } = require('../utils/tokenUtils');` import to `cibaService.js`
- Enriched `ciba/initiate` logEvent with structured `request` object: `{ scope, deliveryMode, loginHintType, bindingMessage }` and top-level `bindingMessage` field
- Enriched `ciba/initiated` logEvent with `authReqId_length` (length of the opaque ID, not the value)
- Added new `ciba/tokens-received` logEvent inside `waitForApproval` after `pollForTokens` resolves successfully, with `jwtFullDecode: decodeJwt(tokens?.access_token) || undefined`

## Files changed
- `banking_api_server/services/cibaService.js`

## Verification
- `ciba/tokens-received` event fires on the `auth_lifecycle` category (has icon — no new category needed)
- `jwtFullDecode` follows `{ header, claims }` shape matching `TokenChainDisplay.js` pattern
- No raw token strings in any log field
