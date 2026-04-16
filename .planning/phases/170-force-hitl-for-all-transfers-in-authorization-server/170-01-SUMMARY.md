# 170-01-SUMMARY — Transfer HITL Enforcement

## What was done
- Modified `transactionConsentChallenge.js` to require consent challenges for ALL transfers regardless of amount (Phase 170)
- Updated `routes/transactions.js` to return 428 `consent_challenge_required` when transfers lack a `consentChallengeId`
- Admin bypass preserved; withdrawals/deposits keep $500 threshold

## Files modified
- `banking_api_server/services/transactionConsentChallenge.js` — Added transfer-type check before amount threshold in `createChallenge()`
- `banking_api_server/routes/transactions.js` — Updated HITL consent gate to always require consent for transfers

## Key decisions
- Transfer type check uses `v.normalized.type === 'transfer'` before the amount `<= HIGH_VALUE_CONSENT_USD` check
- BFF returns 428 (not 400) for missing consent — matches HTTP semantics for "precondition required"
- Added explicit 428 for missing `consentChallengeId` (previously only checked during `verifyAndConsumeChallenge`)

## Commits
- `fbfd44f` — feat(170-01): force HITL consent for all transfers regardless of amount

## Verification
- `node -c` syntax check passed for both files
- Transfer $1 → consent challenge created (previously rejected as "not required")
- Withdrawal $100 → still rejected as "not required" (threshold preserved)
- Admin role → still bypasses consent (unchanged)
