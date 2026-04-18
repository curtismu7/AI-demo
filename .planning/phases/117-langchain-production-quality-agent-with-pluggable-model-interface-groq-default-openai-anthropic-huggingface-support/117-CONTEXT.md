# Phase 117 Context — LangChain pluggable model interface

**Phase:** 117
**Created:** 2026-04-18
**Status:** Ready for planning

---

## Phase Goal

Build the first production-quality pluggable model layer for the LangChain agent, with Groq as the default and OpenAI, Anthropic, and HuggingFace available through the same abstraction.

Note: the current Phase 117 goal text in ROADMAP appears stale and unrelated. Use this context as the source of truth for planning scope.

---

## Decisions

### 1. First-pass scope
**Decision:** Provider abstraction plus configuration UI
- This phase should include both the server-side provider abstraction and a user/admin-facing configuration surface for choosing providers
- Do not stop at backend-only plumbing

### 2. Provider set
**Decision:** Groq default, OpenAI, Anthropic, and HuggingFace in scope
- Planning should assume these four provider paths are part of the first implementation pass
- Groq remains the default starting provider unless the user explicitly switches

### 3. What is deferred
**Decision:** Automatic failover is not required in this phase
- Provider failover order and resilience orchestration can be a later phase
- The first pass should prefer explicit provider selection and solid per-provider config/validation

### 4. UX expectation
**Decision:** Real configuration, not placeholder controls
- The UI should make provider choice and required credentials/settings understandable
- If some providers require different settings, the UI should adapt rather than showing one generic form

---

## Canonical refs

- `langchain_agent/src/main.py` — current LangChain application bootstrap
- `langchain_agent/src/services/interfaces.py` — existing interface abstraction patterns in the LangChain agent
- `langchain_agent/src/authentication/interfaces.py` — another example of provider/interface abstraction in the same subsystem
- `banking_api_ui/src/services/bankingAgentLangGraphClientService.js` — current client-side agent API surface
- `banking_api_ui/src/App.js` — existing `/langchain` route wiring
- `banking_api_server/src/__tests__/phase116-agent-comprehensive-flows.test.js` — recent LangChain-agent flow coverage that planning should avoid regressing

---

## Specifics

- Reuse existing LangChain agent architecture rather than forking separate agents per provider
- Planning should account for provider-specific credentials, model identifiers, and configuration validation
- Configuration should feel production-grade, not demo-only

---

## Deferred ideas

- Automatic provider fallback chains
- Quota/error-based model failover orchestration
- Advanced provider benchmarking UI

---

*Status: discussion complete — ready for `/gsd-plan-phase 117`*