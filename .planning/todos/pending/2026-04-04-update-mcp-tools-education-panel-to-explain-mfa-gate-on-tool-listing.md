---
created: 2026-04-04T00:00:00.000Z
title: Update MCP tools education panel to explain MFA gate on tool listing
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/components/education/
---

## Problem

Phase 52 adds an MFA gate to `GET /api/mcp/inspector/tools` — users who haven't completed MFA cannot load the tool list. But there is no in-app explanation of why tool loading requires MFA or what the user should do.

The existing MCP protocol education text in BankingAgent.js only covers the JSON-RPC handshake, not the step-up gate.

## Solution

Update the education content shown in the MCP tools area to explain:
- Why listing tools requires MFA verification (defense-in-depth: even discovery is protected)
- What happens when mfa_required is returned (step-up appears, user verifies, then retries)
- Reference to the Security Settings where admin can toggle stepUpMethod

Either update the `'mcp-protocol'` education string in BankingAgent.js, or add a new EDU panel
for the MCP step-up gate if the education panel system supports it.
Also add a note in the "🔐 MFA verification required" toast message pointing users to the
verification badge below.
