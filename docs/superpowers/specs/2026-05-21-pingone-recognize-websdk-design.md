# PingOne Recognize WebSDK Integration Design

**Date:** 2026-05-21  
**Status:** Approved

---

## Summary

Add PingOne Recognize WebSDK support to the Super Banking demo as a fourth `hitl_consent_mfa_mode` value (`recognize`). When selected, face authentication replaces OTP/MFA as the verification step in the HITL transfer consent flow. Enrollment is managed from the user's Profile page.

---

## Scope

**In scope:**
- Web Enrollment (live camera, Profile page)
- Web Authentication (live face scan, HITL consent gate)
- Unenroll (Profile page)
- Enroll from Image (Profile page — silent enrollment via base64 selfie, e.g. from PingOne Verify)
- New `recognize` value in `hitl_consent_mfa_mode` feature flag
- Full-page `RecognizeOverlay` for face-auth during consent
- `RecognizeEnrollCard` section on Profile page
- New `recognizeService.js` BFF service
- New `/api/recognize/enroll` BFF route
- New `/consent-challenge/:id/verify-recognize` route

**Out of scope:**
- Login step-up via Recognize
- DaVinci connector path
- PingOne Verify IDV integration (enroll-from-image accepts a selfie base64 but does not wire PingOne Verify automatically)

---

## Architecture

### Enrollment Flow (Profile page)

```
User → Profile page → RecognizeEnrollCard
  → "Enroll Face" button
  → Recognize WebSDK loaded via CDN <script> tag
  → SDK renders camera UI (web enrollment capability)
  → SDK finishEvent fires
  → POST /api/recognize/enroll  (BFF records enrollment flag in session / configStore)
  → Card updates to "Enrolled" state + Unenroll button
  → "Unenroll" button → DELETE /api/recognize/enroll
      → recognizeService.unenrollUser(userId)
      → Card resets to unenrolled state
```

### HITL Consent Face-Auth Flow

```
User initiates transfer
  → POST /api/transactions → BFF returns 428 (no consentChallengeId)
  → React mounts consent modal (existing)
  → User ticks checkbox, clicks "Confirm"
  → POST /consent-challenge/:id/confirm
      → mfaMode === 'recognize'
      → recognizeService.initiateSession(userId)
      → Recognize API returns sessionToken
      → BFF returns { mode: 'recognize', sessionToken, challengeId }
  → React unmounts modal, mounts RecognizeOverlay (full-page)
  → RecognizeOverlay loads WebSDK, initialises with sessionToken
  → SDK renders face-auth camera UI (web authentication capability)
  → finishEvent fires → RecognizeOverlay calls onSuccess(sdkResult)
  → POST /consent-challenge/:id/verify-recognize { result: sdkResult }
      → recognizeService.verifySession(sdkResult) → ok
      → ch.status = 'confirmed'
  → RecognizeOverlay dismisses
  → POST /api/transactions { consentChallengeId } → transaction executes
```

---

## New Files

| File | Purpose |
|------|---------|
| `demo_api_server/services/recognizeService.js` | Wraps Recognize REST API: `initiateSession`, `verifySession`, `enrollUser`, `unenrollUser`. Reads `RECOGNIZE_API_KEY`, `RECOGNIZE_TENANT_NAME`, `RECOGNIZE_BASE_URL` from configStore. Throws on missing config at call time (not at module load). |
| `demo_api_server/routes/recognize.js` | `POST /api/recognize/enroll` (trigger enrollment), `DELETE /api/recognize/enroll` (unenroll). Registered in `server.js`. |
| `demo_api_ui/src/components/RecognizeOverlay.js` | Full-page overlay. Loads WebSDK CDN script tag on mount, initialises with `sessionToken` prop, fires `onSuccess(result)` / `onError(message)` callbacks. Auto-dismisses on error after 3000ms. |
| `demo_api_ui/src/components/RecognizeOverlay.css` | Styles for the full-page overlay and camera container. |
| `demo_api_ui/src/components/RecognizeEnrollCard.js` | Profile page card: shows enrolled/not-enrolled status, Enroll/Unenroll/Enroll-from-Image buttons. Embeds WebSDK for enrollment and unenrollment capabilities. |

