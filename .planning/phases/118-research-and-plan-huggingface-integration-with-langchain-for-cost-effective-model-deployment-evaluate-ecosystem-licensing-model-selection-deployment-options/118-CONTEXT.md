# Phase 118 Context — HuggingFace research and planning

**Phase:** 118
**Created:** 2026-04-18
**Status:** Ready for planning

---

## Phase Goal

Research and recommend the right HuggingFace integration strategy for this LangChain-based system, comparing hosted and self-hosted deployment options for cost, licensing, model fit, and operational complexity.

Note: the current Phase 118 goal text in ROADMAP appears stale and unrelated. Use this context as the source of truth for planning scope.

---

## Decisions

### 1. Research boundary
**Decision:** Compare both hosted and self-hosted paths
- Evaluate HuggingFace managed/API options and self-hosted or dedicated deployment options
- Do not optimize for only one path up front

### 2. Evaluation dimensions
**Decision:** Research must cover practical adoption criteria
- Licensing and usage restrictions
- Model-family suitability for this banking/agent use case
- LangChain integration fit
- Operational complexity, secrets/auth, and deployment burden
- Cost and latency tradeoffs

### 3. Deliverable shape
**Decision:** The research should end with a recommendation, not just a survey
- Planning should produce a clear near-term recommended path and a fallback/alternative path
- If the answer differs for local dev versus hosted deployment, make that explicit

### 4. Scope guardrail
**Decision:** This phase is research/planning first
- No large implementation should be assumed as part of this phase unless the plan explicitly scopes a thin proof-of-concept

---

## Canonical refs

- `langchain_agent/src/main.py` — current LangChain application entrypoint and integration boundary
- `langchain_agent/src/services/interfaces.py` — abstraction pattern for plugging in new provider behavior
- `banking_api_ui/src/App.js` — existing `/langchain` surface for any future UI tie-in
- `banking_api_ui/src/services/bankingAgentLangGraphClientService.js` — current client path to the agent
- `banking_api_server/src/__tests__/phase116-agent-comprehensive-flows.test.js` — recent agent behavior that provider changes must preserve

---

## Specifics

- Planning should compare hosted inference endpoints against self-hosted or dedicated inference deployment, not just raw model quality
- The recommendation should explicitly call out what would be needed to fit HuggingFace into the Phase 117 pluggable-provider architecture

---

## Deferred ideas

- Full multi-provider failover across hosted and self-hosted HuggingFace options
- Automated cost benchmarking harness

---

*Status: discussion complete — ready for `/gsd-plan-phase 118`*