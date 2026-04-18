# Phase 124 Context — MFA HITL indication

**Phase:** 124
**Created:** 2026-04-18
**Status:** Ready for planning

---

## Phase Goal

Add clear Human-in-the-Loop indication to MFA and step-up flows so users understand that a manual approval step is required, without changing the underlying approval mechanics.

---

## Decisions

### 1. Primary UX treatment
**Decision:** Prompt plus persistent badge
- The main MFA/HITL prompt must clearly say manual approval is required
- A visible HITL badge/icon should persist through the approval flow so the state does not disappear after the first prompt

### 2. Scope boundary
**Decision:** Keep this focused on flow indication, not broader education work
- Do not expand this phase into a full education-panel rewrite
- The emphasis is in-flow clarity during the actual MFA/HITL experience

### 3. Coverage expectation
**Decision:** Apply consistently across step-up scenarios
- The same indication pattern should work wherever the app triggers step-up/HITL approval, not just one narrow path
- Preserve the existing approval mechanics and server contract

### 4. Guardrail
**Decision:** No new approval steps
- This phase should improve wording, visual state, and continuity only
- Avoid adding extra clicks or branching logic unless already required by the current flow

---

## Canonical refs

- `banking_api_ui/src/services/bankingAgentLangGraphClientService.js` — current client handling for agent HITL consent responses
- `banking_api_ui/src/services/agentFlowDiagramService.js` — existing step-up/HITL flow states and naming
- `banking_api_server/config/runtimeSettings.js` — step-up configuration and transaction-type thresholds
- `banking_api_server/src/__tests__/transaction-consent-challenge.test.js` — current step-up/OTP approval flow behavior that must remain intact
- `banking_api_server/server.js` — authenticated agent route surface for consent/approval interactions

---

## Specifics

- The default phrase should strongly indicate manual approval, not just generic MFA verification
- The badge/icon should remain visible throughout the relevant approval state, not flash once and disappear
- If multiple current UI surfaces handle step-up differently, planning should normalize the indication pattern without redesigning the whole system

---

## Deferred ideas

- Broader education-panel treatment of HITL concepts
- Richer audit/history surfaces for approval decisions

---

*Status: discussion complete — ready for `/gsd-plan-phase 124`*