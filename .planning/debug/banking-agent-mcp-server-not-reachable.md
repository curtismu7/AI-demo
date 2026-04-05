---
status: awaiting_human_verify
trigger: "Banking Agent UI shows 'Banking Agent is unavailable. The MCP server is not reachable.'"
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:20:00Z
---

## Current Focus

hypothesis: CONFIRMED — GET /api/mcp/inspector/tools in mcpInspector.js does not handle token exchange failures (PingOne 401 "Unsupported auth method"). Returns 502 → UI isConnErr=true → "Banking Agent unavailable". The fix in e2324b7 fixed POST /api/mcp/tool but not GET /api/mcp/inspector/tools.
test: Applied fix to mcpInspector.js catch block for sessionTokenForDiscovery — mirror isExchangeScopeError from server.js, fall back to local catalog instead of 502
expecting: After fix, clicking MCP Tools returns local catalog (200) even when PingOne exchange fails with 401
next_action: Build UI, verify, submit for human verification

## Symptoms

expected: Opening the banking agent shows the chat interface with tool chips. MCP tools are available and can be invoked.
actual: Agent panel shows a full red error box: "Banking Agent is unavailable. The MCP server is not reachable." with text "Local: cd banking_mcp_server && npm run dev" and "Hosted: set MCP_SERVER_URL to your reachable MCP server URL"
errors: "Banking Agent is unavailable. The MCP server is not reachable."
reproduction: Open the banking demo UI, click on the Banking Agent or MCP Tools button.
started: April 4, 2026 — after gsd-debugger modified mcpLocalTools.js and server.js to add step-up gates

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-04T00:10:00Z
  checked: Vercel env ls
  found: MCP_SERVER_URL IS set on Vercel Production (added 1d ago). MCP_RESOURCE_URI also set. User's context saying "MCP_SERVER_URL is not set" was incorrect — it IS set, pointing to Render-hosted MCP server.
  implication: Token exchange with PingOne IS attempted for GET /api/mcp/inspector/tools

- timestamp: 2026-04-04T00:11:00Z
  checked: mcpInspector.js GET /tools route — sessionTokenForDiscovery catch block (lines ~144-148)
  found: "catch (err) { return res.status(502).json({ error: 'token_resolution_failed', message: err.message }); }" — NO fallback to local catalog when token exchange fails
  implication: Any PingOne 401/400 during token exchange → 502 to UI → isConnErr=true → "Banking Agent unavailable"

- timestamp: 2026-04-04T00:12:00Z
  checked: server.js POST /api/mcp/tool isExchangeScopeError (e2324b7 fix)
  found: isExchangeScopeError catches err.httpStatus===400, err.code==='token_exchange_failed', OR (err.httpStatus===401 && err.pingoneError) → falls back to local handler. But GET /api/mcp/inspector/tools has NO equivalent fallback.
  implication: Same 401 from PingOne that was fixed for POST /api/mcp/tool still breaks GET /api/mcp/inspector/tools

- timestamp: 2026-04-04T00:13:00Z
  checked: BankingAgent.js isConnErr check (line 1732-1742)
  found: isConnErr = err.message.includes('502') among other checks. GET /api/mcp/inspector/tools returns 502 → UI throws "MCP tools fetch failed: 502" → isConnErr=true → full error panel
  implication: 502 from inspector endpoint directly causes "Banking Agent unavailable" message

- timestamp: 2026-04-04T00:14:00Z
  checked: oauthService.js performTokenExchange/performTokenExchangeWithActor error handling
  found: richErr.httpStatus=401, richErr.pingoneError set when PingOne returns 401 during exchange
  implication: err.httpStatus===401 && err.pingoneError will be true for the "Unsupported auth method" case

## Resolution

root_cause: GET /api/mcp/inspector/tools in mcpInspector.js does not handle PingOne token exchange failures. When exchange fails with 401 (err.httpStatus===401 && err.pingoneError), the catch block returns res.status(502), triggering isConnErr=true in the UI ("Banking Agent is unavailable"). The identical fix was applied to POST /api/mcp/tool in e2324b7 but GET /api/mcp/inspector/tools was missed.
fix: |
  In banking_api_server/routes/mcpInspector.js, GET /tools route:
  Changed the sessionTokenForDiscovery catch block to check isExchangeScopeError
  (err.httpStatus===400, err.code==='token_exchange_failed', or (err.httpStatus===401 && err.pingoneError))
  and call respondLocalCatalog() instead of returning 502 in those cases.
  Only genuine non-exchange errors still return 502.
  npm run build → exit 0 ✓
verification: UI build passes. Human verification needed — click MCP Tools on Vercel production and confirm local catalog is returned (200) rather than 502.
files_changed: [banking_api_server/routes/mcpInspector.js]

## Resolution

root_cause:
fix:
verification:
files_changed: []
