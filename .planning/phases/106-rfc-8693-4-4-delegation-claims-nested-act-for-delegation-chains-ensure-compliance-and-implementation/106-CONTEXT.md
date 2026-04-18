# Phase 106 Context — RFC 8693 nested act delegation chains

**Phase:** 106
**Created:** 2026-04-18
**Status:** Ready for planning

---

## Phase Goal

Implement and verify RFC 8693 Section 4.4 delegation-chain compliance for nested `act` claims. This phase is about correctness and standards alignment in token structure and backend handling, not about adding new UI.

Note: the current Phase 106 goal text in ROADMAP appears stale and unrelated. Use this context as the source of truth for planning scope.

---

## Decisions

### 1. Scope boundary
**Decision:** RFC compliance only
- Focus on nested `act` delegation claim handling, validation, decoding, and documentation/tests where needed
- Do not add new end-user UI or visualization in this phase

### 2. What must be proven
**Decision:** End-to-end nested chain correctness
- The code should correctly preserve and interpret delegation chains beyond a single `act.sub`
- Planning should cover token issuance assumptions, decode/display helpers used by developers, and any authorization checks that inspect actor identity

### 3. Where to enforce or validate
**Decision:** Backend logic, token-handling docs, and tests
- Prioritize the token exchange path, any backend authorization logic that inspects `act`, and developer-facing diagnostics/docs
- Add or update tests/examples if needed to prove nested-chain handling is correct

### 4. Explicitly out of scope
**Decision:** UI surfacing is deferred
- If nested-chain visualization would help, capture it as a follow-on phase rather than expanding this one

---

## Canonical refs

- `docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md` — explains `may_act -> act` transition and delegation-chain semantics
- `docs/ARCHITECTURE_WALKTHROUGH.md` — current delegated token-flow documentation and `act` claim examples
- `banking_api_server/src/services/errorMessageBuilder.js` — existing teaching/error copy around missing delegation claims
- `banking_api_server/src/services/errorSchemaService.js` — delegation-related error schema definitions
- `.planning/debug/TOKEN-CHAIN-DECODED-DEBUG.md` — evidence about claim preservation in decoded token paths

---

## Specifics

- Planning should treat nested `act` support as a token-structure and policy correctness problem first
- If the current code only handles `act.sub`, the plan should explicitly decide whether deeper paths like `act.act.sub` must be preserved, validated, or surfaced in debug outputs

---

## Deferred ideas

- Visualize nested delegation chains in token-chain UI or education panels
- Add a separate educational walkthrough focused on nested actor chains

---

*Status: discussion complete — ready for `/gsd-plan-phase 106`*