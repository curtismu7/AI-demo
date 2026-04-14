---
phase: 144
plan: 02
subsystem: banking_api_ui
tags: [ui, pingone-test, feature-flag, token-exchange, id-token]
dependency_graph:
  requires: [144-01]
  provides: [ID Token Exchange UI test card, TokenChainDisplay idTokenMode prop]
  affects: [PingOneTestPage, TokenChainDisplay]
tech_stack:
  added: []
  patterns: [FF-gated UI column, conditional label prop]
key_files:
  created: []
  modified:
    - banking_api_ui/src/components/PingOneTestPage.jsx
    - banking_api_ui/src/components/TokenChainDisplay.js
decisions:
  - effectivePlaceholders useMemo pattern avoids mutating static PLACEHOLDER_EVENTS while supporting idTokenMode label swap
metrics:
  duration: "~5 min"
  completed: "2026-04-14"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 144 Plan 02: ID Token Exchange UI + TokenChainDisplay idTokenMode Summary

Add FF-gated ID Token → MCP Token test row to PingOneTestPage and conditional user token labels to TokenChainDisplay.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | PingOneTestPage ID Token Exchange column | 0bf65aa | PingOneTestPage.jsx |
| 2 | TokenChainDisplay idTokenMode prop | 2672ac8 | TokenChainDisplay.js |

## What Was Built

**Task 1 — PingOneTestPage.jsx:**
- `exchangeIdTokenStatus / Error / Decoded / SubjectDecoded` state vars
- `ffIdTokenExchange` boolean state, read from `/api/pingone-test/config` in `loadWorkerConfig` useEffect
- `testExchangeIdToken` useCallback handler calling `GET /api/pingone-test/exchange-id-token-to-mcp`
- New `test-card-col` rendered after Exchange 3 column:
  - When `ffIdTokenExchange=true`: active TestCard + DecodedTokenPanel(s)
  - When `ffIdTokenExchange=false`: disabled TestCard with enable-FF message

**Task 2 — TokenChainDisplay.js:**
- Component signature changed to `({ idTokenMode = false })`
- `effectivePlaceholders` useMemo: maps PLACEHOLDER_EVENTS to swap `label: 'User ID token'` on id=`user-token` row and `exchange` row label when idTokenMode=true
- `currentEvents` uses `effectivePlaceholders` instead of raw `PLACEHOLDER_EVENTS`
- Header subtitle and session-dot `title` attribute swap "User access token" → "User ID token" when `idTokenMode=true`

## Verification

`npm run build` → exit 0 ✓

## Deviations from Plan

None — plan executed exactly as written. No `ffTwoExchangeDelegation` existed in the file (it was the first FF), so `loadWorkerConfig` was the direct insertion point as specified.

## Self-Check: PASSED

- [x] `0bf65aa` commit exists
- [x] `2672ac8` commit exists
- [x] `PingOneTestPage.jsx` modified
- [x] `TokenChainDisplay.js` modified
- [x] Build exit 0
