---
created: 2026-04-11T13:43:56.799Z
title: Show tokens for each call with ability to decode them
area: ui
files:
  - banking_api_server/services/
  - banking_api_ui/src/components/PingOneTestPage.jsx
---

## Problem

Need to display tokens for each API call with the ability to decode JWT tokens. The token display should be collapsible for each token since there will be many tokens. A service is needed to handle token decoding and display logic to avoid code duplication across components.

## Solution

Create a token service that:
- Provides JWT token decoding functionality
- Manages collapsible token display state
- Can be integrated into PingOne test page and other components
- Shows token metadata (issuer, audience, expiry, scopes) in a user-friendly format
- Allows users to expand/collapse individual token details


---

## TRIAGE 2026-05-15 — CLOSED (DONE / superseded)

Shipped. `DecodedTokenPanel.jsx` (collapsible header/payload/scopes/timing), `TokenChainDisplay.js`, `UnifiedTokenFlowInspector.jsx`, `TokenChainContext.js`. BFF pre-decodes JWTs server-side (token-custody rule) and the UI renders per-call decoded claims collapsibly. Done.
