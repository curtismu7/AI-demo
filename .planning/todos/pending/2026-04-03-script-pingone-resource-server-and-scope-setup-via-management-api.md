---
created: "2026-04-03T18:29:45.574Z"
title: "Script PingOne resource server and scope setup via Management API"
area: "api"
files:
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
  - docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md
  - banking_api_server/services/
---

## Problem

Setting up all 5 Super Banking resource servers (Super Banking AI Agent Service, Agent Gateway, MCP Server, MCP Gateway, Banking API) with their scopes and attribute expressions via the PingOne console is tedious and error-prone. Every new environment or demo reset requires repeating 30+ console steps manually.

The PingOne Management API fully supports resource server and scope management programmatically:
- `POST /environments/{envId}/resources` — create resource server (name, audience, TTL)
- `POST /environments/{envId}/resources/{resourceId}/scopes` — add scopes
- `GET /environments/{envId}/resources` — list to check existing
- `PUT /environments/{envId}/resources/{resourceId}` — update audience/TTL
- Attribute expressions (`/resources/{resourceId}/attributes`) can also be created via API

This means the entire Part 1 setup from both token exchange docs could be automated as a single script.

## Solution

Create a setup script (e.g. `scripts/setup-pingone-resources.sh` or `scripts/setup-pingone.js`) that:

1. Uses a Worker app Client Credentials token (needs `p1:create:resource`, `p1:update:resource`, `p1:create:resourceScope`, `p1:read:resource` scopes — available on the PingOne API resource server for Worker apps)
2. Idempotently creates or confirms all 5 resource servers:
   - `Super Banking AI Agent Service` → audience `https://ai-agent.pingdemo.com`
   - `Super Banking Agent Gateway` → audience `https://agent-gateway.pingdemo.com` + scope `agent:invoke`
   - `Super Banking MCP Server` → audience `https://mcp-server.pingdemo.com` + scopes `banking:accounts:read/write/read` + `act` attribute expression
   - `Super Banking MCP Gateway` → audience `https://mcp-gateway.pingdemo.com` + scope `mcp:invoke`
   - `Super Banking Banking API` → audience `https://resource-server.pingdemo.com` + scopes `banking:accounts:read/write/read` + `act` attribute expression
3. Outputs resource IDs and audience values for verification
4. Does NOT create/modify apps — app creation and grant type assignment still requires console or a separate script

**Note on attribute expressions:** The `act` SpEL expressions can also be set via API (`POST /resources/{resourceId}/attributes`). This is the most complex part but fully documented in PingOne Management API reference.

**Worker app scopes needed (create a Worker app in PingOne → System type → enable these on PingOne API resource):**
- `p1:read:environment`
- `p1:create:resource`
- `p1:update:resource`
- `p1:read:resource`
- `p1:create:resourceScope`
- `p1:read:resourceScope`

**Key API reference:**
- `https://apidocs.pingidentity.com/pingone/platform/v1/api/#post-create-resource`
- `https://apidocs.pingidentity.com/pingone/platform/v1/api/#post-create-resource-scope`
- `https://apidocs.pingidentity.com/pingone/platform/v1/api/#post-create-resource-attribute`
