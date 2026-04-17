---
status: complete
phase: 182-public-url-for-mcp-server-so-external-clients-like-claude-can-connect
created: 2025-04-17
completed: 2025-04-17
plan_count: 1
---

# Phase 182 Execution Summary

**Status:** ✅ COMPLETE (adapted: Vercel deployment instead of K8s)

## Overview

Phase 182 was originally planned for EKS/Kubernetes deployment. Per user decision, it was adapted to deploy the MCP server's HTTP Streamable transport as a Vercel serverless function instead.

External MCP clients (Claude Desktop, etc.) can now connect via:
```
POST https://bxfinance-demo.vercel.app/mcp
```

## What Changed vs Original Plan

| Original Plan (K8s) | Actual (Vercel) |
|---------------------|-----------------|
| 7 K8s manifest files | 1 serverless handler + vercel.json update |
| WebSocket + HTTP transport | HTTP Streamable only (Vercel limitation) |
| EKS cluster required | Zero infrastructure — uses existing Vercel project |
| kubectl apply | vercel --prod (already in workflow) |
| api.pingdemo.com domain | bxfinance-demo.vercel.app/mcp |

## Files Created/Modified

| File | Type | Purpose |
|------|------|---------|
| `api/mcp-handler.js` | NEW | Vercel serverless wrapper for MCP HTTP transport |
| `vercel.json` | MOD | Routes, install/build commands, function config |
| `banking_mcp_server/README.md` | MOD | Vercel deployment documentation |

## Architecture

```
Claude Desktop / MCP Client
        │
        │  POST /mcp (JSON-RPC)
        ▼
    Vercel Edge Network
        │
        │  Route: /mcp → api/mcp-handler.js
        ▼
    api/mcp-handler.js (Serverless Function)
        │
        │  Lazy init: AuthManager, SessionManager, ToolProvider
        ▼
    HttpMCPTransport.handleRequest()
        │
        ├── Token introspection → PingOne
        ├── Tool execution → BankingAPIClient → /api/* (BFF)
        └── Response → JSON-RPC result
```

## Endpoints Available

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP JSON-RPC (HTTP Streamable transport) |
| `/mcp` | DELETE | Session termination |
| `/.well-known/oauth-protected-resource` | GET | RFC 9728 metadata |
| `/.well-known/mcp-server` | GET | Public discovery manifest |
| `/mcp/health` | GET | Health check |

## Vercel Configuration Changes

### Routes Added (before `/api` catch-all)
- `/mcp` → `api/mcp-handler`
- `/mcp-server/*` → `api/mcp-handler`
- `/.well-known/oauth-protected-resource` → `api/mcp-handler`
- `/.well-known/mcp-server` → `api/mcp-handler`
- `/mcp/health` → `api/mcp-handler`

### Build Pipeline Updated
- `installCommand`: Added `npm install --prefix banking_mcp_server`
- `buildCommand`: Added `cd banking_mcp_server && npm run build` (TypeScript compilation)
- `functions`: Added `api/mcp-handler.js` with `maxDuration: 30` and `includeFiles: banking_mcp_server/dist/**`

## Verification

- [x] MCP server TypeScript compiles (`npm run build` → 0)
- [x] All module imports resolve from handler path
- [x] UI build passes
- [x] vercel.json is valid JSON with correct route ordering
- [x] CORS preflight handling (OPTIONS)
- [x] Health check endpoint returns 200
- [x] README documents all endpoints and client config

## Known Limitations

1. **No WebSocket support** — Vercel serverless is request/response only
2. **Cold start latency** — First request ~2-5 seconds (MCP initialization)
3. **30-second timeout** — Maximum Vercel function duration
4. **Ephemeral sessions** — In-memory sessions don't persist across cold starts
5. **No SSE streaming** — GET /mcp returns 405 (POST polling pattern)

## Client Configuration

For Claude Desktop:
```json
{
  "mcpServers": {
    "banking": {
      "url": "https://bxfinance-demo.vercel.app/mcp",
      "transport": "streamable-http"
    }
  }
}
```

## Commits

```
95067e2 feat(phase-182): expose MCP server on Vercel via HTTP Streamable transport
```
