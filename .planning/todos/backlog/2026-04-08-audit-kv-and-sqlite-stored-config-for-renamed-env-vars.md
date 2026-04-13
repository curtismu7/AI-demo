---
created: 2026-04-08T12:22:27.551Z
title: Audit KV and SQLite stored config for renamed env vars
area: database
files:
  - banking_api_server/services/configStore.js:440-480
  - banking_api_server/services/pingoneBootstrapService.js:88-125
  - banking_api_server/services/pingOneClientService.js:40-55
---

## Problem

The env var rename refactor (commit ab9d1ee) updated `.env`, `env.example`, and all code
references so variable names match actual PingOne app/resource names:

  - `AI_AGENT_CLIENT_ID`       → `PINGONE_AI_AGENT_CLIENT_ID`
  - `AGENT_OAUTH_CLIENT_ID`    → `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`
  - `AGENT_OAUTH_CLIENT_SECRET`→ `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET`
  - `MCP_RESOURCE_URI`         → `PINGONE_RESOURCE_MCP_SERVER_URI`
  - `MCP_GATEWAY_AUDIENCE`     → `PINGONE_RESOURCE_MCP_GATEWAY_URI`
  - `MCP_RESOURCE_URI_TWO_EXCHANGE` → `PINGONE_RESOURCE_TWO_EXCHANGE_URI`
  - `ENDUSER_AUDIENCE`         value: `'banking_api_enduser'` → `'https://ai-agent.pingdemo.com'`
  - `AI_AGENT_AUDIENCE`        value: `'mcp_application'` → `'https://mcp-server.pingdemo.com'`

The `configStore.js` has backward-compat aliases so reading works. However, any values
**stored at runtime** (via the Admin /config UI or CIMD registration) in:
  - Upstash Redis KV (production/Vercel)
  - SQLite `config` table (local dev)

…may still be saved under the **old** key names (e.g. `agent_oauth_client_id`,
`ai_agent_client_id`, `mcp_resource_uri`). Reads will still resolve via aliases, but writes
from the config UI will now save under the new canonical key names — causing two copies of
the same credential to exist (old key written previously + new key written now).

## Solution

1. **Audit what keys are currently stored** in Upstash KV (use `update-upstash.sh` or direct
   Upstash REST to list keys with prefix `config:`) and local SQLite (`config` table).

2. **Migrate stored values**: For each renamed key, if old name exists in KV/SQLite and new
   name does not, copy old → new and optionally delete old.

3. **Update the config UI** (Admin → Configuration page, `banking_api_ui/src/components/`)
   to display new variable names so operators see `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`
   not `AGENT_OAUTH_CLIENT_ID`.

4. **Verify** by hitting `/api/config/effective` (or equivalent endpoint) and confirming
   the rendered values come from the correct key with correct audience URIs.

Backward-compat aliases in `configStore.getEffective()` can be removed once migration is
confirmed across all environments (local, Vercel preview, Vercel prod).
