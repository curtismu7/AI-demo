# Agent Consolidation — One LangGraph Service, Three Frontends, One Provider Rule

**Date:** 2026-05-15
**Status:** Approved (brainstorming complete) — ready for implementation planning
**Branch context:** `fix/config-precedence-vault-sqlite-env`

## Problem

The demo presents three agents that are easy to confuse:

1. **BFF LangGraph agent** — in-process inside `banking_api_server`, LangChain.js / LangGraph, owns conversation state + HITL gates. Reached via `/api/banking-agent/message`. The live primary.
2. **`banking_agent_service` (:3006)** — standalone Node/TS, raw Anthropic/OpenAI SDK (not LangChain), does its *own* RFC 8693 exchange + MCP gateway connection. Actively hardened (8+ recent security commits; Phase 261 roadmapped) but **not wired to any UI**.
3. **`langchain_agent` (:8889)** — Python LangChain + local Ollama. First-class presented exhibit with its own `/langchain` page, Config panel, Ollama panel.

The user's pain point is **narrative, not code duplication**: audiences can't tell which agent is "the" agent or why three exist; it derails the OAuth/token-custody teaching story; the dead :3006 service makes the stack look broken; UI placement modes (Middle/Float/Bottom) get mistaken for "the three agents."

A second, cross-cutting defect surfaced during exploration: **LLM provider resolution is inconsistent app-wide**. `agentBuilder.js:162` defaults to Helix, `geminiNlIntent.js:250` defaults to Helix via a different path, `routes/langchainConfig.js:165` defaults to **Ollama**, and a doc comment claims `heuristic→ollama`. The intended rule is **Heuristic → Helix → (Ollama only if explicitly selected AND configured)**.

## Goal

One coherent story: **one LangGraph agent, running as its own service (:3006), under the user's delegated identity (RFC 8693) with the BFF as sole token custodian, dockable three ways (Middle / Float / Bottom).** Plus: one consistent provider-resolution rule, enforced in exactly one place.

## Non-Goals (YAGNI)

