---
plan: "264-01"
status: complete
---

## What was done
- Extended GET /api/admin/mcp-gateway/config to include: pingOneEnvUrl, pingOneResourceId, gatewayPublicUrl, upstreamMcpUrl, mcpScope, introspectEndpoint
- introspectEndpoint derived as pingOneEnvUrl + '/as/introspect'
- mcpScope defaults to 'banking:mcp:invoke' (was hardcoded 'test')
- pingOneResourceId now falls back to configStore.getEffective('mcp_gw_client_id') when MCP_GW_CLIENT_ID env not set
- gatewayPublicUrl now falls back to configStore.getEffective('mcp_gw_public_url') when MCP_GW_RESOURCE_URI env not set
- Expanded POST allowlist with: mcp_gw_client_id, mcp_gw_public_url, mcp_scope
- POST persists new keys via configStore.setRaw() after successful gateway push

## Tests
Created banking_api_server/tests/mcpGatewayConfig.test.js — all 13 tests pass.

## Files changed
- banking_api_server/routes/mcpGatewayConfig.js
- banking_api_server/tests/mcpGatewayConfig.test.js (new)
