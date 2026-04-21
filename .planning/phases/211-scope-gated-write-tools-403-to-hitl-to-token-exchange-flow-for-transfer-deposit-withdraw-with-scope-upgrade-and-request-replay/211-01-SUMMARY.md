# Phase 211 Plan 01 — SUMMARY

**Phase:** 211-scope-gated-write-tools-403-to-hitl-to-token-exchange-flow
**Plan:** 01 — BFF scope-upgrade route + mcpWriteToken session cache
**Status:** ✅ Complete
**Commit:** `feat(211-01): POST /api/mcp/scope-upgrade + mcpWriteToken session cache fast-path`

---

## What Was Built

### Task 1: `POST /api/mcp/scope-upgrade` route (server.js ~line 954)

A new BFF endpoint that:
1. Calls `resolveMcpAccessTokenWithEvents(req, 'create_transfer')` to perform an RFC 8693 token exchange requesting `banking:write` scope
2. On success, stores the resulting write-scoped token in `req.session.mcpWriteToken` (saved with `session.save()`)
3. Returns `{ ok: true, tokenEvents }` — tokenEvents surface the exchange chain to the UI for educational display
4. On failure (no token returned): returns `403 scope_upgrade_failed`
5. On exception: returns `500 scope_upgrade_failed`

### Task 2: `WRITE_TOOLS_REQUIRING_CACHE` + `mcpWriteToken` fast-path (server.js ~lines 927, 1083)

- `const WRITE_TOOLS_REQUIRING_CACHE = new Set(['create_transfer', 'create_deposit', 'create_withdrawal'])` declared at module level (after agentMcpTokenService import)
- Inside `POST /api/mcp/tool`, before the `resolveMcpAccessTokenWithEvents` call: conditional checks if `req.session.mcpWriteToken` is set AND the requested tool is in `WRITE_TOOLS_REQUIRING_CACHE`
  - **Cache hit path:** sets `mcpAccessToken = req.session.mcpWriteToken`, `tokenEvents = []`, derives `userSub` from session; skips token exchange entirely
  - **Cache miss path:** falls through to original `resolveMcpAccessTokenWithEvents(req, tool)` call (unchanged)

---

## Files Modified

| File | Changes |
|------|---------|
| `banking_api_server/server.js` | +WRITE_TOOLS_REQUIRING_CACHE const; +POST /api/mcp/scope-upgrade route; +mcpWriteToken cache fast-path in POST /api/mcp/tool |

---

## Key Design Decisions (from CONTEXT.md)

- **D-01 (HITL consent step):** Consent modal is in the UI (Plan 02); this BFF route is the backend leg called upon confirm
- **D-02 (Token exchange):** Uses existing `resolveMcpAccessTokenWithEvents` — no new exchange logic needed
- **D-03 (Request replay):** mcpWriteToken cached in session; Plan 02 stores `pendingScopeUpgradeRef` for auto-replay
- **D-04 (Educational visibility):** `tokenEvents` returned from scope-upgrade route for display in token chain

---

## Verification

```bash
grep -n "scope-upgrade\|mcpWriteToken\|WRITE_TOOLS_REQUIRING_CACHE" banking_api_server/server.js
# Expected: lines 927, 957, 967, 1083, 1085

node --check banking_api_server/server.js
# Expected: exit 0 (✅ confirmed)
```

---

## What Plan 02 Depends On

- `POST /api/mcp/scope-upgrade` endpoint at `/api/mcp/scope-upgrade` ✅
- Response shape: `{ ok: true, tokenEvents }` on success ✅
- Session key: `mcpWriteToken` ✅ (cleared automatically on session expiry)
