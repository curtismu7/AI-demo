---
phase: 53-debug-testing-and-bug-fixes-for-phase-52-mfa-step-up
plan: "01"
subsystem: auth
tags: [mfa, stepUpVerified, ttl, token-refresh, error-codes, session-security]

requires:
  - phase: 52-pingone-mfa-step-up
    provides: mfaService.js + mfa.js routes baseline

provides:
  - stepUpVerified session flag replaced with 5-min TTL timestamp at all 4 write sites
  - All stepUpVerified read/check sites use > Date.now() comparison
  - _wrapError in mfaService attaches e.code ('token_expired', 'challenge_expired') for 401/404/410
  - All 3 mfa.js route catch blocks handle challenge_expired (→ 410) and token_expired (→ refresh+retry, fallback 401)
  - _tryRefresh helper in mfa.js for one-shot silent token refresh

affects: [53-02, 53-03, 53-04, ui-mfa-modal]

tech-stack:
  added: []
  patterns:
    - "stepUpVerified as TTL: Date.now() + STEP_UP_TTL_MS (5 min), check via > Date.now(), consume to 0"
    - "MFA error codes via _wrapError: e.code = 'token_expired' | 'challenge_expired'"
    - "One-shot silent refresh: _tryRefresh(req) then retry MFA call; fallback session_expired 401"

key-files:
  created: []
  modified:
    - banking_api_server/routes/ciba.js
    - banking_api_server/routes/mfa.js
    - banking_api_server/routes/oauthUser.js
    - banking_api_server/services/mcpLocalTools.js
    - banking_api_server/routes/mcpInspector.js
    - banking_api_server/services/mfaService.js

key-decisions:
  - "STEP_UP_TTL_MS = 5 * 60 * 1000 (5 minutes) defined per file that uses it"
  - "Consume (single-use) sets to 0, not false — 0 fails the > Date.now() check naturally"
  - "mcpInspector.js gate: !(stepUpVerified > Date.now()) covers both expired and never-set cases"

patterns-established:
  - "TTL session flags: set = Date.now() + TTL_MS; check = value > Date.now(); consume = 0"
  - "mfa.js catch blocks: challenge_expired → 410; token_expired → refresh+retry → fallback 401 session_expired"

requirements-completed: [BUG-01, BUG-02, BUG-03]

duration: 25min
completed: 2026-04-04
---

# Phase 53-01: BFF Session TTL + MFA Error Codes

**stepUpVerified boolean replaced with 5-min TTL timestamp; MFA routes now handle challenge expiry (410) and token expiry (silent refresh + retry) across all 4 write sites and 2 check sites.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-04T15:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- D-01: Replaced `stepUpVerified = true` with `Date.now() + STEP_UP_TTL_MS` at all 4 BFF write sites (ciba.js, mfa.js ×2, oauthUser.js); both check sites updated to `> Date.now()` comparison; consume changed from `false` to `0`
- D-02: Extended `_wrapError` in mfaService.js — attaches `e.code = 'token_expired'` for 401, `'challenge_expired'` for 404/410
- D-03: All 3 mfa.js route catch blocks now handle `challenge_expired` (→ HTTP 410) and `token_expired` (→ `_tryRefresh` one-shot retry, fallback HTTP 401 `session_expired`); added `_tryRefresh` helper

## Task Commits

1. **Task 1+2: TTL + error codes + catch blocks** - `a867fb6` (fix(53-01))

## Files Created/Modified

- `banking_api_server/routes/ciba.js` — TTL constant + write site updated
- `banking_api_server/routes/mfa.js` — TTL constant + oauthService import + _tryRefresh helper + all 3 catch blocks + write sites
- `banking_api_server/routes/oauthUser.js` — TTL constant + write site updated
- `banking_api_server/services/mcpLocalTools.js` — check site: `=== true` → `> Date.now()`, consume: `false` → `0`
- `banking_api_server/routes/mcpInspector.js` — gate: `!stepUpVerified` → `!(stepUpVerified > Date.now())`
- `banking_api_server/services/mfaService.js` — _wrapError extended with e.code for 401/404/410
