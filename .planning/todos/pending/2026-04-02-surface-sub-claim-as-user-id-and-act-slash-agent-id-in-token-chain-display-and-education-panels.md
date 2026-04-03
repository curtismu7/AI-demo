---
created: 2026-04-02T00:00:00.000Z
title: Surface sub claim as user ID and act/agent ID in token chain display and education panels
area: ui
files:
  - banking_api_ui/src/components/TokenChainDisplay.js
  - banking_api_ui/src/components/TokenChainDisplay.css
  - banking_api_ui/src/components/education/TokenExchangePanel.js
---

## Problem

The token chain display shows raw JWT claims but does not visually call out the two most important identity claims:
- `sub` — the user's identity (who the token is for)
- `act.sub` — the agent/actor identity (who is acting on behalf of the user, per RFC 8693)

In the RFC 8693 token exchange model, the identity chain is: `sub` = user, `act.sub` = AI agent client, nested `act.act.sub` = MCP server (2-exchange). This is the core demo story but it is buried in a wall of JSON claims.

## Solution

Make `sub` and `act.sub` first-class visual citizens in the token display:

1. **TokenChainDisplay** — in each token node/card, render a dedicated identity row above the claims JSON:
   - "👤 User: `{sub}`" (resolved to display name if available, fallback to raw UUID)
   - "🤖 Agent: `{act.sub}`" (only present on exchanged tokens — the agent client ID)
   - "🔗 MCP: `{act.act.sub}`" (only present on 2-exchange tokens — the MCP server client ID)
   - Use distinct label+value pill styling (not buried in the JSON pre block)

2. **Token anatomy tooltip / callout** — when hovering or expanding a token node, show a one-liner:
   - "This token says: **{user display name}** authorized **{agent name}** to act as them"

3. **Education panel callout** — in `TokenExchangePanel.js` (or the `AgentBuilderLandscapePanel` comparison), add a callout box: "In a delegated token: `sub` = the human user, `act.sub` = the AI agent, `act.act.sub` = the MCP server (2-exchange only)."

4. **Chip / quick-explain** — "Who is in this token?" chip in the Banking Agent that resolves the current token's `sub` and `act.sub` and explains them in plain English.

Ensure `sub` values that are UUIDs fall back gracefully — show truncated UUID (`abc123...`) with copy-on-click.
