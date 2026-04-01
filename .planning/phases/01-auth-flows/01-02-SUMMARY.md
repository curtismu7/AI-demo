# Summary: 01-02 — BankingToolProvider step_up_required passthrough

**Phase:** 01-auth-flows
**Plan:** 01-02
**Completed:** 2026-03-31
**Commit:** 2d3933c

## What Was Built

Added `step_up_required` structured error passthrough to all 3 catch blocks in `BankingToolProvider.ts` (deposit, withdrawal, transfer). When the BFF returns HTTP 428 with `error: step_up_required`, the MCP tool now returns a structured JSON result instead of propagating a raw thrown error.

Each catch block now checks `error.errorCode === 'step_up_required'` BEFORE the existing `consent_challenge_required` check. It extracts `step_up_method` and `amount_threshold` from `error.originalError?.response?.data` and returns via `createSuccessResult`.

## Return Shape

```json
{
  "error": "step_up_required",
  "step_up_required": true,
  "step_up_method": "ciba",
  "message": "This transaction requires additional authentication (CIBA). Please complete the step-up verification to proceed.",
  "amount_threshold": 250
}
```

## Files Changed

- `banking_mcp_server/src/tools/BankingToolProvider.ts` — added step_up_required block before each of 3 consent_challenge_required blocks (deposit ~line 373, withdrawal ~line 422, transfer ~line 478)

## Verification

- `npx tsc --noEmit` → clean, no output ✓
- 725 tests pass, 1 pre-existing unrelated integration test failure (mcp-protocol token header test — fails on baseline too) ✓
- `consent_challenge_required` handling unchanged ✓
- `createAuthChallengeResult` path unchanged ✓

## Key Decisions

- Used `createSuccessResult(JSON.stringify({...}))` to match consent_challenge_required pattern — avoids new interface fields
- Used `error.originalError?.response?.data` (correct field, not `axiosError`) cast to `Record<string, unknown>`
- `step_up_method` defaults to `'ciba'` if not present in BFF response

## Self-Check: PASSED
