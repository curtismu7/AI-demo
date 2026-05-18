# ChatGPT / Claude as the Agent — Design

**Date:** 2026-05-18
**Status:** Approved (design); implementation plan to follow
**Author:** Curtis Muir (with Claude Code)
**Goal:** Teach the identity/token-custody tradeoff of handing agent control to a third party.

---

## 1. Problem & Goal

Question raised: *"Could we use ChatGPT or Claude as the agent for our app? What would we lose (first token exchange, for example)?"*

The driving goal is **pedagogical**, not adoption: the demo's value is showing
exactly which identity and security guarantees are forfeited as you hand more of
the agent loop to a third-party platform. The comparison itself is the
deliverable.

## 2. Core Insight

The Super Banking architecture has a clean seam: **reasoning is separate from
identity**.

- The **LLM brain** picks which MCP tool to call from chat text
  (Helix→Claude / Ollama / instant heuristic). It never touches a token.
- The **BFF** is sole token custodian. It performs the RFC 8693 exchange
  (user = `subject_token`, agent = optional `actor_token`, narrowed `aud` +
  scope), enforces the PingAuthorize gate, and surfaces every step in the
  **Token Chain UI panel**.

"Use ChatGPT/Claude as the agent" is really three different shapes, each of
which moves that seam to a different place. The migration of the boundary *is*
the lesson.

## 3. The Three Shapes

### Option A — Swap the LLM brain only (the real path)

Replace Helix/Ollama with a direct OpenAI or Anthropic API call **for tool
routing only**, behind the existing `llmProviderResolver.js` single resolution
point (ARCHITECTURE-TRUTHS T-3). Heuristic still runs first (T-3 safety floor).
BFF still does the full RFC 8693 exchange.

- **Lost:** essentially nothing. Token chain, `act` claim, narrowed `aud`/scope,
  PingAuthorize gate — all intact.
- **Consistent with:** T-3 (single resolver, no inline defaults), T-4 (PingOne
  mints; services only request).
- **Note:** partially exists already — Helix wraps Claude Sonnet 4.6.

### Option B — Hosted agent platform (instrumented downgrade demo)

Hand the conversation loop to OpenAI's Responses API (or an Anthropic agent
loop) with the Super Banking MCP server registered as a tool. The platform
orchestrates tool calls; the app becomes a tool provider.

- **Lost — and this is the headline answer to "first token exchange":** the
  per-tool RFC 8693 exchange. Per OpenAI's docs, you pass an `authorization`
  value on **every** Responses API request and OpenAI deliberately does **not**
  store it — there is no place for a per-tool, narrowed, actor-stamped token.
  You hand one broad bearer token to a third party.
- **Specifically forfeited:** the `act` delegation claim; per-tool scope
  narrowing; single-resource audience discipline (T-10); the Token Chain panel
  goes dark exactly where it is most instructive.
- **Also:** tool args + results enter OpenAI's model context ("a malicious
  server can exfiltrate… anything that enters the model's context").

### Option C — ChatGPT/Claude.ai as the MCP client (optional extreme demo)

Expose Super Banking tools as a remote MCP server users connect to *from*
ChatGPT or Claude.ai directly. The app's UI/BFF is not in the loop.

- **Lost:** custody entirely. Anthropic's cloud performs OAuth 2.1 + PKCE
  (DCR/CIMD/Anthropic-held creds), and **stores + refreshes** the token
  (reactive on 401, proactive ~5 min before expiry) across all Claude surfaces.
  The server receives one connector-scoped token; Anthropic's docs are silent
  on downstream RFC 8693. BFF/Token-Chain story is entirely absent.
- **Gained:** users where they are.

## 4. Comparison Table

| | A. Swap LLM brain | B. Hosted agent platform | C. Platform as client |
|---|---|---|---|
| User token held by | BFF (unchanged) | BFF, but handed to OpenAI per request | Anthropic/OpenAI cloud |
| RFC 8693 exchange | Intact | Lost at agent boundary | Lost |
| `act` / delegation claim | Preserved | Gone | Gone |
| Per-tool scope narrowing | Preserved | Gone | Gone |
| Token Chain UI panel | Fully works | Goes dark past BFF→OpenAI | N/A (UI not in loop) |
| Sees tool args/results | Your infra + chosen API | OpenAI infra | Platform cloud |
| Token refresh owner | You | You (per-request, not stored) | Platform |
| Ops burden delta | Lowest | Medium | Run hardened public MCP server |

## 5. Decision

**Build A as the baseline real path. Instrument B (and optionally C) as
deliberate "downgrade" demos.**

The lesson lands hardest when the audience watches the Token Chain panel light
up under the BFF agent (`subject_token → act claim → narrowed aud`), then
watches that *same panel go dark* when the loop is flipped to a third-party
platform. The contrast is the curriculum.

Concretely:

- **A** — add OpenAI/Anthropic as first-class providers in
  `llmProviderResolver` (token chain fully intact — the "right way").
- **B** — a demo route handing the loop to OpenAI's Responses API with the MCP
  server as a tool; Token Chain panel explicitly annotates "delegation lost
  here — third party holds a broad token."
- **C** — optional: a documented "connect from Claude.ai" path narrated as
  "zero custody, zero exchange visibility."

This converts "what would we lose" from a risk into the teaching material.

## 6. Constraints & Non-Negotiables

- ARCHITECTURE-TRUTHS T-3: single resolver point, no inline LLM defaults;
  heuristic always runs first.
- ARCHITECTURE-TRUTHS T-4: PingOne mints tokens; services only request.
- Token custody rule (CLAUDE.md): tokens never exposed to the browser for
  Option A. Options B/C are *explicitly demonstrating* the violation as a
  teaching device and must be clearly labeled as such in the UI/logs.
- REGRESSION_PLAN §1 protected files (llmProviderResolver, agentMcpTokenService,
  bankingAgentLangGraphService) — pre-read required before edits; minimal diff.
- No emojis except ⚠️ ✅ ❌.
- UI build must exit 0 after any `banking_api_ui` change.

## 7. Out of Scope

- Replacing the BFF token custody model for production (A keeps it).
- Removing Helix/Ollama (A adds providers alongside; does not remove).
- Real production adoption of B/C — they are instrumented teaching demos only.

## 8. Open Questions for Implementation Plan

- Which provider first for A — Anthropic direct, OpenAI direct, or both?
- Does B target OpenAI Responses API only, or also an Anthropic agent loop?
- Is C in scope for the first implementation pass, or documented-only?

---

## Sources

- [OpenAI – Remote MCP & connectors](https://platform.openai.com/docs/guides/tools-remote-mcp)
- [OpenAI – MCP and Connectors guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [Anthropic – Authentication for connectors](https://claude.com/docs/connectors/building/authentication)
- [Claude Help Center – Custom connectors via remote MCP](https://support.claude.com/en/articles/11503834-build-custom-connectors-via-remote-mcp-servers)
- [State of MCP 2026: AI Agents, OAuth, and Your Money](https://truthifi.com/education/state-of-mcp-2026-ai-agents-custom-connectors)
