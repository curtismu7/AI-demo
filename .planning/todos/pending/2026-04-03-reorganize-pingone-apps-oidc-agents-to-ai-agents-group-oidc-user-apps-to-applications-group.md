---
created: 2026-04-03T17:12:15.412Z
title: Reorganize PingOne apps — OIDC agents to AI Agents group, OIDC user apps to Applications group
area: auth
files:
  - banking_api_server/.env
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
---

## Problem

PingOne now has a dedicated **"AI Agents"** app group for OIDC applications that represent AI agents (vs. user-facing apps). The current PingOne environment (`d02d2305`) has not been reorganized to reflect this:

- **AI Agent apps** (e.g., `BX Finance AI Agent App` — `80145519`, and `BX Finance MCP Service` — `d98f4336`) should be moved to the **AI Agents** group
- **User-facing OIDC apps** (e.g., `BX Finance User` — `5df1fbdb`, `BX Finance Banking App` — `949a748e`) should remain under the standard **Applications** group
- The **BX Finance MCP ServiceV1** (`bdf0fa76`) used for introspection may also belong under AI Agents

This distinction matters for Phase 46 naming standardization and for demo clarity when showing the PingOne console to stakeholders.

## Solution

1. In PingOne console (env `d02d2305`), move agent apps to the **AI Agents** group:
   - `BX Finance AI Agent App` (`80145519`) → AI Agents
   - `BX Finance MCP Service` (`d98f4336`) → AI Agents
   - `BX Finance MCP ServiceV1` (`bdf0fa76`) → AI Agents (used for introspection)
2. Keep user OIDC apps in **Applications**:
   - `BX Finance User` (`5df1fbdb`) → Applications
   - `BX Finance Banking App` (`949a748e`) → Applications
3. Update Phase 46 naming standard doc to call out the group distinction as a best practice
4. Validate that moving apps between groups has no effect on token behavior (it shouldn't — groups are organizational only)
