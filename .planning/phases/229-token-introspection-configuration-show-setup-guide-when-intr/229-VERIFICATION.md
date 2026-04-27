---
phase: 229-token-introspection-setup-guide
verified: 2026-04-26T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open Config → Token Validation tab. Select Introspection mode. Verify the proactive blue banner appears before clicking Test PingOne Connection."
    expected: "A light-blue banner reads approximately: 'Introspection mode is selected. Click Test PingOne Connection below to verify your configuration...'"
    why_human: "Banner visibility depends on runtime state (validationMode=introspection, healthStatus=null) and requires a browser."
  - test: "With introspection env vars absent (PINGONE_INTROSPECTION_ENDPOINT unset), click 'Test PingOne Connection'."
    expected: "Status badge shows '⚙ Not Configured' and the 3-step inline setup guide appears below it."
    why_human: "Requires the backend to return not_configured status, which depends on actual missing env vars at runtime."
  - test: "Inspect the setup guide step 3 .env code block."
    expected: "Shows exactly: PINGONE_INTROSPECTION_ENDPOINT, PINGONE_WORKER_CLIENT_ID, PINGONE_WORKER_CLIENT_SECRET — no real credentials, only placeholder values."
    why_human: "Visual confirmation that placeholders render correctly and no actual secrets are embedded in the rendered UI."
---

# Phase 229: Token Introspection Setup Guide — Verification Report

**Phase Goal:** When token introspection is not configured, show a setup guide in the Config → Token Validation tab that explains how to enable it — specifically what env vars to set and how to get the values from PingOne.
**Verified:** 2026-04-26
**Status:** human_needed (all automated checks pass; 3 browser-only checks remain)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When health check returns not_configured, a full setup guide appears inline below the status badge | VERIFIED | Line 296: `{healthStatus?.status === 'not_configured' && (<div className={styles.setupGuide}>` — conditional render wired correctly |
| 2 | Setup guide shows the three required env vars: PINGONE_INTROSPECTION_ENDPOINT, PINGONE_WORKER_CLIENT_ID, PINGONE_WORKER_CLIENT_SECRET | VERIFIED | Lines 334-336: all three names appear verbatim in a `<pre className={styles.setupCode}>` block |
| 3 | Setup guide explains how to find the introspection endpoint URL from PingOne (format: https://auth.pingone.com/{env-id}/as/introspect) | VERIFIED | Line 307: Step 1 body includes `https://auth.pingone.com/{environment-id}/as/introspect` with instructions to find Environment ID in PingOne Admin |
| 4 | Setup guide explains how to create a Worker application in PingOne to get client credentials | VERIFIED | Lines 319-324: Step 2 contains a 5-item ordered list covering Applications → Add Application → Worker → copy Client ID/Secret → enable |
| 5 | Setup guide shows the exact .env snippet to paste | VERIFIED | Lines 334-336: `<pre className={styles.setupCode}>` renders the three env var assignments with placeholder values |
| 6 | Proactive not-configured banner shows when validationMode is introspection but no health check has been run yet | VERIFIED | Line 222: `{validationMode === 'introspection' && !healthStatus && (<div className={styles.proactiveBanner}>` — condition matches spec exactly |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `banking_api_ui/src/components/ConfigTokenValidation.tsx` | Inline setup guide, proactive banner; min 350 lines | VERIFIED | 369 lines; both features present and wired |
| `banking_api_ui/src/components/ConfigTokenValidation.module.css` | CSS for setup guide card, step list, code snippets; min 40 lines | VERIFIED | 392 lines; all required classes present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ConfigTokenValidation.tsx` | `banking_api_server/routes/health.js` | `GET /api/health/introspection → not_configured status` | WIRED | Line 118: `fetch('/api/health/introspection')` with `setHealthStatus(data)`; conditional at line 296 keys off `healthStatus?.status === 'not_configured'` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `ConfigTokenValidation.tsx` | `healthStatus` | `fetch('/api/health/introspection')` (line 118) with `setHealthStatus(data)` (line 119) | Yes — populates from actual API response | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Built JS contains not_configured logic | `grep not_configured build/static/js/main.363387d9.js` | Match found | PASS |
| Built JS contains PINGONE_INTROSPECTION_ENDPOINT string | `grep PINGONE_INTROSPECTION_ENDPOINT build/static/js/main.363387d9.js` | Match found | PASS |
| Built JS contains Worker Application instructions | `grep "Worker Application" build/static/js/main.363387d9.js` | Match found | PASS |
| Commit 182ff132 touches only UI files | `git show 182ff132 --stat` | 2 files: ConfigTokenValidation.tsx +55, ConfigTokenValidation.module.css +89; no backend files | PASS |

---

### Requirements Coverage

No `requirements:` field declared in PLAN frontmatter. Phase is a UI enhancement scoped entirely within two files; no REQUIREMENTS.md entries mapped to phase 229.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `ConfigTokenValidation.tsx` | 334-336 | `your-worker-client-id`, `your-worker-client-secret` | Info | These are intentional placeholder display strings in the .env snippet — not hardcoded credentials. No real secrets present. |

No blockers. No stub implementations. The `return null` / `return {}` patterns are absent. All state variables that drive rendering are populated from API calls, not hardcoded.

---

### Human Verification Required

#### 1. Proactive banner renders in browser

**Test:** Open Config → Token Validation. Confirm Introspection mode is active (radio selected). Do not click the test button.
**Expected:** A light-blue banner appears reading approximately: "Introspection mode is selected. Click Test PingOne Connection below to verify your configuration. If you haven't set up the env vars yet, the test will show a step-by-step setup guide."
**Why human:** Banner visibility depends on the combination of runtime state (`validationMode === 'introspection'` AND `healthStatus === null`). The mode is loaded from the server on mount so initial value may differ from the useState default.

#### 2. Not-configured state triggers inline guide

**Test:** Ensure PINGONE_INTROSPECTION_ENDPOINT is unset in the BFF environment. Click "Test PingOne Connection" on the Token Validation tab.
**Expected:** Status badge shows "⚙ Not Configured". Below it, the full 3-step setup guide appears with the correct PingOne URL format, Worker Application instructions, and .env snippet.
**Why human:** Requires the backend health route to return `{ status: 'not_configured' }`, which only occurs with the env var absent. Cannot simulate without running the server.

#### 3. Placeholder values are correct and no real credentials shown

**Test:** Read the .env code block in step 3 of the setup guide.
**Expected:** Exactly three lines, using the exact variable names, with placeholder values (`your-worker-client-id`, `{env-id}`) — no real credentials.
**Why human:** Visual confirmation of rendered text in the browser; the build JS confirms the strings exist but not that JSX renders them legibly.

---

### Gaps Summary

No gaps. All automated verifications pass. The component correctly gates the setup guide on `healthStatus?.status === 'not_configured'`, the proactive banner on `validationMode === 'introspection' && !healthStatus`, the three env var names are present verbatim in the code block, three numbered steps are implemented, CSS classes are fully defined, and the commit confirms no backend files were touched. Build artifacts confirm the feature was included in the most recent production build.

Three human verification items remain because they require a browser and/or running the BFF server with env vars absent — they cannot be verified by grep or static analysis.

---

_Verified: 2026-04-26_
_Verifier: Claude (gsd-verifier)_
