---
created: 2026-04-21T22:07:58.410Z
title: MCP Traffic history items expand on click to show call summary
area: ui
files:
  - banking_api_ui/src/components/McpTrafficPage.js
---

## Problem

The MCP Traffic tab History list shows rows with "agent", step count, and timestamp (e.g. "agent ~ 5 steps  5:07:13 PM") but clicking a row does nothing. Users expect clicking a history entry to expand it inline and show a summary of what MCP calls were made during that session — tool name, direction, status, and key payload fields.

## Solution

Add click-to-expand accordion behaviour to each history row in McpTrafficPage.js. When expanded, show a compact summary of MCP calls for that session: tool name, request/response direction arrow, status (success/error), and abbreviated payload. Pattern already exists for "Current call" detail panel — reuse the same expand/collapse logic for history rows.
