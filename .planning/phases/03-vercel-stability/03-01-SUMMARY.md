# Phase 03 Plan 01 — SUMMARY
# STAB-01: KV cross-instance SSE event bridge for Vercel

**Phase:** 03-vercel-stability  
**Plan:** 01  
**Status:** ✅ Complete  
**Commit:** 2ef3d49

---

## What Was Built

Added a Upstash KV-backed cross-instance event bridge to `mcpFlowSseHub.js` so the agent flow diagram panel receives SSE events even when GET /api/mcp/tool/events and POST /api/mcp/tool land on different Vercel Lambda instances.

---

## Files Changed

| File | Change |
|------|--------|
| `banking_api_server/services/mcpFlowSseHub.js` | Added KV bridge: `kvPublish`, `startKvPoller`, `_testSetKvClient`, `_getKvClient`, `_kvKey` |
| `banking_api_server/src/__tests__/mcpFlowSseHub.test.js` | 5 unit tests (Tests A–E) covering KV bridge publish, dedup, poller, and stream_end handling |

---

## Key Implementation

**`_getKvClient()`** — reads `KV_REST_API_URL` / `UPSTASH_REDIS_REST_URL` and `KV_REST_API_TOKEN` / `UPSTASH_REDIS_REST_TOKEN`; returns null in local dev (no KV env vars). Supports `_testSetKvClient(client)` for test injection.

**`kvPublish(traceId, payload)`** — called in `publish()` fire-and-forget; does `kv.rpush('banking:sse:events:{traceId}', ...)` + `kv.expire(..., 120)`.

**`startKvPoller(traceId, res)`** — called in `handleSseGet()` when `attachSubscriber` returns the new-attach path; polls KV list every 500ms, deduplicates by `ev.t` timestamp via `res._receivedTs` Set, closes on `stream_end` phase.

---

## Tests (5/5 pass)

- **A:** `publish()` calls `kv.rpush` when override set
- **B:** local subscriber tracks `t` in `_receivedTs`  
- **C:** `endTrace()` writes `stream_end` to KV + `expire(30)`
- **D:** poller sends KV events, skips already-seen `t` values
- **E:** poller closes connection on `stream_end` phase

---

## Requirements Satisfied

- ✅ **STAB-01**: Agent flow diagram SSE bridge backed by KV for cross-instance delivery on Vercel

---

## Wiring

```
publish(traceId, payload)
  → kvPublish(traceId, payload)       // KV: RPUSH banking:sse:events:{traceId}
  → in-memory local subscribers       // same-Lambda delivery (unchanged)

handleSseGet(req, res)
  → attachSubscriber(traceId, req, res)
  → startKvPoller(traceId, res)       // NEW: KV poll every 500ms
      → kv.lrange(cursor, -1)
      → deduplicate by ev.t
      → res.write('data: ...\n\n')
      → clearInterval on stream_end or res close
```
