---
created: 2026-04-04T16:40:08.475Z
title: Add session expiry countdown timer to header
area: ui
files:
  - banking_api_ui/src/components/Header.js
  - banking_api_ui/src/services/apiClient.js
---

## Problem

Users have no visibility into how much time remains in their login session before it expires. When the session ends silently, the next action fails unexpectedly (typically a 401 redirect). A countdown timer or "expires in X minutes" indicator in the header would let users save work or re-authenticate proactively.

The BFF session is backed by an OAuth access token with a PingOne-issued `expires_in`. The client-side `apiClient.js` already has `isTokenExpired()` logic but nothing surfaces the remaining TTL in the UI.

## Solution

1. Expose a `/api/session/info` (or similar) BFF endpoint that returns `{ expiresAt: <ISO timestamp> }` derived from the stored token's `expires_in` + issue time.
2. In `Header.js`, poll or compute remaining time from `expiresAt` and render a countdown (e.g. "Session: 12m 34s") that turns amber < 5 min and red < 1 min.
3. Optionally wire a "Renew session" button that triggers token refresh before expiry.
4. Consider using the existing `authContext` / `useAuth` pattern (if one exists) so the timer re-renders reactively without polling.
