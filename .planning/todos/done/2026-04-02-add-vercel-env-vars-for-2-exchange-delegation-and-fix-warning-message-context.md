---
created: "2026-04-02T01:06:44.348Z"
title: "Add Vercel env vars for 2-exchange delegation and fix warning message context"
area: "api"
files:
  - banking_api_ui/src/components/DemoDataPage.js:1423
  - banking_api_server/services/agentMcpTokenService.js:806
  - banking_api_server/env.example
---

## Problem

Two related issues:

1. **Vercel deployment is missing required env vars** for the 2-Exchange Delegated Chain. When `ff_two_exchange_delegation` is ON, the BFF requires `AI_AGENT_CLIENT_ID`, `AI_AGENT_CLIENT_SECRET`, `AGENT_OAUTH_CLIENT_ID`, `AGENT_OAUTH_CLIENT_SECRET`, and `MCP_RESOURCE_URI_TWO_EXCHANGE`. These must be set in Vercel's environment variable dashboard. Currently no reminder or checklist ensures this is done before deploying.

2. **The ⚠️ warning message in DemoDataPage.js** (line 1423) says to "set `AI_AGENT_CLIENT_ID` + `AI_AGENT_CLIENT_SECRET` env vars" — with no context about *where* to set them. The message reads as if it's a local developer instruction, but for Vercel deployments the variables are set in the Vercel project settings (not `.env` or `env.example`). The message should clarify: "set these in Vercel → Settings → Environment Variables (or your `.env` file for local dev)."

## Solution

1. **Update the warning message** in `DemoDataPage.js` at line 1423 to read:
   > ⚠️ Also enable the **"2-Exchange Delegated Chain"** feature flag and set `AI_AGENT_CLIENT_ID` + `AI_AGENT_CLIENT_SECRET` in **Vercel → Settings → Environment Variables** (or `.env` for local dev).

2. **Add a Vercel env-var checklist section** — either in the Config.js Vercel Config card or in the DemoData 2-exchange section — listing the full set of required vars for 2-exchange mode:
   - `AI_AGENT_CLIENT_ID`
   - `AI_AGENT_CLIENT_SECRET`
   - `AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD` (default: `basic`)
   - `AI_AGENT_INTERMEDIATE_AUDIENCE`
   - `AGENT_OAUTH_CLIENT_ID`
   - `AGENT_OAUTH_CLIENT_SECRET`
   - `MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD` (default: `basic`)
   - `MCP_RESOURCE_URI_TWO_EXCHANGE` (default: `https://resource-server.pingdemo.com`)
   - Feature flag: `ff_two_exchange_delegation=true` (via config page or env var)

3. **Consider updating the "not configured" BFF error** (`agentMcpTokenService.js` line 806) to also mention Vercel: "Set these env vars in Vercel → Settings → Environment Variables and redeploy."
