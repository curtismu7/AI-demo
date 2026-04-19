---
phase: 197-fix-phase-193-regression-sidenav-missing-on-unauthenticated-dashboard
plan: 01
status: complete
---

## Summary

Fixed Phase 193 regression where the sidebar was missing from the unauthenticated `/dashboard` route. Guests clicking "Explore Demo" or "Try as Customer" now see the full navigation sidebar and can explore the app without forced login.

## Root Cause

Phase 193 (`2310f01`) moved the `/dashboard` route from inside the catch-all route to an explicit outer route. The authenticated branch included `<AdminSideNav>`, but the **unauthenticated branch** (used by guests) omitted it entirely, rendering only `TopNav + UserDashboard`.

## Changes

- **App.js (line 607):** Added `<AdminSideNav user={null} />` to the unauthenticated `/dashboard` branch so guests see the sidebar.
- **AdminSideNav.jsx:**
  - Used spread syntax in `actionItems` array to conditionally show auth-dependent actions (Switch Role, Log Out) only when `user` exists
  - Added "Sign In" action (🔑 icon) for guests instead of Log Out
  - Added `case 'sign-in'` handler to `handleAction()` that redirects to `/api/auth/oauth/user/login?return_to=/dashboard`
  - Added "Postman Collections" to System Tools section (earlier uncommitted work)

## Key Files

- `banking_api_ui/src/App.js`
- `banking_api_ui/src/components/AdminSideNav.jsx`

## Verification

- ✅ Build passes (`npm run build` exit 0)
- ✅ Unauthenticated `/dashboard` renders sidebar
- ✅ Guest action menu shows "Dark Mode" + "Sign In"
- ✅ Authenticated users see normal "Switch Role" + "Log Out" + "Dark Mode"
- ✅ Sign In button triggers OAuth login with proper return_to

## Regression Prevention

Added to [REGRESSION_PLAN.md](../../../REGRESSION_PLAN.md) §4 (Bug Fix Log):

**Phase 197:** Fixed sidebar missing on unauthenticated `/dashboard` (Phase 193 regression). Root cause: explicit `/dashboard` route in outer Routes had no `<AdminSideNav>` in guest branch. Fix: added `<AdminSideNav user={null} />` to unauthenticated branch; made AdminSideNav action items guest-aware (show Sign In instead of Log Out/Switch Role when `!user`). Files: `App.js`, `AdminSideNav.jsx`. Build: ✅
