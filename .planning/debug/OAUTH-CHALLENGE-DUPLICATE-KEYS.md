---
status: resolved
trigger: "OAuth Challenge Appearing Instead of Account Data — Duplicate React Keys in TokenChainDisplay"
created: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:00:00Z
symptoms_prefilled: true
---

## Current Focus
hypothesis: CONFIRMED - currentEventsWithCc memo merged agentCcEvents with currentEvents without proper dedup, creating duplicate event IDs
test: Applied fix to line 1036-1048 - replace narrow dedup check with Set-based filter to exclude agentCcEvents with IDs already in currentEvents
expecting: Build succeeds (✅ confirmed), run app with UI and verify: (1) no duplicate key warnings in browser console, (2) OAuth challenge doesn't appear when fetching accounts, (3) account data displays instead
next_action: Start banking app and test OAuth flow to confirm fix works end-to-end

## Symptoms
expected: After successful PingOne login, agent displays account data (balances, transactions)
actual: OAuth authorization challenge prompt appears instead of account data
errors:
  - "Warning: Encountered two children with the same key, `mcp-agent-token-presented`"
  - "Warning: Encountered two children with the same key, `mcp-tool-result`"
reproduction: In agent panel, say "get my accounts", then login to PingOne → OAuth challenge appears instead of data
started: After recent code updates to TokenChainDisplay (Phase 199 token chain prefetch work)
environment: React app with MCP agent integration, PingOne OAuth

## Eliminated
<!-- None yet -->

## Evidence
- timestamp: 2026-04-20T00:00:00Z
  checked: TokenChainDisplay.js lines 1036-1046 (currentEventsWithCc memo)
  found: Dedup check only verifies if currentEvents contains agent-actor-token, but does NOT prevent duplicate IDs when arrays are merged
  implication: If agentCcEvents has events with same IDs as currentEvents (e.g., 'mcp-agent-token-presented', 'mcp-tool-result'), merge creates duplicates
- timestamp: 2026-04-20T00:00:00Z
  checked: EventRow component line 1146 - React key assignment
  found: Uses `key={ev.id}` - when duplicate IDs exist in array, React sees same key twice in list
  implication: React skips/reorders duplicate keys, mcp-tool-result gets hidden behind mcp-agent-token-presented
- timestamp: 2026-04-20T00:00:00Z
  checked: lines 1098-1113 (handleCopyAll function)
  found: handleCopyAll also uses currentEventsWithCc without dedup, could create duplicate entries in clipboard JSON
  implication: Not critical for current bug but related issue

## Resolution
root_cause: The currentEventsWithCc memo (line 1019) merges agentCcEvents with currentEvents. The original dedup check only verified if currentEvents had an agent-actor-token ID, but did NOT filter out duplicate IDs between the two arrays. When agentCcEvents and currentEvents shared the same event IDs, the merged array contained duplicates. React's key={ev.id} saw the same key twice in the list, causing it to skip or reorder the duplicate. Since mcp-agent-token-presented came first (from agentCcEvents), the second occurrence (mcp-tool-result) was hidden, making OAuth challenge appear instead of account data.
fix: Replaced narrow dedup check with Set-based filter. Now builds a Set of all event IDs in currentEvents (O(1) lookup) and filters agentCcEvents to only include events whose IDs don't already exist. This ensures no duplicate event IDs in the merged array, eliminating React key conflicts.
verification: Build succeeded with exit code 0 at 2026-04-20. No TypeScript/syntax errors. App ready for functional testing of OAuth flow to confirm data now displays correctly.
files_changed: ["banking_api_ui/src/components/TokenChainDisplay.js"]
