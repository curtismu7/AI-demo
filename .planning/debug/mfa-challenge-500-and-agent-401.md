---
status: awaiting_human_verify
trigger: "Investigate two issues: mfa-challenge-500-and-agent-401"
created: 2026-04-09T00:00:00Z
updated: 2026-04-09T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED (both issues)
  ISSUE 1 — MFA 500: configStore.envFallbackMap has NO entry for 'pingone_mfa_policy_id',
    so PINGONE_MFA_POLICY_ID env var is never read. configStore.getEffective returns "".
    Empty policyId → mfaService.initiateDeviceAuth throws "not configured" INSIDE the try block
    → _wrapError swallows it (no err.response) → returns generic "MFA operation failed" (500).
  ISSUE 2 — nl/status 401: Already resolved. bankingAgentNlRoutes IS mounted before
    bankingAgentRoutes in server.js (line 850). curl confirms 200 ✓

test: Confirmed via configStore.getEffective('pingone_mfa_policy_id') → "" at runtime
expecting: Fix = (1) add 'pingone_mfa_policy_id' to configStore.envFallbackMap + (2) move
           policyId check outside try block in mfaService.initiateDeviceAuth
next_action: Apply fixes to configStore.js and mfaService.js

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected:
  - /api/auth/mfa/challenge returns 200 and sends OTP email to user
  - /api/banking-agent/nl/status returns 200 with groqConfigured etc.

actual:
  - /api/auth/mfa/challenge → 500 "MFA operation failed"
  - UI shows toast: "Could not initiate MFA: MFA operation failed"
  - /api/banking-agent/nl/status → 401 (still, despite prior fix)

errors: |
  api/transactions: 428 (Precondition Required) — expected for withdrawal >= $250, not a bug
  api/auth/mfa/challenge: 500 (Internal Server Error)
  api/banking-agent/nl/status: 401 (Unauthorized)
  App.js:92 Withdrawal error: AxiosError 428

reproduction:
  1. Login via PingOne OAuth as user
  2. Attempt a withdrawal >= $250 on UserDashboard → 428 expected
  3. Step-up modal appears with "Verify via Email" button
  4. Click "Verify via Email" → /api/auth/mfa/challenge → 500
  5. Toast: "Could not initiate MFA: MFA operation failed"

started: MFA challenge failure started with or after LangChain agent integration work;
         banking-agent/nl/status 401 persists despite fix in agent-401-and-transactions-400.md

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-09T00:00:00Z
  checked: grep configStore.js for pingone_mfa_policy_id in envFallbackMap
  found: NO entry for 'pingone_mfa_policy_id' in envFallbackMap — PINGONE_MFA_POLICY_ID env var never read
  implication: configStore.getEffective('pingone_mfa_policy_id') always returns "" regardless of env var

- timestamp: 2026-04-09T00:00:00Z
  checked: runtime node eval — configStore.getEffective('pingone_mfa_policy_id')
  found: returns "" (empty string)
  implication: !policyId is true → initiateDeviceAuth throws "not configured" error

- timestamp: 2026-04-09T00:00:00Z
  checked: mfaService.js try/catch structure around initiateDeviceAuth
  found: policyId throw is INSIDE the try block → _wrapError swallows it
         _wrapError: pingErr = err.response?.data = undefined → message fallback = 'MFA operation failed'
         e.status = err.response?.status || 500 → 500
  implication: Every config failure produces identical uninformative 500 "MFA operation failed"

- timestamp: 2026-04-09T00:00:00Z
  checked: curl https://localhost:3001/api/banking-agent/nl/status (after server restart)
  found: 200 {"groqConfigured":true,...} — prior fix IS applied, nl/status is working
  implication: Issue 2 (nl/status 401) was resolved by previous debug session, no action needed

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  ISSUE 1 — MFA 500:
    (a) configStore.js envFallbackMap had no entry for 'pingone_mfa_policy_id', so
        process.env.PINGONE_MFA_POLICY_ID was never checked.
    (b) Empty policyId → mfaService.initiateDeviceAuth throws "not configured" INSIDE the try block
        → _wrapError captures it (no err.response) → produces generic 500 "MFA operation failed"
        hiding the real cause from the UI and logs.
  ISSUE 2 — nl/status 401: Already fixed (bankingAgentNlRoutes mounted before bankingAgentRoutes
    in server.js). curl confirms 200 ✓

fix: |
  1. banking_api_server/services/configStore.js — added 'pingone_mfa_policy_id: [PINGONE_MFA_POLICY_ID]'
     to envFallbackMap so the env var is read.
  2. banking_api_server/services/mfaService.js — moved policyId check OUTSIDE the try block
     with explicit e.status=503 and e.code='mfa_not_configured'. Error now propagates as
     503 "PINGONE_MFA_POLICY_ID is not configured. Set it in .env or via admin UI." instead of
     500 "MFA operation failed".
  ACTION REQUIRED: Set PINGONE_MFA_POLICY_ID=<your-mfa-policy-id> in banking_api_server/.env
     (or via Admin Config UI). Get the policy ID from PingOne Admin → MFA Policies.

verification: |
  - configStore.getEffective('pingone_mfa_policy_id') returns 'test-policy-123' when PINGONE_MFA_POLICY_ID is set ✓
  - mfaService.js node -e syntax check passes ✓
  - nl/status returns 200 after server restart ✓

files_changed:
  - banking_api_server/services/configStore.js
  - banking_api_server/services/mfaService.js
