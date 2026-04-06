---
created: 2026-04-03T17:12:15.412Z
title: Correct PingOne resource-scope mental model — resources are pre-created with audience, apps only pick scopes
area: auth
files:
  - banking_api_server/.env
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
---

## Problem

The agent gave incorrect PingOne console instructions:

> "Resources tab → click Add Resource → select BX Finance Agent Gateway → save"

This is wrong. PingOne does **not** work that way. The correct mental model is:

1. **Resources are created separately** (under `Connections → Resources`) with a defined audience URI (e.g. `https://agent-gateway.pingdemo.com`) and their own scopes defined on the resource itself.
2. **On an app's Resources tab**, you only **select scopes** from pre-existing resources — you do NOT create or "add" a resource there. The resource must already exist with the correct audience before you can pick its scopes on an app.

The agent must never again say "add a resource" on an app's Resources tab — apps only grant scopes from resources, they don't create resource associations.

## Solution

Update agent instructions / PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md to use correct language:

- **Correct:** "On the app's Resources tab, find `BX Finance Agent Gateway` and select the scopes you want to grant to this app"
- **Incorrect:** "Add Resource → select BX Finance Agent Gateway"

For the AI Agent App (`80145519`) specifically:
- Go to `Connections → Applications → BX Finance AI Agent App`
- **Resources tab** → find **BX Finance Agent Gateway** (audience: `https://agent-gateway.pingdemo.com`)
- Select any required scopes from that resource (or leave blank if the resource has no named scopes required for CC)
- Save

If BX Finance Agent Gateway doesn't appear on the Resources tab, it means the resource wasn't created yet or wasn't added to the environment's resource list — fix that in `Connections → Resources` first.
