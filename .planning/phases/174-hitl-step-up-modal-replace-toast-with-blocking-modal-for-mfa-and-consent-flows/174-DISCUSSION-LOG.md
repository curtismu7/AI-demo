# Phase 174: HITL Step-Up Modal — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 174-hitl-step-up-modal-replace-toast-with-blocking-modal-for-mfa-and-consent-flows
**Areas discussed:** Modal trigger points, Modal UX design, Cancel/timeout behavior, Agent blocking, Education content

---

## Modal Trigger Points

| Option | Description | Selected |
|--------|-------------|----------|
| MFA step-up | Currently a toast — replace with blocking modal that collects OTP | ✓ |
| Consent challenge | Currently inline card (middle/dock) — replace with blocking overlay modal | |
| Auth challenge redirect | Currently auto-redirects to PingOne — add modal explaining what's happening | |

**User's choice:** MFA step-up only
**Notes:** Consent challenge keeps inline cards, auth challenge keeps redirect behavior

---

## MFA Method

| Option | Description | Selected |
|--------|-------------|----------|
| OTP input in modal | Modal shows OTP input field, user enters code from email/SMS | ✓ |
| CIBA push notification | Modal shows "Verifying…" spinner, CIBA pushes to device | |
| Both (CIBA primary, OTP fallback) | Modal offers both methods | |

**User's choice:** OTP input in modal

---

## Visual Style

| Option | Description | Selected |
|--------|-------------|----------|
| Dark overlay (reuse existing CSS) | Dark semi-transparent backdrop, modal centered — matches existing otp-step-up-modal CSS | ✓ |
| Bottom sheet | Slide-up from bottom like a mobile sheet | |
| Inline in agent | No overlay, replaces chat input temporarily | |

**User's choice:** Dark overlay, reuse existing CSS

---

## Cancel Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Cancel drops action | Cancel dismisses modal, agent shows "MFA cancelled", action dropped | ✓ |
| Cancel allows retry | Cancel dismisses modal, agent paused, user can retry | |
| No cancel (forced) | User must complete MFA or close agent | |

**User's choice:** Cancel drops action

---

## Timeout

| Option | Description | Selected |
|--------|-------------|----------|
| No timeout | Modal stays open until user acts or cancels | ✓ |
| 60s timeout | Auto-cancel with message after 60s | |
| 120s timeout | Matches PingOne OTP expiry window | |

**User's choice:** No timeout

---

## Agent Blocking Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Full freeze + message | Agent shows "Waiting for MFA…", all buttons disabled | ✓ |
| Partial freeze | Only triggering action blocked, other chips still work | |

**User's choice:** Full freeze + message

---

## Education Content in Modal

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal context line | Title + one-liner explaining why (e.g. "Transfer over $500 requires verification") | ✓ |
| Expandable education section | "Why am I seeing this?" with HITL explanation and links | |
| No education content | Just OTP input, keep it clean | |

**User's choice:** Minimal context line

---

## Agent's Discretion

- OTP input validation approach
- Error message wording
- Exact context line wording

## Deferred Ideas

- CIBA push notification support
- Consent challenge modal upgrade
- Auth challenge pre-redirect modal
- Activity log integration for MFA events
