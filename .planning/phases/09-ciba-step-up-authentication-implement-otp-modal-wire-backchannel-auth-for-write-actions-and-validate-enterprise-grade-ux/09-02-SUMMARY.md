---
phase: 09-ciba-step-up-authentication-implement-otp-modal-wire-backchannel-auth-for-write-actions-and-validate-enterprise-grade-ux
plan: "02"
subsystem: ui
tags: [react, step-up, ciba, banking-agent, consent]

requires: []
provides:
  - Method-specific step-up messages in agent thread (CIBA vs email)
  - Confirmation card with method label + timestamp after approval
  - SensitiveConsentBanner fully removed from BankingAgent

affects: [banking-agent, sensitive-details]

tech-stack:
  added: []
  patterns:
    - pendingStepUpActionRef stores {actionId, form, method} — method read at approval time

key-files:
  created: []
  modified:
    - banking_api_ui/src/components/BankingAgent.js

key-decisions:
  - "SensitiveConsentBanner removed — replaced by 428 step-up path wired in plans 04 and 05"
  - "confirmaton card includes method label (CIBA vs Email OTP) and timestamp for auditability"
  - "consent_required tool results now fall through to existing error handler (no special case)"

patterns-established:
  - "Step-up method stored in ref at trigger time, read at approval time for accurate labeling"

requirements-completed: [CIBA-02, CIBA-04]

duration: 10min
completed: 2026-04-03
---

# Phase 09-02: Method-specific step-up messages, remove SensitiveConsentBanner

**Agent thread now shows CIBA vs email-specific messages; SensitiveConsentBanner fully removed.**

## Performance

- **Duration:** 10 min
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `pendingStepUpActionRef.current` now stores `{ actionId, form, method }` for downstream use
- CIBA path produces "CIBA push sent to your device — waiting for approval…"
- Email path produces "Email OTP sent to your registered email — waiting for verification…"
- After `cibaStepUpApproved`, agent posts "✅ CIBA approved — continuing your request (HH:MM:SS)"
- All SensitiveConsentBanner code removed: import, 2 state vars, 2 handlers, detection block, JSX

## Task Commits

1. **Task 1: Method-specific messages + store method in ref** — `66a9f7e` (feat)
2. **Task 2: Confirmation card + remove SensitiveConsentBanner** — `66a9f7e` (feat)

## Files Created/Modified

- `banking_api_ui/src/components/BankingAgent.js` — Method-specific messages, confirmation card, SensitiveConsentBanner fully removed
