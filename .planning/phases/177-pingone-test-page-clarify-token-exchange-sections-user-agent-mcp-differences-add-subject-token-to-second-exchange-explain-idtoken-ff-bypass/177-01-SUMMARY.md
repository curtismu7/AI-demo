---
plan: 177-01
status: complete
---

## Summary

Clarified Exchange 2 vs Exchange 3 on PingOne Test page. Added subjectTokenDecoded to Exchange 3 backend response, showed subject token panel in Exchange 3 card. Updated WhatIsHappening with per-exchange explanations. Replaced FF-gated ID Token card with always-visible card + warning when FF off.

## Key Files
- banking_api_server/routes/pingoneTestRoutes.js — Added subjectTokenDecoded to Exchange 3 response
- banking_api_ui/src/components/PingOneTestPage.jsx — Exchange 3 subject panel, WhatIsHappening rewrite, ungated ID Token card

## Commit
7ba67b4
