# 244-02-SUMMARY — Event-Wired Architecture Page Components

## What Was Built

Two dedicated page components that subscribe to the live event stream and highlight diagram regions in real-time. Both reuse the shared `ArchitectureDiagramPage` display layer from Plan 01.

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `banking_api_ui/src/components/ArchitectureOverviewPage.js` | Created | Overview page: 11 event-map rules, keyword scan, per-region timers |
| `banking_api_ui/src/components/ArchitectureTokenFlowPage.js` | Created | Token-flow page: more granular 12-rule map targeting per-hop components |

## Architecture

```
ArchitectureOverviewPage / ArchitectureTokenFlowPage
  ├─ fetchEvents() — polls /api/admin/app-events?since=<ISO> every 10s
  ├─ mapEventToRegions(event) — category+tag → [{ regionId, colorClass }]
  ├─ scanKeywords(text) — llm_complete response → keyword → regionId
  ├─ activateRegion(id, colorClass) — sets state + schedules 4s clearTimeout
  └─ ArchitectureDiagramPage — receives activeRegions, renders SVG overlay
```

## Event → Region Mapping Verified

| Event | Overview Regions | Token-Flow Regions | Color |
|-------|-----------------|-------------------|-------|
| agent_prompt/llm_invoke | agent | agent1, llm | active |
| agent_prompt/llm_complete | agent + keyword scan | agent1 + keyword scan | active |
| token_exchange/rfc8693-success | idp-oauth-as, mcp-gw | pingone-aic, token-exchange-box, mcp-gateway-tf | active |
| token_exchange/rfc8693-error | idp-oauth-as, mcp-gw | pingone-aic, token-exchange-box, mcp-gateway-tf | active-error |
| authorize/permit | pingauthorize | pingauthorize-tf | active-permit |
| authorize/deny | pingauthorize | pingauthorize-tf | active-error |
| oauth/user/callback | user, idp-oauth-as | olb-application, pingone-aic | active |
| mcp/* | mcp-gw | mcp-gateway-tf | active |

## Key Design Decisions

- **?since= param** — only new events since last fetch are processed; prevents re-highlighting on every tick
- **Per-region useRef timers** — `clearTimers.current[regionId]` is an independent setTimeout; one region expiring does not affect others
- **Admin gate** — `user?.role !== 'admin'` check before any fetch; 403 swallowed silently; non-admin sees static diagram
- **MCP category note** — `logEvent('mcp',...)` not found in banking_api_server/ at this time; 'mcp' trigger in event map is forward-compatible; keyword scan covers current MCP tool calls via agent_prompt events

## Commits

- `e839efae` feat(244-02): ArchitectureOverviewPage — event polling, per-region timers, keyword scan, admin gate
- `c85b2931` feat(244-02): ArchitectureTokenFlowPage — token-flow diagram with granular per-hop region mapping

## Build

`npm run build` exit 0 ✓

## Requirements Satisfied

| ID | Description | Status |
|----|-------------|--------|
| ARCH-03 | Live event highlights driven by appEventService polling | ✅ |