---

## Modified Files

| File | Change |
|------|--------|
| `demo_api_server/services/transactionConsentChallenge.js` | Add `recognize` branch in `confirmChallenge` MFA dispatch. Add exported `verifyRecognize(req, challengeId, sessionResult)` function that calls `recognizeService.verifySession` and advances challenge to `'confirmed'`. |
| `demo_api_server/server.js` | Register `recognize.js` router at `/api/recognize`. Add `POST /consent-challenge/:challengeId/verify-recognize` route (same auth middleware pattern as `verify-otp`). |
| `demo_api_server/routes/featureFlags.js` | Add `'recognize'` to `hitl_consent_mfa_mode` options array and description. |
| `demo_api_ui/src/components/Profile.js` | Add `RecognizeEnrollCard` as a third card below MFA Devices. |
| `demo_api_ui/src/components/TransactionConsentModal.js` (or equivalent) | Handle `mode: 'recognize'` in confirm response — mount `RecognizeOverlay`, call `verify-recognize` on success, resume transaction. |

---

## Environment Variables

```
RECOGNIZE_API_KEY=<secret api key from Recognize tenant>
RECOGNIZE_TENANT_NAME=<tenant name>
RECOGNIZE_BASE_URL=https://authentication-service.eks.core-production.saas-us-east.keyless.technology
```

Region variants:
- US: `https://authentication-service.eks.core-production.saas-us-east.keyless.technology`
- EU: `https://authentication-service.eks.core-production.keyless.technology`
- LATAM: `https://authentication-service.eks.core-production.latam.keyless.technology`
- Sandbox: `https://authentication-service-sandbox.eks.core-production.keyless.technology`

All three vars are required. `recognizeService.js` throws a clear error at call time if any are absent.

---

## Error Handling

| Failure | BFF response | UI behaviour |
|---------|-------------|-------------|
| `recognizeService.initiateSession` fails | `502 recognize_init_failed` | Modal shows error toast, stays open |
| User not enrolled when `recognize` mode active | SDK fires errorEvent immediately | Overlay shows: "Face ID not set up. Enroll from your Profile page first." Dismisses after 3000ms |
| SDK errorEvent during face-auth | `onError` callback fires | Overlay shows error message, dismisses after 3000ms (matching Recognize doc recommendation) |
| `verifySession` rejects | `401 recognize_verify_failed` | Overlay shows failure message, challenge is not consumed, user can retry |

No silent fallback to OTP when `recognize` mode is active — the failure is intentional demo story.

---

## Feature Flag

Admin toggles `hitl_consent_mfa_mode` to `recognize` on the Feature Flags page. No other flag is needed. Existing modes (`onetime`, `device_picker`, `homegrown`) are unaffected.

---

## Testing

- Regression tests for `transactionConsentChallenge.js` — add `recognize` branch coverage alongside existing `onetime` / `device_picker` / `homegrown` test cases.
- Mock `recognizeService` in tests (same pattern as `mfaService` mocks in existing tests).
- No E2E test for live camera (requires Recognize tenant + real camera); manual verification checklist:
  - Profile page shows Recognize enrollment card
  - Enroll flow renders camera UI and records enrolled state on success
  - Unenroll removes enrollment
  - Transfer with `hitl_consent_mfa_mode=recognize` → 428 → confirm → RecognizeOverlay mounts
  - Successful face scan → transaction executes
  - UI build exits 0 after all changes

---

## Constraints

- Recognize DaVinci connector is a proof-of-concept per official docs; this integration uses the WebSDK directly (stable path).
- Emoji rule applies: only `⚠️`, `✅`, `❌` in UI text, code comments, and docs.
- Tokens stay server-side; no Recognize API key is ever sent to the browser — only the session token returned by `initiateSession`.
- `REGRESSION_PLAN.md` §4 entry required on completion.
