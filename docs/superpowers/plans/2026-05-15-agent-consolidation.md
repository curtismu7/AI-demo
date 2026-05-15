# Agent Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate to one LangGraph agent running as a reasoning-only service on :3006 (BFF keeps token custody + HITL), and enforce one app-wide LLM provider-resolution rule (Heuristic → Helix → Ollama-only-if-configured).

**Architecture:** Two phases. Phase 1 builds a single shared `llmProviderResolver` and converges every provider-default site onto it (independently shippable, low risk). Phase 2 ports the in-process LangGraph graph into `banking_agent_service` (:3006) as a stateless reasoning oracle; the BFF drives a turn loop and remains the sole token custodian + HITL enforcer.

**Tech Stack:** Node.js (CommonJS, `banking_api_server`), TypeScript (`banking_agent_service`), Jest, LangGraph (`@langchain/langgraph`), Express.

**Spec:** `docs/superpowers/specs/2026-05-15-agent-consolidation-design.md`

---

## File Structure

**Phase 1 (provider resolver):**
- Create: `banking_api_server/services/llmProviderResolver.js` — the single resolution function
- Create: `banking_api_server/tests/llmProviderResolver.regression.test.js` — resolver unit tests
- Modify: `banking_api_server/services/agentBuilder.js` (~line 162) — call resolver
- Modify: `banking_api_server/services/geminiNlIntent.js` (~line 234 doc, ~line 250 default) — call resolver, fix doc
- Modify: `banking_api_server/routes/langchainConfig.js` (~line 165) — call resolver instead of `|| 'ollama'`

**Phase 2 (:3006 LangGraph move):**
- Create: `banking_agent_service/src/reasoningGraph.ts` — ported LangGraph graph (TS)
- Create: `banking_agent_service/src/reasonRoute.ts` — `POST /api/agent/reason` handler
- Modify: `banking_agent_service/src/index.ts` — replace `/api/agent/task`, delete token/MCP code
- Create: `banking_api_server/services/agentReasoningClient.js` — BFF→:3006 HTTP client + turn loop
- Modify: `banking_api_server/services/bankingAgentLangGraphService.js` — `processAgentMessage` calls the loop instead of in-process graph
- Create: `banking_api_server/tests/agentReasoningLoop.regression.test.js` — loop + fallback + HITL-suspend tests
- Modify: `CONTEXT.md` — agent glossary
- Modify: `banking_api_ui/src/pages/LangChainPage.js` + placement-mode copy — narrative labels (Phase 2 final task)

---

# PHASE 1 — Single Provider Resolver

### Task 1: Create the `llmProviderResolver` module (TDD)

**Files:**
- Create: `banking_api_server/services/llmProviderResolver.js`
- Test: `banking_api_server/tests/llmProviderResolver.regression.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// banking_api_server/tests/llmProviderResolver.regression.test.js
/**
 * Regression: one canonical provider resolver.
 * Rule (ARCHITECTURE-TRUTHS T-3): Heuristic runs upstream (not here).
 * When consulted: explicit choice honored; else Helix; Ollama ONLY if
 * explicitly selected AND configured, else fall back to Helix.
 */
jest.mock('../services/configStore', () => ({
  getEffective: jest.fn(() => ''),
}));
const { resolveLlmProvider } = require('../services/llmProviderResolver');

describe('resolveLlmProvider', () => {
  test('defaults to helix when no provider set', () => {
    expect(resolveLlmProvider({})).toEqual({ provider: 'helix', model: undefined });
  });

  test('honors explicit helix', () => {
    expect(resolveLlmProvider({ provider: 'helix', model: 'gpt-4o-mini' }))
      .toEqual({ provider: 'helix', model: 'gpt-4o-mini' });
  });

  test('honors explicit ollama when configured (ollama_base_url present)', () => {
    expect(resolveLlmProvider({ provider: 'ollama', ollama_base_url: 'http://localhost:11434', model: 'llama3.2' }))
      .toEqual({ provider: 'ollama', model: 'llama3.2' });
  });

  test('falls back to helix when ollama selected but NOT configured', () => {
    expect(resolveLlmProvider({ provider: 'ollama' }))
      .toEqual({ provider: 'helix', model: undefined });
  });

  test('unknown provider falls back to helix', () => {
    expect(resolveLlmProvider({ provider: 'gpt5' }))
      .toEqual({ provider: 'helix', model: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd banking_api_server && npx jest tests/llmProviderResolver.regression.test.js`
