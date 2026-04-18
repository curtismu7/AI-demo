---
created: 2026-04-18T10:00:47.453Z
title: Remove legacy two-step token exchange error from test page
area: ui
files:
  - banking_api_ui/src/components/PingOneTestPage.jsx
  - banking_api_ui/src/components/PingOneTestPage.css
---

## Problem

The PingOneTestPage displays the legacy two-step token exchange flow ("User Token → Agent Token → MCP Token (Legacy Two-Step)") with a visible FAILED error state. This flow is deprecated in favor of the new dual-token exchange (Phase 184 & 186). The failed display is confusing for test page users and should be removed.

Current state: Shows red FAILED box with "Token exchange failed" message that doesn't add value post-Phase 184.

## Solution

Remove the legacy two-step exchange card/section from PingOneTestPage entirely. Keep only:
1. Exchange 1: Direct MCP token exchange (1-token flow)
2. Exchange 2: Dual-token exchange (Phase 184, 186, 187)

Files to update:
- `TEST_CONFIG` exchange definitions (remove legacy entry)
- Component JSX (remove legacy card rendering)
- CSS (remove any dedicated legacy styles if no longer needed)

This aligns with Phase 187 scope: "Update docs, test page, anyplace we do 1 token exchange" — focus on active flows only.
