---
created: 2026-04-03T19:00:00.000Z
title: Audit PingOne apps for missing apps including Super Banking Admin App
area: auth
files:
  - banking_api_server/.env
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
---

## Problem

After the credential update session, we noticed the PingOne **Super Banking Admin App** is not visible / may be missing from the environment (`d02d2305`). It is referenced in the 2-exchange coexistence table as the Exchange #1 exchanger for 1-exchange mode (bypassed when `ff_two_exchange_delegation=true`), and its client ID is used as `PINGONE_ADMIN_CLIENT_ID` in `.env`.

Current `.env` value: `PINGONE_ADMIN_CLIENT_ID=949a748e-4dd0-44a3-944e-721ee1e3ca16`

No admin client secret update was provided — it may be that the app was deleted or renamed and the UUID is stale.

**Full apps that should exist in PingOne env `d02d2305`:**
- `Super Banking User App` — OIDC login for end users (`PINGONE_USER_CLIENT_ID`) ✅ updated
- `Super Banking Admin App` — OIDC login for admin users (`PINGONE_ADMIN_CLIENT_ID`) ❓ status unknown
- `Super Banking MCP Token Exchanger` — CC + Token Exchange for MCP service (`AGENT_OAUTH_CLIENT_ID`) ✅ updated
- `Super Banking AI Agent App` — CC + Token Exchange for AI Agent (`AI_AGENT_CLIENT_ID`) ✅ updated
- Any Worker apps used for introspection (e.g. `BX Finance MCP ServiceV1` — `bdf0fa76`)

## Solution

1. Log into PingOne console (env `d02d2305`) → **Applications → Applications** and **Applications → AI Agents**
2. Confirm which apps are present and note their client IDs
3. Identify any missing apps (especially `Super Banking Admin App`)
4. If `Super Banking Admin App` is missing: recreate it per the setup guide and update `PINGONE_ADMIN_CLIENT_ID` + `PINGONE_ADMIN_CLIENT_SECRET` in `.env` and Vercel
5. Cross-check with the reorganize-pingone-apps todo (`2026-04-03-reorganize-pingone-apps-oidc-agents-to-ai-agents-group-oidc-user-apps-to-applications-group.md`) — once we know what exists, move apps to correct groups
6. Update the `.env` and Vercel for any stale UUIDs found
