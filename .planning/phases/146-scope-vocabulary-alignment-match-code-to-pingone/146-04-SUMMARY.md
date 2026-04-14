---
phase: 146-scope-vocabulary-alignment-match-code-to-pingone
plan: 04
subsystem: api, ui
tags: [admin, scope-reference, sidenav, react]
requires:
  - phase: 146-01
    provides: SCOPE_VOCABULARY.md canonical registry
provides:
  - GET /api/admin/scope-vocabulary BFF endpoint
  - ScopeReferencePage component
  - Scope Ref. nav item in SideNav Developer Tools
affects: [admin-config, sidenav]
key-files:
  created: [banking_api_ui/src/components/ScopeReferencePage.js]
  modified: [banking_api_server/routes/adminConfig.js, banking_api_ui/src/components/SideNav.js, banking_api_ui/src/App.js]
key-decisions:
  - "Endpoint reads SCOPE_VOCABULARY.md from disk and returns as JSON {success, markdown}"
  - "UI renders markdown as preformatted text (no markdown parser dependency)"
  - "Added MdMenuBook icon import for nav item"
requirements-completed: []
completed: 2026-04-14
---

# Plan 146-04: Scope Reference Links

**Added BFF endpoint for scope vocabulary, ScopeReferencePage component, and Scope Ref. nav link.**

## Accomplishments
- Added GET /api/admin/scope-vocabulary endpoint to adminConfig.js (reads SCOPE_VOCABULARY.md, returns JSON)
- Created ScopeReferencePage.js component (fetches endpoint, renders preformatted markdown)
- Added "Scope Ref." to SideNav Developer Tools group with MdMenuBook icon
- Added route /scope-reference in App.js wrapped in AdminRoute
- Build verified passing

## Task Commits
1. **Task 1-3: BFF endpoint + page + nav link** - `e91b20b`

## Files Created/Modified
- `banking_api_server/routes/adminConfig.js` - GET /api/admin/scope-vocabulary endpoint
- `banking_api_ui/src/components/ScopeReferencePage.js` - New page component
- `banking_api_ui/src/components/SideNav.js` - Added Scope Ref. nav item + MdMenuBook import
- `banking_api_ui/src/App.js` - Added ScopeReferencePage import and /scope-reference route
