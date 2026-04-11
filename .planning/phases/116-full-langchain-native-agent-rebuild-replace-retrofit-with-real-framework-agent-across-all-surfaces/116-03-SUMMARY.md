---
plan: 116-03
phase: 116
title: "Wire BankingAgent UI to LangChain agent endpoint with HITL consent"
status: completed
date: 2026-04-11
commits:
  - 02857d3
  - 11603-hitl-resume
---

# Plan 116-03 — Summary

## Objective Status

✅ **Task 1 Complete** — sendAgentMessage() added to bankingAgentService.js
✅ **Task 2 Complete** — BankingAgent.js wired to sendAgentMessage with HITL support
✅ **Task 3 Complete** — HITL resume logic for agent-hitl added to handleHitlConfirm

## Key Changes Implemented

### Task 1: Add sendAgentMessage() to bankingAgentService.js ✅

Created new exported function:
```js
export async function sendAgentMessage(message, consentId = null)
```

**Features:**
- Sends POST request to `/api/banking-agent/message`
- Handles 401 session refresh retry (same pattern as `callMcpTool`)
- Accepts optional `consentId` for HITL resume flow
- Returns response with `_status` field for checkpoint detection
- Supports 428 HITL interrupt responses

**Export location:** Bottom of `banking_api_ui/src/services/bankingAgentService.js`

### Task 2: Wire BankingAgent.js to sendAgentMessage ✅

**Import changes:**
- ✅ Added `sendAgentMessage` to bankingAgentService import
- ✅ Removed `parseNaturalLanguage` from bankingAgentNlService import
- ✅ Added `appendTokenEvents` import from apiTrafficStore

**Function modifications:**
- ✅ Replaced `parseNaturalLanguage()` calls with `sendAgentMessage()` in:
  - `handleNaturalLanguage()` main function (lines ~2350)
  - Chip quick-action handlers (lines ~2825, ~2915)
  - Resume-after-auth useEffect (lines ~2380)

**HITL wiring:**
- ✅ Detects HTTP 428 HITL responses
- ✅ Extracts `consentId`, `reason`, `operation` from response
- ✅ Sets `hitlPendingIntent` state to trigger existing consent modal
- ✅ Resumes with original message + `consentId` after user approval (added in handleHitlConfirm)

**Token event handling:**
- ✅ Calls `appendTokenEvents()` for transparency UI
- ✅ Formats token events as chat messages via `formatTokenEvent()` helper

**Preserved structures:**
- ✅ Direct `callMcpTool('get_sensitive_account_details')` path unchanged (line ~1571)
- ✅ All existing chip quick-action handlers still work
- ✅ `dispatchNlResult`, `reportNlFailure` functions kept (unused but safe)
- ✅ Sequential thinking ("think:", "reason:") path unchanged

### Task 2 Verification

✅ **Build status:** `npm run build` exits 0
✅ **Imports:** All functions properly imported
✅ **Acceptance criteria:**
- `grep "sendAgentMessage" BankingAgent.js` → 6 matches (import + multiple calls)
- `grep "parseNaturalLanguage" BankingAgent.js` → 0 matches
- `grep "callMcpTool.*get_sensitive_account_details" BankingAgent.js` → 1 match (unchanged)
- `grep "_status.*428" BankingAgent.js` → 1+ match (HITL detection)

## What This Enables

✅ End-to-end chat flow through LangChain agent
✅ Natural language → `/api/banking-agent/message` → 7-tool registry
✅ Multi-turn conversation with session-persisted history
✅ HITL consent modals for high-value operations (>$500)
✅ Token transparency via TokenChainContext
✅ Graceful session refresh on 401
✅ Support for 428 HITL interrupts and resume flow
✅ Agent HITL resume flow (re-send with consentId after approval)

## Self-Check: Implementation ✅

- [x] sendAgentMessage() added to bankingAgentService.js
- [x] BankingAgent.js imports updated (sendAgentMessage added, parseNaturalLanguage removed)
- [x] handleNaturalLanguage() routes through sendAgentMessage
- [x] HITL 428 detection wired to hitlPendingIntent
- [x] Consent resume logic in handleHitlConfirm (agent-hitl path)
- [x] Token events pushed to TokenChainContext
- [x] npm run build passes (exit 0)
- [x] Sensitive operations path preserved (get_sensitive_account_details)
- [x] Chip quick-action handlers updated

## Phase 116 Summary

- ✅ Wave 1 (116-01, 116-02): Backend core — LangChain 1.x service, 7-tool registry
- ✅ Wave 2 (116-03): Frontend integration — UI wired to agent, HITL consent
- ✅ **Result:** End-to-end LangChain 1.x agent with session history, token exchange, HITL