Expected: FAIL — `Cannot find module '../services/llmProviderResolver'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// banking_api_server/services/llmProviderResolver.js
/**
 * Single canonical LLM provider resolver (ARCHITECTURE-TRUTHS T-3).
 *
 * The heuristic is NOT a provider — it always runs upstream and is the
 * deterministic floor. This resolver is consulted only when the heuristic
 * did not answer.
 *
 * Rule: explicit langchainConfig.provider is honored; otherwise Helix.
 * 'ollama' is returned ONLY when explicitly selected AND configured
 * (an ollama_base_url is present, or OLLAMA_BASE_URL env is set). If
 * 'ollama' is selected but not configured, fall back to Helix — never a
 * dead Ollama call. No other module may inline a provider default.
 *
 * @param {{ provider?: string, model?: string, ollama_base_url?: string }} langchainConfig
 * @returns {{ provider: 'helix'|'ollama', model: string|undefined }}
 */
function resolveLlmProvider(langchainConfig = {}) {
  const requested = langchainConfig && langchainConfig.provider;
  const model = langchainConfig && langchainConfig.model;

  if (requested === 'ollama') {
    const configured =
      !!(langchainConfig && langchainConfig.ollama_base_url) ||
      !!process.env.OLLAMA_BASE_URL;
    if (configured) return { provider: 'ollama', model };
    return { provider: 'helix', model };
  }

  if (requested === 'helix') return { provider: 'helix', model };

  // No explicit provider, or an unknown one → Helix (the default LLM).
  return { provider: 'helix', model };
}

module.exports = { resolveLlmProvider };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd banking_api_server && npx jest tests/llmProviderResolver.regression.test.js`
Expected: PASS — 5 passed

- [ ] **Step 5: Commit**

```bash
git add banking_api_server/services/llmProviderResolver.js banking_api_server/tests/llmProviderResolver.regression.test.js
git commit -m "feat(llm): single canonical provider resolver (T-3)"
```

---

### Task 2: Converge `agentBuilder.js` onto the resolver

**Files:**
- Modify: `banking_api_server/services/agentBuilder.js:160-163`

- [ ] **Step 1: Replace the inline default**

In `banking_api_server/services/agentBuilder.js`, find (around line 160-163):

```javascript
        // Initialize LLM provider (Helix, Ollama, or others)
    let model;
    const provider = langchainConfig?.provider || 'helix';
    const selectedModel = langchainConfig?.model || DEFAULT_MODELS[provider];
```

Replace with:

```javascript
        // Initialize LLM provider — resolution is centralized (T-3).
    let model;
    const { resolveLlmProvider } = require('./llmProviderResolver');
    const { provider } = resolveLlmProvider(langchainConfig);
    const selectedModel = langchainConfig?.model || DEFAULT_MODELS[provider];
```

- [ ] **Step 2: Run agent builder + existing agent tests to verify no regression**

Run: `cd banking_api_server && npx jest agentBuilder bankingAgent --passWithNoTests`
Expected: PASS (or no test files — that is acceptable here; behavior verified by Task 5 integration)

- [ ] **Step 3: Syntax check**

Run: `cd banking_api_server && node -c services/agentBuilder.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add banking_api_server/services/agentBuilder.js
git commit -m "refactor(agentBuilder): use central provider resolver, drop inline default"
```

---

### Task 3: Converge `geminiNlIntent.js` onto the resolver + fix stale doc

**Files:**
- Modify: `banking_api_server/services/geminiNlIntent.js:234` (doc), `:250` (default)

- [ ] **Step 1: Fix the stale doc comment**

In `banking_api_server/services/geminiNlIntent.js` around line 234, find:

```javascript
 * @param {string} [provider='auto'] - 'auto' (heuristic→ollama), 'ollama' (skip heuristic), 'helix', etc.
```

Replace with:

```javascript
 * @param {string} [provider='auto'] - 'auto' (heuristic→helix), 'ollama' (skip heuristic, requires Ollama configured), 'helix'. See llmProviderResolver.
```

- [ ] **Step 2: Replace the inline default with the resolver**

Around line 250, find:

```javascript
  const selectedProvider = provider === 'auto' ? (langchainConfig?.provider || configStore.get('provider') || 'helix') : provider;
```

Replace with:

```javascript
  const { resolveLlmProvider } = require('./llmProviderResolver');
  const selectedProvider = provider === 'auto'
    ? resolveLlmProvider(langchainConfig).provider
    : provider;
```

- [ ] **Step 3: Syntax check**

