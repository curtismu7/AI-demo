---
created: "2026-04-03T18:29:45.574Z"
title: "Add inline ASCII flow diagrams to both token exchange docs"
area: "docs"
files:
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
  - docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md
---

## Problem

Both token exchange docs describe the token chain in prose and tables but lack a concise inline flow diagram that shows the full actor/resource topology at a glance. The doc for the 2-exchange pattern currently has a draw.io reference but no inline diagram that can be read without opening a separate file. The 1-exchange doc references a (renamed) drawio file but likewise has no inline view.

A specific diagram was produced in conversation that visually shows the 2-exchange chain with all actors and resources. All names must use canonical **Super Banking** naming (not the old "BX Finance" names).

## Solution

### 1. `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` — add this diagram in the "How It Works" section

Each arrow must show the **scope** that flows with it.

```
[Super Banking User App]  ──login (scope: banking:agent:invoke)──▶
        Subject Token  ──aud: https://ai-agent.pingdemo.com──▶  [Super Banking AI Agent Service] (resource)
                                         │
          [Super Banking AI Agent App] ──CC (scope: agent:invoke)──▶  [Super Banking Agent Gateway] (resource)
                                         │ Exchange #1  (subject_token + actor_token scoped to agent-gateway)
                                         ▼
                       Agent Exchanged Token  ──aud: https://mcp-server.pingdemo.com──▶  [Super Banking MCP Server] (resource)
                                         │
   [Super Banking MCP Token Exchanger] ──CC (scope: mcp:invoke)──▶  [Super Banking MCP Gateway] (resource)
                                         │ Exchange #2  (subject_token + actor_token scoped to mcp-gateway)
                                         ▼
                  Final MCP Token  ──aud: https://resource-server.pingdemo.com──▶  [Super Banking Banking API] (resource)
                                    scope: banking:accounts:read banking:transactions:read banking:transactions:write
```

### 2. `PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md` — add equivalent 1-exchange diagram in the "How It Works" section

```
[Super Banking User App]  ──login (scope: banking:agent:invoke)──▶
        Subject Token  ──aud: https://ai-agent.pingdemo.com──▶  [Super Banking AI Agent Service] (resource)
                                         │
     [Super Banking Admin App] ──client_id/secret (no actor token)──▶  Exchange #1
                                         │
                                         ▼
                         MCP Token  ──aud: https://mcp-server.pingdemo.com──▶  [Super Banking MCP Server] (resource)
                                    scope: banking:accounts:read banking:transactions:read banking:transactions:write
                                         │
   [Super Banking MCP Token Exchanger] ──CC (scope: p1:read:user p1:update:user)──▶  [PingOne API] (resource)
                                         (Client Credentials only — no token exchange)
                                         ▼
                    PingOne API Token  ──aud: https://api.pingone.com──▶  PingOne Management API
```

### Notes
- Both diagrams should be placed in a fenced code block in the "How It Works" / "Demo pattern" section, just above or below the existing token flow ASCII block already in each doc
- **Scope labels are required on every arrow** — this is the core ask from the user
- **Do NOT use "BX Finance"** — all names must be the canonical Super Banking names used throughout the updated docs
- The diagram the user provided used "BX Finance" names — treat that as the structural template, not the literal content
