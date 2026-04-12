---
created: 2026-04-12T11:15:48.840Z
title: Fix authorization code flow to require PingOne login and use access token
area: auth
files:
  - banking_api_ui/src/components/PingOneTestPage.jsx:414-434
  - banking_api_server/routes/pingoneTestRoutes.js:370-410
---

## Problem

The "Authorization Code Token" test card on PingOneTestPage calls `/api/pingone-test/authz-token`
which only checks whether a session token already exists. It doesn't enforce that the user logs
in via PingOne Authorization Code + PKCE first. If there's no session, it just returns an error
with no guidance.

The test should mirror what happens on the Dashboard: user must first log in to PingOne (Authorization
Code + PKCE flow), then the resulting access token from that login is what gets used / displayed /
exchanged. The page should detect absence of session and redirect to login or show a clear
"Login required" prompt with a PingOne login button, not silently fail.

Token exchange tests (exchange1/2/3) already correctly guard with `req.session.oauthTokens.accessToken`
check, but the UI doesn't pre-empt or handle the 401 gracefully.

## Solution

- BFF `/api/pingone-test/authz-token`: already returns error when no session token — that part is fine
- PingOneTestPage: detect `data.error` containing "must log in" or status 401 and show an inline
  login prompt ("Login to PingOne first → [Login]" button linking to `/api/auth/login`) rather
  than just showing a red failure badge
- Optionally: auto-run `testAuthzToken` on mount; if it fails with auth error show a login banner
  at the top of the Token Acquisition section
- Token exchange cards should also show "Login required" guidance when their upstream authz token
  test has failed, rather than letting users test them independently with no token
