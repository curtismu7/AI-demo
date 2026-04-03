# 36-03 SUMMARY

**Phase:** 36-postman-collections-and-environments-audit
**Plan:** 03
**Status:** COMPLETE
**Commit:** 4377bda

## What Was Done

### Task 1: Created docs/BX-Finance-MCP-Tools.postman_collection.json

New Postman Collection v2.1 covering MCP server direct HTTP endpoints:

1. **MCP Server Discovery** (`GET {{MCP_SERVER_URL}}/.well-known/mcp-server`) — public discovery manifest, no auth, returns serverInfo/capabilities/tools[]/oauth_metadata_url
2. **MCP Audit Trail** (`GET {{MCP_SERVER_URL}}/audit?limit=20`) — recent tool-call events, optional query params (agentId, operation, outcome, eventType, limit)

All URLs use `{{MCP_SERVER_URL}}` from BX-Finance-Shared environment (added in plan 36-01).

### Task 2: Created docs/BX-Finance-BFF-API.postman_collection.json

New Postman Collection v2.1 covering new BFF API endpoints added in phases 29–34:

1. **GET /api/mcp/audit** — BFF proxy to MCP server audit, graceful fallback
2. **GET /api/mcp/exchange-mode** — returns current 1-exchange|2-exchange mode
3. **POST /api/mcp/exchange-mode** — set mode, raw JSON body, no auth
4. **GET /api/rfc9728** — RFC 9728 protected resource metadata, no auth
5. **POST /api/mcp/inspector/invoke** — invoke MCP tool via inspector, includes sensitive data tool example referencing `{{BANKING_SENSITIVE_SCOPE}}`

All URLs use `{{BANKING_API_BASE_URL}}` from BX-Finance-Shared environment (added in plan 36-01). No hardcoded hostnames.

## Verification
- MCP-Tools: valid Collection v2.1, 2 requests, `MCP_SERVER_URL` used, `well-known` present → PASS
- BFF-API: valid Collection v2.1, 5 requests, `BANKING_API_BASE_URL` used, mcp/audit + rfc9728 + inspector present → PASS

## Artifacts Created
- `docs/BX-Finance-MCP-Tools.postman_collection.json` (2 requests)
- `docs/BX-Finance-BFF-API.postman_collection.json` (5 requests)