- No rewrite of `langchain_agent` (#3); it stays as a deliberately-labeled cross-stack exhibit, untouched.
- No new UI components; no redesign of `BankingAgent.js`; no change to the three placement modes' behavior.
- No streaming token responses (future, separate concern).
- No moving token custody or HITL out of the BFF.
- No reviving #2's old `runAgentTask` / Anthropic-SDK semantics.

## Chosen Approach: A — Thin reasoning service, BFF executes tools

Rejected alternatives:

- **B (full agent on :3006, BFF forwards user token):** moves the user token + HITL across a process boundary — contradicts the "BFF is sole token custodian" invariant (CLAUDE.md / REGRESSION_PLAN §1). Rejected by explicit user constraint.
- **C (logical service only, no physical split):** zero risk but does not deliver the "agent is a separate service" lesson the user explicitly wants. Rejected in Q4.

## Architecture

```
Browser (Middle | Float | Bottom — same BankingAgent.js, unchanged)
  → (cookie) → BFF  /api/banking-agent/message
        [token custodian, heuristic-first, HITL/428, Token Chain, loop driver]
      → HTTP → banking_agent_service :3006   [LangGraph reasoning ONLY]
      ← tool_call intents ─┐
      │ BFF executes tool (RFC 8693 + MCP gateway + HITL gate + Token Chain)
      └→ tool results → :3006 continues graph → final answer
  ← reply + tokenEvents → Browser
```

**The cut line:** today `processAgentMessage` does both reasoning (LangGraph loop) and execution (tool calls via injected `agentContext`). Approach A splits along the seam that already exists logically (the injected-`agentContext` boundary):

- **`:3006` owns:** LangGraph graph construction, LLM invocation with the *resolved* provider/model, the agent⇄tools reasoning loop, recursion cap. Receives messages + tool *schemas*; returns either a final answer or a batch of tool-call intents. **Never sees a user token, never connects to the MCP gateway, never calls PingOne.** Its current `resolveGatewayToken` + `McpGatewayClient` code is **deleted**.
- **BFF owns (unchanged behavior):** session/token custody, RFC 8693 exchange (incl. the 2026-05-15 single-resource-scope fix), HITL 428 gate, `req.session.txConsentChallenges`, Token Chain `tokenEvents`, the heuristic fast-path (runs before :3006 is consulted — ARCHITECTURE-TRUTHS T-3), and now the loop orchestration + recursion cap.

Net effect: one LangGraph codebase in the already-existing separate service, with the token-custody boundary made *structurally* explicit — :3006 cannot touch a token because the token-holding process is a different one.

## BFF ↔ :3006 Reasoning Protocol

**Endpoint:** `POST :3006/api/agent/reason` (replaces `/api/agent/task`, which did its own token exchange).

**Auth:** the BFF↔:3006 hop is gated by a shared secret (reuse the existing `requireBearerToken` middleware shell, semantics changed: shared secret, **not** a user token — no user token crosses the boundary).

**Transport:** plain HTTP/JSON on loopback (`http://localhost:3006`). No WebSocket (request/response loop, not streaming).

**BFF-driven turn loop** (BFF is the orchestrator; :3006 is a stateless reasoning oracle):

```
1. BFF → :3006   { messages: [...history, userMsg], tools: [schemas],
                    provider, model }            ← provider already resolved
2. :3006 → BFF   { type: "tool_calls", calls: [{id,name,args}], messages:[...] }
3. BFF executes each call locally
      (RFC 8693 + MCP gateway + HITL gate + Token Chain)
      ├─ ok           → tool result
      └─ HITL needed  → BFF returns 428 to BROWSER; loop suspends (see HITL)
4. BFF → :3006   { messages: [...prev, toolResults] }
5. :3006 → BFF   { type: "final", answer, messages }   ← or another tool_calls round
6. BFF → Browser { reply, tokenEvents }
```

- **No conversation state on :3006.** Full history is passed each turn (it already is, in-process, via `finalState.messages`). Conversation memory stays BFF session-side.
- **Recursion cap** (`MAX_TOOL_ITERATIONS`, currently 10) moves to the BFF loop counter; same limit, same user-facing message on hit.
- **Failure modes:** :3006 unreachable / 5xx / timeout → BFF falls back to the **heuristic** answer (T-3 floor; the heuristic already ran first) with a clear "advanced reasoning unavailable" note. Preserves today's behavior when the LLM is down.

## HITL / Consent Across the Boundary

**Invariant:** the HITL gate fires at tool-execution time, and tool execution stays in the BFF. So consent fires in exactly the same place as today. :3006 is never involved in consent.

Flow when a tool needs consent (e.g., transfer ≥ threshold):

```
:3006 → BFF   tool_calls: [{ name:"create_transfer", args:{...} }]
BFF executes create_transfer
  → transactionConsentChallenge fires (Phase 170, unchanged)
  → BFF responds to BROWSER: HTTP 428 + challengeId (existing shape)
  → reasoning loop SUSPENDED. :3006 not told. No state parked on :3006.

User confirms in AgentConsentModal (unchanged UI, all 3 placements)
  → Browser → BFF POST /api/transactions (or /consent) w/ consentChallengeId
  → BFF verifies + consumes challenge (one-time, unchanged)
  → BFF resumes: re-enters the BFF↔:3006 loop with session-stored history
     + the resolved tool result
  → :3006 continues the graph → final answer
```

**Unchanged (REGRESSION_PLAN §1 — will-not-break):**

- `services/transactionConsentChallenge.js` (transfer-always-requires-consent, OTP HMAC, timing-safe compare).
- `routes/transactions.js` 428 enforcement + one-time `consentChallengeId` consumption. **This remains the money-path backstop against any double-execution on resume.**
- `req.session.txConsentChallenges` (stays BFF session-side; :3006 has no session).
- `AgentConsentModal` across all three placement frontends.
- Token Chain `tokenEvents` (generated BFF-side during BFF tool execution).

**Resumption:** the BFF replays the BFF↔:3006 loop with the conversation history (already in the BFF session — that's where `langchain_config` / message context live) plus the resolved tool result, mechanically the same as a normal continuation round.

**Security boundary statement:** consent decision, challenge issuance/consumption, and token custody never leave the BFF. :3006 cannot bypass HITL because it cannot execute tools at all — only propose them. Strictly stronger than today's shared-address-space model.

## Code Disposition

**`banking_agent_service` (:3006):** keep the hardened *shell* (bounded body, vault-aware startup, prompt-store, the recent security commits); change the *execution model*.

| Current | Target |
|---|---|
| `resolveGatewayToken(userToken)` (own RFC 8693) | **Removed** |
| `McpGatewayClient` (own WS to gateway :3005) | **Removed** |
| `runAgentTask` (raw Anthropic/OpenAI SDK) | **Replaced** by LangGraph graph ported from `agentBuilder.js` |
| `POST /api/agent/task` (token exchange + MCP) | **Replaced** by `POST /api/agent/reason` (stateless) |
| `requireBearerToken` (user token) | **Kept**, semantics → shared-secret gate for the BFF hop |

**BFF in-process code:**

- `services/agentBuilder.js` (graph construction + LLM invocation) → **moves to :3006** as the reasoning core; consumes the shared provider resolver (below), not an inline `|| 'helix'`.
- `services/bankingAgentLangGraphService.js` `processAgentMessage` → **splits**: heuristic-first gate + tool execution + HITL + Token Chain **stays in BFF** and becomes the loop orchestrator; the reasoning portion now calls :3006 instead of invoking the graph in-process.
- `routes/bankingAgentRoutes.js` `/api/banking-agent/message` → **browser contract unchanged**; internally calls the new loop.

**Three frontends (Middle / Float / Bottom):** zero code change. They share `BankingAgent.js` and hit `/api/banking-agent/message`; "done" by virtue of the preserved BFF contract.

**`langchain_agent` (#3):** out of scope; untouched. Its muddle is addressed by narrative/labeling only.

## Single Provider Resolver (app-wide)

One canonical function. Every LLM path calls it. No inline provider defaults anywhere.

```
resolveLlmProvider(langchainConfig) → 'helix' | 'ollama'
  1. Heuristic is NOT a provider — always runs first, upstream, unchanged
     (T-3). Resolver consulted only when the heuristic did not answer.
  2. langchainConfig.provider explicitly set → use it (honors a
     per-session/admin choice, including an intentional 'ollama').
  3. Else → 'helix'   (the default LLM, always).
  4. 'ollama' returned ONLY when explicitly selected per #2 AND Ollama is
     configured+enabled (base URL reachable / ff flag on). Selected but not
     configured → fall back to 'helix', never a dead Ollama call.
```

**Location:** new shared module `banking_api_server/services/llmProviderResolver.js`. BFF-side (the BFF owns `langchainConfig` / session / configStore — T-3, T-6). :3006 receives the *already-resolved* provider+model in the `/api/agent/reason` payload and does **not** re-resolve. Single decision point.

**Convergence (audit + fix list):**

| Site | Today | After |
|---|---|---|
| `agentBuilder.js:162` | inline `\|\| 'helix'` | `resolveLlmProvider()` (in ported code) |
| `geminiNlIntent.js:250` | `\|\| configStore.get('provider') \|\| 'helix'` | `resolveLlmProvider()` |
| `geminiNlIntent.js:234` | doc says `heuristic→ollama` | doc corrected: `heuristic→helix` |
| `routes/langchainConfig.js:165` | `cfg.provider \|\| 'ollama'` ❌ | `resolveLlmProvider()` |
| ported LangGraph on :3006 | (new) | uses resolved value from payload |

**Invariant (ARCHITECTURE-TRUTHS T-3, already strengthened in repo):** provider resolution is Heuristic → Helix → Ollama-only-if-configured, computed in exactly one function, BFF-side; no path may inline a provider default.

## Demo Narrative (resolves the muddle)

One-sentence story:
> "One AI agent — a LangGraph reasoning service running as its own process — performs delegated banking actions under the user's identity via RFC 8693, with the BFF as sole token custodian. You can dock that same agent three ways."

| Surface | Narrative role |
|---|---|
| Middle / Float / Bottom | Same agent, three placements — a UX nicety, explicitly **not** three agents |
| `/langchain` page (#3) | "Same security model, different stack (Python LangChain + local Ollama)" — a labeled, deliberate contrast |
| :3006 as a visible service | "The agent is a separate service, same OAuth" — surfaced in service status / Token Chain |

Presentation-only changes (no behavior):

- Placement-mode selector copy clarifying these are views of one agent.
- One-line banner on `/langchain` framing it as the Python-LangChain variant.
- `CONTEXT.md` "agent" glossary: canonical agent = LangGraph service on :3006; `langchain_agent` = labeled cross-stack exhibit; the in-process BFF agent ceases to exist as a distinct thing (becomes the BFF↔:3006 orchestrator).
- Service status / Token Chain shows :3006 as "Agent (LangGraph)".

## Regression / Risk Notes

- REGRESSION_PLAN §1 token-custody + HITL invariants: **preserved and strengthened** (custody boundary becomes a process boundary).
- New risk surface: the BFF↔:3006 loop (network hop where there was an in-process call). Mitigated by: stateless :3006, heuristic fallback on :3006 failure, recursion cap moved to BFF, one-time consent-challenge consumption unchanged as money-path backstop.
- Phase 261 ("agent service error propagation") is not conflicted: this spec does **not** execute Phase 261's plan items, but it preserves their intent — :3006 still exists and stays hardened; it stops being a second token custodian. Phase 261 should be re-scoped against this new topology when it is picked up.
- Provider-resolver change touches `routes/langchainConfig.js` (currently Ollama-default) — verify the Config UI / Ollama panel still report correctly after convergence.

## Open Questions for Implementation Planning

- Exact `/api/agent/reason` request/response JSON schema (tool schema shape, message format parity with current LangGraph state).
- Shared-secret mechanism for the BFF↔:3006 hop (reuse an existing internal-secret pattern, e.g. the `/internal/id-token` shared-secret convention).
- Whether the ported graph lives as TS in `banking_agent_service/src/` (matches that service's TS build) vs. a shared package — likely TS port, since `agentBuilder.js` is JS and :3006 is TS.
- Test strategy: regression pair for the new loop (heuristic fallback on :3006 down; HITL suspend/resume across the boundary).

---

## Phase 2 Re-Spec Required (2026-05-15 — execution paused after Task 6)

**Status:** Phase 1 (Tasks 1–5) shipped and clean. Phase 2 (Tasks 7–12) PAUSED.
Task 6 (`reasonContract.ts`) landed. Task 7 hit a foundational plan error and
the user chose to re-spec Phase 2 rather than patch it mid-execution.

**Verified findings that invalidate the original Phase 2 plan:**

1. **`banking_agent_service` has NO `@langchain/*` dependencies.** Its deps are
   `axios, dotenv, express, jsonwebtoken, ws` only. The original plan's Task 7
   assumed `import { ChatOllama } from '@langchain/ollama'` / `@langchain/core`
   — those packages are absent. The plan was wrong to assume a verbatim
   LangChain graph port.

2. **Helix never used LangChain tool-binding.** In the in-process
   `agentBuilder.js`, the Helix provider is a bare
   `RunnableLambda.from(callHelixAgent)` with **no `bindTools`** (only the
   Ollama branch calls `model.bindTools(tools)`). Helix returns a plain string
   and cannot emit `tool_calls`. "Port the LangGraph graph including Helix
   tool-calling" was never a real capability.

3. **`callHelixAgent` is a 3-step `fetch` Helix Conversation API flow**, not a
   single axios call (create conversation → post message → poll up to 30s).
   Auth is `x-api-key` (not Bearer). Path base `/dpc/jas/helix/v1`. The Task 7
   scaffold's "single axios call" was structurally wrong.

4. **`banking_agent_service` already has a working axios-based agent loop**
   (`src/agentOrchestrator.ts`): Anthropic/OpenAI providers, MCP-gateway tool
   loop, no LangChain. The service already demonstrates the no-LangChain
   pattern the reasoning service should follow.

5. `agentBuilder.js` `DEFAULT_MODELS` has 6 entries (ollama, openai, anthropic,
   groq, google, helix), not the 2 in the scaffold — values for ollama/helix
   happen to match but the re-spec should use the real map.

**Re-spec direction (decided): no-LangChain port.** Implement the reasoning
step in plain `axios`/`fetch` inside `banking_agent_service`:
- Ollama via its REST API directly (no `ChatOllama`).
- Helix via a faithful port of `helixLlmService.js`'s 3-step Conversation flow
  (the existing `helixClient.ts` scaffold's throw must be replaced with that
  real flow).
- No new dependencies added to `banking_agent_service`.
- Tool-calling: only the Ollama path can propose tool_calls (mirrors current
  BFF behavior); Helix returns a final answer string. The reasoning-only
  contract (`reasonContract.ts`, already committed) is unaffected and stays.
- Everything else in the design (Approach A, BFF-driven loop, HITL stays
  BFF-side, single provider resolver, narrative) remains valid — only the
  *implementation mechanism* of the reasoning step changes from
  "LangChain graph port" to "axios/fetch reasoning step."

**Next action when resumed:** rewrite Phase 2 tasks (7–12) in the
implementation plan against this no-LangChain approach, then resume
subagent-driven execution. `reasonContract.ts` (Task 6) is correct as-is and
needs no change.
