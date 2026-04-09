# Phase 116: Research — Full LangChain Native Agent Rebuild

**Researched:** 2026-04-09
**Status:** Complete

---

## Executive Summary

LangChain 1.x (installed: `langchain@1.3.1`, `@langchain/core@1.1.39`, `@langchain/anthropic@1.3.26`) is a **major version jump** from 0.x — the API is fundamentally different. `createStructuredChatAgent` and `AgentExecutor` from `langchain/agents` **no longer exist** (that subpath is not exported). The new API is `createAgent()` from the root `langchain` package, which creates a `ReactAgent` backed by LangGraph under the hood.

This is *more* native than the CONTEXT.md anticipated — the framework provides built-in HITL middleware (`humanInTheLoopMiddleware`) that natively handles interrupt + resume flows, eliminating the need for the custom `hitlGatewayMiddleware.js`.

---

## Standard Stack

### Core API Pattern

```js
import { createAgent } from 'langchain';
import { humanInTheLoopMiddleware } from 'langchain';
import { tool } from '@langchain/core/tools';
import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod/v4';

// 1. Define tools
const getAccountsTool = tool(
  async (_, config) => {
    // config.configurable.agentContext carries auth context
    const { agentToken, userId } = config.configurable.agentContext;
    return await callMcpTool('get_my_accounts', {}, agentToken, userId);
  },
  {
    name: 'get_my_accounts',
    description: 'List the authenticated user\'s bank accounts',
    schema: z.object({})
  }
);

// 2. Create agent (model can be string "claude-3-5-sonnet-20241022" or ChatAnthropic instance)
const agent = createAgent({
  model: new ChatAnthropic({ model: 'claude-3-5-sonnet-20241022', apiKey: process.env.ANTHROPIC_API_KEY }),
  tools: [getAccountsTool, ...otherTools],
  systemPrompt: 'You are a helpful banking assistant...',
  middleware: [
    humanInTheLoopMiddleware({
      interruptOn: {
        create_transfer: { allowedDecisions: ['approve', 'reject'], description: 'Approve fund transfer?' },
        create_deposit:  { allowedDecisions: ['approve', 'reject'] },
        create_withdrawal: { allowedDecisions: ['approve', 'reject'] }
      }
    })
  ]
});

// 3. Invoke with messages array (includes history for multi-turn)
const result = await agent.invoke({
  messages: [
    ...sessionHistory,           // prior exchanges from req.session.agentChatHistory
    { role: 'human', content: userMessage }
  ]
});
// result.messages contains ALL messages (input + AI + tool calls + tool results)
// result.__interrupt__?.[0] contains HITL interrupt data (if triggered)
```

### Zod Usage
LangChain 1.x internally uses **both** `zod/v3` (for core tools types) and `zod/v4`. User code should use `zod/v4` (installed as `zod@4.3.6`). Both paths work — `import { z } from 'zod/v4'` is the correct path for tool schemas.

---

## HITL Native Pattern (replaces custom hitlGatewayMiddleware.js)

LangChain 1.x ships `humanInTheLoopMiddleware` — this is the correct way to do HITL, not a custom Express middleware.

**How it works:**
1. Agent invokes a tool marked with `interruptOn`
2. `agent.invoke()` returns early with `result.__interrupt__[0]` set — execution is paused
3. Server returns `{ hitl: interruptData }` to the UI
4. UI shows consent modal; user approves/rejects
5. Client POSTs decision to `/api/banking-agent/consent`
6. Server reconstructs the interrupted message thread and calls `agent.invoke(new Command({ resume: { decisions: [...] } }), { configurable: { thread_id } })`
7. Agent resumes from the interrupt point

