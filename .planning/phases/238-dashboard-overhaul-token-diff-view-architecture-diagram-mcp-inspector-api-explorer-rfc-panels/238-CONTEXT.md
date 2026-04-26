# Phase 238 Context — Dashboard Overhaul

## Goal
Replace the current placeholder-heavy dashboard with a full educational learning center:
1. **Token Diff Panel** — horizontal side-by-side JWT claim comparison across each exchange hop
2. **Architecture Diagram** — interactive system diagram matching the Lucidchart (User → OLB App → PF/AIC/P1 → agent1/LLM → MCP GW → MCP OLB/Invest → APIs)
3. **MCP Inspector** — full JSON-RPC request/response pairs for every MCP interaction
4. **API Explorer** — expandable accordion for every BFF API call with request+response bodies
5. **Dashboard reorganization** — unified tabbed Learning Center integrating all panels
6. RFC links on all educational content using Phase 237's `RfcLink` component

## Depends on
Phase 237 (RfcLink component, TokenAudienceChain, RFC 8693 annotations on TokenChainDisplay)

## Key existing infrastructure

### Components already available
- `banking_api_ui/src/components/TokenChainDisplay.js` — shows live token chain; events from `TokenChainContext`
- `banking_api_ui/src/components/DevToolsDashboard.jsx` — floating panel with Token Chain / Flow Inspector / MCP Traffic tabs
- `banking_api_ui/src/components/McpTrafficPage.js` — polls `/api/mcp/traffic` every 3s; shows BFF↔MCP+PingOne entries
- `banking_api_ui/src/components/McpInspector.js` — tools/list + tools/call invocation with call history
- `banking_api_ui/src/components/ApiCallDisplay.jsx` — polls `/api/api-calls`; shows categorized API call list
- `banking_api_ui/src/components/ApiCallsModal.js` — modal wrapper around ApiCallDisplay
- `banking_api_ui/src/components/ArchitectureTabsPanel.jsx` — two tabs: "System Architecture" (placeholder text) + "Token Exchange Flow" (TokenExchangeFlowDiagram)
- `banking_api_ui/src/components/education/TokenAudienceChain.js` — CSS diagram: User Token → GW Token → Backend Token
- `banking_api_ui/src/config/rfcLinks.js` — RFC_LINKS constant (RFC_8693, RFC_9728, RFC_7521, RFC_7636, RFC_6749, MCP_SPEC)
- `banking_api_ui/src/components/shared/RfcLink.js` — reusable clickable RFC link with external icon

### Data shapes
Token chain events (from `useTokenChainOptional()`):
```js
event = {
  id: 'user_token' | 'agent_cc_token' | 'mcp_token' | ...,
  label: 'User Token' | ...,
  status: 'active' | 'acquired' | 'exchanged' | 'waiting' | ...,
  claims: { sub, aud, act, may_act, scope, client_id, exp, iat, ... } | null,
  alg: 'RS256' | ...,
  exchangeMethod: '2-exchange' | '1-exchange' | ...,
  tokenType: 'user' | 'agent' | 'mcp' | ...,
}
```

MCP traffic entries (from `GET /api/mcp/traffic`):
```js
entry = {
  id, ts, type: 'rpc_request' | 'rpc_response' | 'exchange_request' | ...,
  dir: 'BFF→MCP' | 'MCP→BFF' | 'BFF→PingOne' | ...,
  ok: boolean, summary: string,
  request: { ... } | null, response: { ... } | null,
}
```

API call entries (from `GET /api/api-calls?sessionId=...`):
```js
call = {
  id, category, method, url, status, duration,
  request: { headers, body } | null,
  response: { body } | null,
  timestamp,
}
```

### Ports & services
- UI: 3000 (dev) / 4000 (run-bank.sh)
- BFF: 3001 (dev) / 3002 (run-bank.sh)
- MCP OLB: 8080, MCP Gateway: 3005, MCP Invest: 8081

## Regression protection
Read `REGRESSION_PLAN.md §1` before touching Dashboard.js, TokenChainDisplay.js, or any OAuth/session path.
The Token Chain (TokenChainDisplay.js) must not be removed — it is a §1 critical component.
