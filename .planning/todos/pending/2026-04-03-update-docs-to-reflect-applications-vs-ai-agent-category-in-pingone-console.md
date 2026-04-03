---
created: 2026-04-03T18:49:44.307Z
title: Update docs to reflect Applications vs AI Agent category in PingOne console
area: docs
files:
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
  - docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md
---

## Problem

The token exchange setup guides (both 1-exchange and 2-exchange) currently say "Click **Add Application**" without specifying which PingOne app category to use. PingOne now has two distinct categories:

- **Applications** — standard OIDC/OAuth apps (user-facing apps, web apps)
- **AI Agents** — dedicated category for apps representing AI agent identities

The setup docs need to tell the reader:
- `Super Banking User App` → create under **Applications**
- `Super Banking AI Agent App` → create under **AI Agents**
- `Super Banking MCP Token Exchanger` → create under **AI Agents** (it's a service identity, not a user app)

Without this guidance, a reader setting up the PingOne environment for the first time will default to creating everything under Applications.

## Solution

For each app creation step in `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` and `PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md`, add a note or table row specifying the PingOne category:

- Step 2a (Super Banking User App) → **Applications**
- Step 2b (Super Banking AI Agent App) → **AI Agents**
- Step 2c (Super Banking MCP Token Exchanger) → **AI Agents**

Exact wording suggestion at the top of each app step:
> In the PingOne console sidebar, expand **Applications** → select **AI Agents** (or **Applications**) → click **Add Application**.

Cross-check with the reorganize-pingone-apps todo (`2026-04-03-reorganize-pingone-apps-oidc-agents-to-ai-agents-group-oidc-user-apps-to-applications-group.md`) once that work is done — the docs should match whatever final group structure is established.
