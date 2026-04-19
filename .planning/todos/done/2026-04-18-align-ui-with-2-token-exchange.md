---
created: 2026-04-18T13:45:01.851Z
title: Align UI with 2-token exchange
area: ui
files:
  - .planning/ROADMAP.md:1960
  - docs/TOKEN_TERMINOLOGY_GLOSSARY.md:1
  - banking_api_ui/src/components/TokenExchangeFlowDiagram.jsx:5
  - banking_api_ui/src/components/education/TokenChainEducationPanel.js:174
  - banking_api_ui/src/components/PingOneTestPage.jsx:999
  - banking_api_ui/src/components/PingOneTestPage.jsx:1221
  - banking_api_ui/src/components/education/RFC8707Content.js:287
---

## Problem

The repo now treats the new taxonomy and 2-exchange path as canonical, but several UI surfaces still describe older exchange names and step labels. Current examples include the Token Chain education panel still teaching an older delegated sequence, the PingOne Test page still referring to "Phase 184 Exchange 2" and "Exchange 3", and the flow diagram using "single" and "double" mode labels instead of RFC-aligned 1-exchange and 2-exchange terminology. This creates a mismatch between the roadmap/docs and what users learn in the product.

## Solution

Audit all user-facing token-exchange copy and visuals, then align them to the current taxonomy from Phase 188. Focus on educational panels, flow diagrams, test-page labels, token chain examples, and any CTA/help text that still references legacy exchange names. Preserve accurate distinctions among 1-exchange, 2-exchange, and the Phase 186 ID-token variant, and validate the React UI build after the copy/diagram updates.
