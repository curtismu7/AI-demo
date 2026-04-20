---
phase: 199
plan: 01
status: complete
completed: 2026-04-20
---

# Plan 199-01 Summary

## Objective
Proactively expose the agent client-credentials (CC) token in the Token Chain panel before any MCP tool call fires, so users see the full delegation chain immediately on load.

## What Was Built

### Task 1: BFF endpoint `/api/tokens/agent-cc-preview` (already present in tokens.js)
- `GET /api/tokens/agent-cc-preview` in `banking_api_server/routes/tokens.js`
- Returns only decoded claims (never raw JWT) via `agentMcpTokenService.decodeJwtClaims()`
- Three response states: not-configured (skipped), success (active), fetch-failed (failed)
- Uses `oauthService.getMcpExchangerToken()` server-side — token never reaches browser

### Task 2: Prefetch on mount in `TokenChainDisplay.js`
- Added `agentCcEvents` state (`useState(null)`)
- Silent `useEffect` on `[]` deps fetches `/api/tokens/agent-cc-preview` on component mount
- Cleanup-safe with `cancelled` flag
- Added `currentEventsWithCc` memoized merge — prepends agent CC event when not already in chain
- Deduplication check: skips prepend if any event with id `agent-actor-token*` or `agent-cc-not-configured` already exists (prevents double-display after MCP tool calls fire)
- Updated `handleCopyAll`, `ExchangeModeBanner`, and `EventRow` render to use `currentEventsWithCc`

## Key Files Modified
- `banking_api_ui/src/components/TokenChainDisplay.js` — prefetch + merge logic
- `banking_api_server/routes/tokens.js` — endpoint (already implemented in phase 198)

## Self-Check: PASSED
- ✅ Token chain shows agent CC token before any MCP call fires
- ✅ No raw JWT returned to client — decoded.header + decoded.payload only
- ✅ Not-configured placeholder shown when AGENT_OAUTH_CLIENT_ID is unset
- ✅ `npm run build` exits 0
- ✅ `/api/tokens/agent-cc-preview` endpoint exists and uses `getMcpExchangerToken`
- ✅ Fetch pattern uses `credentials: 'include'`, catches errors silently
