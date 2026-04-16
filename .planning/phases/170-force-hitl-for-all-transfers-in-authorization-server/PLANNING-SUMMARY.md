---
phase: 170
title: Force HITL for all Transfers in authorization server
planning_date: 2026-04-16
planning_status: complete
---

# Phase 170 Planning Complete

## Summary

**Phase 170: Force HITL for all Transfers in authorization server**

Successfully created a comprehensive 2-plan breakdown to enforce Human-In-The-Loop (HITL) approval for **all transfer operations** (regardless of amount).

**Git commit:** `47af3f1` — docs(170): create phase plan for force HITL for all transfers

---

## Planning Output

### Documents Created

| File | Purpose | Size |
|------|---------|------|
| `170-CONTEXT.md` | Phase requirements, architecture, decisions | 6.4 KB |
| `170-01-PLAN.md` | Modify transactionConsentChallenge + verify routes | 10 KB |
| `170-02-PLAN.md` | Testing + REGRESSION_PLAN.md update | 16 KB |

All files located in: `.planning/phases/170-force-hitl-for-all-transfers-in-authorization-server/`

### ROADMAP.md Updated

Phase 170 entry now shows:
- **Goal:** Enforce HITL approval requirement for ALL transfer operations
- **Requirements:** TRANSFER-HITL-01, TRANSFER-HITL-02, TRANSFER-HITL-03, TRANSFER-HITL-04
- **Plans:** 2 plans (previously TBD)
- **Dependency:** Phase 169 (✓ Complete)

---

## Wave Structure

```
Wave 1: Plan 01 (execute, parallel-ready)
  - Task 1: Modify transactionConsentChallenge.js
  - Task 2: Verify routes/transactions.js enforcement + logging
  
Wave 2: Plan 02 (execute, depends on Plan 01)
  - Task 1: Update REGRESSION_PLAN.md
  - Task 2: Add unit tests (transactionConsentChallenge)
  - Task 3: Add integration tests (bankingAgentService)
  - Task 4: Build verification + test suite pass
```

**Autonomy:** Both plans are autonomous (no checkpoints requiring user interaction)

---

## Phase Goals (Outcomes)

### Goal 1: Remove $500 Threshold for Transfers Only ✓
**Plan 01, Task 1**

Change logic in `transactionConsentChallenge.js` (line ~185):
```javascript
// Before: only transfers > $500 require challenge
if (v.normalized.amount <= HIGH_VALUE_CONSENT_USD) {
  return { error: 'consent_challenge_not_required', ... }
}

// After: ALL transfers require challenge
if (v.normalized.type === 'transfer') {
  // Skip amount check for transfers
} else if (v.normalized.amount <= HIGH_VALUE_CONSENT_USD) {
  // Keep existing logic for withdrawal/deposit
}
```

**Outcome:** Transfers of $1, $0.01, etc. now require HITL consent

### Goal 2: Enforce 428 Return for Unconsented Transfers ✓
**Plan 01, Task 2**

Verify BFF enforces consent check in `POST /api/transactions`:
- Transfer without `consentChallengeId` → 428 Precondition Required
- Transfer with invalid/expired challenge → 428 + error details
- Transfer with valid challenge → 200 + transaction executed

**Outcome:** API layer prevents unauthorized transfers

### Goal 3: Comprehensive Testing ✓
**Plan 02, Tasks 2-3**

Add unit tests:
- Transfer $1 requires challenge
- Transfer $0.01 requires challenge
- Withdrawal $500+ still required (unchanged)
- Withdrawal $100 rejected (unchanged)

Add integration tests:
- Agent transfer without consent → 428
- Agent transfer with valid consent → 200
- Deposit without consent → 200 (unchanged)

**Outcome:** All transfer HITL logic verified; no regressions

### Goal 4: Regression Protection ✓
**Plan 02, Task 1**

Update `REGRESSION_PLAN.md`:
- §1: Add "Transfer HITL enforcement" row with files and guidance
- §4: Add Phase 170 Bug Fix Log entry with rationale

**Outcome:** Future developers protected against breaking transfer HITL

---

## Requirements Mapping

| Requirement | Plan | Task | Status |
|-------------|------|------|--------|
| TRANSFER-HITL-01 | 01 | 1 | ✓ Planned |
| TRANSFER-HITL-02 | 01 | 2 | ✓ Planned |
| TRANSFER-HITL-03 | 02 | 1 | ✓ Planned |
| TRANSFER-HITL-04 | 02 | 2-3 | ✓ Planned |

---

## Success Criteria Checklist

Phase-level success criteria (to verify after execution):

- [ ] All transfers ≥ $0.01 require explicit consent challenge
- [ ] BFF returns 428 + "HITL required" for unconsented transfers
- [ ] Authentication flow (PingOne token exchange) unaffected
- [ ] No build errors; `npm run build` exits 0
- [ ] Existing HITL test suite passes
- [ ] REGRESSION_PLAN.md updated with new guardrails
- [ ] Withdrawals keep $500 threshold (unchanged)
- [ ] Deposits unaffected (unchanged)
- [ ] Admin users bypass HITL (unchanged)

