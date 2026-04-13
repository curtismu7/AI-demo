---
created: 2026-04-03T11:24:38.614Z
title: Render MCP server did not deploy — verify live and confirm UAT Tests 2-4
area: tooling
files:
  - banking_mcp_server/Dockerfile
  - banking_mcp_server/package.json
  - banking_mcp_server/src/server/BankingMCPServer.ts
  - banking_mcp_server/src/server/HttpMCPTransport.ts
  - render.yaml
  - .planning/phases/32-mcp-server-advanced-capabilities-sequential-thinking-tool-async-long-running-tasks-primitive-well-known-server-discovery-audit-trail-observability-and-mcp-registry-integration/32-VERIFICATION.md
---

## Problem

The Render.com deployment of the MCP WebSocket server (`banking-demo-20s6.onrender.com`) was in progress when Phase 32 was completed. Three Render deploy attempts failed due to `prestart:prod` hook trying to `rm -rf dist` as non-root user (permission denied). Root cause was fixed (removed `prestart`/`prestart:prod` from `package.json`, commit `47722a1`), and the fix was backported to `main` (commit `f3590cb`). A fresh deploy was triggered from Render dashboard, but the outcome was not confirmed before closing the session.

Phase 32 VERIFICATION.md marks status `human_needed` for exactly these 3 items:
1. `GET https://banking-demo-20s6.onrender.com/.well-known/mcp-server` returns 200 JSON with tools[] and auth
2. `sequential_think` appears in live `tools/list` response without auth
3. `think: what accounts do I have?` in agent chat shows 🧠 reasoning bubble with 5 steps

## Solution

1. Check Render dashboard — if service shows "Live", run:
   ```
   curl https://banking-demo-20s6.onrender.com/.well-known/mcp-server
   ```
   Expected: 200 JSON with `sequential_think` in tools[], `auth.type = "oauth2"`

2. If still deploying / crashed: check build logs for errors. The fix is on `main` at commit `f3590cb`. If it still fails, check `MCP_SERVER_HOST` env var is set to `0.0.0.0` and `PORT`/`MCP_SERVER_PORT` both set to `10000`.

3. Once live: test `think:` prefix in agent chat on https://banking-demo-puce.vercel.app — reasoning bubble should appear.

4. Update `32-VERIFICATION.md` status from `human_needed` → `passed` after all 3 spot-checks confirmed.

5. Ensure `MCP_SERVER_URL=wss://banking-demo-20s6.onrender.com` is set in Vercel production env (was set previously but verify).
