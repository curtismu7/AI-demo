# Phase 174: HITL Step-Up Modal — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current toast-based MFA step-up UX with a blocking dark-overlay modal that collects OTP input, freezes the agent until resolved, and provides minimal educational context. Consent challenges and auth-challenge redirects keep their current patterns.

</domain>

<decisions>
## Implementation Decisions

### Modal Trigger Points
- **D-01:** Only MFA step-up (`mfa_required`) gets a blocking modal. Consent challenge keeps its inline card (`ba-inline-consent-card`). Auth challenge redirect keeps its current auto-redirect behavior.

### Modal UX
- **D-02:** OTP input modal — user enters the code from email/SMS directly in the modal. No CIBA push support in this phase.
- **D-03:** Dark semi-transparent overlay with centered modal — reuse existing `otp-step-up-modal` CSS classes already defined in `App.css` (lines 765–930+).
- **D-04:** Minimal education context line in modal header (e.g., "Transfer over $500 requires identity verification"). No expandable sections or links to education panels.

### Cancel & Timeout Behavior
- **D-05:** Cancel button dismisses modal and drops the action. Agent shows "MFA cancelled" message. Action is not retried.
- **D-06:** No timeout — modal stays open until user completes OTP or cancels.

### Agent Blocking Behavior
- **D-07:** Full agent freeze while modal is open — "Waiting for MFA…" message in chat, all action buttons disabled. Only the modal is interactive.

### Agent's Discretion
- OTP input field validation (length, format) — agent can decide approach
- Error message wording for invalid/expired OTP
- Exact wording of the context line

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing HITL/MFA Implementation
- `banking_api_ui/src/components/BankingAgent.js` — Current MFA toast flow (lines ~1735-1750), pendingStepUpActionRef (line 977), onStepUpApproved handler (line 1319)
- `banking_api_ui/src/App.css` — Existing `otp-step-up-modal` CSS classes (lines 765-930+) — already styled, ready to use
- `banking_api_server/services/mfaService.js` — Backend MFA service
- `banking_api_ui/src/components/SensitiveConsentBanner.js` — Existing consent pattern (not changing)

### Education Content
- `banking_api_ui/src/components/BankingAgent.js` line 724 — Existing step-up education text
- `banking_api_ui/src/components/BankingAgent.js` line 729 — HITL education text

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `otp-step-up-modal` CSS classes in App.css — full modal styling (overlay, header, body, input, actions, error states, buttons) already defined
- `pendingStepUpActionRef` pattern in BankingAgent.js — stores action awaiting MFA, replayed on approval
- `onStepUpApproved` / `onStepUpCancelled` event handlers already wired
- `react-toastify` toast system (currently used, will be replaced for MFA flow)

### Established Patterns
- Ref-based pending action storage (`pendingStepUpActionRef`, `pendingAuthChallengeActionRef`)
- Window event dispatch for cross-component communication (`stepUpApproved`, `stepUpCancelled`, `userAuthenticated`)
- Loading state management via `setLoading(true/false)` in BankingAgent

### Integration Points
- BankingAgent.js `handleCallTool` function (~line 1660+) where `mfa_required` response is currently handled with toast
- Toast update at line 1738 to be replaced with modal show
- `agentFlowDiagram.completeMfaChallenge()` should be called on modal resolve/cancel

</code_context>

<specifics>
## Specific Ideas

- Reuse the fully-styled `otp-step-up-modal` CSS that's already in App.css rather than creating new styles
- Context line should mention the specific trigger (e.g., amount threshold or tool name)

</specifics>

<deferred>
## Deferred Ideas

- CIBA push notification support in modal — could be added as Phase 174.1 if needed
- Consent challenge modal upgrade — keep inline cards for now, consider modal in future phase
- Auth challenge pre-redirect modal — explaining what's about to happen before PingOne redirect
- Activity log integration for MFA events

</deferred>

---

*Phase: 174-hitl-step-up-modal*
*Context gathered: 2026-04-17*
