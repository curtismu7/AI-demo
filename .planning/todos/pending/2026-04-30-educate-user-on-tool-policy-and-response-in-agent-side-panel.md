---
created: 2026-04-30T09:47:47.568Z
title: Educate user on tool policy and response in agent side panel
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_server/routes/mcp.js
  - banking_mcp_gateway/src/server/GatewayServer.ts
---

## Problem

When the agent calls an MCP tool (e.g. `get_my_accounts`) and the gateway returns "Error: Gateway policy denied the tool call", the user sees only a red error box with no explanation:
- Which tool was invoked
- Which policy rule blocked it (and why)
- What the raw gateway/MCP response was

This is an educational demo — users must understand *why* a tool call succeeded or failed, not just *that* it failed. Currently the side panel / result card is completely opaque on policy decisions.

## Solution

Extend the per-command result card in the agent side panel (the expandable row shown for each tool call step) to display an educational breakdown:

1. **Tool name + description** — what the tool does (pull from MCP tool registry / tools list)
2. **Policy decision** — gateway policy that was evaluated, the verdict (allowed/denied), and the reason string returned by the gateway (e.g. `SCOPE_NOT_PRESENT`, `STEP_UP_REQUIRED`)
3. **Raw response** — the full JSON returned from the gateway/MCP server so developers can inspect what happened
4. **Educational callout** — a short plain-English explanation of what the policy means and how to fix it (e.g. "The gateway requires the `banking:accounts:read` scope. The current token does not include it — re-authenticate with the full scope list.")

Implementation hints:
- The gateway already returns a structured error body; surface it rather than discarding it
- The BFF `/api/mcp/tool` response should propagate `policy_decision`, `policy_reason`, and `raw_response` fields alongside the existing `error` string
- The agent result card component in `BankingAgent.js` renders each step — add an expandable "Why did this happen?" detail section
- Keep the happy-path (allowed) card lightweight; only show the policy breakdown when `error` or `mfa_required` is present

**Be careful:** do not restructure the card DOM in a way that breaks existing step rendering or HITL consent flow.
