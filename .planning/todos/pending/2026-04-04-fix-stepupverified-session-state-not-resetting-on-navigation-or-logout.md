---
created: 2026-04-04T14:27:57.622Z
title: Fix stepUpVerified session state not resetting on page navigation or logout
area: auth
files:
  - banking_api_server/routes/mfa.js
  - banking_api_server/routes/oauthUser.js
  - banking_api_server/services/mcpLocalTools.js:52-53
  - banking_api_ui/src/components/UserDashboard.js
---

## Problem

`req.session.stepUpVerified` is set to `true` when any MFA challenge completes (OTP, TOTP, push, FIDO2, CIBA). It is consumed (set back to `false`) in `mcpLocalTools.js` line 53 after a single tool call:

```javascript
req.session.stepUpVerified = false; // consume — single-use per tool call
```

However several scenarios leave `stepUpVerified` in an inconsistent state:

### 1. `stepUpVerified` persists across logout / re-login
If the user logs out and a new session is created, `stepUpVerified` may still be `true` in the old session store entry, or a new user could inherit a stale session slot. Currently `oauthUser.js` logout destroys the session, but if session destruction fails silently, the flag persists.

### 2. `stepUpVerified` never reset after non-tool-call usage
When `stepUpVerified` is set via the MFA BFF routes (`mfa.js`) and the user completes step-up but then navigates away without performing the gated action, `stepUpVerified` stays `true` for the lifetime of the session. Next visit, the gate is bypassed without re-verification.

### 3. Session shared across tabs
If the user has two tabs open and completes step-up in one, the other tab inherits `stepUpVerified = true` without the user having explicitly verified in that context.

### 4. `stepUpVerified` flag has no TTL
Once set, `stepUpVerified` remains `true` until `mcpLocalTools.js` consumes it. If the user does a bank transfer step-up but then browses for 30 minutes before executing the transfer, the step-up is still valid — no time bound.

## Solution

### Add TTL to stepUpVerified (priority fix)
Instead of a boolean, store a timestamp:
```javascript
// On completion:
req.session.stepUpVerified = Date.now() + (5 * 60 * 1000); // valid 5 minutes

// On check (mcpLocalTools.js + mcpInspector.js):
const verified = req.session?.stepUpVerified && req.session.stepUpVerified > Date.now();
if (verified) {
  req.session.stepUpVerified = 0; // consume
}
```

### Reset on logout
In `oauthUser.js` logout handler, explicitly zero the flag before session destruction:
```javascript
req.session.stepUpVerified = 0;
```

### Reset on session init
In session middleware or the `/api/auth/user` response, if a new login is detected (new `user.id` vs stored `user.id`), clear `stepUpVerified`.

## Files to change
- `banking_api_server/routes/mfa.js` — set `stepUpVerified = Date.now() + 300_000` instead of `true`
- `banking_api_server/routes/ciba.js` — same TTL pattern on CIBA approval
- `banking_api_server/services/mcpLocalTools.js` line 52 — check `stepUpVerified > Date.now()` instead of `=== true`
- `banking_api_server/routes/mcpInspector.js` — check `stepUpVerified > Date.now()` instead of truthy
- `banking_api_server/routes/oauthUser.js` logout — explicitly zero the flag

## Priority
Medium — the single-use consume pattern (`= false` in mcpLocalTools) mostly works for normal flows. The TTL fix is the most impactful improvement for demo security correctness.
