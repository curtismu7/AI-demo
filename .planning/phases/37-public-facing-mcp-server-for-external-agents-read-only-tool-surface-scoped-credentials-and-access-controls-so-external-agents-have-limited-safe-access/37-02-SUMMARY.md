---
plan: 37-02
phase: 37-public-facing-mcp-server-read-only-access-tiers
status: complete
completed: 2026-04-04
commit: 4481014
---

## What Was Built

Updated `McpProtocolPanel.js` to surface the read-only tool tiers from Plan 37-01 in the in-app education drawer: catalog table now has a "Read-only?" column across all 9 tools (including newly added `sequential_think` and `get_sensitive_account_details`), and a new "Server discovery" tab explains the `/.well-known/mcp-server` endpoint with example JSON showing `publicAccess.readOnlyTools[]` and `restrictedAccess.authenticatedTools[]`. Also added `mcp-discovery` command to `educationCommands.js` and a "Server Discovery" subsection to the MCP server README.

## Key Files

### Created
_(none)_

### Modified
- `banking_api_ui/src/components/education/McpProtocolPanel.js` — TOOLS array expanded to 9 tools with `readOnly` flags; catalog table has "Read-only?" column with ✓/— cells + footnote; new `discovery` tab with endpoint URL, example JSON, and MCP spec link
- `banking_api_ui/src/components/education/educationCommands.js` — added `mcp-discovery` command routing to `McpProtocolPanel` `discovery` tab
- `banking_mcp_server/README.md` — "Server Discovery" subsection with `curl` example and `readOnlyTools`/`authenticatedTools` JSON

## Verification

- `cd banking_api_ui && npm run build` → exit 0, compiled successfully
- `McpProtocolPanel.js` contains `readOnly`, `discovery`, `readOnlyTools`
- `educationCommands.js` contains `mcp-discovery`
- `README.md` contains `/.well-known/mcp-server`

## Self-Check: PASSED
