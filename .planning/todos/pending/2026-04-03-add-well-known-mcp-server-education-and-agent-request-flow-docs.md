---
created: 2026-04-03T00:30:24.812Z
title: Add /.well-known/mcp-server education and include it in agent request flow
area: docs
files:
  - banking_mcp_server/src/server/HttpMCPTransport.ts
  - banking_api_ui/src/components/BankingAgent.js
  - banking_mcp_server/README.md
---

## Problem

Phase 32 implemented `/.well-known/mcp-server` (the MCP server discovery endpoint) in `HttpMCPTransport.ts`, but there is no user-facing education about what it is, why it exists, or how AI clients use it. Visitors to the demo — especially developers evaluating the MCP integration — won't know the endpoint is there or what it returns.

Additionally, the BankingAgent request flow (the sequence diagram / explanation of how the agent resolves tools) does not yet reference the discovery step, meaning the educational narrative is incomplete: the very first thing a well-behaved MCP client should do (fetch `/.well-known/mcp-server` to learn what servers and tools are available) is invisible in the demo.

## Solution

1. **UI education panel** — In `BankingAgent.js` (or a dedicated `McpDiscoveryInfo` sub-component), add a collapsible "How it works" section that explains:
   - What `/.well-known/mcp-server` is (MCP discovery spec)
   - What JSON it returns (name, version, tools[], auth block)
   - How AI clients (Claude Desktop, Cursor, etc.) use it to bootstrap a session

2. **Agent request flow diagram/text** — Insert `/.well-known/mcp-server` as Step 0 / Step 1 in the existing agent request flow explanation so the sequence is:
   - `GET /.well-known/mcp-server` → discover tools & auth requirements
   - `POST /mcp` (initialize handshake)
   - `tools/list` → enumerate tools
   - `tools/call` → invoke with user token

3. **README update** — The `banking_mcp_server/README.md` "AI Client Setup" section (added in 32-03) should call out the discovery endpoint URL and link to the MCP spec section that defines it.

4. **Optional: live "Try it" button** — A one-click fetch of `/.well-known/mcp-server` in the MCP Inspector page showing the raw JSON response, so devs can see it live without cURL.
