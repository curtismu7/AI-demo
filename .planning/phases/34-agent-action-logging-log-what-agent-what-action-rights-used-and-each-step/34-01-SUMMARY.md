---
phase: 34-agent-action-logging-log-what-agent-what-action-rights-used-and-each-step
plan: 34-01
status: complete
completed: 2026-04-03
commit: c22f7f9
---

## Summary

Implemented Upstash Redis persistence for the MCP server's `AuditLogger`. All five log* methods now write audit events to Redis (`mcp:audit:events` list) as fire-and-forget. `queryAuditLogs` reads from Redis with full filter support. `generateAuditSummary` aggregates real data. The `/audit` HTTP endpoint now forwards `agentId` + `operation` query params.

## Key Files

### Created / Modified
- `banking_mcp_server/package.json` — added `@upstash/redis@^1.34.0` dependency
- `banking_mcp_server/src/interfaces/config.ts` — added `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `EnvironmentVariables`
- `banking_mcp_server/src/utils/AuditLogger.ts` — full Redis implementation (write + read + filter + summarize)
- `banking_mcp_server/src/server/HttpMCPTransport.ts` — `handleAuditQuery` now forwards `agentId` + `operation` filters

## Decisions Made

- Used `@upstash/redis` direct client (not `@vercel/kv` wrapper) since MCP server is not Vercel-hosted
- Redis write is fire-and-forget: errors logged to stderr but never propagate to tool call path
- Key: `mcp:audit:events`; LPUSH + LTRIM (500 entries max); 7-day TTL
- When `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` absent: graceful no-op (local dev)
- `sanitizeParams` helper strips sensitive keys (password/secret/token/key/credential/authorization)

## Verification

- `grep "lpush" banking_mcp_server/src/utils/AuditLogger.ts` → found in `writeToRedis`
- `grep "writeToRedis" ... | wc -l` → 6 (5 log* method calls + 1 definition)
- `UPSTASH_REDIS_REST_URL` in `config.ts` EnvironmentVariables
- `@upstash/redis` in `package.json` dependencies
- `cd banking_mcp_server && npm run build` → **exit 0**
