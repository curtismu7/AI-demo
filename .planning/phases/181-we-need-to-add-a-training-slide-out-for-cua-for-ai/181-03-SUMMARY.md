---
phase: 181-we-need-to-add-a-training-slide-out-for-cua-for-ai
plan: 03
status: complete
---

# 181-03 SUMMARY

**Plan:** Cross-links with HITL/MCP panels + copy polish  
**Requirements:** CUA-03  
**Status:** COMPLETE

## What Was Done

1. Added outbound links from `ComputerUseAgentPanel.js` to Agent Gateway, Human-in-the-Loop, and MCP Protocol.
2. Added reciprocal `See also: Computer Use Agent (CUA)` links in:
   - `AgentGatewayPanel.js`
   - `HumanInLoopPanel.js`
   - `McpProtocolPanel.js`
3. Kept the CUA copy explicit that this banking demo uses MCP/tool-use rather than direct browser-driving CUA.

## Verification

- `rg` confirms `ComputerUseAgentPanel.js` links to Agent Gateway, Human-in-the-Loop, and MCP Protocol.
- `rg` confirms Agent Gateway, Human-in-the-Loop, and MCP Protocol each open `EDU.CUA`.
- `cd banking_api_ui && npm run build` completed successfully.

## Files Changed

- `banking_api_ui/src/components/education/ComputerUseAgentPanel.js`
- `banking_api_ui/src/components/education/AgentGatewayPanel.js`
- `banking_api_ui/src/components/education/HumanInLoopPanel.js`
- `banking_api_ui/src/components/education/McpProtocolPanel.js`

## Outcome

The CUA panel is now integrated into the broader education system instead of being an isolated drawer.