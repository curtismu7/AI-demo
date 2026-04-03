---
phase: 09-ciba-step-up-authentication-implement-otp-modal-wire-backchannel-auth-for-write-actions-and-validate-enterprise-grade-ux
plan: "01"
subsystem: ui
tags: [react, step-up, ciba, countdown, ux]

requires: []
provides:
  - Auto-countdown (3s) step-up initiation from agent trigger in UserDashboard
  - Cancel button to abort countdown before auto-fire
  - Conditional success toast copy ('resuming agent request' vs 'retry your transaction')

affects: [banking-agent, dashboard-ux]

tech-stack:
  added: []
  patterns:
    - useRef to keep function refs current for stale-closure-safe setTimeout callbacks
    - agentCountdown countdown state (3→2→1→0) driving UI via useState

key-files:
  created: []
  modified:
    - banking_api_ui/src/components/UserDashboard.js

key-decisions:
  - "Default fall-through method in onAgentStepUp changed to 'email' (not 'ciba') to match new server default"
  - "3 separate setTimeout calls (1s/2s/3s) stored in ref array allow cancel to clear all"
  - "handleCibaStepUpRef and stepUpVerifyHrefRef keep latest functions current for stale closure safety"

patterns-established:
  - "Refs for stale closure: useRef + useEffect sync pattern for event-listener callbacks"

requirements-completed: [CIBA-01]

duration: 12min
completed: 2026-04-03
---

# Phase 09-01: Auto-countdown step-up initiation

**Agent-triggered CIBA/email step-up now auto-initiates after 3-second countdown with a Cancel button.**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `agentCountdown` state (3→0) and `autoInitiateTimerRef` to schedule 3 `setTimeout` calls
- `cancelAutoInitiate` callback clears all timers and resets countdown
- Toast UI shows "Starting in Ns…" + Cancel for CIBA, "Redirecting in Ns…" + Cancel for email
- Post-approval toast says "resuming agent request…" for agent flows vs old "retry your transaction"

## Task Commits

1. **Task 1: Countdown refs + auto-initiate logic** — `56bfa8f` (feat)
2. **Task 2: Toast UI countdown & success copy** — `56bfa8f` (feat, merged into single commit)

## Files Created/Modified

- `banking_api_ui/src/components/UserDashboard.js` — Countdown refs, `cancelAutoInitiate`, updated `onAgentStepUp`, conditional toast UI, fixed success toast copy
