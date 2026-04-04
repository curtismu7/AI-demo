---
created: 2026-04-04T11:22:41.040Z
title: Update Step by Step education panel with real aud may_act values and both exchange modes
area: ui
files:
  - banking_api_ui/src/components/education/MayActPanel.js:36-64
  - banking_api_server/.env (AI_AGENT_CLIENT_ID, MCP_RESOURCE_URI, AI_AGENT_AUDIENCE)
---

## Problem

The "Step by step" tab in `MayActPanel.js` (the "How the AI acts on your behalf" drawer) uses
hardcoded placeholder strings instead of the actual values this repo configures:

- `"client_id": "ai-banking-agent"` — should be the real `AI_AGENT_CLIENT_ID` from config
- `"sub": "your-user-id"` — should reflect the real subject format
- `"act": { "sub": "ai-banking-agent" }` — placeholder, not the real actor client ID
- No `aud` claim shown at all — but `aud` is a key educational point (token is scoped to MCP resource URI)
- Only one token exchange mode shown — does not distinguish between 1-exchange (`act` = agent) vs
  2-exchange (`act.sub` = agent, `act.act.sub` = MCP server)

This makes the panel misleading during a demo — a customer can look at the real Token Chain panel
and see completely different IDs than what the education panel shows.

## Solution

1. **Wire real config values into the code snippets** — The panel already receives props or can read
   from runtimeSettings / the live token context. Replace hardcoded strings:
   - `may_act.client_id` → real `AI_AGENT_CLIENT_ID` (or shorten to last 8 chars + `…` for display)
   - `act.sub` → same real agent client ID
   - Add `aud` line: `"aud": "<MCP_RESOURCE_URI>"  ← scoped to the MCP server only`

2. **Show both exchange modes** — add a toggle or two labelled subsections:

   **1-Exchange (default):**
   ```
   "sub": "<user-id>"           ← the action benefits you
   "act": { "sub": "<agent-id>" }  ← the AI is doing it
   "aud": "<mcp-resource-uri>"  ← scoped to MCP only
   ```

   **2-Exchange (FF_TWO_EXCHANGE_DELEGATION=true):**
   ```
   "sub": "<user-id>"                      ← the action benefits you
   "act": {
     "sub": "<agent-id>",                  ← the AI is doing it
     "act": { "sub": "<bff-client-id>" }   ← via the BFF
   }
   "aud": "<mcp-resource-uri>"
   ```

3. **Optionally** read the active exchange mode from `runtimeSettings.ff_two_exchange_delegation`
   and highlight which mode is currently active with a badge: "Active in this session".

Key env vars to source display values from (server-side configStore → exposed via /api/config):
- `AI_AGENT_CLIENT_ID` = `2533a614-fcb6-4ab9-82cc-9ab407f1dbda`
- `MCP_RESOURCE_URI` = `https://ai-agent.pingdemo.com`
- `PINGONE_USER_CLIENT_ID` (BFF client, used as `act.act.sub` in 2-exchange)

The panel already has an `EduImplIntro` component and live token context — use those patterns.
Do NOT hardcode the actual UUIDs in JSX; read from config/runtimeSettings so they stay accurate
across environments.
