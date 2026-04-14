---
phase: 146-scope-vocabulary-alignment-match-code-to-pingone
plan: 01
subsystem: api
tags: [oauth, scopes, documentation]
provides:
  - SCOPE_VOCABULARY.md canonical registry
  - scopes.js refactored to canonical names (banking:read, banking:write)
  - COMPOUND_SCOPES export for backward compat
affects: [scope-audit, token-exchange, mcp-server]
key-files:
  created: [banking_api_server/SCOPE_VOCABULARY.md]
  modified: [banking_api_server/config/scopes.js, banking_api_server/routes/scopeAudit.js, banking_api_server/scripts/verify-scope-configuration.js, banking_api_server/services/configStore.js]
key-decisions:
  - "banking:general:read/write renamed to banking:read/write as canonical names"
  - "Compound scopes (banking:accounts:read etc.) kept for backward compat via COMPOUND_SCOPES"
requirements-completed: []
completed: 2026-04-14
---

# Plan 146-01: Scope Inventory + Documentation

**Created canonical scope registry (SCOPE_VOCABULARY.md) and refactored scopes.js to use banking:read/banking:write naming.**

## Accomplishments
- Created SCOPE_VOCABULARY.md with scope list, resource server mapping, route enforcement index, user type assignments
- Refactored scopes.js: BANKING_READ → 'banking:read', BANKING_WRITE → 'banking:write'
- Added COMPOUND_SCOPES export for backward compatibility
- Updated banking:general:* references in scopeAudit.js, configStore.js, verify-scope-configuration.js
- Added cross-references to existing scope documentation files

## Task Commits
1. **Task 1-3: Scope vocabulary registry + code refactoring** - `b3c18d0`

## Files Created/Modified
- `banking_api_server/SCOPE_VOCABULARY.md` - Canonical scope registry (~130 lines)
- `banking_api_server/config/scopes.js` - Rewritten with canonical names + COMPOUND_SCOPES
- `banking_api_server/routes/scopeAudit.js` - Updated banking:general → banking
- `banking_api_server/scripts/verify-scope-configuration.js` - Updated banking:general → banking
- `banking_api_server/services/configStore.js` - Updated banking:general → banking
- `banking_api_server/OAUTH_SCOPE_CONFIGURATION.md` - Cross-reference added
- `banking_api_server/SCOPE_AUTHORIZATION.md` - Cross-reference added
- `banking_api_server/SCOPE_CONFIGURATION_README.md` - See Also section added
