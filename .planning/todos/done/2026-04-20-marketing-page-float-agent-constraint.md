---
created: 2026-04-20T00:00:00.000Z
title: Marketing pages should only show float agent, never bottom positioning
area: ui
files:
  - banking_api_ui/src/pages/Landing.js
  - banking_api_ui/src/pages/Features.js
  - banking_api_ui/src/pages/Pricing.js
  - banking_api_ui/src/components/BankingAgent.js
---

## Problem

Marketing pages (Landing, Features, Pricing, etc.) currently may display the BankingAgent in bottom positioning mode, which conflicts with the marketing-only design intent. The agent positioning logic needs to enforce that marketing pages always use float mode (the default and most appropriate positioning for these pages).

## Solution

Implement a constraint in BankingAgent.js or agent decision logic that:
- Detects when rendering on a marketing page (via route or context flag)
- Forces agent positioning to `float` mode, ignoring any bottom mode preference
- Ensures the default float positioning is always applied for marketing routes
- Document this constraint to prevent future regressions

This keeps marketing pages clean and focused without agent intrusion into page content flow.
