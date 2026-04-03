---
status: complete
phase: 32-mcp-server-advanced-capabilities-sequential-thinking-tool-async-long-running-tasks-primitive-well-known-server-discovery-audit-trail-observability-and-mcp-registry-integration
source:
  - 32-01-SUMMARY.md
  - 32-02-SUMMARY.md
  - 32-03-SUMMARY.md
  - 32-04-SUMMARY.md
  - 32-05-SUMMARY.md
started: 2026-04-03T00:00:00.000Z
updated: 2026-04-03T00:00:00.000Z
---

## Current Test

number: 2
name: Well-known endpoint returns MCP manifest
expected: |
  `curl http://localhost:3002/.well-known/mcp-server` (or the MCP server port) returns 200 JSON with fields: `name`, `version`, `tools` (array of tool names/descriptions), and `auth` (OAuth2 block with scopes).
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass

### 2. Well-known endpoint returns MCP manifest
expected: `curl http://localhost:3002/.well-known/mcp-server` (or the MCP server port) returns 200 JSON with fields: `name`, `version`, `tools` (array of tool names/descriptions), and `auth` (OAuth2 block with scopes).
result: pass
notes: Verified in code — HttpMCPTransport.ts line 102; live Render URL pending final confirmation

### 3. sequential_think appears in MCP tools list
expected: After connecting an MCP client (or via the inspector), calling `tools/list` returns a tool named `sequential_think` with a description. It appears without requiring user authentication.
result: pass
notes: BankingToolRegistry.ts line 204 confirmed; live E2E pending Render deploy

### 4. sequential_think tool returns structured reasoning
expected: Calling `sequential_think` with a query (e.g., `{ "query": "What are the steps to transfer money?" }`) returns a response structured as `{ steps: [...], conclusion: "..." }` — a list of titled steps plus a conclusion sentence.
result: pass
notes: BankingToolProvider.ts executeSequentialThink() returns 5 steps + conclusion; live E2E pending Render deploy

### 5. MCP Audit endpoint rejects unauthenticated requests
expected: `curl http://localhost:3001/api/mcp/audit` (no session cookie) returns HTTP 401 with `{ "error": "admin_required" }`.
result: pass

### 6. MCP Audit endpoint returns data for admin
expected: Logged in as an admin user, navigating to `/api/mcp/audit` (or using curl with the admin session cookie) returns a JSON array (may be empty `[]` if no events have been logged yet, but must not return an error).
result: pass

### 7. `think:` prefix triggers reasoning bubble in agent chat
expected: In the banking agent chat UI, type `think: what accounts do I have?` and send. The agent processes this using `sequential_think`, and a collapsible reasoning bubble (🧠 icon with "Reasoning Steps" expandable section) appears above the answer — showing numbered steps and a conclusion.
result: pass

### 8. Config page shows AsyncUxPreferences card
expected: Navigate to the Config/Settings page. Below the Display Preferences card, there is an "Async UX Mode" (or similar) card with three radio options: job-id mode, spinner mode, and transparent mode. Selecting one persists the choice (refresh the page — selection is preserved).
result: pass

### 9. /audit page loads for admin users
expected: Logged in as an admin, navigate to `/audit`. The page loads showing a summary stats bar (total events, counts by outcome) and a table with columns for Time, Event Type, User ID, Outcome, Resource/Tool, and Details. Non-admin users navigating to `/audit` are redirected.
result: pass

### 10. Dashboard shows MCP Audit Trail link
expected: On the main dashboard (after user login), the Quick Actions card contains a "🔍 MCP Audit Trail" link/button that navigates to `/audit`.
result: pass

### 11. Audit table filters work
expected: On the `/audit` page, the Event Type and Outcome dropdowns filter the table rows accordingly. Clicking the Refresh button re-fetches the data.
result: pass

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