Run: `cd banking_api_server && node -c services/geminiNlIntent.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Run NL-intent-related tests**

Run: `cd banking_api_server && npx jest geminiNlIntent nlIntent --passWithNoTests`
Expected: PASS (or no matching test files — acceptable)

- [ ] **Step 5: Commit**

```bash
git add banking_api_server/services/geminiNlIntent.js
git commit -m "refactor(nl-intent): central provider resolver + fix stale heuristic→ollama doc"
```

---

### Task 4: Fix the Ollama-default in `routes/langchainConfig.js`

**Files:**
- Modify: `banking_api_server/routes/langchainConfig.js:165`

- [ ] **Step 1: Replace `|| 'ollama'` with the resolver**

In `banking_api_server/routes/langchainConfig.js` around line 164-165, find:

```javascript
  const cfg = getLangchainConfig(req);
  const activeProvider = cfg.provider || 'ollama';
```

Replace with:

```javascript
  const cfg = getLangchainConfig(req);
  const { resolveLlmProvider } = require('../services/llmProviderResolver');
  const activeProvider = resolveLlmProvider(cfg).provider;
```

- [ ] **Step 2: Syntax check**

Run: `cd banking_api_server && node -c routes/langchainConfig.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add banking_api_server/routes/langchainConfig.js
git commit -m "fix(langchain-config): default to Helix via resolver, not Ollama"
```

---

### Task 5: Phase 1 verification — critical suite + manual provider check

**Files:** none (verification only)

- [ ] **Step 1: Run the resolver suite + critical regression suite**

Run:
```bash
cd banking_api_server && npx jest tests/llmProviderResolver.regression.test.js oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration
```
Expected: all PASS (5 resolver + 38 critical = 43 passed)

- [ ] **Step 2: Grep-assert no inline provider defaults remain**

Run:
```bash
cd banking_api_server && grep -rnE "\|\|\s*'(ollama|helix)'" services/agentBuilder.js services/geminiNlIntent.js routes/langchainConfig.js || echo "CLEAN — no inline provider defaults"
```
Expected: `CLEAN — no inline provider defaults`

- [ ] **Step 3: Add REGRESSION_PLAN §4 entry**

Add to `REGRESSION_PLAN.md` §4 (top, reverse-chronological), using the project template (Files changed / What was broken / What was fixed / Verify / Do not break). Summary: provider resolution unified into `llmProviderResolver.js`; `routes/langchainConfig.js` no longer defaults to Ollama; T-3 single-resolver invariant now enforced. Do-not-break: no module may reintroduce an inline `|| 'helix'`/`|| 'ollama'`.

- [ ] **Step 4: Commit**

```bash
git add REGRESSION_PLAN.md
git commit -m "docs(regression): §4 entry — single provider resolver (Phase 1)"
```

---

# PHASE 2 — LangGraph reasoning service on :3006

> Phase 2 preconditions: Phase 1 merged. The BFF keeps token custody + HITL; :3006 becomes reasoning-only.

### Task 6: Define the `/api/agent/reason` contract (shared types doc)

**Files:**
- Create: `banking_agent_service/src/reasonContract.ts`

- [ ] **Step 1: Write the contract types**

```typescript
// banking_agent_service/src/reasonContract.ts
// BFF ↔ :3006 reasoning protocol (no user token crosses this boundary).

export interface ReasonToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ReasonMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

export interface ReasonRequest {
  messages: ReasonMessage[];
  tools: ReasonToolSchema[];
  provider: 'helix' | 'ollama'; // already resolved by the BFF
  model?: string;
  // Helix connection config (BFF-owned; passed through, never a token)
  helixConfig?: Record<string, string | undefined>;
  ollamaBaseUrl?: string;
}

export type ReasonResponse =
  | { type: 'tool_calls'; calls: Array<{ id: string; name: string; args: Record<string, unknown> }>; messages: ReasonMessage[] }
  | { type: 'final'; answer: string; messages: ReasonMessage[] };
```

- [ ] **Step 2: Build the TS service to verify it compiles**

Run: `cd banking_agent_service && npm run build && echo BUILD_OK`
Expected: `BUILD_OK` (tsc compiles `dist/`)

- [ ] **Step 3: Commit**

```bash
git add banking_agent_service/src/reasonContract.ts
git commit -m "feat(agent-svc): BFF↔:3006 reasoning protocol contract"
```

---

### Task 7: Port the LangGraph graph into `banking_agent_service` (reasoning-only)

**Files:**
- Create: `banking_agent_service/src/reasoningGraph.ts`

This ports the graph from `banking_api_server/services/agentBuilder.js` but **removes** tool execution — the graph emits tool-call intents instead of invoking tools (the BFF executes them).

- [ ] **Step 0: Capture the real Helix request shape (prerequisite — do not skip)**

Run: `cd banking_api_server && grep -n -A30 "function callHelixAgent" services/helixLlmService.js`
Record the exact axios URL path, body fields, and headers. `helixClient.ts` (Step 2) MUST replicate that shape verbatim — the structure shown in Step 2 is a scaffold, the real endpoint/fields come from this output. If they differ, the Step 2 code is wrong; use what this command shows.

- [ ] **Step 1: Create the reasoning graph**

```typescript
// banking_agent_service/src/reasoningGraph.ts
// Reasoning-only LangGraph. Ported from banking_api_server/services/agentBuilder.js.
// CRITICAL: this graph NEVER executes tools and NEVER touches a token. It runs
// one agent step: given messages + tool schemas, it returns either a final
// answer or a batch of tool-call intents for the BFF to execute.
import { ChatOllama } from '@langchain/ollama';
import { RunnableLambda } from '@langchain/core/runnables';
import type { ReasonRequest, ReasonResponse, ReasonMessage } from './reasonContract';

