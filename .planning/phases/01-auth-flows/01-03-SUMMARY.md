# Summary: 01-03 — Agent Step-Up + Auth Challenge Auto-Retry

**Phase:** 01-auth-flows
**Plan:** 01-03
**Completed:** 2026-03-31
**Commit:** 69a1866

## What Was Built

Wired `BankingAgent.js` and `UserDashboard.js` so agent-triggered step-up (CIBA) and login challenges complete automatically with no manual retry.

### AUTH-01: CIBA step-up auto-retry

1. **BankingAgent.js** — detects `step_up_required: true` in MCP tool result → stores pending action in `pendingStepUpActionRef`, shows chat message with CIBA instructions → dispatches `agentStepUpRequested` custom event
2. **UserDashboard.js** — listens for `agentStepUpRequested` → sets `agentTriggeredStepUp=true`, `stepUpRequired=true`, `stepUpMethod` → existing step-up toast UI activates + `handleCibaStepUp` is called automatically → CIBA poll success branch conditionally dispatches `cibaStepUpApproved`
3. **BankingAgent.js** — listens for `cibaStepUpApproved` → reads `pendingStepUpActionRef.current`, clears it, posts "Authentication approved" message, re-calls `runAction`

### AUTH-02: Auth challenge login retry

1. **BankingAgent.js** — detects `authChallenge.authorizationUrl` in tool result → stores pending action in `pendingAuthChallengeActionRef`, shows "Login required" message with `<a>` Sign-in link
2. After login: existing `userAuthenticated` event fires → second listener reads `pendingAuthChallengeActionRef.current`, clears it, posts "Signed in" message, re-calls `runAction`

## Files Changed

- `banking_api_ui/src/components/BankingAgent.js`:
  - Added `pendingStepUpActionRef` and `pendingAuthChallengeActionRef` (useRef, not useState — avoids stale closures)
  - Added two new `useEffect` event listeners (`cibaStepUpApproved`, second `userAuthenticated`)
  - Added `else if (step_up_required)` and `else if (authChallenge)` blocks before the generic error fallthrough
- `banking_api_ui/src/components/UserDashboard.js`:
  - Added `agentTriggeredStepUp` state
  - Added `cibaStepUpApproved` dispatch in CIBA poll success branch (conditional on `agentTriggeredStepUp`)
  - Added `agentStepUpRequested` event listener effect

## Verification

- `npm run build` → `Compiled successfully.` ✓ (no new warnings)
- `hitlPendingIntent` / `consent_challenge_required` path: unchanged ✓
- `consentBlocked` `useState(() => ...)` initializer: unchanged ✓
- `REAUTH_KEY` in UserDashboard.js fetchUserData: unchanged ✓
- Existing `userAuthenticated` listener (calls `checkSelfAuth`): preserved ✓

## Key Decisions

- Used `useRef` (not `useState`) for pending action storage — avoids stale closure in event listeners registered with `[]` deps
- Auth challenge "Sign in" link: `<a href>` (not `window.location.href`) — user controls when to click
- Both new effects use `[]` deps + eslint-disable comment (same pattern as other closures in BankingAgent.js)

## Self-Check: PASSED
