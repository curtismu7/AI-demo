---
plan: "264-03"
status: complete
---

## What was done
- Added "Docs & Setup" 4th tab to McpGatewayConfig with 3 doc cards (PingGateway docs, AAM guide, agent security guide)
- Replaced flat Real PingGateway tab content with 5-step wizard
- Step 1: PingOne credential status (auto-read from BFF config)
- Step 2: Route config form (6 fields: 3 read-only derived + 3 editable) with live JSON preview and Save/Download buttons
- Step 3: Route file download with path instructions
- Step 4: admin.json snippet with copy button
- Step 5: BFF .env instructions
- Compliance note: "compatible with PingGateway 2025.11.1 and 2026"
- routeForm state seeded from BFF GET response (introspectEndpoint, pingOneResourceId, gatewayPublicUrl, mcpScope)
- Required badge shown on empty required fields (pingOneResourceId, gatewayUrl)
- Live JSON preview client-side (no API call)
- Save to Config POSTs mcp_gw_client_id, mcp_gw_public_url, mcp_scope to BFF

## Verification
- npm run build exits 0

## Files changed
- banking_api_ui/src/components/McpGatewayConfig.jsx
- banking_api_ui/src/components/McpGatewayConfig.css
