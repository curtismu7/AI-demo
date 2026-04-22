---
created: 2026-04-22T13:05:28.485Z
title: Add clear token reset button
area: ui
files:
  - banking_api_ui/src/components/PingOneTestPage.jsx:1149
---

## Problem

The PingOne Test page needs a clear token action that fully logs the user out and clears page-level token state so the screen can be restarted from a clean baseline. The current Clear Token behavior is not explicit enough about what is cleared, and the page can remain in a partially-hydrated state after token operations. The desired behavior is to clear session/user/admin/MCP-related tokens, preserve the worker token configuration, and reset the page UI so token exchange and entity explorer flows start over cleanly.

## Solution

Update the PingOne Test page clear-token action to call the proper logout/session-clearing path, preserve worker-token credentials/config, and reset local component state after the clear completes. Verify the page returns to a clean initial state with no stale decoded tokens, exchange results, or entity explorer carry-over. Audit whether backend logout/session endpoints also need a dedicated "clear test tokens but keep worker token config" path.