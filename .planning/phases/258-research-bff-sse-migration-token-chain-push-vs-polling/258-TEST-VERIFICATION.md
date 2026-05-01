---
phase: 258
type: test-plan
title: "Phase 258: Test & Verification — Token Chain SSE Migration"
date: 2026-05-01
---

# Phase 258: Test & Verification Report

## Completed Changes

### ✅ Task 1: BFF SSE Hub Extension
**Commit:** `822e8146`

**Changes:**
- Added `publishTokenEventsToSse(flowTraceId, tokenEvents)` helper function in `banking_api_server/server.js`
- Wire token events to SSE hub at key points in POST `/api/mcp/tool` handler:
  - After token resolution success (line ~1222)
  - After token resolution errors (error paths)
  - After local fallback token events
- Token events now published with `type: 'token-event'` wrapper

**Files Modified:** `banking_api_server/server.js` (+25 lines)

### ✅ Task 2: UI SSE Token Event Collection
**Commit:** `83b120a4`

**Changes:**
- Modified `callMcpTool()` in `banking_api_ui/src/services/bankingAgentService.js`
- Added `tokenEventsFromSse` array to collect token events from SSE stream
- SSE callback now checks for `data.type === 'token-event'` and pushes to array
- Token events appended immediately when received (real-time Token Chain display)
- Merge SSE events with response body events (backward compat) before returning
- Deduplication logic prevents duplicate events
- All error paths include SSE-collected token events

**Files Modified:** `banking_api_ui/src/services/bankingAgentService.js` (~40 lines)

**Verification:** `npm run build` passed ✅

---

## Testing Scenarios

### Scenario 1: Happy Path (User Login + Tool Call)
**Goal:** Verify token events stream in real time during MCP tool call

**Steps:**
1. Open browser to `https://localhost:4000/dashboard` (or configured UI URL)
2. Click "🔐 Sign In" → complete PingOne login
3. Click "🏦 My Accounts" → view Token Chain panel
4. **Expected:** Token events appear in real time as:
   - User token loaded
   - User token introspection completes
   - Token exchange starts
   - Exchange completes
   - MCP access token received
5. **Verification:**
   - Events appear **before** "My Accounts" result shows
   - Each event has timestamp
   - No duplicate events (deduplication works)
   - Event order: user-token → introspection → exchange-required → exchanged-token

### Scenario 2: SSE Fallback (No SSE Connection)
**Goal:** Verify backward compatibility when SSE is unavailable

**Steps:**
1. Open DevTools → Network tab
2. Click "🏦 My Accounts"
3. Filter network to `/api/mcp/tool/events` request
4. Right-click → "Block URL" (blocks SSE stream)
5. Trigger another tool call
6. **Expected:** Token Chain still shows events (from response body fallback)
7. **Verification:**
   - Events appear after tool result (not streaming)
   - No errors in console
   - Tool result displays correctly

### Scenario 3: High-Volume Calls (Event Ordering)
**Goal:** Verify event ordering under rapid calls

**Steps:**
1. Open Token Chain panel
2. In browser console, run rapid tool calls:
   ```javascript
   for (let i = 0; i < 3; i++) {
     window.fetch('/api/mcp/tool', {
       method: 'POST',
       credentials: 'include',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         tool: 'get_my_accounts',
         params: {},
         flowTraceId: crypto.randomUUID()
       })
     });
   }
   ```
3. **Expected:**
   - Token Chain shows 3 separate event flows
   - Each flow's events are in correct order
   - No mixed events between flows
   - Timestamps are sequential within each flow

### Scenario 4: Token Expiry Path
**Goal:** Verify token expiry events are captured

**Steps:**
1. Open Token Chain panel
2. Note current token expiry time
3. Wait until session is close to expiry (or use admin config to set short TTL)
4. Attempt a tool call after expiry
5. **Expected:**
   - Token introspection returns `active=false`
   - Token Chain shows introspection failure event
   - Tool call fails gracefully
   - UI prompts to re-login

### Scenario 5: Memory & Cleanup (No Leaks)
**Goal:** Verify SSE connections close properly and no memory leaks

**Steps:**
1. Open DevTools → Memory tab
2. Take heap snapshot (baseline)
3. Make 10 tool calls
4. Check Token Chain has all events
5. Take heap snapshot
6. Perform garbage collection
7. Take final heap snapshot
8. **Expected:**
   - Memory grows but then stabilizes after GC
   - No detached DOM nodes from SSE connections
   - EventSource connections properly closed in `finally` block

---

## Backward Compatibility Checklist

- [ ] Response body `tokenEvents` field preserved (for non-SSE clients)
- [ ] `callMcpTool` still returns `{ result, tokenEvents }` in same shape
- [ ] Deduplication prevents double-counting SSE + response events
- [ ] Error responses still include tokenEvents in body
- [ ] BankingAgent.js still handles response.tokenEvents from higher-level APIs

---

## Integration Points

### BFF `/api/mcp/tool` Handler
- ✅ Token events published to SSE hub
- ✅ Response body still includes `tokenEvents[]` (fallback)
- ✅ Error paths publish events
- ✅ Local fallback paths publish events

### UI `callMcpTool` Service
- ✅ SSE stream opened before POST
- ✅ Token events collected from SSE
- ✅ Token events appended to UI immediately on receipt
- ✅ Merged with response body events (backward compat)
- ✅ All error paths include SSE events

### Token Chain UI Context
- ✅ Receives events via `appendTokenEvents()` (unchanged API)
- ✅ Events now arrive streaming (not batch)
- ✅ Event order preserved
- ✅ No changes required to display logic

---

## Known Limitations & Deferred Work

### Phase 258 Scope (Done)
- Token chain events only (not session preview or app events)
- Streaming via existing `mcpFlowSseHub` pattern
- Real-time display in Token Chain panel

### Deferred (Future Phases)
- Session preview polling → SSE (research noted as good candidate)
- App events polling → SSE (research noted as good candidate)
- HTTP/2 usage to reduce connection limits
- Redis pub/sub for multi-instance deployments

---

## Build Verification

```bash
# BFF syntax valid
✅ node -c banking_api_server/server.js

# UI build successful
✅ npm run build
   Build folder ready to be deployed
```

---

## Regression Risk Assessment

**Risk Level:** LOW

**Why:**
- SSE hub infrastructure already exists (used by WebMcpPanel.js)
- Response body fallback preserves backward compatibility
- Changes are additive, not refactoring
- Error paths unchanged (just emit events in addition)
- Token Chain UI receives same data shape from `appendTokenEvents()`

**Regression Triggers to Watch:**
- ❌ Token events appearing twice (deduplication failure)
- ❌ SSE events without corresponding errors (connection issue)
- ❌ Response body events absent (fallback not working)
- ❌ Out-of-order events (timestamp check needed)

---

## Next Steps

1. **Manual Testing:** Execute scenarios 1-5 above
2. **Automated Testing:** Run jest tests for `bankingAgentService.js` token event handling
3. **Load Testing:** Verify SSE connections under high concurrency
4. **Browser Testing:** Chrome, Safari, Firefox (SSE support varies)
5. **Error Path Testing:** Network failures, token expiry, exchange failures

---

**Implementation Status:** ✅ Complete (Tasks 1-2)  
**Testing Status:** ⏳ Pending (Task 3)  
**Deployment Readiness:** Awaiting test pass  

*Report generated: 2026-05-01*
