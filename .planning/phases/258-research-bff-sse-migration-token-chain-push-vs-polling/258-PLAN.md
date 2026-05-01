---
phase: 258
title: "Plan Phase 258 — SSE Token Chain Migration"
type: plan
status: complete
date: 2026-05-01
---

# Phase 258: Plan — BFF SSE Migration (Token Chain Events)

**Goal:** Extend existing `mcpFlowSseHub` pattern to stream all token events in real time during `BankingAgent.js` MCP tool calls, replacing batch delivery in response body.

**Scope:** Option B from research — token chain SSE only. Session preview, app events, and traffic polling remain unchanged in this phase.

**Effort:** 2–3 tasks (estimated 4–6 hours total)

---

## Prerequisites

- ✅ Research complete: `mcpFlowSseHub` pattern exists and works in `WebMcpPanel.js`
- ✅ `appendTokenEvents()` call sites identified: 6 locations in `BankingAgent.js`
- ✅ SSE hub already buffers events; no data loss risk
- ✅ Backward compat preserved: `tokenEvents[]` field in response remains

---

## Task Breakdown

### Task 1: Extend `mcpFlowSseHub` for Token Events (BFF)

**Objective:** Publish all token events to the SSE hub during MCP tool execution.

**Files to modify:**
- `banking_api_server/services/mcpFlowSseHub.js`
- `banking_api_server/services/agentMcpTokenService.js` (at JWKS verify and introspection points)
- `banking_api_server/server.js` (POST `/api/mcp/tool` handler)

**Actions:**
1. In `mcpFlowSseHub.js`: Verify `publish()` method accepts token event types (phase, tokenEvent, etc.)
2. In `agentMcpTokenService.js`: Add `mcpFlowSseHub.publish()` calls at:
   - `pushJwksVerifyEvent()` calls (line ~1600+)
   - Token introspection response handling
3. In `server.js` POST `/api/mcp/tool` handler: Wire token events to hub during execution; populate `tokenEvents: []` in response (or fallback if SSE unavailable)

**Verification:**
- Server logs show `[MCPFlowSSE]` events during tool call
- Token Chain UI shows events streaming live (not in batch at end)
- Response body fallback works if SSE connection drops

**Risk:** Low. Existing hub infrastructure; additive changes only.

---

### Task 2: Update `BankingAgent.js` to Consume SSE (UI)

**Objective:** Replace synchronous `appendTokenEvents(response.tokenEvents)` calls with SSE stream listening.

**Files to modify:**
- `banking_api_ui/src/components/BankingAgent.js` (6 call sites)
- `banking_api_ui/src/services/bankingAgentService.js` (if SSE opener not yet exposed)

**Call sites in BankingAgent.js to update:**
1. Admin login via PingOne (line ~150)
2. User login via PingOne (line ~200)
3. User token introspection check (line ~250)
4. MCP tool call (main flow) (line ~400)
5. Token exchange (RFC 8693) (line ~500)
6. Agent completion / token finalization (line ~600)

**Actions:**
1. Before each tool call: Open SSE stream with `openMcpToolStream(traceId)`
2. Replace `appendTokenEvents(response.tokenEvents)` with event listener on SSE stream
3. Close SSE stream on tool completion or error
4. If SSE unavailable, fall back to response body `tokenEvents[]`

**Pattern (from WebMcpPanel.js):**
```javascript
const sseStream = openMcpToolStream(traceId);
sseStream.on('token-event', (event) => {
  appendTokenEvents([event]);
});
toolCall().then((response) => {
  sseStream.close();
  // Fall back to response events if SSE didn't fire
  if (response.tokenEvents?.length > 0) {
    appendTokenEvents(response.tokenEvents);
  }
});
```

**Verification:**
- Token Chain UI updates in real time (not after tool finishes)
- Events appear in order (no out-of-order delivery)
- Error cases (SSE drop, tool error) handled gracefully
- Existing tests still pass

**Risk:** Medium. 6 call sites; must verify each error path. But fallback mitigates.

---

### Task 3: Test & Verification

**Objective:** Ensure SSE token chain works end-to-end with no regressions.

**Scenarios:**
1. **Happy path (admin):** Admin login → observe token events stream in Token Chain
2. **Happy path (user):** User login + MCP tool call → observe device selection, call execution, token exchange in real time
3. **SSE unavailable:** Simulate SSE connection drop → verify fallback to response body
4. **High-volume:** Rapid tool calls (5+) → verify event ordering and no data loss
5. **Token expiry:** Initiate SSE after token expiry → verify appropriate error event

**Verification checklist:**
- [ ] Token Chain panel updates live (not batch)
- [ ] Event timestamps are sequential
- [ ] JWKS verify events appear before introspection events
- [ ] Fallback events appear when SSE is unavailable
- [ ] No console errors or unhandled rejections
- [ ] No new memory leaks (SSE connections closed properly)
- [ ] Existing polling surfaces (session preview, app events) unaffected

**Tools:**
- Browser DevTools (Network tab: observe SSE connection)
- Token Chain UI panel
- Server logs: `[MCPFlowSSE]` entries
- UI build: `npm run build`
- Jest tests for `BankingAgent.js` and `bankingAgentService.js`

**Risk:** Low. Most risk is in existing code; verification is thorough.

---

## Success Criteria

- ✅ SSE hub emits token events during all tool calls
- ✅ BankingAgent.js reads events from SSE stream (6 call sites updated)
- ✅ Token Chain UI displays events in real time (streaming, not batch)
- ✅ Backward compat: `response.tokenEvents[]` fallback works
- ✅ No regressions in other polling surfaces
- ✅ Build passes: `npm run build` exit 0
- ✅ All verification scenarios pass
- ✅ No new errors in server logs or browser console

---

## Files Changed Summary

| File | Change | Lines |
|------|--------|-------|
| `banking_api_server/services/mcpFlowSseHub.js` | Add token event publishing | +15–20 |
| `banking_api_server/services/agentMcpTokenService.js` | Wire SSE at JWKS/introspection points | +10–15 |
| `banking_api_server/server.js` | Publish to SSE hub in `/api/mcp/tool` handler | +5–10 |
| `banking_api_ui/src/components/BankingAgent.js` | Replace 6 `appendTokenEvents()` calls with SSE listeners | +30–50 |
| `banking_api_ui/src/services/bankingAgentService.js` | Expose SSE stream opener (if needed) | +10–20 |

---

## Timeline

- **Task 1 (BFF):** 1–2 hours
- **Task 2 (UI):** 1–2 hours
- **Task 3 (Test):** 1–2 hours

**Total:** 2–3 tasks, 4–6 hours

---

## Rollback Plan

If SSE migration introduces instability:
1. Revert to `response.tokenEvents[]` delivery in POST `/api/mcp/tool`
2. Remove SSE listeners in BankingAgent.js
3. Keep SSE infrastructure in place (used by WebMcpPanel.js still)
4. No data loss (events still available in response)

---

## Next Steps

1. **Approval:** Review this plan, request changes if needed
2. **Execute:** Run Task 1–3 in order
3. **Verify:** Manual testing + CI/CD
4. **Iterate:** Phase 258 complete when all verification criteria met

---

*Plan created: 2026-05-01*
