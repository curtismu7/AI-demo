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

```
[Super Banking User App]  ──login──▶  Subject Token  ──aud──▶  [Super Banking AI Agent Service] (resource)
                                         │
          [Super Banking AI Agent App] ──CC──▶  [Super Banking Agent Gateway] (resource)
                                         │ Exchange #1
                                         ▼
                               Agent Exchanged Token  ──aud──▶  [Super Banking MCP Server] (resource)
                                         │
   [Super Banking MCP Token Exchanger] ──CC──▶  [Super Banking MCP Gateway] (resource)
                                         │ Exchange #2
                                         ▼
                                 Final MCP Token  ──aud──▶  [Super Banking Banking API] (resource)
```

### 2. `PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md` — add equivalent 1-exchange diagram in the "How It Works" section

```
[Super Banking User App]  ──login──▶  Subject Token  ──aud──▶  [Super Banking AI Agent Service] (resource)
                                         │
        [Super Banking Admin App] ──CC──▶  [Super Banking Agent Gateway] (resource)
                                         │ Exchange #1
                                         ▼
                                 MCP Token  ──aud──▶  [Super Banking MCP Server] (resource)
                                         │
   [Super Banking MCP Token Exchanger] ──CC──▶  [PingOne API] (resource)
                                         (Client Credentials only — no exchange)
                                         ▼
                             PingOne API Token  ──aud──▶  PingOne Management API
```

### Notes
- Both diagrams should be placed in a fenced code block in the "How It Works" / "Demo pattern" section, just above or below the existing token flow ASCII block already in each doc
- **Do NOT use "BX Finance"** — all names must be the canonical Super Banking names used throughout the updated docs
- The diagram the user provided used "BX Finance" names — treat that as the structural template, not the literal content
