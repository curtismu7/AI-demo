---
created: "2026-04-03T18:29:45.574Z"
title: "Update AGENT_OAUTH credentials in .env for recreated MCP Token Exchanger"
area: "api"
files:
  - banking_api_server/.env
  - banking_api_server/services/agentMcpTokenService.js
---

## Problem

The Super Banking MCP Token Exchanger PingOne app (`d98f4336-4c48-411d-8506-698416a9ce3a`) was deleted from PingOne. A replacement app needs to be created and its new Client ID + Client Secret must be entered in `banking_api_server/.env` before the 2-exchange delegation chain can be tested.

Current stale values in `.env`:
```
AGENT_OAUTH_CLIENT_ID=d98f4336-4c48-411d-8506-698416a9ce3a   ← DELETED in PingOne
AGENT_OAUTH_CLIENT_SECRET=FcuzefhZrom-bGyxXBLgNvsD...         ← STALE
```

Also need to verify that ALL env var names in `banking_api_server/.env` align with canonical Super Banking naming used by the code:
- `AGENT_OAUTH_CLIENT_ID` + `AGENT_OAUTH_CLIENT_SECRET` → Super Banking MCP Token Exchanger
- `AI_AGENT_CLIENT_ID` + `AI_AGENT_CLIENT_SECRET` → Super Banking AI Agent App
- `MCP_RESOURCE_URI` → must match Super Banking MCP Server audience (`https://mcp-server.pingdemo.com`)
- `AGENT_GATEWAY_AUDIENCE` → must match Super Banking Agent Gateway audience (`https://agent-gateway.pingdemo.com`)
- `MCP_GATEWAY_AUDIENCE` → must match Super Banking MCP Gateway audience (`https://mcp-gateway.pingdemo.com`)
- `MCP_RESOURCE_URI_TWO_EXCHANGE` → must match Super Banking Banking API audience (`https://resource-server.pingdemo.com`)

## Solution

1. In PingOne console: create `Super Banking MCP Token Exchanger` as Web App type with Client Credentials + Token Exchange grants. Enable `mcp:invoke` from Super Banking MCP Gateway and `banking:accounts:read/write/read` from Super Banking Banking API on its Resources tab.
2. Copy new Client ID and Secret from PingOne.
3. Open `banking_api_server/.env` and update:
   ```
   AGENT_OAUTH_CLIENT_ID=<new-client-id>
   AGENT_OAUTH_CLIENT_SECRET=<new-client-secret>
   ```
4. Verify all other audience vars match PingOne resource server Audience fields exactly.
5. Update Vercel env vars: remove stale `AGENT_OAUTH_CLIENT_ID` + `AGENT_OAUTH_CLIENT_SECRET`, re-add with new values. Also add `AI_AGENT_CLIENT_ID` + `AI_AGENT_CLIENT_SECRET` to Vercel if not already present.
6. Restart `run-bank.sh` and test 2-exchange flow.