// Mirrors banking_api_server agentBuilder DEFAULT_MODELS.
const DEFAULT_MODELS: Record<string, string> = { ollama: 'llama3.2', helix: 'gpt-4o-mini' };

function buildModel(req: ReasonRequest) {
  if (req.provider === 'helix') {
    // Helix is called via the same HTTP shape the BFF uses; the BFF passes
    // helixConfig through (no secret persisted here).
    const helixConfig = req.helixConfig || {};
    return RunnableLambda.from(async (messages: ReasonMessage[]) => {
      const { callHelix } = await import('./helixClient');
      return await callHelix(helixConfig, messages);
    });
  }
  const baseUrl = req.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  return new ChatOllama({ model: req.model || DEFAULT_MODELS.ollama, temperature: 0.7, baseUrl });
}

/**
 * One reasoning step. Returns tool_calls (for the BFF to execute) or a final
 * answer. The graph loop itself is driven by the BFF (Task 10), so this is a
 * single-turn pure function — no recursion here.
 */
export async function reasonOnce(req: ReasonRequest): Promise<ReasonResponse> {
  const model = buildModel(req);
  const bound = (model as any).bindTools
    ? (model as any).bindTools(req.tools.map(t => ({
        name: t.name, description: t.description, input_schema: t.inputSchema,
      })))
    : model;

  const response: any = await bound.invoke(req.messages);

  if (response.tool_calls && response.tool_calls.length > 0) {
    return {
      type: 'tool_calls',
      calls: response.tool_calls.map((tc: any) => ({
        id: tc.id, name: tc.name, args: tc.args || {},
      })),
      messages: [...req.messages, { role: 'assistant', content: response.content || '' }],
    };
  }

  const answer = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content ?? '');
  return {
    type: 'final',
    answer,
    messages: [...req.messages, { role: 'assistant', content: answer }],
  };
}
```

- [ ] **Step 2: Create the minimal Helix client used above**

```typescript
// banking_agent_service/src/helixClient.ts
// Thin Helix caller. Mirrors banking_api_server/services/helixLlmService.js
// request shape. Receives connection config from the BFF per request; persists
// nothing. Returns an object with a `.content` string + optional `.tool_calls`
// so reasoningGraph can treat it uniformly with ChatOllama output.
import axios from 'axios';
import type { ReasonMessage } from './reasonContract';

export async function callHelix(
  cfg: Record<string, string | undefined>,
  messages: ReasonMessage[],
): Promise<{ content: string; tool_calls?: unknown[] }> {
  const baseUrl = cfg.helix_base_url;
  if (!baseUrl) throw new Error('[helixClient] helix_base_url missing');
  const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const res = await axios.post(
    `${baseUrl}/openidm/endpoint/agent`,
    { [cfg.helix_prompt_field_id || 'prompt']: prompt, agentId: cfg.helix_agent_id },
    { headers: { 'x-api-key': cfg.helix_api_key || '' }, timeout: 30000 },
  );
  const text = typeof res.data === 'string' ? res.data : (res.data?.output ?? JSON.stringify(res.data));
  return { content: String(text) };
}
```

> NOTE: The exact Helix request path/fields must match `banking_api_server/services/helixLlmService.js` `callHelixAgent`. Before implementing, open that file and copy its real axios call shape into `helixClient.ts` verbatim (URL path, body fields, headers). The shape above is the structure; the exact endpoint/fields come from that file.

- [ ] **Step 3: Build**

Run: `cd banking_agent_service && npm run build && echo BUILD_OK`
Expected: `BUILD_OK`

- [ ] **Step 4: Commit**

```bash
git add banking_agent_service/src/reasoningGraph.ts banking_agent_service/src/helixClient.ts
git commit -m "feat(agent-svc): reasoning-only LangGraph ported from agentBuilder (no tool exec, no tokens)"
```

---

### Task 8: Add `POST /api/agent/reason`, delete token/MCP code from index.ts

**Files:**
- Create: `banking_agent_service/src/reasonRoute.ts`
- Modify: `banking_agent_service/src/index.ts` (replace `/api/agent/task`; remove `resolveGatewayToken` + `McpGatewayClient` usage)

- [ ] **Step 1: Create the route handler**

```typescript
// banking_agent_service/src/reasonRoute.ts
import type { Request, Response } from 'express';
import { reasonOnce } from './reasoningGraph';
import type { ReasonRequest } from './reasonContract';

