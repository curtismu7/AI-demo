# 32-01 SUMMARY

## Plan Executed: 32-01
**Phase:** 32 — MCP Server Advanced Capabilities
**Status:** Complete
**Commit:** feat(32-01): fix POST /api/mcp/tool 400 error + add /.well-known/mcp-server discovery endpoint

## What Was Built

### Task 1: Fix POST /api/mcp/tool 400 error (D-16)
Changed `req.readable` guard to `req.readableLength > 0` in the raw buffer fallback of the POST /api/mcp/tool handler. This prevents the fallback from attempting to read from an already-consumed stream. Added diagnostic `console.warn` log before the 400 return for production debugging.

### Task 2: Add GET /.well-known/mcp-server discovery endpoint (D-07, D-08, D-09)
Added a public `/.well-known/mcp-server` endpoint to `HttpMCPTransport` that bypasses the origin check and returns a machine-readable MCP manifest including: server name/version, all registered tools (name+description), OAuth 2.0 auth block with scopes, and contact URL.

## Key Files

- `banking_api_server/server.js` — fixed readableLength guard + diagnostic warn
- `banking_mcp_server/src/server/HttpMCPTransport.ts` — added BankingToolRegistry/pkg imports, `/.well-known/mcp-server` handler before origin check, and `handleMcpDiscovery()` private method

## Verification

- `POST /api/mcp/tool` with valid JSON body no longer returns 400 due to stream read issue
- `GET /.well-known/mcp-server` returns 200 JSON manifest without authentication
- `banking_mcp_server` TypeScript build: EXIT 0
