---
phase: 214
slug: fix-fido-registration-and-check-authentication-look-at-curl-
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 214 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (existing) |
| **Config file** | `banking_api_server/package.json` (jest config) |
| **Quick run command** | `cd banking_api_server && npx jest mfaService --no-coverage` |
| **Full suite command** | `cd banking_api_server && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd banking_api_server && npx jest mfaService --no-coverage`
- **After every plan wave:** Run `cd banking_api_ui && npm run build` (exit 0) + `cd banking_api_server && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 214-01-01 | 01 | 1 | D-03/D-04 | — | Full pingError body logged (no token leakage) | unit | `cd banking_api_server && npx jest mfaService -t "completeFido2Registration" --no-coverage` | ✅ `banking_api_server/src/__tests__/mfaService.test.js` | ⬜ pending |
| 214-01-02 | 01 | 1 | D-01/D-03 | — | completeFido2Registration uses corrected Content-Type | unit | `cd banking_api_server && npx jest mfaService -t "completeFido2Registration" --no-coverage` | ✅ W0 update | ⬜ pending |
| 214-01-03 | 01 | 2 | D-05/D-06 | — | Authentication path returns success after enrollment fixed | manual | Browser FIDO2 test flow on MFATestPage | — | ⬜ pending |
| 214-02-01 | 02 | 1 | D-07/D-08 | — | curl-context endpoint returns envId, region, userId | unit/smoke | `cd banking_api_server && npx jest mfaTest --no-coverage` | ❌ Wave 0 | ⬜ pending |
| 214-02-02 | 02 | 2 | D-09/D-10/D-11 | — | PingOneCurlCard renders and toggles in all MFA sections | manual | `cd banking_api_ui && npm run build` (exit 0) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `banking_api_server/src/__tests__/mfaService.test.js` — update existing test to assert `completeFido2Registration` sends the corrected Content-Type header
- [ ] `banking_api_server/src/__tests__/mfaTest.test.js` (create if needed) — smoke test for `GET /api/mfa/test/curl-context` returning envId + region + userId

*Note: `banking_api_server/src/__tests__/mfaService.test.js` already exists per RESEARCH.md; Wave 0 updates the test, not creates it.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FIDO2 registration completes without UNEXPECTED_ERROR | D-01–D-04 | Requires live PingOne tenant + hardware/browser authenticator | 1. Start server; 2. Open MFATestPage; 3. Click "Start FIDO2 Enrollment"; 4. Complete authenticator prompt; 5. Verify no error in response box |
| FIDO2 authentication challenge flow end-to-end | D-05 | Requires prior enrolled device + browser | 1. After enrollment; 2. Click "Test FIDO2 Authentication"; 3. Complete authenticator prompt; 4. Verify success response |
| PingOneCurlCard shows real envId/region, $WORKER_TOKEN placeholder | D-08/D-11 | Requires running server with real configStore | 1. Load MFATestPage; 2. Expand curl for any MFA section; 3. Verify URL contains real env ID; 4. Verify `$WORKER_TOKEN` (not real token) |
| PingOneCurlCard populates device ID after enrollment step | D-11 | Dynamic state requires browser interaction | 1. Complete SMS enrollment; 2. Check SMS curl; 3. Verify deviceId in curl body is real, not placeholder |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
