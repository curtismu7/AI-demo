---
phase: 05-user-documentation
plan: 03
status: complete
---

# 05-03 SUMMARY

**Plan:** Audit and fix docs/ARCHITECTURE_WALKTHROUGH.md  
**Requirements:** DOC-02  
**Status:** COMPLETE

## What Was Done

### Task 1: Fixed ARCHITECTURE_WALKTHROUGH.md (5 targeted fixes)

1. **OAuth clients table** — Updated from 3-row to 5-row table with canonical env var names:
   - `PINGONE_AI_CORE_CLIENT_ID` → `PINGONE_ADMIN_CLIENT_ID`
   - `PINGONE_AI_CORE_USER_CLIENT_ID` → `PINGONE_USER_CLIENT_ID`
   - `AGENT_OAUTH_CLIENT_ID` → `PINGONE_AI_AGENT_CLIENT_ID`
   - Added Worker app row: `PINGONE_WORKER_TOKEN_CLIENT_ID`
   - Added MCP Token Exchanger row: `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`
   - Header updated from "three" to "up to five PingOne apps"

2. **Diagram filename references** — Fixed all 3 diagram links:
   - `BX-Finance-AuthCode-PKCE-Flow.drawio` → `Super-Banking-AuthCode-PKCE-Flow.drawio`
   - `BX-Finance-CIBA-Flow.drawio` → `Super-Banking-CIBA-Flow.drawio`
   - `BX-Finance-TokenExchange-Flow.drawio` → `Super-Banking-TokenExchange-Flow.drawio`

3. **Scope names** — Updated token state tables:
   - `banking:read banking:write` → `banking:general:read banking:general:write banking:ai:agent`
   - `banking:accounts:read` → `banking:general:read banking:general:write banking:ai:agent`

4. **Exchange client identity** — Updated 2-exchange step labels and token state:
   - `AGENT_OAUTH_CLIENT_ID` → `PINGONE_AI_AGENT_CLIENT_ID` (×3: CC grant step, act claim in token struct, table row)

5. **MCP Token Exchanger attribution** — Added note to 1-exchange path stating `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` authenticates the exchange request to PingOne

## Verification
- `grep "PINGONE_AI_CORE" docs/ARCHITECTURE_WALKTHROUGH.md` → 0 matches ✅
- `grep "BX-Finance-" docs/ARCHITECTURE_WALKTHROUGH.md` → 0 matches ✅
- `grep "AGENT_OAUTH" docs/ARCHITECTURE_WALKTHROUGH.md` → 0 matches ✅
- `grep -c "Super-Banking-" docs/ARCHITECTURE_WALKTHROUGH.md` → 3 ✅
- `grep -c "PINGONE_ADMIN_CLIENT_ID" docs/ARCHITECTURE_WALKTHROUGH.md` → 1 ✅
- `grep "MCP Token Exchanger" docs/ARCHITECTURE_WALKTHROUGH.md` → 2 matches ✅

## Commits
- `6e9da9b` — docs(05-03): fix naming and diagram refs in ARCHITECTURE_WALKTHROUGH.md

## Artifacts
- `docs/ARCHITECTURE_WALKTHROUGH.md` (modified — 5 targeted fixes, net +19/-16 lines)
