---
created: 2026-04-22T13:07:29.105Z
title: Fix PingOne token policy explorer
area: api
files:
  - banking_api_ui/src/components/PingOneTestPage.jsx:2928
  - banking_api_server/routes/pingoneTestRoutes.js:287
  - banking_api_server/services/pingoneManagementService.js:598
---

## Problem

The PingOne Test page shows `SPEL/Policies (0)` with the message that no token policies were returned and suggests the worker token may be missing `p1:read:environment:tokenPolicies`. This leaves the Entity Explorer incomplete and makes it unclear whether the issue is missing worker-token scope, missing Management API permission, or a backend fetch/parsing problem in the token-policies path.

## Solution

Audit the worker-token scope and PingOne Management API permission set, then verify the backend `getTokenPolicies()` call and the `verify-assets` response shaping used by the PingOne Test page. Improve the UI/error state so it distinguishes between `no policies exist`, `insufficient worker-token scope`, and `request/parsing failure` instead of collapsing all of them into an empty list.