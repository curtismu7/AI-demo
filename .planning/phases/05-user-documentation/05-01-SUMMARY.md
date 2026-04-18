---
phase: 05-user-documentation
plan: 01
status: complete
---

# 05-01 SUMMARY

**Plan:** Audit and fix docs/SETUP.md and README.md  
**Requirements:** DOC-01  
**Status:** COMPLETE

## What Was Done

### Task 1: Fixed docs/SETUP.md (5 targeted fixes)

1. **Env var naming** — Renamed `PINGONE_AI_CORE_CLIENT_ID` → `PINGONE_ADMIN_CLIENT_ID`, `PINGONE_AI_CORE_USER_CLIENT_ID` → `PINGONE_USER_CLIENT_ID` in §2.2, §2.3, §3, §7. Added legacy names note as fallback alias documentation.

2. **MCP Token Exchanger app** — Added new §2.5 with full config table (Type: AI_AGENT, grant types, scopes, env vars `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID/_SECRET`). Renumbered old §2.5 → §2.6.

3. **App count** — Updated intro from "three PingOne OAuth applications" → "four PingOne applications" with optional fifth.

4. **Port clarity** — Replaced vague §4 Option A text with explicit port table (UI: 4000, API: 3002, MCP: 8080), HTTPS/mkcert requirement, and a comparison callout: run-bank.sh = 4000/3002 HTTPS; start.sh/manual = 3000/3001 HTTP.

5. **Scope consistency** — Verified no stale `banking:read`/`banking:write` scopes remain (consolidated 6-scope model already used throughout).

### Task 2: Verified README.md pointer (no changes needed)

README already has two `docs/SETUP.md` pointers (Quick Start + Configuration sections). No stale `AI_CORE` refs present.

## Verification
- `grep "PINGONE_AI_CORE_CLIENT_ID" docs/SETUP.md` → 0 matches (only legacy note remains) ✅
- `grep -c "PINGONE_ADMIN_CLIENT_ID" docs/SETUP.md` → 4 ✅
- `grep -c "MCP Token Exchanger" docs/SETUP.md` → 3 ✅
- `grep -c "4000/3002" docs/SETUP.md` → 1 ✅
- `grep "docs/SETUP.md" README.md` → 2 matches ✅

## Commits
- `24bf91c` — docs(05-01): fix env var naming, add MCP Token Exchanger, clarify ports in SETUP.md

## Artifacts
- `docs/SETUP.md` (modified — 5 targeted fixes, net +47/-10 lines)
- `README.md` (verified, no changes needed)
---
phase: 05-user-documentation
plan: 01
status: complete
---

# 05-01 SUMMARY

**Plan:** docs/SETUP.md + README.md pointer update  
**Requirements:** DOC-01  
**Status:** COMPLETE (artifacts verified as meeting all must_haves)

## What Was Done

### Task 1: Created docs/SETUP.md (256 lines)

Comprehensive end-to-end setup guide with all 7 required sections:

1. **Prerequisites** — Node versions, PingOne trial, repo clone
2. **PingOne Application Configuration** — All 3 OAuth clients (admin OIDC, user OIDC, worker/management) with exact scope lists, callback URIs, grant types
3. **Environment Variables** — Complete table with required/optional status and where to get each value
4. **Running Locally** — Service-by-service commands (BFF, React UI, MCP server) and `./run-bank.sh` single-command runner
5. **Verifying the Setup** — Flow-by-flow checklist for all 3 auth flows
6. **Vercel Deployment** — Pointer to docs/VERCEL_SETUP.md
7. **Troubleshooting** — Covers `invalid_client`, `invalid_scope`, session loss, token exchange auth method mismatch, and dashboard account issues

### Task 2: Updated README.md

`## Quick Start` and `## Configuration` sections replaced with pointers to docs/SETUP.md (confirmed at lines 22, 26).

## Verification
- `docs/SETUP.md` exists, 256 lines, all 7 `## N.` sections present ✅
- `README.md` references `docs/SETUP.md` twice ✅
- Troubleshooting covers ≥5 failure modes ✅
- Env vars table has required/optional annotations ✅

## Artifacts
- `docs/SETUP.md` (created)
- `README.md` (Quick Start + Configuration sections updated)
