# Phase 190 Context — Align UI with 2-token exchange taxonomy and education

**Phase:** 190
**Created:** 2026-04-18
**Status:** Ready for planning

---

## Phase Goal

Bring all user-facing token-exchange terminology and examples into alignment with Phase 188 so the UI consistently teaches RFC 8693 subject token, actor token, MCP-scoped access token, and the 1-exchange / 2-exchange distinction.

## Decisions

### 1. Source of truth

**Decision:** Phase 188 glossary drives terminology

- `docs/TOKEN_TERMINOLOGY_GLOSSARY.md` is the canonical vocabulary
- UI should prefer `1-exchange` and `2-exchange` over older `single`, `double`, or numbered legacy labels like `Exchange 3`

### 2. Scope boundary

**Decision:** UI copy and visuals only

- Update education panels, diagrams, and test-page copy
- Do not change server-side token behavior in this phase
- Do not expand into new product features beyond copy/visual alignment

### 3. What must stay accurate

**Decision:** Preserve flow distinctions

- 1-exchange: subject token only
- 2-exchange: subject token + actor token
- Phase 186 ID-token flow remains a distinct variant and must not be renamed into 2-exchange

### 4. Verification requirement

**Decision:** React build is mandatory

- After UI changes, run `cd banking_api_ui && npm run build`

## Canonical refs

- `docs/TOKEN_TERMINOLOGY_GLOSSARY.md` — canonical RFC 8693 vocabulary and exchange pattern names
- `.planning/ROADMAP.md` — Phase 188 taxonomy and current roadmap framing
- `banking_api_ui/src/components/TokenExchangeFlowDiagram.jsx` — current token-exchange mode labels and tooltips
- `banking_api_ui/src/components/education/TokenChainEducationPanel.js` — exchange-path teaching copy and examples
- `banking_api_ui/src/components/PingOneTestPage.jsx` — test-page labels still using legacy exchange numbering
- `banking_api_ui/src/components/education/RFC8707Content.js` — educational references to 1-exchange and 2-exchange docs

## Specifics

- Review user-facing labels, helper copy, examples, and diagram captions before editing
- Prefer minimal wording changes over UI restructuring
- If a label is tied to persisted code behavior, rename only the displayed text unless implementation changes are truly required

## Deferred ideas

- Broader token-chain visual redesign
- New education panel solely for taxonomy differences

---

Status: planning-ready from captured todo context