**Resume pattern requires LangGraph checkpointing** to persist interrupted state between HTTP requests. Since this is a stateless serverless environment (Vercel), use **in-memory checkpointer keyed by session ID** for the interrupt state. Not `MemorySaver` (that's for long-term), but storing the interrupted agent state in `req.session.pendingInterrupt = { threadId, interruptData }`.

**Simpler alternative for Phase 116:** Keep the existing custom `hitlGatewayMiddleware.js` approach (detect >$500 before tool execution, return `428`, wait for consent) since it already works and avoids LangGraph checkpointing complexity. The native HITL middleware requires persistent state (LangGraph thread_id), which adds complexity for serverless. **Recommendation: keep custom HITL middleware for Phase 116, use native HITL in a future phase when streaming/checkpointing is implemented.**

---

## Session History Pattern (D-03)

`ConversationBufferMemory` is deprecated. The correct approach for per-request agent with session history is to pass history directly in the `messages` array:

```js
// Load from session
const history = req.session.agentChatHistory || [];   // [{ role: 'human'|'ai', content: string }]
const MAX_HISTORY = 20;
const trimmedHistory = history.slice(-MAX_HISTORY);

// Invoke
const result = await agent.invoke({
  messages: [
    ...trimmedHistory,
    { role: 'human', content: req.body.message }
  ]
});

// Extract last AI response
const lastAiMsg = [...result.messages].reverse().find(m => m.constructor.name === 'AIMessage' || m.role === 'ai' || m.type === 'ai');
const reply = lastAiMsg?.content ?? 'No response';

// Persist
req.session.agentChatHistory = [
  ...trimmedHistory,
  { role: 'human', content: req.body.message },
  { role: 'ai', content: reply }
].slice(-MAX_HISTORY);
```

---

## Tool Context Pattern

Tools need access to `agentToken`, `userId`, and `tokenEvents` at invocation time. Pass via LangChain `config.configurable`:

```js
// In route handler
const result = await agent.invoke(
  { messages: [...history, { role: 'human', content: message }] },
  {
    configurable: {
      agentContext: {
        agentToken: req.agentContext.agentToken,
        userId: req.agentContext.userId,
        tokenEvents: req.tokenEvents
      }
    }
  }
);

// In tool implementation
const myTool = tool(
  async (input, config) => {
    const { agentToken, userId, tokenEvents } = config.configurable.agentContext;
    return await callMcpTool('get_my_accounts', {}, agentToken, userId, tokenEvents);
  },
  { name: 'get_my_accounts', schema: z.object({}), description: '...' }
);
```

---

## Architecture Patterns

### Don't Hand-Roll

| Pattern | Avoid | Use Instead |
|---------|-------|-------------|
| ConversationBufferMemory | ❌ deprecated | Pass history in `messages[]` |
| `createStructuredChatAgent` + `AgentExecutor` | ❌ not exported in 1.x | `createAgent()` from `langchain` |
| Custom intent routing (NL→tool dispatch) | ❌ brittle | Agent reasoning decides tool calls |
| LCEL `prompt \| llm.bind_tools(tools)` | ❌ old 0.3.x pattern | `createAgent({ model, tools })` |

### Model Initialization
```js
// Option A: String (auto-resolves via initChatModel, detects 'claude' prefix → anthropic)
createAgent({ model: 'claude-3-5-sonnet-20241022', tools })

// Option B: Instance (explicit, preferred for custom config)
createAgent({ model: new ChatAnthropic({ model: 'claude-3-5-sonnet-20241022', apiKey: ... }), tools })
```
Option B is preferred — explicit API key passing, no auto-detection magic.

### Import Paths (verified against installed packages)
```js
import { createAgent, humanInTheLoopMiddleware } from 'langchain';
import { tool } from '@langchain/core/tools';
import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod/v4';
// Note: 'langchain/agents' subpath does NOT exist in 1.x — throws ERR_PACKAGE_PATH_NOT_EXPORTED
```

---

## Common Pitfalls

1. **`langchain/agents` import fails** — That subpath is not exported in langchain 1.x. Import `createAgent` from root `langchain`.
2. **`AgentExecutor` not found** — Replaced by `ReactAgent` internally. Don't import it directly.
3. **`ConversationBufferMemory` pattern** — Deprecated. Use messages array with session history.
4. **zod v4 vs v3** — LangChain core uses both internally, but userland schemas should use `zod/v4` (your installed version). Do NOT use bare `import { z } from 'zod'` in tool schemas — use `zod/v4` explicitly.
5. **Tool function second parameter** — `tool(fn, fields)` — the function receives `(input, config)`. Use `config.configurable` for runtime context (auth tokens, etc.).
6. **`result.output` doesn't exist** — LangChain 1.x returns `{ messages: [...] }`. Extract the last AI message from `result.messages`, not `result.output`.
7. **Native HITL requires LangGraph checkpointing** — `humanInTheLoopMiddleware` uses `@langchain/langgraph` interrupt mechanism. Resuming requires a `thread_id` and persistent checkpoint store. For Phase 116, keep the existing custom HITL flow and store interrupt state in `req.session`.

---

## Files to Modify (Phase 116 scope)

| File | Change |
|------|--------|
| `banking_api_server/services/bankingAgentLangChainService.js` | Full rewrite: remove `createStructuredChatAgent`, implement `createAgent()` with session history pattern |
| `banking_api_server/utils/mcpToolRegistry.js` | Add 3 new tools: `get_login_activity`, `brave_search`, `explain_topic`. Refactor to use `tool()` function |
| `banking_api_server/routes/bankingAgentRoutes.js` | Fix response extraction (`result.messages` not `result.output`), wire token events via `configurable` |
| `banking_api_ui/src/components/BankingAgent.js` | Replace `parseNaturalLanguage()` dispatch with `POST /api/banking-agent/message` |
| `banking_api_ui/src/services/bankingAgentNlService.js` | Remove import from BankingAgent.js (keep file, just unused) |

---

## Validation Architecture

```
Dimension 1 — Agent initialization: `POST /api/banking-agent/init` returns 200
Dimension 2 — Message routing: `POST /api/banking-agent/message` with valid session → returns { reply, tokenEvents }
Dimension 3 — Multi-turn memory: Second message references first → reply is contextually coherent
Dimension 4 — Tool invocation: Message asking for accounts → agent calls get_my_accounts tool → returns account data
Dimension 5 — RFC 8693 token exchange: tokenEvents in response includes token_exchange entry
Dimension 6 — HITL trigger: Transfer >$500 → response includes hitl field with consentId
Dimension 7 — Education tool: Message "explain langchain" → agent calls explain_topic → returns education content
Dimension 8 — Build: `npm run build` in banking_api_ui exits 0
```
