---
created: "2026-04-02T10:22:11.811Z"
title: "Phase 20 Postman: keep both collections, fix sub-steps utilities for both audiences"
area: docs
files:
  - docs/BX Finance — 1-Exchange Delegated Chain (sub-steps).postman_collection.json
  - docs/BX Finance — 1-Exchange Delegated Chain — pi.flow.postman_collection.json
  - docs/BX Finance — 2-Exchange Delegated Chain — pi.flow.postman_collection.json
  - docs/BX Finance — 2-Exchange Delegated Chain.postman_environment.json
---

## Problem

Phase 20 gray area 1 decision is now locked. Two 1-exchange collections currently exist:
- `1-Exchange Delegated Chain (sub-steps)` — step-by-step audience (learners, workshops), broken utilities
- `1-Exchange Delegated Chain — pi.flow` — full-flow audience (demo runners, customers), working utilities

Gray area 1 answer: **Option C — keep both, fix the sub-steps collection.**

Both serve distinct audiences:
- **sub-steps**: educators walking learners through each RFC 8693 step individually
- **pi.flow**: demo presenters or customers running full end-to-end flows

## Solution

For Phase 20 execution:

**Fix `1-Exchange Delegated Chain (sub-steps)` utilities:**
1. **Utility — Decode Token**: Currently hardcodes `{{subject_token}}` — should use `{{mcp_token}}` or a generic `{{token_to_decode}}` variable so users can paste any token after any step
2. **Utility — Set mayAct on User**: Uses `{{PINGONE_CORE_CLIENT_ID}}` as `mayAct.sub` but env var is `client_id` — align variable name; also needs a pre-request guard that checks `{{pingone_api_token}}` is set first (mirrors the working 2-exchange Utility B pattern)
3. Add pre-request guards to both utilities (see 2-exchange collection's Utility A/B as the gold standard)
4. Align env var names across sub-steps collection to match the `BX Finance — 2-Exchange Delegated Chain.postman_environment.json` naming convention

**2-exchange collection** already has solid utilities (Utility A introspect + Utility B set-mayAct) — validate they work against the current env, no structural changes needed.

**Keep unchanged:**
- `1-Exchange Delegated Chain — pi.flow` — already uses correct pattern, working utilities
- `2-Exchange Delegated Chain — pi.flow` — already solid

**Remaining gray areas for Phase 20 context (unanswered):**
- Gray area 2: What other specific breakage exists in sub-steps (beyond variable naming)?
- Gray area 3: Doc format? README guide vs in-collection descriptions vs both?
