---
phase: 181-we-need-to-add-a-training-slide-out-for-cua-for-ai
plan: 01
status: complete
---

# 181-01 SUMMARY

**Plan:** CUA education drawer component + EDU registration  
**Requirements:** CUA-01  
**Status:** COMPLETE

## What Was Done

1. Added a new `ComputerUseAgentPanel` education drawer component in `banking_api_ui/src/components/education/ComputerUseAgentPanel.js`.
2. Implemented the 5 required tabs:
   - What is CUA?
   - How it works
   - CUA vs MCP/tool-use
   - Security & trust
   - In this demo
3. Included a static inline loop visual for screenshot -> analysis -> action -> repeat.
4. Added the canonical education id `EDU.CUA = 'cua'` in `educationIds.js`.
5. Registered the new panel in `EducationPanelsHost.js` so it opens through the shared education host.

## Verification
- `cd banking_api_ui && npm run build` completed successfully.
- Build emitted unrelated pre-existing warnings in `BankingAgent.js` and `LlmConfigPanel.jsx`; no build failure or new warnings tied to the CUA panel files.

## Files Changed
- `banking_api_ui/src/components/education/ComputerUseAgentPanel.js`
- `banking_api_ui/src/components/education/educationIds.js`
- `banking_api_ui/src/components/education/EducationPanelsHost.js`

## Outcome

The repo now has a mounted CUA education drawer available through the canonical `cua` education id, ready for discoverability wiring and cross-panel linking in Wave 2.