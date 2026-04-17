---
created: 2026-04-16T12:33:02.725Z
title: Show MCP request and response metadata in token chain display
area: ui
files:
  - banking_api_ui/src/components/TokenChainDisplay.js
  - banking_api_server/services/mcpWebSocketClient.js
  - banking_api_server/services/agentMcpTokenService.js
---

## Problem

The Token Chain Display UI currently shows the token exchange steps (user AT → delegated AT with act claim → MCP access token) but does not show:

1. **The outbound request to the MCP server** — what the MCP client (BFF) sends via WebSocket: the `tools/call` JSON-RPC payload, headers, agent token, and correlation ID
2. **The metadata returned by the MCP server** — introspection result, session creation, tool execution result, scopes validated, authentication status

Without this, demo audiences can't see the full round-trip: how the delegated token is presented to the MCP server and what the MCP server does with it (introspect, validate audience, check scopes, execute tool).

## Solution

- Capture the MCP WebSocket request/response in `mcpWebSocketClient.js` as token events (request sent, response received)
- Include in token events: tool name, scopes required, correlation ID, introspection result (active/inactive, scopes, audience), and tool response summary
- Surface these events in `TokenChainDisplay.js` as additional steps in the chain after the token exchange steps
- Show both the "MCP Request" (what was sent) and "MCP Response" (what came back, including auth metadata)
