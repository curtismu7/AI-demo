---
created: 2026-04-01T15:50:00.000Z
title: Remove or mask password hint from public landing page
area: ui
files:
  - banking_api_ui/src/components/LandingPage.js:233-248
  - banking_api_ui/src/components/DemoDataPage.js:1150-1151
---

## Problem

The landing page displays `User: bankuser` and `Pass: Tigers7&` (actual password) in plain text via the `marketing_demo_password_hint` config. This is set intentionally by the admin to help demo users, but showing a real password publicly on a landing page is a security risk:

- The page is public (no auth required)
- Real credentials are indexed / visible in screenshots / screen shares
- Even for a demo app, this trains bad password-handling habits

Screenshot evidence: password "Tigers7&" visible in plain text below the sign-in intro copy.

## Solution

Options (pick one):
1. **Remove the password hint entirely** — only show the username hint; tell users the password in setup docs or via the README.
2. **Mask by default** — show `Pass: ••••••••` with a "reveal" toggle (eye icon), so it's one click for demo users but not exposed on page load / in screenshots.
3. **Warn in DemoDataPage** — keep the feature but add a red warning in the `marketing_demo_password_hint` field: "Caution: this password will be visible in plain text on the public landing page."

Option 2 (masked + reveal toggle) is the recommended balance for a demo app.
