---
created: 2026-04-12T21:46:14.214Z
title: Restore pingone-test and mfa-test pages — add to Chase top nav
area: ui
files:
  - banking_api_ui/src/components/ChaseTopNav.js:24-28
  - banking_api_ui/src/components/PingOneTestPage.jsx
  - banking_api_ui/src/components/MFATestPage.jsx
  - banking_api_ui/src/App.js:516-517
---

## Problem

The `/pingone-test` and `/mfa-test` pages exist and are routed in App.js (lines 516-517), but are not accessible from the Chase top nav (`ChaseTopNav.js`). The `navLinks` array (line 24) only has Home, Dashboard, and Config — the test pages have no entry point for users navigating the app.

## Solution

Add "PingOne Test" and "MFA Test" links to the `navLinks` array in `banking_api_ui/src/components/ChaseTopNav.js`. Consider gating MFA Test behind an admin/role check consistent with the `AdminRoute` wrapper already on the route in App.js.

Example addition:
```js
{ label: 'PingOne Test', path: '/pingone-test', pages: ['pingone-test'] },
{ label: 'MFA Test', path: '/mfa-test', pages: ['mfa-test'] },
```
