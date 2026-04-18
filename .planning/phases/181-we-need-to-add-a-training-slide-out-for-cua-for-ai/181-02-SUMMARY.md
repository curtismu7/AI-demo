---
phase: 181-we-need-to-add-a-training-slide-out-for-cua-for-ai
plan: 02
status: complete
---

# 181-02 SUMMARY

**Plan:** NL routing + RFC/sidebar/agent discoverability wiring  
**Requirements:** CUA-02  
**Status:** COMPLETE

## What Was Done

1. Added CUA routing to `banking_api_server/services/nlIntentParser.js` for `cua`, `computer use agent`, and `computer use`.
2. Updated `banking_api_server/services/geminiNlIntent.js` so the LLM router maps CUA requests to panel `cua`.
3. Added a CUA row to `banking_api_ui/src/components/education/RFCIndexPanel.js`.
4. Added a CUA learn-menu item to `banking_api_ui/src/components/AdminSideNav.jsx`.
5. Added a CUA entry to `banking_api_ui/src/components/education/educationCommands.js`.

## Verification

- `parseHeuristic('what is cua')` -> `{ kind: 'education', education: { panel: 'cua', tab: 'what' } }`
- `parseHeuristic('computer use agent')` -> `{ kind: 'education', education: { panel: 'cua', tab: 'what' } }`
- `parseHeuristic('computer use')` -> `{ kind: 'education', education: { panel: 'cua', tab: 'what' } }`
- `cd banking_api_ui && npm run build` completed successfully.

## Files Changed

- `banking_api_server/services/nlIntentParser.js`
- `banking_api_server/services/geminiNlIntent.js`
- `banking_api_ui/src/components/education/RFCIndexPanel.js`
- `banking_api_ui/src/components/AdminSideNav.jsx`
- `banking_api_ui/src/components/education/educationCommands.js`

## Outcome

The CUA panel is now reachable from both NL intent paths and the repo's main education discovery surfaces.