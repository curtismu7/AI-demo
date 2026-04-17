---
created: 2026-04-17T10:27:01.267Z
title: Show LLM model name in agent spinner and server log
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_mcp_server/src/tools/BankingToolProvider.ts
---

## Problem

When the agent is processing a request, the spinner does not indicate which LLM model is being used. The server log also lacks this information. This makes it hard to know at a glance whether the agent is using GPT-4, Claude, or another model — important for demos and debugging.

## Solution

1. **Spinner:** Surface the active LLM model name in the agent's loading/thinking spinner UI (e.g., "Thinking with Claude 3.5 Sonnet…" instead of just "Thinking…"). The model name likely comes from the MCP server or BFF config.
2. **Server log:** Log the model name when a tool call or agent request is initiated in the MCP server or BFF pipeline so it appears in terminal output.
