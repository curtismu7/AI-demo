---
phase: 170
title: Force HITL for all Transfers in authorization server
date_created: 2026-04-16
status: discussion
---

# Phase 170: Force HITL for all Transfers

## Phase Goal

Enforce Human-In-The-Loop (HITL) approval requirement for **ALL transfer operations** (regardless of amount), implemented across the BFF authorization layer to ensure no transfer executes without explicit user consent.

Depends on: Phase 169 (OAuth token display page) ✓

## Current State

### Existing HITL Implementation (transactionConsentChallenge.js)

- **Threshold-based**: Only transfers/withdrawals > $500 require consent
- **Flow**: Challenge creation → OTP send → OTP verify → confirmed state
- **Enforcement**: `POST /api/transactions` checks for valid consent before executing
- **Admin bypass**: Admin users bypass consent entirely

**Key code:**
```javascript
// Current: only HIGH_VALUE_CONSENT_USD ($500) requires challenge
if (v.normalized.amount <= HIGH_VALUE_CONSENT_USD) {
  return { error: 'consent_challenge_not_required', ... }
}
```

### Challenge Process

1. **POST /api/transactions/consent-challenge** — createChallenge()
   - Validates intent (amount, accounts, type)
   - Returns status: 'pending'
   - Stores in session.txConsentChallenges[challengeId]

2. **POST /api/transactions/consent-challenge/:id/confirm** — sendOtp()
   - Generates 6-digit OTP
   - Emails OTP to user
   - Transitions to status: 'otp_pending'

3. **POST /api/transactions/consent-challenge/:id/verify-otp** — verifyOtp()
   - Verify OTP against hash
   - Transition to status: 'confirmed'

4. **POST /api/transactions** with consentChallengeId
   - Verifies challenge is confirmed
   - Executes transaction

### Current Scope

**Applies to:**
- Transfers (amount > $500)
- Withdrawals (amount > $500)
- Deposits (N/A — not high-value sensitive)

**Does NOT apply to:**
- Any transfer < $500
- Admin users
- Non-transfer transactions

## Phase 170 Requirements

### Requirement: TRANSFER-HITL-01
**Force HITL for ALL transfers** (remove amount threshold for transfer type only)

Change:
```javascript
// NEW: For 'transfer' type, ALWAYS require consent regardless of amount
if (v.normalized.type === 'transfer') {
  // Skip the amount check, proceed to create challenge
}
else if (v.normalized.amount <= HIGH_VALUE_CONSENT_USD) {
  // Keep existing logic for withdrawal/deposit
  return { error: 'consent_challenge_not_required', ... }
}
```

**Acceptance criteria:**
- Transfers of any amount (including $1) require consent challenge
- Withdrawals keep existing $500 threshold
- Deposits unaffected
- Admin users still bypass (preserve existing behavior)

### Requirement: TRANSFER-HITL-02
**Ensure BFF authorization layer blocks transfers without valid consent**

Changes needed in `routes/transactions.js`:
- `verifyAndConsumeChallenge()` must validate consent for transfers
- Return 428 (Precondition Required) if transfer + no valid consent
- Error message: "Transfer requires HITL approval. Create a consent challenge first."

**Acceptance criteria:**
- Direct POST /api/transactions without consentChallengeId returns 428 for transfers
- Existing logged-in user flows still work (agent-initiated transfers get 428 → UI shows HITL modal)
- MCP agent receives step_up_required with appropriate error

### Requirement: TRANSFER-HITL-03
**Update REGRESSION_PLAN.md** with new guardrails

Document:
- Transfer HITL enforcement (all amounts)
- Where the check happens (transactionConsentChallenge: type check; routes/transactions: verification)
- Why amount threshold was removed (security requirement, FI regulation alignment)

### Requirement: TRANSFER-HITL-04
**Test coverage**

Add/update tests:
- Unit: Transfer type triggers HITL regardless of amount
- Integration: POST /api/transactions without consent returns 428
- E2E: Agent-initiated transfer follows full challenge flow

## Architecture Impact

### Files Modified

1. **banking_api_server/services/transactionConsentChallenge.js**
   - `createChallenge()` — add transfer type check

2. **banking_api_server/routes/transactions.js**
   - Ensure POST /api/transactions validates challenge for transfers
   - Error responses for missing/invalid consent

3. **REGRESSION_PLAN.md**
   - Add transfer HITL enforcement to §1 do-not-break list
   - Log decision in §4

### No Changes Required

- `transactionConsentChallenge` OTP flow (works as-is)
- Admin bypass (keep as-is)
- Withdrawal/deposit thresholds (unchanged)
- UI consent flow (already exists, will show for all transfers)

## Testing Strategy

### Manual Testing

1. **Consent Challenge Creation:**
   - `POST /api/transactions/consent-challenge { type: 'transfer', amount: 1.00 }`
   - Expect: 200 + challengeId (not 400 'not_required')

2. **Direct Transaction Creation:**
   - `POST /api/transactions { type: 'transfer', amount: 1.00 }`
   - Expect: 428 (precondition required) + consent challenge error

3. **Full Flow:**
   - Create challenge → Send OTP → Verify OTP → Execute with consentChallengeId
   - Expect: 200 + transaction created

4. **Admin Bypass:**
   - Same as (2) but as admin user
   - Expect: 200 + transaction executed (no challenge required)

### Automated Testing

- Update `banking_api_ui/src/services/bankingAgentService.test.js` or add new transfer-specific tests
- Mock `transactionConsentChallenge.createChallenge()` returning 200 for all transfer amounts
- Mock `routes/transactions.js` returning 428 for transfers without valid consent

## Decisions

- **D-01: Transfer-only scope** — Enforce HITL for transfers only; withdrawals keep $500 threshold
- **D-02: Admin bypass preserved** — Admin users do not need consent (operational necessity)
- **D-03: No API version bump** — Change is backward-compatible (stricter, but same structure)
- **D-04: Session-backed state** — Keep consent challenges in express-session (works with Redis on Vercel)

## Related Phases

**Depends on:** Phase 169 (OAuth token display page) — ✓ Complete

**Enables:** Phase 171+ (additional security enforcement layers)

**Related:** 
- Phase 9: CIBA step-up authentication (parallel HITL mechanism)
- Phase 10: Enterprise-grade HITL (consent modal, styling)

## Success Criteria (Phase-level)

1. All transfers ≥ $0.01 require explicit consent challenge
2. BFF returns 428 + "HITL required" for unconsented transfers
3. Authentication flow (PingOne token exchange) unaffected
4. No build errors; `npm run build` exits 0
5. Existing HITL test suite passes (challenge flow, OTP, etc.)
6. REGRESSION_PLAN.md updated with new guardrails
