# Phase 136-01 Summary — Server-side Token Chain Fixes

## What Was Built
Fixed the root-cause userId key mismatch that made the token chain always show placeholder cards.

## Root Cause Found
`oauth.js` stored auth events keyed by `authedUser.id` (internal DB integer) but
`/api/token-chain` read events by `req.user.id = decoded.sub` (PingOne UUID from JWT).
These were always different values → Map lookup always returned an empty array.

## Changes Made

### `banking_api_server/routes/oauth.js`
- After decoding `oauthTokens.accessToken`, extract `decoded.sub` as `_tcUserId`
- Changed `trackTokenEvent({ userId: authedUser.id, ... })` → `userId: _tcUserId`
- Fallback: `_tcUserId = _tcClaims.sub || authedUser.id` (handles edge case)

### `banking_api_server/services/tokenChainService.js`
- Added `synthesizeFromSession(accessToken)` function
- Decodes a raw JWT to produce a single synthetic `auth` event (`_synthetic: true`)
- Returns `[]` on any error (safe fallback)
- Exported in `module.exports`

### `banking_api_server/routes/tokenChain.js`
- Changed `const tokenChain` → `let tokenChain`
- Added fallback: if chain is empty AND session has `oauthTokens.accessToken`, call `synthesizeFromSession`
- Ensures post-restart resilience — user always sees real token data not placeholder

## Commit
`1f0846f` — fix(136-01): fix token chain userId key mismatch + add synthesizeFromSession fallback

## Verification
Grep confirmed all changes in place:
- `_tcUserId` in oauth.js at correct location
- `synthesizeFromSession` in service + route
- Route has length check + session guard before calling synthesis
