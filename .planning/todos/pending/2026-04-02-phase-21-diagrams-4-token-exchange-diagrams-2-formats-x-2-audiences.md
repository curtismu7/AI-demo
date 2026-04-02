---
created: "2026-04-02T10:22:11.811Z"
title: "Phase 21 diagrams: 4 token exchange diagrams (2 formats × 2 audiences)"
area: docs
files:
  - docs/BX_Finance_AI_Agent_Tokens.drawio
  - docs/BX-Finance-1-Exchange-Delegated-Chain.drawio
  - docs/BX-Finance-2-Exchange-Delegated-Chain.drawio
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
---

## Problem

Phase 21 gray area decisions 2 and 3 are now locked — diagram format and audience split defined.

**Gray area 2 (format):** Both formats — side-by-side token cards AND swimlane diagram
**Gray area 3 (audience):** Two audience-specific versions — Technical and Business-friendly

Total deliverable: **4 draw.io XML diagrams**:

| # | Format | Audience | Claim style |
|---|--------|----------|-------------|
| 1 | Side-by-side token cards | Technical | Real RFC 8693 claim names: `act`, `may_act`, `sub`, `aud`, `iss`, `scope`, `grant_type` |
| 2 | Side-by-side token cards | Business-friendly | Plain labels: "User's Login Token", "Agent Delegation Token", "Final Authorized Token" |
| 3 | Swimlane sequence | Technical | Real claim names, shows actor/subject/resource flows |
| 4 | Swimlane sequence | Business-friendly | Business labels, shows who does what at each step |

## Solution

All 4 diagrams as `.drawio` XML files in `docs/`. Naming convention:
- `docs/BX-Finance-Token-Exchange-Cards-Technical.drawio`
- `docs/BX-Finance-Token-Exchange-Cards-Business.drawio`
- `docs/BX-Finance-Token-Exchange-Swimlane-Technical.drawio`
- `docs/BX-Finance-Token-Exchange-Swimlane-Business.drawio`

**Token claim source of truth**: `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` — confirmed shapes:
- Initial token carries `may_act.sub` = client ID of the agent/actor allowed to exchange on behalf
- After 1-exchange: carries `act.sub` = who performed the exchange, `sub` = original user
- After 2-exchange: carries nested `act.act.sub`, `act.sub` = actors in the chain
- `grant_type = urn:ietf:params:oauth:grant-type:token-exchange` (RFC 8693)

**Business-friendly label mapping:**
- `sub` → "Authenticated User"
- `may_act.sub` → "Pre-authorized Agent"
- `act.sub` → "Acting Service/Agent"
- `aud` → "Target Resource Server" / "Intended For"
- `scope` → "What it can do"
- `iss` → "Issued by PingOne"

**Remaining gray area for Phase 21 (unanswered):**
- Gray area 1: Which flows to cover? 1-exchange chain only, 2-exchange chain only, or both?
  Likely answer = both chains (4 diagrams × 2 chains = 8 total) — await confirmation before planning.
