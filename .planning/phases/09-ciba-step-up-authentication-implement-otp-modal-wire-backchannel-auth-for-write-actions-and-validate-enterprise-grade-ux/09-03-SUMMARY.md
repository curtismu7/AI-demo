---
phase: 09-ciba-step-up-authentication-implement-otp-modal-wire-backchannel-auth-for-write-actions-and-validate-enterprise-grade-ux
plan: "03"
subsystem: api
tags: [config, step-up, email, threshold, configStore, transactions]

requires: []
provides:
  - Default step-up method changed to 'email' in runtimeSettings, configStore, Config.js
  - step_up_amount_threshold configurable via Admin Config UI (default $250)
  - transactions.js reads threshold from configStore.getEffective first

affects: [transactions, admin-config]

tech-stack:
  added: []
  patterns:
    - configStore.getEffective() takes precedence over runtimeSettings for runtime-tunable values

key-files:
  created: []
  modified:
    - banking_api_server/config/runtimeSettings.js
    - banking_api_server/services/configStore.js
    - banking_api_ui/src/components/Config.js
    - banking_api_server/routes/transactions.js

key-decisions:
  - "Email OTP is now the default — wider device compatibility than CIBA push"
  - "step_up_amount_threshold in configStore allows runtime change without server restart"
  - "threshold falls back runtimeSettings → 250 to preserve backwards compat"

patterns-established:
  - "configStore.getEffective() priority over runtimeSettings for admin-configurable values"

requirements-completed: [CIBA-03]

duration: 10min
completed: 2026-04-03
---

# Phase 09-03: Default step-up method to email, configurable threshold

**Default step-up method changed to 'email' across all layers; step-up threshold now Admin Config.**

## Performance

- **Duration:** 10 min
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `stepUpMethod` default changed 'ciba' → 'email' in runtimeSettings.js
- `step_up_method` default changed 'ciba' → 'email' in configStore schema + Config.js
- `step_up_amount_threshold` added to configStore schema, env mapping, and Config.js form
- "Step-up threshold ($)" number input added to Admin Config Step-Up Authentication section
- `transactions.js` reads `STEP_UP_THRESHOLD` from `configStore.getEffective('step_up_amount_threshold')` first

## Task Commits

1. **Task 1: Change default method in runtimeSettings, configStore, Config.js; add threshold schema** — `45d67bb` (feat)
2. **Task 2: Add threshold form field in Config.js; wire transactions.js** — `45d67bb` (feat)

## Files Created/Modified

- `banking_api_server/config/runtimeSettings.js` — stepUpMethod default 'email'
- `banking_api_server/services/configStore.js` — step_up_method default 'email', step_up_amount_threshold added
- `banking_api_ui/src/components/Config.js` — email default, threshold number input
- `banking_api_server/routes/transactions.js` — reads threshold from configStore first
