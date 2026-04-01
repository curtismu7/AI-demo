---
created: 2026-04-01T16:30:58.512Z
title: Notify user when PingOne SSO silently signs them in without credential prompt
area: auth
files:
  - banking_api_server/routes/oauthUser.js:159-251
  - banking_api_ui/src/App.js
  - banking_api_ui/src/components/BankingAgent.js
---

## Problem

When a user already has an active PingOne session (SSO), clicking "Sign In" immediately redirects back from PingOne without ever showing a credentials prompt. The user sees the loading state briefly then lands on the dashboard — but there is no feedback explaining that they were silently signed in via an existing PingOne session.

This is confusing in demo contexts:
- Observers watching a demo wonder "was there a bug? Why didn't PingOne show?"
- Users who expected to choose an account or enter credentials don't understand what happened
- In the education drawer, there's no mention that PingOne can skip the prompt for SSO sessions

PingOne does NOT send any signal in the callback indicating that credentials were skipped — the code/state response looks identical regardless of whether the user typed a password or was silently authenticated.

**Heuristic approach:** Stamp the login start time in the session just before the PingOne redirect (`/api/auth/oauth/user/login`). In the callback handler, calculate elapsed time. If the round-trip was < ~2000ms, it's very likely PingOne skipped the credential prompt (SSO session reuse). Surface this to the frontend.

## Solution

1. **BFF — stamp login start time:**
   In `oauthUser.js` `/login` route (around line 242), before `res.redirect(url)` add:
   ```js
   req.session.oauthLoginStartedAt = Date.now();
   ```

2. **BFF — detect silent SSO in callback:**
   In `oauthUser.js` `/callback` route (around line 517, after session save), calculate:
   ```js
   const loginMs = req.session.oauthLoginStartedAt
     ? Date.now() - req.session.oauthLoginStartedAt
     : null;
   const silentSso = loginMs !== null && loginMs < 2000;
   // Pass silentSso in the redirect or as a flash value
   ```
   Include `sso_silent=1` (or `sso_fast=1`) as a query param on the post-login redirect URL so the frontend can detect it.

3. **Frontend — show informational toast/message:**
   In `App.js` on the post-login route detection (search for `oauthSuccess`), check for `?sso_silent=1` in `window.location.search` and show a brief info toast:
   > "✅ Signed in automatically — you had an active PingOne session."
   Clear the query param after reading it (replace in history).

4. **Optional — BFF cleanup:**
   Delete `req.session.oauthLoginStartedAt` in the callback after reading it to avoid stale values on subsequent logins.

**Threshold:** 2000ms is conservative. In practice, PingOne SSO redirects complete in < 500ms when a session exists. Normal credential flow takes 5–30+ seconds. A 2s cutoff provides ample separation.