const SHARED_SECRET_HEADER = 'x-internal-gateway-secret';

export function makeReasonHandler(internalSecret: string) {
  return async function reasonHandler(req: Request, res: Response): Promise<void> {
    // BFF↔:3006 hop is gated by a shared secret. No user token crosses here.
    const presented = req.headers[SHARED_SECRET_HEADER];
    if (!internalSecret || presented !== internalSecret) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const body = req.body as ReasonRequest;
    if (!body || !Array.isArray(body.messages) || !Array.isArray(body.tools)) {
      res.status(400).json({ error: 'messages[] and tools[] required' });
      return;
    }
    try {
      const out = await reasonOnce(body);
      res.json(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Agent] reason error:', msg);
      res.status(500).json({ error: 'reason_failed', detail: msg });
    }
  };
}
```

- [ ] **Step 2: Wire it into index.ts and remove the token/MCP path**

In `banking_agent_service/src/index.ts`:
- Remove the `import { McpGatewayClient }` line and the `resolveGatewayToken` import/usage.
- Delete the entire `app.post('/api/agent/task', ...)` handler.
- Add:

```typescript
import { makeReasonHandler } from './reasonRoute';

const INTERNAL_SECRET = process.env.BFF_INTERNAL_SECRET || '';
if (!INTERNAL_SECRET) {
  console.error('[Agent] FATAL: BFF_INTERNAL_SECRET unset — /api/agent/reason would be open. Refusing to start.');
  process.exit(1);
}
app.post('/api/agent/reason', express.json({ limit: '256kb' }), makeReasonHandler(INTERNAL_SECRET));
```

> NOTE: Keep the existing `GET /health` handler and the existing hardened middleware (bounded body, vault startup). Only the `/api/agent/task` handler and its token/MCP imports are removed.

- [ ] **Step 3: Build**

Run: `cd banking_agent_service && npm run build && echo BUILD_OK`
Expected: `BUILD_OK` (compile fails loudly if a deleted symbol is still referenced — fix any stragglers)

- [ ] **Step 4: Commit**

```bash
git add banking_agent_service/src/reasonRoute.ts banking_agent_service/src/index.ts
git commit -m "feat(agent-svc): /api/agent/reason (shared-secret gated); remove own token-exchange + MCP client"
```

---

### Task 9: BFF reasoning client + turn loop (TDD)

**Files:**
- Create: `banking_api_server/services/agentReasoningClient.js`
- Test: `banking_api_server/tests/agentReasoningLoop.regression.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// banking_api_server/tests/agentReasoningLoop.regression.test.js
/**
 * Regression: BFF drives the reason loop. :3006 proposes tool calls; the BFF
 * executes them (custody stays here). On :3006 failure the loop returns a
 * heuristic-fallback signal (never a dead end). Recursion cap enforced BFF-side.
 */
jest.mock('axios');
const axios = require('axios');
const { runReasonLoop } = require('../services/agentReasoningClient');

function exec(name) { return `result:${name}`; }

