---
phase: 146-scope-vocabulary-alignment-match-code-to-pingone
plan: 03
subsystem: ui
tags: [react, token-chain, dashboard, scopes]
requires:
  - phase: 146-02
    provides: injected_scope_names claim in token events
provides:
  - Per-scope INJECTED badges in TokenChainDisplay
  - Scope injection warning banner on Dashboard
affects: [dashboard, token-chain-display]
key-files:
  modified: [banking_api_ui/src/components/TokenChainDisplay.js, banking_api_ui/src/components/TokenChainDisplay.css, banking_api_ui/src/components/Dashboard.js]
  created: [banking_api_ui/src/components/Dashboard.css]
key-decisions:
  - "Per-scope badge rendering: tcd-scope-badge--real (blue) vs tcd-scope-badge--injected (amber/gold)"
  - "Dashboard warning banner dismissable, fetches /api/admin/config to check flag state"
requirements-completed: []
completed: 2026-04-14
---

# Plan 146-03: Token Chain UI + Warning Banner

**Added INJECTED scope badges in Token Chain Display and scope injection warning banner on Dashboard.**

## Accomplishments
- Enhanced fmtScope() to accept injectedScopeNames parameter for badge-aware formatting
- Added per-scope badge rendering in ClaimsStrip (real vs injected with ⚡ tag)
- Added scopeInjectedHint to EventRow hints
- Created Dashboard warning banner with ⚠️ icon, title, description, dismiss button
- Build verified: 406.99 kB JS, 72.69 kB CSS

## Task Commits
1. **Task 1-2: INJECTED badges + warning banner** - `bd3ba98`

## Files Created/Modified
- `banking_api_ui/src/components/TokenChainDisplay.js` - Per-scope badges, fmtScope enhanced
- `banking_api_ui/src/components/TokenChainDisplay.css` - Scope badge CSS (real blue, injected amber)
- `banking_api_ui/src/components/Dashboard.js` - scopeInjectionEnabled state, config fetch, warning banner
- `banking_api_ui/src/components/Dashboard.css` - Warning banner CSS (new file)
