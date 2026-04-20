# Phase 205: Missing Credentials Modal — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 205-missing-credentials-modal
**Areas discussed:** 4 (Form Presentation, Guidance & Help, Error Display & Recovery, Keyboard & Accessibility)

---

## Area 1: Form Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Single form | All credential fields visible at once; user fills multiple and submits once | |
| **Sequential fields** | One field per step; client_id → confirm → client_secret → confirm; clearer mental model | ✓ |
| Tabbed by type | Separate tabs for OAuth vs Worker Token credentials | |

**User's choice:** Sequential fields (D-01)

**Notes:** User preferred the clearer, step-by-step experience over a dense multi-field form. Matches pattern from FidoStepUpModal.

---

## Area 2A: Form Guidance Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Inline help text only | Brief hint under each field (e.g., "Find in PingOne Admin") | |
| **Collapsible section** | "How to find your credentials?" header that expands/collapses with detailed instructions | ✓ |
| External link | "See setup guide" button opens separate doc or modal | |
| Combination | Inline hints + collapsible for more detail | |

**User's choice:** Collapsible guidance section (D-03)

**Notes:** Keeps modal compact by default; users who need help can expand. Info icon for visual cue.

---

## Area 2B: Worker Token Guidance Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Brief hint | One-liner only (e.g., "Worker App token from PingOne Admin") | |
| **Step-by-step** | 5-6 step instructions (1. Go to PingOne Admin, 2. Find Worker Apps, 3. [app name], 4. Create/copy, 5. Paste here) | ✓ |
| Visual reference | Screenshots or animated guide link | |

**User's choice:** Step-by-step instructions (D-04)

**Notes:** Clear procedural guidance helps users who are unfamiliar with PingOne Admin UI.

---

## Area 3A: Error Display Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Field-level only | Red border + error text under affected field | |
| Form toast only | Toast notification at top/bottom with error summary | |
| **Both** | Inline field errors + form-level toast for server errors | ✓ |

**User's choice:** Both (D-06)

**Notes:** 
- Inline errors keep user focused on the problematic field (format/length issues)
- Toast captures server-side failures (already registered, API timeout) that don't map to a specific field

---

## Area 3B: Error Recovery Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Stay in modal and retry | Modal remains open; user adjusts fields and resubmits from same modal | |
| Close and restart | Modal closes; user must re-trigger credentials prompt | |
| Disable and auto-retry | Modal disabled while server retries silently | |

**User's choice:** Stay in modal + Cancel button (D-07, D-08)

**Notes:** 
- Modal stays open so user doesn't lose their context or intermediate values (D-07)
- Cancel button available at any step to abandon flow (D-08)
- This matches TransactionConsentModal error recovery pattern

---

## Area 4A: Keyboard & Accessibility

| Option | Description | Selected |
|--------|-------------|----------|
| Standard form UX | Tab cycles fields, Escape closes, Enter does not submit (user clicks button) | |
| Power-user UX | Tab cycles, Escape closes, Enter on last field auto-submits | |
| **Standard form UX (with explicit Submit button)** | Tab → fields → Submit button, Escape cancels modal, Enter is ignored | ✓ |

**User's choice:** Standard form UX (D-09)

**Notes:** Safest approach. Matches existing modal patterns. Prevents accidental submission on typo.

---

## Discretionary Areas

**the agent's Discretion:** Field label wording, animation timing, modal overlay styling, retry delay logic.

---

## Deferred Ideas

- Credential validation UI (real-time syntax checking) — Phase 206
- Credentials reset/revoke functionality — separate phase
- Credentials expiry warnings — separate phase
- Multi-step OAuth app creation wizard — separate phase (complex)

---

*Phase: 205-missing-credentials-modal*
*Discussion gathered: 2026-04-20*