describe('runReasonLoop', () => {
  beforeEach(() => jest.clearAllMocks());

  test('final answer in one round', async () => {
    axios.post.mockResolvedValueOnce({ data: { type: 'final', answer: 'hi', messages: [] } });
    const out = await runReasonLoop({
      messages: [{ role: 'user', content: 'hello' }], tools: [],
      provider: 'helix', executeTool: exec, maxIterations: 10,
    });
    expect(out).toEqual({ ok: true, answer: 'hi' });
  });

  test('one tool round then final — BFF executes the tool', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { type: 'tool_calls', calls: [{ id: '1', name: 'get_x', args: {} }], messages: [] } })
      .mockResolvedValueOnce({ data: { type: 'final', answer: 'done', messages: [] } });
    const calls = [];
    const out = await runReasonLoop({
      messages: [{ role: 'user', content: 'x' }], tools: [],
      provider: 'helix', executeTool: (n) => { calls.push(n); return 'r'; }, maxIterations: 10,
    });
    expect(calls).toEqual(['get_x']);
    expect(out).toEqual({ ok: true, answer: 'done' });
  });

  test(':3006 failure → heuristic-fallback signal, not a throw', async () => {
    axios.post.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const out = await runReasonLoop({
      messages: [{ role: 'user', content: 'x' }], tools: [],
      provider: 'helix', executeTool: exec, maxIterations: 10,
    });
    expect(out).toEqual({ ok: false, reason: 'reasoning_unavailable' });
  });

  test('recursion cap enforced BFF-side', async () => {
    axios.post.mockResolvedValue({ data: { type: 'tool_calls', calls: [{ id: '1', name: 'loop', args: {} }], messages: [] } });
    const out = await runReasonLoop({
      messages: [{ role: 'user', content: 'x' }], tools: [],
      provider: 'helix', executeTool: exec, maxIterations: 3,
    });
    expect(out).toEqual({ ok: false, reason: 'max_iterations' });
    expect(axios.post.mock.calls.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd banking_api_server && npx jest tests/agentReasoningLoop.regression.test.js`
Expected: FAIL — `Cannot find module '../services/agentReasoningClient'`

- [ ] **Step 3: Implement the client + loop**

```javascript
// banking_api_server/services/agentReasoningClient.js
/**
 * BFF→:3006 reasoning client. The BFF DRIVES the loop and EXECUTES tools
 * (token custody + HITL stay here). :3006 only proposes tool calls or returns
 * a final answer. On :3006 failure we signal heuristic-fallback (the heuristic
 * already ran upstream — ARCHITECTURE-TRUTHS T-3 floor). Recursion cap is
 * enforced here, mirroring the old in-process MAX_TOOL_ITERATIONS.
 */
const axios = require('axios');

const REASON_URL =
  (process.env.AGENT_SERVICE_URL || 'http://localhost:3006') + '/api/agent/reason';

/**
 * @param {object} p
 * @param {Array} p.messages
 * @param {Array} p.tools  tool schemas
 * @param {'helix'|'ollama'} p.provider  already resolved by the BFF
 * @param {string} [p.model]
 * @param {object} [p.helixConfig]
 * @param {string} [p.ollamaBaseUrl]
 * @param {(name:string, args:object)=>Promise<any>} p.executeTool  BFF-side tool exec
 * @param {number} p.maxIterations
 * @returns {Promise<{ok:true,answer:string}|{ok:false,reason:'reasoning_unavailable'|'max_iterations'}>}
 */
async function runReasonLoop(p) {
  const secret = process.env.BFF_INTERNAL_SECRET || '';
  let messages = p.messages;
  for (let i = 0; i < p.maxIterations; i++) {
    let resp;
    try {
      resp = await axios.post(
        REASON_URL,
        {
          messages,
          tools: p.tools,
          provider: p.provider,
          model: p.model,
          helixConfig: p.helixConfig,
          ollamaBaseUrl: p.ollamaBaseUrl,
        },
        { headers: { 'x-internal-gateway-secret': secret }, timeout: 35000 },
      );
    } catch (err) {
      // :3006 unreachable / 5xx / timeout — heuristic is the floor upstream.
      return { ok: false, reason: 'reasoning_unavailable' };
    }
    const data = resp.data;
    if (data.type === 'final') return { ok: true, answer: data.answer };
    if (data.type === 'tool_calls') {
      const toolMessages = [];
      for (const call of data.calls) {
        // executeTool performs RFC 8693 + MCP + HITL gate in the BFF. If it
        // throws an HITL-suspend sentinel the caller (Task 10) handles 428;
        // here we just propagate by rethrowing.
        const result = await p.executeTool(call.name, call.args);
        toolMessages.push({ role: 'tool', content: typeof result === 'string' ? result : JSON.stringify(result), tool_call_id: call.id });
      }
      messages = [...(data.messages || messages), ...toolMessages];
      continue;
    }
    return { ok: false, reason: 'reasoning_unavailable' };
  }
  return { ok: false, reason: 'max_iterations' };
}

module.exports = { runReasonLoop };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd banking_api_server && npx jest tests/agentReasoningLoop.regression.test.js`
Expected: PASS — 4 passed

- [ ] **Step 5: Commit**

```bash
git add banking_api_server/services/agentReasoningClient.js banking_api_server/tests/agentReasoningLoop.regression.test.js
git commit -m "feat(bff): BFF-driven reason loop client (custody + cap stay BFF-side)"
```

---

### Task 10: Wire `processAgentMessage` to the loop (BFF keeps heuristic + tool exec + HITL)

**Files:**
- Modify: `banking_api_server/services/bankingAgentLangGraphService.js` (the LLM branch — currently `createBankingAgent` + `graph.invoke`, around lines 432-477)

- [ ] **Step 1: Replace the in-process graph invocation with the loop**

In `bankingAgentLangGraphService.js`, the heuristic-first block stays exactly as-is. Only the LLM fallback portion changes. Find the block that calls `createBankingAgent(...)` then `graph.invoke(...)` (≈ lines 432-477) and replace the graph construction + invoke with:

```javascript
    // LLM path — reasoning now runs in banking_agent_service (:3006). The BFF
    // resolves the provider, supplies tool schemas, EXECUTES tools locally
    // (RFC 8693 + MCP + HITL all stay here), and drives the loop.
    const { resolveLlmProvider } = require('./llmProviderResolver');
    const { runReasonLoop } = require('./agentReasoningClient');
    const { provider, model } = resolveLlmProvider(langchainConfig);

    // Tool schemas the agent may propose (names/descriptions/inputSchema only —
    // never executors). Reuse the existing tool list builder used by the old
    // in-process graph (the same `tools` array createBankingAgent built).
    const toolSchemas = await buildToolSchemasForAgent({ userId, req }); // see Step 2

    const loopResult = await runReasonLoop({
      messages: [{ role: 'user', content: message }],
      tools: toolSchemas,
      provider,
      model,
      helixConfig: extractHelixConfig(langchainConfig), // see Step 2
      ollamaBaseUrl: langchainConfig?.ollama_base_url,
      maxIterations: MAX_TOOL_ITERATIONS,
      executeTool: async (name, args) => {
        // Existing BFF tool execution path — unchanged. This is where the
        // HITL 428 gate fires (transactionConsentChallenge). If it throws the
        // existing hitl-required error, let it propagate so the route returns
        // 428 to the browser exactly as today.
        return await executeBffTool({ name, args, userId, userToken, req, tokenEvents });
      },
    });

    if (loopResult.ok) {
      return {
        reply: loopResult.answer, success: true, toolsCalled: [], tokensUsed: 0,
        requiresConsent: false, agentConfigured: true, tokenEvents: tokenEvents || [],
      };
    }
    if (loopResult.reason === 'max_iterations') {
      return {
        reply: 'Agent reached maximum tool iteration limit. Please rephrase your request or try a simpler query.',
        success: false, toolsCalled: [], tokensUsed: 0, requiresConsent: false,
        agentConfigured: true, tokenEvents: tokenEvents || [], error: 'max_tool_iterations',
      };
    }
    // reasoning_unavailable → fall through to the heuristic result already
    // computed earlier in this function (T-3 floor). Return that instead of a
    // dead end.
    return heuristicFallbackResult || {
      reply: 'Advanced reasoning is temporarily unavailable. Please try a simpler request.',
      success: false, toolsCalled: [], tokensUsed: 0, requiresConsent: false,
      agentConfigured: true, tokenEvents: tokenEvents || [], error: 'reasoning_unavailable',
    };
```

- [ ] **Step 2: Extract the two helpers from the old in-process path**

The old `createBankingAgent` built a `tools` array (LangChain tools with executors) and an LLM. Extract two small helpers in the same file (or a sibling) WITHOUT changing tool behavior:
- `buildToolSchemasForAgent({userId, req})` → returns `[{name, description, inputSchema}]` derived from the SAME tool list `createBankingAgent` used (strip the executors).
- `executeBffTool({name, args, userId, userToken, req, tokenEvents})` → invokes the SAME tool executor the old in-process tool node called (`tool.invoke(args, { configurable: { agentContext: { agentToken, userId, tokenEvents }}})`), preserving the HITL-throw behavior.
- `extractHelixConfig(langchainConfig)` → the existing `helixConfig` object literal already built in `agentBuilder.js` lines 172-178 (helix_base_url/api_key/environment_id/agent_id/prompt_field_id).
- `heuristicFallbackResult` → capture the heuristic result computed in the heuristic-first block so the `reasoning_unavailable` branch can return it.

> Implementation note: these helpers MUST reuse the existing tool definitions/executors verbatim — do not re-implement tools. The goal is to split "schema vs execute," not to change what tools do. Open `agentBuilder.js` lines 257-292 (the tool node) for the exact `tool.invoke` shape to preserve.

- [ ] **Step 3: Syntax check**

Run: `cd banking_api_server && node -c services/bankingAgentLangGraphService.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Run the critical suite (HITL must still pass)**

Run: `cd banking_api_server && npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration agentReasoningLoop`
Expected: all PASS (38 critical + 4 loop)

- [ ] **Step 5: Commit**

```bash
git add banking_api_server/services/bankingAgentLangGraphService.js
git commit -m "feat(bff): processAgentMessage drives :3006 reason loop; heuristic/HITL/custody unchanged"
```

---

### Task 11: End-to-end verification (live)

**Files:** none (verification only)

- [ ] **Step 1: Set the shared secret and restart the stack**

Ensure `BFF_INTERNAL_SECRET` is set in `banking_api_server/.env` (it already exists for `/internal/id-token`; reuse the same value). `banking_agent_service/.env` symlinks to it, so :3006 sees the same secret.

Run: `cd /Users/curtismuir/Development/banking && ./run-bank.sh restart 2>&1 | tail -5`
Expected: services start; `./run-bank.sh status` shows Agent Service :3006 OK (no `Missing AGENT_CLIENT_ID` — that var is no longer required since the token path is removed; if it still references it, remove the requirement in `config.ts` as part of Task 8).

- [ ] **Step 2: Browser smoke — the muddle case + HITL**

- Sign in as customer → middle agent → type `transactions` → recent transactions render (the original reported bug, now via :3006).
- Type a transfer ≥ threshold → `AgentConsentModal` appears (HITL 428 still BFF-side) → confirm → transfer completes, conversation resumes.
- Stop :3006 (`kill $(cat /tmp/bank-agent-service.pid)`), ask a non-heuristic question → heuristic fallback answers (no dead end). Restart :3006.

- [ ] **Step 3: Log assertions**

Run: `grep -E "reason_failed|/api/agent/reason|reasoning_unavailable|May not request scopes" /tmp/bank-api-server.log /tmp/bank-agent-service.log | tail`
Expected: `/api/agent/reason` 200s on success; no `May not request scopes`; `reasoning_unavailable` only when :3006 was deliberately down.

- [ ] **Step 4: Add REGRESSION_PLAN §4 entry (Phase 2)**

Add §4 entry: LangGraph reasoning moved to :3006 (reasoning-only, shared-secret gated); BFF drives the loop and remains sole token custodian + HITL enforcer; :3006's own token-exchange/MCP code deleted. Do-not-break: :3006 must never receive a user token or execute tools; HITL stays BFF-side; loop recursion cap mirrors MAX_TOOL_ITERATIONS.

- [ ] **Step 5: Commit**

```bash
git add REGRESSION_PLAN.md
git commit -m "docs(regression): §4 entry — LangGraph reasoning service on :3006 (Phase 2)"
```

---

### Task 12: Narrative + labeling (presentation only)

**Files:**
- Modify: `CONTEXT.md` (agent glossary)
- Modify: `banking_api_ui/src/pages/LangChainPage.js` (one-line banner)
- Modify: placement-mode selector copy (locate in `BankingAgent.js` / `AgentUiModeContext.js` consumer)

- [ ] **Step 1: Update CONTEXT.md agent glossary**

Replace the three-bullet "agent" entry so the canonical agent is "the LangGraph reasoning service on :3006, driven by the BFF"; `langchain_agent` is "the Python LangChain cross-stack exhibit"; note the in-process BFF agent no longer exists as a distinct thing (it is the BFF↔:3006 orchestrator).

- [ ] **Step 2: Add the /langchain banner**

In `banking_api_ui/src/pages/LangChainPage.js`, add a single non-emoji info banner near the top: "Python LangChain variant — the same delegated-OAuth security model as the main agent, running in a different runtime (Python + local Ollama)."

- [ ] **Step 3: Placement-mode copy**

Add a one-line clarifier near the placement toggle (Middle/Float/Bottom) that these are views of one agent, not different agents. No behavior change.

- [ ] **Step 4: UI build gate (MANDATORY — CLAUDE.md)**

Run: `cd banking_api_ui && npm run build`
Expected: exit code 0

- [ ] **Step 5: Commit**

```bash
git add CONTEXT.md banking_api_ui/src/pages/LangChainPage.js banking_api_ui/src/components/BankingAgent.js
git commit -m "docs(narrative): one-agent story — glossary + /langchain + placement copy"
```

---

## Done Criteria

- Phase 1: `llmProviderResolver` is the only place a provider default exists; grep-clean; 43 tests pass.
- Phase 2: `transactions` works through :3006 in the browser; HITL transfer still gated BFF-side and resumes; :3006-down falls back to heuristic; :3006 has no token-exchange/MCP code; UI build exits 0.
- ARCHITECTURE-TRUTHS T-3 (already strengthened) holds; two REGRESSION_PLAN §4 entries added.
