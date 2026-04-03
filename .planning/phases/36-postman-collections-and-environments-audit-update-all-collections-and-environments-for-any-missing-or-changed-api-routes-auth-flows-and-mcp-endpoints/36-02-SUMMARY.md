# 36-02 SUMMARY

**Phase:** 36-postman-collections-and-environments-audit
**Plan:** 02
**Status:** COMPLETE
**Commit:** 4377bda

## What Was Done

### Task 1: Full staleness audit of all 4 existing BX Finance collections

Audited `BX-Finance-1-Exchange-Step-by-Step`, `1-Exchange pi.flow`, `2-Exchange pi.flow`, `BX-Finance-Advanced-Utilities`.

**Fixes applied:**

**BX-Finance-1-Exchange-Step-by-Step.postman_collection.json:**
- Collection variable values cleared: `ENDUSER_AUDIENCE` and `MCP_RESOURCE_URI` had `pingdemo.com` defaults → cleared to `""` (env var takes precedence in Postman)
- Test label `'Step 1d: aud = ENDUSER_AUDIENCE (ai-agent.pingdemo.com)'` → removed pingdemo.com parenthetical
- Test label `'Step 2: aud = https://mcp-server.pingdemo.com'` → `'Step 2: aud = MCP_RESOURCE_URI'`
- `urlencoded[6].description` → `'{{MCP_RESOURCE_URI}} (set in shared environment)'`
- Request description text: replaced pingdemo.com occurrences with variable references

**BX Finance — 1-Exchange Delegated Chain — pi.flow:**
- `item[4].urlencoded[4].value` (RFC 8693 audience): `https://mcp-server.pingdemo.com` → `{{MCP_RESOURCE_URI}}`
- Collection variable[6] value cleared to `""`
- Test assertion: `'https://ai-agent.pingdemo.com'` → `pm.environment.get('ENDUSER_AUDIENCE')`
- Test assertion: `'https://mcp-server.pingdemo.com'` → `pm.environment.get('MCP_RESOURCE_URI')`

**BX-Finance-Advanced-Utilities:** Already clean — no changes needed.

### Task 2: Correct 2-exchange audience params + expand Advanced-Utilities

**BX Finance — 2-Exchange Delegated Chain — pi.flow audience corrections (per D-06):**

Confirmed mapping against `banking_api_server/services/agentMcpTokenService.js`:
- `item[4]` Step 5a (AI Agent Actor Token CC): `audience=https://agent-gateway.pingdemo.com` → `audience={{ENDUSER_AUDIENCE}}`
- `item[5]` Step 5b (Exchange #1): `audience=https://mcp-server.pingdemo.com` → `audience={{MCP_RESOURCE_URI}}`
- `item[6]` Step 6a (MCP Actor Token CC): `audience=https://mcp-gateway.pingdemo.com` → `audience={{MCP_RESOURCE_URI}}`
- `item[7]` Step 6b (Exchange #2): `audience=https://resource-server.pingdemo.com` → `audience={{MCP_RESOURCE_URI}}`

All test script assertions updated to use `pm.environment.get('MCP_RESOURCE_URI')` / `pm.environment.get('ENDUSER_AUDIENCE')`. Variable descriptions updated to reference `{{VARIABLE}}` instead of hardcoded pingdemo.com URLs.

**BX-Finance-Advanced-Utilities — 3 new BFF utility requests added (per D-03):**
- `BFF — GET /api/mcp/audit (tool-call events)` — uses `{{BANKING_API_BASE_URL}}`
- `BFF — GET /api/mcp/exchange-mode` — uses `{{BANKING_API_BASE_URL}}`
- `BFF — POST /api/mcp/exchange-mode (set mode)` — raw JSON body `{"mode": "1-exchange"}`

Total requests: 2 → **5**

## Verification
- All 4 collections: `pingdemo.com` → 0 matches → PASS
- 2-exchange all 4 audience params use `{{VARIABLE}}` → PASS
- Advanced-Utilities has 5 requests → PASS
- `BANKING_API_BASE_URL` in Advanced-Utilities → PASS

## Artifacts Modified
- `docs/BX-Finance-1-Exchange-Step-by-Step.postman_collection.json`
- `docs/BX Finance — 1-Exchange Delegated Chain — pi.flow.postman_collection.json`
- `docs/BX Finance — 2-Exchange Delegated Chain — pi.flow.postman_collection.json`
- `docs/BX-Finance-Advanced-Utilities.postman_collection.json`
