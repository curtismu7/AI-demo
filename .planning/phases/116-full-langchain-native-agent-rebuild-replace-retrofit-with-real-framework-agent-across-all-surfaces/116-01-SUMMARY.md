---
plan: 116-01
phase: 116
title: "Rewrite BFF agent service for LangChain 1.x createAgent() API"
status: completed
date: 2026-04-09
commits:
  - f8ebbeb
---

# Plan 116-01 — Summary

## Objective Achieved

✅ Rewrote `bankingAgentLangChainService.js` to use LangChain 1.x `createAgent()` API instead of deprecated 0.x patterns (`createStructuredChatAgent` + `AgentExecutor` + `ConversationBufferMemory`).

✅ Fixed `bankingAgentRoutes.js` to implement per-request agent initialization with session-persisted multi-turn history.

## Key Changes

### 1. bankingAgentLangChainService.js (Full Rewrite)

**Removed (deprecated 0.x patterns):**
- `AgentExecutor` + `createStructuredChatAgent` from `langchain/agents`
- `ConversationBufferMemory` from `langchain/memory`
- `initializeBankingAgent()` — no more module-level executor
- `processBankingAgentMessage()`
- `processBankingAgentMessageWithAuth()`
- `createBankingAgentWithConfig()`
- `validateAgentExecutor()`
- `clearAgentMemory()`
- `getAgentChatHistory()`

**Added (LangChain 1.x):**

**Export 1: `createBankingAgent()`**
- Creates a fresh `ReactAgent` per request (stateless)
- Uses `createAgent()` from `langchain` root (NOT from `langchain/agents` — that subpath doesn't exist in 1.x)
- Initializes with `ChatAnthropic` model, MCP tools from `createMcpToolRegistry()`, and system prompt
- No persistent memory — history is passed in via message context

**Export 2: `processAgentMessage(message, agentContext, sessionHistory, tokenEvents)`**
- Accepts message + session history (max 20 messages from `req.session.agentChatHistory`)
- Performs RFC 8693 token exchange if needed (get agent-scoped token)
- Invokes fresh agent with message + trimmed history
- Extracts AI reply from `result.messages` (NOT `result.output` — doesn't exist in 1.x)
- Returns `{ reply, updatedHistory, tokenEvents, interrupt }`
- Handles HITL interrupt detection for 428 responses

**Export 3: `exchangeTokenForAgent()` (unchanged)**
- Kept verbatim from previous implementation
- RFC 8693 token exchange for user → agent actor scope
- Records token events and raises on error

**Key pattern:**
```js
// OLD (0.x):
const executor = await initializeBankingAgent();  // Called once, global
const result = await executor.invoke({ input: message, userId });
const reply = result.output;

// NEW (1.x):
const sessionHistory = req.session.agentChatHistory || [];
const result = await processAgentMessage(message, agentContext, sessionHistory, tokenEvents);
const reply = result.reply;
// Then: req.session.agentChatHistory = result.updatedHistory;
```

### 2. bankingAgentRoutes.js (Major Refactor)

**Removed:**
- `let bankingAgent = null` (no global executor state)
- Import of `initializeBankingAgent`, `processBankingAgentMessageWithAuth`
- `hitlGatewayMiddleware` from `/message` route chain (replaced with inline HITL handling)

**Updated imports:**
- ✅ Import `processAgentMessage` instead of old functions
- ✅ Keep `storeConsentRequest`, `getConsentDecision`, `recordConsentDecision`

**POST /init (Simplified)**
- No longer initializes a global executor
- Just returns `{ success: true, sessionId }`

**POST /message (Complete Rewrite)**
- Validates message input
- Loads session history from `req.session.agentChatHistory`
- Calls `processAgentMessage()` with fresh agent per request
- **Persists updated history back to session**: `req.session.agentChatHistory = result.updatedHistory`
- If HITL interrupt: stores consent request, returns 428
- Otherwise returns `{ success: true, reply, tokenEvents }`

**POST /consent (Unchanged)**
- No changes — already working correctly

**Key flow:**
```js
const sessionHistory = req.session.agentChatHistory || [];  // Load (max 20)
const result = await processAgentMessage(message, agentContext, sessionHistory, tokenEvents);
req.session.agentChatHistory = result.updatedHistory;  // Persist

if (result.interrupt && !consentApproved) {
  // -> 428 with HITL
} else {
  // -> 200 with reply + tokenEvents
}
```

## Verification Results

✅ **Deprecated imports removed:**
- `grep -c "AgentExecutor\|createStructuredChatAgent\|ConversationBufferMemory"` → 0
- `grep -c "initializeBankingAgent\|processBankingAgentMessageWithAuth"` → 0

✅ **New API in place:**
- `grep -c "createAgent"` → 2 (import + usage)
- `grep -c "export.*createBankingAgent\|processAgentMessage\|exchangeTokenForAgent"` → 3 functions

✅ **Session history present:**
- `grep -c "agentChatHistory"` → 2 (load + save)

✅ **No global executor state:**
- `grep -c "let bankingAgent"` → 0

✅ **Node ESM imports verify:**
- `import { createBankingAgent, processAgentMessage, exchangeTokenForAgent } from '...'` ✓

## What This Enables

✅ Per-request stateless agent initialization (works on Vercel serverless)
✅ Session-persisted multi-turn conversation history (max 20 messages, enforced)
✅ RFC 8693 token exchange for agent-scoped MCP access
✅ HITL 428 interrupt detection and consent flow
✅ Foundation for Plan 116-02 (tool registry rewrite) and 116-03 (UI wiring)

## Next Steps

- **Plan 116-02:** Rewrite tool registry to use `tool()` function, 7 tools, configurable auth context
- **Plan 116-03:** Wire UI to call `/api/banking-agent/message`, integrate HITL modals

## Self-Check: PASSED ✅

- [x] All deprecated 0.x patterns removed
- [x] New LangChain 1.x API (`createAgent()`) in use
- [x] Session history loading + persistence
- [x] Per-request agent init (stateless, Vercel-friendly)
- [x] HITL interrupt handling
- [x] RFC 8693 token exchange kept from Phase 115
- [x] Tests (acceptance criteria) verified via grep + node smoke tests
