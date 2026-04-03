---
phase: 34-agent-action-logging-log-what-agent-what-action-rights-used-and-each-step
plan: 34-02
status: complete
completed: 2026-04-03
commit: 0326217
---

## Summary

Updated the BFF audit proxy (`mcpAudit.js`) to pass `agentId` and `operation` query params through to the MCP server. Updated `AuditPage.js` to show agent-specific fields: Agent ID column, Tool/Operation column, Duration column, and enriched expandable detail showing `scope`, `tokenType`, `requestSummary`, `responseSummary`. Added `filterAgentId` and `filterOperation` text inputs to the filter bar.

## Key Files

### Modified
- `banking_api_server/routes/mcpAudit.js` — added `agentId` + `operation` param passthrough
- `banking_api_ui/src/components/AuditPage.js` — 8-column table, agent ID/operation filters, enriched detail row
- `banking_api_ui/src/components/AuditPage.css` — added `.audit-cell--duration` rule

## Decisions Made

- Kept "Event Type" column in header (8 columns total, colSpan=8) — removing it would lose useful display info while the filter dropdown still exists for filtering
- Reused `audit-filter-select` CSS class for the new text input filters (consistent styling)
- Agent ID truncated to 16 chars with `…` ellipsis to avoid wide column
- New detail row bundles scope/tokenType/requestSummary/responseSummary before existing `details` object

## Verification

- `grep "agentId" banking_api_server/routes/mcpAudit.js` → 2 lines (agentId + operation)
- `grep "filterAgentId" AuditPage.js | wc -l` → 4 occurrences
- `colSpan={8}` in both loading and empty rows
- 8 `<th>` columns: Time, Event Type, Agent ID, User ID, Tool/Operation, Outcome, Duration, Details
- `cd banking_api_ui && npm run build` → **exit 0** (Compiled successfully)
