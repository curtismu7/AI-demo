---
phase: 09-ciba-step-up-authentication-implement-otp-modal-wire-backchannel-auth-for-write-actions-and-validate-enterprise-grade-ux
plan: "04"
subsystem: api
tags: [step-up, acr, 428, sensitive-details, mcp-inspector]

requires: []
provides:
  - GET /api/accounts/sensitive-details returns 428 for unelevated ACR
  - mcpLocalTools.get_sensitive_account_details checks ACR, returns real data if elevated
  - callToolLocal forwards req parameter to tool handlers (backwards compatible)

affects: [sensitive-details, mcp-local-tools, banking-agent]

tech-stack:
  added: []
  patterns:
    - ACR check: req.user.acr / req.user['pingone:acr'] split(' ') === STEP_UP_ACR

key-files:
  created: []
  modified:
    - banking_api_server/routes/sensitiveBanking.js
    - banking_api_server/services/mcpLocalTools.js
    - banking_api_server/routes/mcpInspector.js

key-decisions:
  - "POST /sensitive-consent left intact as unused fallback — removal is out of scope"
  - "callToolLocal req is optional (undefined for existing callers) — backwards compatible"
  - "PAZ check for elevated users preserved — ACR gate runs before checkSensitiveAccess"

patterns-established:
  - "428 step_up_required body: {ok:false, step_up_required:true, error:'step_up_required', step_up_method, step_up_acr}"

requirements-completed: [CIBA-02]

duration: 10min
completed: 2026-04-03
---

# Phase 09-04: 428 ACR gate for sensitive account details

**GET /api/accounts/sensitive-details now returns 428 for unelevated users; local inspector wired for step-up.**

## Performance

- **Duration:** 10 min
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `sensitiveBanking.js` adds ACR check at top of GET /sensitive-details — 428 + step_up_required body for non-elevated
- Elevated users continue to PAZ check + data return (unchanged path)
- `mcpLocalTools.get_sensitive_account_details` now performs ACR check against req — returns step_up_required or real account data
- `callToolLocal` updated to accept `req` parameter and forward to handlers
- `mcpInspector.js` passes `req` to `callToolLocal`

## Task Commits

1. **Task 1: ACR gate in sensitiveBanking.js** — `2a8273f` (feat)
2. **Task 2: mcpLocalTools ACR check + callToolLocal req** — `2a8273f` (feat)

## Files Created/Modified

- `banking_api_server/routes/sensitiveBanking.js` — runtimeSettings import, ACR gate → 428
- `banking_api_server/services/mcpLocalTools.js` — runtimeSettings import, ACR check in get_sensitive_account_details, callToolLocal(req)
- `banking_api_server/routes/mcpInspector.js` — callToolLocal now passes req
