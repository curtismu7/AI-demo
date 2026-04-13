---
created: 2026-04-03T17:12:15.412Z
title: Update token exchange docs and education pages with canonical names, descriptions, scopes, and flow diagrams
area: docs
files:
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
  - docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md
  - banking_api_ui/src/components/education/
---

## Problem

After the Phase 46 naming standardization, the canonical names for all apps, resources, and scopes changed. Both token exchange docs still use old names (e.g. "BX Finance MCP Service", "BX Finance Resource Server") and don't reflect the final agreed naming convention. The education pages in the UI also need updating.

Additionally, a clear ASCII flow diagram showing the full token chain was produced in conversation — this belongs permanently in both docs and on the education page in the app.

## Solution

### 1. Update `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md`

Update all references to use canonical names:

**Apps (AI Agents group):**
- `BX Finance AI Agent` (was: BX Finance AI Agent App) — Exchange #1 exchanger
- `BX Finance MCP Token Exchanger` (was: BX Finance MCP Service) — Exchange #2 exchanger
- `BX Finance MCP Introspector` (was: BX Finance MCP ServiceV1) — introspection worker

**Apps (Applications group):**
- `BX Finance User App` (was: BX Finance User)
- `BX Finance Admin App` (was: BX Finance Banking App)

**Resources:**
- `BX Finance AI Agent Service` — audience: `https://ai-agent.pingdemo.com`
- `BX Finance Agent Gateway` — audience: `https://agent-gateway.pingdemo.com`
- `BX Finance MCP Server` — audience: `https://mcp-server.pingdemo.com`
- `BX Finance MCP Gateway` — audience: `https://mcp-gateway.pingdemo.com`
- `BX Finance Banking API` — audience: `https://resource-server.pingdemo.com`

**Scopes:**
- `banking:agent:invoke` on BX Finance AI Agent Service
- `agent:invoke` on BX Finance Agent Gateway
- `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` on BX Finance MCP Server + BX Finance Banking API
- `mcp:invoke` on BX Finance MCP Gateway

**Add the ASCII token chain flow diagram** (from conversation 2026-04-03):

```
[BX Finance User App]  ──login──▶  Subject Token  ──aud──▶  [BX Finance AI Agent Service] (resource)
                                         │
                    [BX Finance AI Agent] (app) ──CC──▶  [BX Finance Agent Gateway] (resource)
                                         │ Exchange #1
                                         ▼
                               Agent Exchanged Token  ──aud──▶  [BX Finance MCP Server] (resource)
                                         │
          [BX Finance MCP Token Exchanger] ──CC──▶  [BX Finance MCP Gateway] (resource)
                                         │ Exchange #2
                                         ▼
                                 Final MCP Token  ──aud──▶  [BX Finance Banking API] (resource)
```

### 2. Update `docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md`

Same naming updates. Add equivalent 1-exchange flow diagram:

```
[BX Finance User App]  ──login──▶  Subject Token  ──aud──▶  [BX Finance AI Agent Service] (resource)
                                         │
              [BX Finance MCP Token Exchanger] ──CC──▶  [BX Finance Agent Gateway] (resource)
                                         │ Exchange #1 (single hop)
                                         ▼
                                 Final MCP Token  ──aud──▶  [BX Finance MCP Server] (resource)
```

### 3. Update Education page in the app

Find the React component(s) under `banking_api_ui/src/components/education/` (or wherever token exchange education is rendered) and:
- Update all app/resource/scope names to canonical versions
- Embed the relevant flow diagram (as styled code block or SVG)
- Ensure the 2-exchange page shows the 3-token chain with nested `act.act` explanation
- Ensure the 1-exchange page shows the 2-token chain with single `act` explanation

### 4. Verify consistency

After all updates, do a search for old names in docs/ and UI source to confirm nothing was missed:
- `BX Finance MCP Service` (old exchanger name)
- `BX Finance Resource Server` (old final audience name)
- `BX Finance AI Agent App` (old agent app name)
- `BX Finance Banking App` (old admin app name)
- `BX Finance User` without "App" suffix
