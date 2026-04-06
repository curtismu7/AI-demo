---
created: 2026-04-06T13:54:00.000Z
title: Add self-service button to side menu
area: ui
files:
  - banking_api_ui/src/components/
  - banking_api_ui/src/pages/
  - banking_api_ui/src/App.js
---

## Problem

Self-service user provisioning functionality was implemented in Phase 54 but there's no accessible UI for users to access it. Users need a way to easily access the self-service features from both the main landing page and the authenticated dashboards. Currently, the self-service endpoints exist but are only accessible via direct API calls, making them difficult to discover and use.

## Solution

Add a "Self Service" button/option to the side navigation menu on:
1. Main landing page (for unauthenticated users to create accounts)
2. Admin dashboard (for admins to manage users)
3. Customer dashboard (for users to manage their profiles)

The button should open a modal or navigate to a dedicated self-service page that provides:
- Account creation form for new users
- Profile management for existing users  
- mayAct configuration for admin users
- User management interface for admins

Implementation should reuse existing self-service API endpoints created in Phase 54 and provide a user-friendly interface for the functionality already built.
