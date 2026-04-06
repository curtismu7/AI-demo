---
created: 2026-04-01T12:15:00Z
title: Include PINGONE_MAY_ACT docs in Phase 5 user documentation
area: docs
files:
  - docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
  - .planning/phases/05-user-documentation/05-CONTEXT.md
---

## Problem

Phase 5 (`user-documentation`) is being planned with `docs/SETUP.md` and `docs/ARCHITECTURE_WALKTHROUGH.md` as its two outputs. Two existing deep-dive docs on the may_act / act token exchange patterns should be linked from or incorporated into the user documentation:

- `docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md` — 1-exchange delegated chain (user token → MCP token)
- `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` — 2-exchange delegated chain (user token + agent token → MCP token with act claim)

These are currently standalone files that a developer would only find by browsing `docs/`. They should be surfaced in the architecture walkthrough so they're discoverable from the main documentation path.

## Solution

When writing `docs/ARCHITECTURE_WALKTHROUGH.md` (DOC-02), explicitly link to both files from the Token Exchange section:

- In the "1-exchange path" explanation, link to `PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md`
- In the "2-exchange path" explanation, link to `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md`

Also consider whether a brief summary of each chain belongs inline, with a "deep dive →" pointer.

Do NOT move or rename these files — links from other docs (Postman collections, drawio diagrams) and the Phase 5 canonical refs list reference them by current path.
