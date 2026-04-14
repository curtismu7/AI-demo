---
phase: 146-scope-vocabulary-alignment-match-code-to-pingone
plan: 02
subsystem: api
tags: [feature-flags, oauth, scopes, token-injection]
requires:
  - phase: 146-01
    provides: canonical scope names in scopes.js
provides:
  - ff_inject_scopes feature flag in configStore
  - Scope injection logic in agentMcpTokenService
  - injected_scope_names claim tracking
affects: [token-chain-display, dashboard, mcp-inspector]
key-files:
  modified: [banking_api_server/services/configStore.js, banking_api_server/routes/featureFlags.js, banking_api_server/services/agentMcpTokenService.js]
key-decisions:
  - "ff_inject_scopes mirrors ff_inject_may_act pattern exactly"
  - "Injection stores injected_scope_names array in claims for per-scope UI badges"
requirements-completed: []
completed: 2026-04-14
---

# Plan 146-02: Feature Flag Infrastructure

**Added ff_inject_scopes feature flag and scope injection logic in agentMcpTokenService.**

## Accomplishments
- Added ff_inject_scopes field definition in configStore.js (public: true, default: 'false')
- Added FLAG_REGISTRY entry in featureFlags.js (category: OAuth Scopes, warnIfEnabled: true)
- Inserted scope injection block in agentMcpTokenService.js (lines 447-493)
- Injection: checks flag → checks existing scopes → injects banking:read + banking:write → stores injected_scope_names → pushes tokenEvent

## Task Commits
1. **Task 1-3: Feature flag + injection logic** - `b4196ed`

## Files Created/Modified
- `banking_api_server/services/configStore.js` - Added ff_inject_scopes field
- `banking_api_server/routes/featureFlags.js` - Added FLAG_REGISTRY entry
- `banking_api_server/services/agentMcpTokenService.js` - Scope injection block inserted
