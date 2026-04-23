# Phase 214: Fix FIDO Registration and Check Authentication — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 214-fix-fido-registration-and-check-authentication-look-at-curl-
**Areas discussed:** FIDO2 fix scope, Curl command scope

---

## FIDO2 Fix Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Investigate-and-fix | Try the flow, capture the error, fix root cause | ✓ |
| Known specific bug | User describes a specific error they've seen | |
| Works but incomplete | Mechanically works but state not reflected | |

**User's choice:** Investigate-and-fix

---

## FIDO2 Authentication Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Verify end-to-end after registration | Test challenge flow after enrollment works | |
| Already broken in a specific way | User describes specific auth-side error | ✓ |

**User's choice:** Already broken in a specific way

**Notes:** User provided the actual error:
```json
{
  "success": false,
  "error": "There was an unexpected error with the service. Please try again later.",
  "pingError": {
    "id": "cdb37ca3-b6f6-438d-bb9f-e1e313e5ef85",
    "code": "UNEXPECTED_ERROR",
    "message": "There was an unexpected error with the service. Please try again later."
  }
}
```
Failing at: `Complete FIDO2 Registration` (enroll-fido2-complete step).

---

## RP-ID Check

| Option | Description | Selected |
|--------|-------------|----------|
| Green ✓ — rp.id matches hostname | RP-ID debug box passes, issue is something else | ✓ |
| Red ✗ — rp.id mismatches hostname | RP-ID patch not working | |
| Didn't see the debug box | Enrollment init is failing | |

**User's choice:** Green ✓ — RP-ID matches

---

## Curl Command Scope

| Option | Description | Selected |
|--------|-------------|----------|
| BFF endpoints only | /api/mfa/test/... curls | |
| PingOne Management API curls | The actual calls the BFF sends to api.pingone.com | ✓ |
| Both layers | BFF + PingOne | |

**User's choice:** PingOne Management API curls

---

## Curl Format (Dynamic vs Static)

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic — real values from config | BFF endpoint returns curls with real env ID, tokens | ✓ |
| Static templates with placeholders | {{ENV_ID}} etc., developer fills manually | |

**User's choice:** Dynamic with real values

---

## Curl Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| FIDO2 sections only | Just enrollment and authentication sections | |
| All MFA sections | SMS, Email, and FIDO2 all get curls | ✓ |

**User's choice:** All MFA sections

---

## Claude's Discretion

- Component approach for curl display (extend TestCard or new component)
- Copy-to-clipboard button
- Token display strategy (show as $WORKER_TOKEN, never real value)
- Server-side debugging log additions

## Deferred Ideas

- BFF-level curl display — user chose PingOne layer only
- `Fido2Challenge.js` step-up fix — deferred unless trivially in scope
