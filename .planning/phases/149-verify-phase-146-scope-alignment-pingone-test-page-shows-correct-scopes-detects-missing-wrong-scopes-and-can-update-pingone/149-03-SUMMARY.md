---
phase: 149
plan: 03
subsystem: scope-config-token-chain
tags: [scope-vocabulary, token-chain, env-config, oauthUser]
dependency_graph:
  requires: [149-01, 149-02]
  provides: [token-chain-exchange-wiring, scope-constant-alignment, enduser-audience-fix]
  affects: [banking_api_server/config/oauthUser.js, banking_api_server/.env, banking_api_ui/src/components/PingOneTestPage.jsx]
tech_stack:
  added: []
  patterns: [useTokenChainOptional, BANKING_SCOPES constant]
key_files:
  modified:
    - banking_api_server/config/oauthUser.js
    - banking_api_server/.env
    - banking_api_ui/src/components/PingOneTestPage.jsx
decisions:
  - "ENDUSER_AUDIENCE set to https://ai-agent.pingdemo.com (AI Agent resource server, not banking resource server)"
  - "Token chain push uses defensive check (data.tokenEvents && ctx?.setTokenEvents) — no-op until BFF adds tokenEvents to exchange responses"
  - ".env not committed to git (gitignored, secrets) — change is on disk only"
metrics:
  duration: "~6 minutes"
  completed: "2026-04-14"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase 149 Plan 03: Wire Token Chain + Fix BANKING_SCOPES.AI_AGENT + .env Values Summary

**One-liner:** Replaced hardcoded `'banking:ai:agent'` with `BANKING_SCOPES.AI_AGENT` in oauthUser.js, corrected `ENDUSER_AUDIENCE` to AI Agent resource server URI, and wired `useTokenChainOptional` into PingOneTestPage exchange handlers.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Replace `'banking:ai:agent'` with `BANKING_SCOPES.AI_AGENT` in oauthUser.js | `52d22e4` | banking_api_server/config/oauthUser.js |
| 2 | Correct `ENDUSER_AUDIENCE` in .env to `https://ai-agent.pingdemo.com` | (gitignored) | banking_api_server/.env |
| 3 | Wire `useTokenChainOptional` + token chain push in testExchange1/2/3 | `8373f3a` | banking_api_ui/src/components/PingOneTestPage.jsx |

## Verification

- `npm run build` in `banking_api_ui/` → **exit 0** ✓
- oauthUser.js now imports `BANKING_SCOPES` from `./scopes` and uses `BANKING_SCOPES.AI_AGENT` ✓
- `.env` `ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com` (on disk, not committed — gitignored) ✓
- `.env` `PINGONE_RESOURCE_MCP_SERVER_URI=https://mcp-server.pingdemo.com` — already correct, no change needed ✓
- PingOneTestPage imports `useTokenChainOptional`, adds `tokenChainCtx` hook, and calls `tokenChainCtx.setTokenEvents(label, data.tokenEvents)` on successful exchange ✓

## Deviations from Plan

### Notes

**1. [Expected] .env not committed to git**
- **Found during:** Task 2
- **Issue:** `banking_api_server/.env` is gitignored (correct — contains secrets)
- **Fix:** Change is on disk; no commit needed/possible
- **Impact:** None — `.env.example` is the committed reference

**2. [Expected] BFF `tokenEvents` not yet in exchange responses**
- **Found during:** Task 3 investigation
- **Issue:** `pingoneTestRoutes.js` exchange endpoints don't yet return a `tokenEvents` array
- **Fix:** Added defensive `if (data.tokenEvents && tokenChainCtx?.setTokenEvents)` guard — the UI hook is wired but is a no-op until the BFF adds `buildExchangeTokenEvent` helper + tokenEvents to responses
- **Impact:** Token Chain panel won't update from test-page exchanges until plan 149-04 (or equivalent BFF task) adds that helper

## Known Stubs

None. The token chain wiring is defensive (correctly no-ops if BFF hasn't added `tokenEvents` yet). This is intentional per task instructions.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check

- [x] `banking_api_server/config/oauthUser.js` modified — `BANKING_SCOPES.AI_AGENT` confirmed
- [x] `banking_api_server/.env` on disk with correct `ENDUSER_AUDIENCE` value
- [x] `banking_api_ui/src/components/PingOneTestPage.jsx` modified — `useTokenChainOptional` confirmed
- [x] Commits `52d22e4` and `8373f3a` exist in git log

## Self-Check: PASSED
