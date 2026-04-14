---
phase: 146-scope-vocabulary-alignment-match-code-to-pingone
plan: 05
subsystem: api, ui
tags: [pingone-test, scopes, canonical]
requires:
  - phase: 146-01
    provides: canonical scope names
provides:
  - PingOne test routes with canonical scope references
  - PingOneTestPage with canonical + compound scope lists
affects: [pingone-test-page]
key-files:
  modified: [banking_api_server/routes/pingoneTestRoutes.js, banking_api_ui/src/components/PingOneTestPage.jsx]
key-decisions:
  - "Token exchange fallback scopes kept as compound (env-var driven, PingOne resource-level)"
  - "EXPECTED_BANKING_SCOPES updated to include both canonical and compound scopes"
  - "JSDoc header updated with canonical scope vocabulary reference"
requirements-completed: []
completed: 2026-04-14
---

# Plan 146-05: PingOne Test Page Refactor

**Updated PingOne test routes and page to reference canonical scope vocabulary alongside compound scopes.**

## Accomplishments
- Updated pingoneTestRoutes.js JSDoc header with canonical scope vocabulary reference
- Updated EXPECTED_BANKING_SCOPES to include banking:read, banking:write alongside compound scopes
- Updated PingOneTestPage.jsx TEST_CONFIG requiredScopes to include canonical scopes
- Updated PingOneTestPage.jsx EXPECTED_BANKING_SCOPES array
- Build verified passing

## Task Commits
1. **Task 1-2: Canonical scope vocabulary in test routes and page** - `937b80b`

## Files Created/Modified
- `banking_api_server/routes/pingoneTestRoutes.js` - JSDoc header + EXPECTED_BANKING_SCOPES updated
- `banking_api_ui/src/components/PingOneTestPage.jsx` - TEST_CONFIG + EXPECTED_BANKING_SCOPES updated
