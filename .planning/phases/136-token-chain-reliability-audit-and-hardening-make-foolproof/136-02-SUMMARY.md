# Phase 136-02 Summary — Client-side Token Chain Fixes

## What Was Built
Fixed three UI-side reasons the token chain stayed stuck on placeholder cards in the customer dashboard.

## Root Causes Fixed

### 1. UserDashboard never seeded the chain
`useCurrentUserTokenEvent` hook only existed in `Dashboard.js` (admin). Customer users
landing on `/dashboard` never called it, so `tokenChainContext.sessionTokenEvent` was always null.

**Fix:** Added `import { useCurrentUserTokenEvent }` + `useCurrentUserTokenEvent()` call
inside the `UserDashboard` component body (line 55).

### 2. Stale fetch guard blocked post-reauth updates
`fetchSessionPreview` had an early-return guard:
```js
if (ctx && ctx.events.length > 0) return; // live data present — skip
```
This meant after a successful re-authentication (`userAuthenticated` event), the guard
would see stale `ctx.events` still present and skip the fetch, leaving the chain stale.

**Fix:** Removed the guard entirely. The function is only called in two places (mount effect
once + `userAuthenticated` event handler), so there's no looping risk.

### 3. No visible empty state when signed-in user has no events
When `!isLive && !isSessionPreview`, the component silently showed grey placeholder cards
with no explanation. Signed-in users couldn't tell if the chain was broken or just loading.

**Fix:** 
- Added `const isPlaceholder = !isLive && !isSessionPreview;`
- When `isPlaceholder && identityHints?.currentUser` (user is signed in), renders a
  `tcd-empty-state` div with a 🔗 icon and instructions to interact with the AI Agent
- Falls back to the original `currentEvents.map()` render when not in that state
- Added `.tcd-empty-state` CSS in `TokenChainDisplay.css`

## Changes Made

| File | Change |
|------|--------|
| `banking_api_ui/src/components/UserDashboard.js` | Import + call `useCurrentUserTokenEvent()` at L26, L55 |
| `banking_api_ui/src/components/TokenChainDisplay.js` | Remove stale guard (L901 removed), add `isPlaceholder` (L988), add empty-state JSX (L1100-1107) |
| `banking_api_ui/src/components/TokenChainDisplay.css` | Added `.tcd-empty-state` + child selectors |

## Commit
`d68a545` — fix(136-02): seed token chain in UserDashboard + fix stale guard + add empty state

## Verification
- Build: `npm run build` exited 0 (+127 B JS, +71 B CSS)
- All grep checks passed
- Build warnings: pre-existing unused variable warnings only, no new errors
