---
created: 2026-04-10T14:30:00.000Z
title: Fix token chain not updating
area: api
files:
  - banking_api_server/services/tokenChainService.js
  - banking_api_server/routes/tokenChain.js
  - banking_api_server/services/agentMcpTokenService.js
---

## Problem

Token chain tracking is not updating correctly when tokens are exchanged or refreshed. The token chain service may not be properly tracking token events, or the tracking calls are failing silently.

## Solution

Investigate tokenChainService.js and token exchange flows to:
- Verify trackTokenEvent is being called at all token exchange points
- Check if token events are being persisted correctly
- Add logging to track token chain updates
- Fix any missing trackTokenEvent calls in token exchange paths
