---
phase: 242-pingone-api-transparency-all-test-pages-show-actual-api-endp
plan: "03"
subsystem: frontend/MFATestPage+AuthzTestPage
tags: [react, api-transparency, ApiCallPreviewCard, MFATestPage, AuthzTestPage]
---

## What was done

### MFATestPage.jsx
- Added `docsSectionTitle` prop to `TestCard` inner component signature
- Added `ApiCallPreviewCard` inside `TestCard` after the existing `PingOneApiPanel` call — renders when `pingoneRequest` is present, passing `endpoint`, `method`, `docsUrl`, `docsSectionTitle`, `requestBody`, `responseBody`, and `responseStatus`
- Added `docsSectionTitle` to all 11 `<TestCard>` call sites:
  - Enroll SMS Device — Init → "MFA Enroll SMS Device — Init"
  - Activate SMS Device (Step 2) → "MFA Enroll SMS Device — Complete"
  - Enroll Email Device → "MFA Enroll Email Device"
  - Initiate FIDO2 Enrollment → "FIDO2 Enroll — Init Registration"
  - Complete FIDO2 Registration → "FIDO2 Enroll — Complete Registration"
  - Initiate SMS OTP Challenge → "MFA Challenge — Initiate (SMS)"
  - Verify SMS OTP → "MFA Verify OTP (SMS)"
  - Initiate Email OTP Challenge → "MFA Challenge — Initiate (Email OTP)"
  - Verify Email OTP → "MFA Verify OTP (Email)"
  - Initiate FIDO2 Challenge → "MFA Challenge — Initiate (FIDO2)"
  - Verify FIDO2 with Passkey → "MFA Verify Assertion (FIDO2)"
- Total `ApiCallPreviewCard` instances in file: **3** (import + 1 existing static card + 1 inside TestCard)

### AuthzTestPage.jsx
- Added `ApiCallPreviewCard` after `PingOneApiPanel` in scenario result render block — shown when `result.engine === "pingone"` and `result.pingoneRequest` is set
- Added static informational `ApiCallPreviewCard` for `result.engine !== "pingone"` (simulated mode label)
- Added `ApiCallPreviewCard` after `PingOneApiPanel` in custom scenario result block — shown when `customResult.engine === "pingone"` and `customResult.pingoneRequest` is set
- Total `ApiCallPreviewCard` instances in file: **5** (import + 1 existing static card + 2 scenario + 1 custom)

## Verification
- `grep -c "ApiCallPreviewCard" MFATestPage.jsx` → 3 (>= 3 ✓)
- `grep -c "ApiCallPreviewCard" AuthzTestPage.jsx` → 5 (>= 3 ✓)
- `grep "apidocs.pingidentity.com"` exits 0 on both files ✓
- `npm run build` → exit 0 ✓
- All existing `PingOneApiPanel` calls preserved (additive only) ✓
