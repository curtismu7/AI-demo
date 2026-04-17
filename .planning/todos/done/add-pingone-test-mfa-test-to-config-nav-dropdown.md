---
title: Add PingOne Test and P1MFA Test to config nav dropdown
area: ui
status: pending
created: 2026-04-14
priority: normal
---

## Problem

The pingone-test (`/pingone-test`) and mfa-test (`/mfa-test`) pages exist but are not accessible from the config dropdown menu in the nav.

## Solution

Add two entries to the config dropdown nav:
- **"PingOne Test"** → `/pingone-test`
- **"P1MFA Test"** → `/mfa-test`

Check `SideNav.js` (or equivalent nav/dropdown config) for the Configuration group and insert both items.

## Files

- `banking_api_ui/src/components/SideNav.js` — Configuration group items array
- `banking_api_ui/src/App.js` — confirm routes already exist

## Notes

Labels are: `"PingOne Test"` and `"P1MFA Test"` (not "MFA Test").
