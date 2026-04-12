---
plan: 116-02
phase: 116
title: "Rebuild tool registry with tool() function and 3 new tools"
status: completed
date: 2026-04-09
commits:
  - 0dd5367
---

# Plan 116-02 — Summary

## Objective Achieved

✅ Created `educationTopics.js` service with 11 education topics extracted from BankingAgent.js TOPIC_MESSAGES.

✅ Rewrote `mcpToolRegistry.js` to use LangChain 1.x `tool()` function from `@langchain/core/tools`, added 3 new tools, implemented configurable auth context pattern.

## Key Changes

### 1. educationTopics.js (New File—Task 1)

**Export 1: `TOPIC_MESSAGES`**
- Object with 11 keys: `login-flow`, `token-exchange`, `may-act`, `mcp-protocol`, `introspection`, `step-up`, `agent-gateway`, `pingone-authorize`, `cimd`, `langchain`, `human-in-loop`
- Content copied from BankingAgent.js TOPIC_MESSAGES (lines 700–715)
- Updated `langchain` topic: changed from "0.3.x LCEL" explanation to "1.x ReactAgent + LangGraph" with `createAgent()` pattern

**Export 2: `explainTopic(topicKey)`**
- Direct key lookup: `explainTopic('login-flow')` → returns explanation string
- Fuzzy matching: `explainTopic('auth-flow')` matches key `'login-flow'`
- Fallback: unknown topic returns list of available topics
- Return type: non-empty string (for tool call response)

**Key usage:**
```js
import { explainTopic } from '../services/educationTopics.js';
const response = await explainTopic('langchain');  // Returns education content
```

### 2. mcpToolRegistry.js (Full Rewrite—Task 2)

**Removed:**
- `class McpToolWrapper` — no longer needed
- Import of `Tool` from `@langchain/core/tools`
- Bare `zod` import (now uses `zod/v4`)

**Updated:**
- Imports: `tool` from `@langchain/core/tools`, `z` from `zod/v4`, `explainTopic` from educationTopics, `createRequire` for CommonJS compat
- Changed `callMcpTool` function signature — params now extracted from individual tool calls

**New exports: 7 tools** (4 existing + 3 new)

All tools now use the `tool()` function pattern:
```js
tool(
  async (input, config) => {
    const { agentToken, userId, tokenEvents } = config.configurable.agentContext;
    // Tool implementation
    return JSON.stringify(result);
  },
  {
    name: 'tool_name',
    description: 'Tool description for agent',
    schema: z.object({ ... })
  }
)
```

**Auth context pattern:**
```js
function getAgentContext(config) {
  return config?.configurable?.agentContext ?? {};
}

// In tool:
const { agentToken, userId, tokenEvents } = getAgentContext(config);
```

**Existing 4 tools (rewritten with tool()):**
1. `get_my_accounts` — no params, returns account list
2. `create_transfer` — from_account_id, to_account_id, amount, description
3. `create_deposit` — account_id, amount, description
4. `create_withdrawal` — account_id, amount, description

**New 3 tools:**

5. **`explain_topic`**
   - Params: `topic` (string) — topic to explain
   - Call: `explainTopic(topic)`
   - Returns: Education content string (non-empty)
   - No auth required

6. **`brave_search`**
   - Params: `query` (string) — web search query
   - Call: `braveSearchService.search(query, { count: 5 })`
   - Returns: Formatted search results
   - Handles BRAVE_NOT_CONFIGURED gracefully

7. **`get_login_activity`**
   - Params: `username` (string) — user to look up
   - Call: Fetch `/api/auth/activity/by-username?username=...`
   - Returns: Formatted login activity logs (timestamp, endpoint, IP)
   - Uses agentToken + userId from auth context

**Key linking:**
```js
const tools = createMcpToolRegistry();
// Passed to createAgent():
const agent = createAgent({
  model: chatAnthropic,
  tools,  // 7 tools, all with configurable auth pattern
  systemPrompt
});

// Agent invocation passes auth:
const result = await agent.invoke({ messages }, {
  configurable: {
    agentContext: { agentToken, userId, tokenEvents }
  }
});
// ↓ tools receive config in (input, config) signature
```

## Verification Results

✅ **Task 1: educationTopics.js**
- `Object.keys(TOPIC_MESSAGES).length` → 11
- `explainTopic('login-flow')` → returns string starting with `🔐`
- `explainTopic('langchain')` → mentions "LangChain 1.x" and "createAgent()"
- `explainTopic('unknown')` → returns fallback list of topics
- Node import verify → ✓

✅ **Task 2: mcpToolRegistry.js**
- `createMcpToolRegistry().length` → 7
- Tool names: `get_my_accounts, create_transfer, create_deposit, create_withdrawal, explain_topic, brave_search, get_login_activity`
- `grep "class McpToolWrapper"` → 0
- `grep "from 'zod/v4'"` → 1
- `grep "from 'zod'"` (old) → 0
- `grep "from '@langchain/core/tools'"` → 1
- Node import verify → ✓

## What This Enables

✅ 7-tool LangChain 1.x agent registry (4 banking + 3 knowledge tools)
✅ Configurable auth context pattern (agentToken + userId + tokenEvents passed to each tool)
✅ Education content accessible via agent tool call (`explain_topic`)
✅ Web search capability (`brave_search`)
✅ Security audit capability (`get_login_activity`)
✅ Foundation for Plan 116-03 (UI wiring to call `/api/banking-agent/message`)

## Dependencies Resolved

- **Plan 116-01 Input:** `createMcpToolRegistry()` is imported by bankingAgentLangChainService.js
- **Plan 116-02 Output:** `createMcpToolRegistry()` returns 7 tools with configurable auth
- **Plan 116-03 Input:** Expects agents messages to flow through tool registry

## Next Steps

- **Plan 116-03:** Wire BankingAgent.js UI to `sendAgentMessage()` → `/api/banking-agent/message`, integrate HITL 428 consent modals

## Self-Check: PASSED ✅

- [x] educationTopics.js created with 11 topics + explainTopic()
- [x] mcpToolRegistry.js rewritten with tool() function
- [x] 7 tools total (4 existing + 3 new)
- [x] Configurable auth context pattern implemented
- [x] No McpToolWrapper class, no bare zod import
- [x] All acceptance criteria verified
- [x] Node smoke tests passing
