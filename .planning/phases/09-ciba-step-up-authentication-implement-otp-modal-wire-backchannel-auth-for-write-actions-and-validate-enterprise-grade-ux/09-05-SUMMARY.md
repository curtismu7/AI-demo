---
phase: 09-ciba-step-up-authentication-implement-otp-modal-wire-backchannel-auth-for-write-actions-and-validate-enterprise-grade-ux
plan: "05"
subsystem: mcp
tags: [typescript, mcp-server, 428, step-up, banking-api-client]

requires: []
provides:
  - BankingAPIClient.getSensitiveAccountDetails returns 428 body instead of throwing
  - BankingToolProvider.executeGetSensitiveAccountDetails handles step_up_required shape
  - MCP TypeScript server builds cleanly (tsc exit 0)

affects: [mcp-production-path, banking-agent]

tech-stack:
  added: []
  patterns:
    - 428 caught in API client method → body returned as Record<string,unknown> (not thrown)
    - step_up_required check before consent_required check in BankingToolProvider

key-files:
  created: []
  modified:
    - banking_mcp_server/src/banking/BankingAPIClient.ts
    - banking_mcp_server/src/tools/BankingToolProvider.ts

key-decisions:
  - "All non-428 errors re-thrown — 428 is the only 'successful failure' that returns body"
  - "Fallback step_up_method: 'email' if body not accessible from originalError"
  - "Existing consent_required block left intact as defensive fallback"

patterns-established:
  - "statusCode === 428 caught in client method to prevent generic error masking structured responses"

requirements-completed: [CIBA-02]

duration: 8min
completed: 2026-04-03
---

# Phase 09-05: MCP TypeScript 428 handling for sensitive details

**MCP server now surfaces step_up_required tool result instead of generic error for sensitive-details 428.**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `BankingAPIClient.getSensitiveAccountDetails` wraps request in try/catch — catches status 428, returns body
- `BankingToolProvider.executeGetSensitiveAccountDetails` checks `step_up_required` before `consent_required`
- Structured result `{ ok:false, step_up_required:true, error:'step_up_required', step_up_method }` matches BankingAgent.js 428 handler
- `npm run build` (TypeScript) exits 0 — no type errors

## Task Commits

1. **Task 1: Catch 428 in BankingAPIClient** — `b834e60` (feat)
2. **Task 2: Handle step_up_required in BankingToolProvider** — `b834e60` (feat)

## Files Created/Modified

- `banking_mcp_server/src/banking/BankingAPIClient.ts` — try/catch around getSensitiveAccountDetails, 428 body returned
- `banking_mcp_server/src/tools/BankingToolProvider.ts` — step_up_required handler before consent_required