---

## Next Steps

### For Executor (Claude)

1. **Run Plan 01:** Implement transactionConsentChallenge + route changes
2. **Run Plan 02:** Add tests + update REGRESSION_PLAN.md
3. **Verify:** All tests pass, no build errors, manual sanity check
4. **Output:** Create 170-01-SUMMARY.md and 170-02-SUMMARY.md with results

### For Team

- Phase 170 is ready for execution immediately
- No additional discovery needed (requirements are clear)
- Execution time estimate: 2-3 hours (straightforward changes)
- Risk: Low (scoped changes, backward compatible API)
- Impact: All future transfers will require explicit user consent

---

## Technical Details

### Current HITL Implementation

Existing `transactionConsentChallenge` service:
- **Challenge creation:** Validates intent, stores in session
- **OTP delivery:** Email 6-digit code
- **OTP verification:** Constant-time comparison, max 3 attempts
- **Consumption:** Check challenge status before transaction execute

**Where threshold check happens:** `createChallenge()` line ~180

**Where enforcement happens:** `POST /api/transactions` + MCP server

### What Changes

1. **Type check added:** Before amount check in `createChallenge()`
2. **Route verification:** Ensure POST /api/transactions validates consent for transfers
3. **Logging:** Track transfer challenges for audit

### What Stays the Same

- OTP flow (unchanged)
- Admin bypass (unchanged)
- Session-backed state (unchanged)
- Error response structure (unchanged)
- Withdrawal/deposit thresholds (unchanged)

---

## Files to Modify (Plan Overview)

### Plan 01 (Implementation)

1. `banking_api_server/services/transactionConsentChallenge.js`
   - ~10 lines added/modified
   - Type check insertion before amount threshold

2. `banking_api_server/routes/transactions.js`
   - Verify 428 enforcement exists
   - Add logging
   - ~5 lines added/verified

### Plan 02 (Testing & Documentation)

1. `REGRESSION_PLAN.md`
   - §1: 1 new row (20 lines)
   - §4: 1 new entry (10 lines)

2. `banking_api_server/services/transactionConsentChallenge.test.js`
   - 5+ test cases (~40 lines)

3. `banking_api_ui/src/services/bankingAgentService.test.js`
   - 3+ test cases (~30 lines)

---

## Decisions Documented

**D-01: Transfer-only scope** — HITL enforcement applies to transfer type only; withdrawals keep $500 threshold

**D-02: Admin bypass preserved** — Admin users do not require consent (operational necessity for support/testing)

**D-03: No API version bump** — Change is backward-compatible (stricter, but same structure)

**D-04: Session-backed state** — Continue using express-session for consent challenges (works with Redis on Vercel)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Transfer flow breaks | Low | High | Existing tests + manual verification |
| Threshold for deposits/withdrawals broken | Low | High | Isolated type check before amount check |
| Admin bypass regression | Low | Medium | Preserve role check in existing code |
| Session state loss | Low | High | No session changes; keep existing store |
| Build fails | Very Low | High | Structure verified; no syntax issues |

---

## Verification Checklist

Pre-execution verification (already done):
- ✓ CONTEXT.md created with clear requirements
- ✓ Plan 01 structure validated (2 tasks, all sections complete)
- ✓ Plan 02 structure validated (4 tasks, all sections complete)
- ✓ Wave structure optimized (1 serial → 2 parallel-ready)
- ✓ Frontmatter valid (all required fields present)
- ✓ Requirements mapped (4 requirements → 6 tasks)
- ✓ ROADMAP.md updated (reflects 2 plans, requirements, phase goal)
- ✓ Git commit successful (47af3f1)

Post-execution verification (executor's responsibility):
- [ ] Plan 01 implementation complete + tested
- [ ] Plan 02 tests passing + REGRESSION_PLAN updated
- [ ] No build errors; `npm run build` exits 0
- [ ] Manual sanity check: transfer flow works end-to-end
- [ ] Agent-initiated transfer returns 428 until consent provided
- [ ] Create summary documents (170-01-SUMMARY.md, 170-02-SUMMARY.md)

---

## Related Context

**Depends on:** Phase 169 (OAuth token display page) — ✓ Complete

**Parallel phases:** None identified

**Future phases:** Phase 171+ (additional security enforcement layers)

**Related phases:**
- Phase 9: CIBA step-up authentication (parallel HITL mechanism)
- Phase 10: Enterprise-grade HITL (consent modal, styling)

---

## Planning Complete ✓

All planning deliverables completed and committed.

Ready for execution by Claude executor agent.

**Status:** Ready for `/gsd-execute-phase 170`
