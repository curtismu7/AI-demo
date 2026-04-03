---
phase: 48
plan: 1
subsystem: docs
tags: [docs, pingone, token-exchange, spel, act-chain]
dependency_graph:
  requires: []
  provides: [correct-step-1e-guidance]
  affects: [docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
decisions:
  - "Removed invalid SpEL expression — PingOne native act nesting is correct approach"
  - "No BFF or PingOne console changes needed — doc-only fix"
metrics:
  duration: 1m
  completed: 2026-04-03
  tasks: 4
  files: 1
---

# Phase 48 Plan 1: Remove Invalid SpEL act Expression Summary

**One-liner:** Removed invalid PingOne SpEL `act` expression from Step 1e and replaced with RFC 8693 §4.4 native-nesting explanation + BFF/PAZ enforcement note.

## What Was Done

Edited `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` Step 1e — **Super Banking Banking API** resource server:

**Removed:**
- Attribute Mapping table with invalid expression: `#root.context.requestData.subjectToken?.act?.sub != null ? #root.context.requestData.subjectToken?.act : null`
- "Expression explained" blockquote
- "PingOne SpEL limitation" blockquote (old version referencing the expression as if it were valid)
- "How to test" block for the invalid expression

**Added:**
- "No custom mapping needed. Leave this tab unchanged."
- RFC 8693 §4.4 explanation: PingOne natively sets `act.sub = client_id of exchanger` and promotes `act.act` from the subject token during Exchange #2
- SpEL limitation note (for reference — explains why a custom expression would fail: `?.` safe navigation through Map entries returns null; no inline Map construction)
- BFF/PAZ enforcement note: `_performTwoExchangeDelegation()` verifies `act.sub` + `act.act.sub`; PAZ enforces both as named policy attributes

## Commits

| Task | Hash | Description |
|------|------|-------------|
| 2 | `d4c0a7a` | docs(48): remove invalid SpEL act expression from Step 1e Super Banking Banking API |
| 4 | `fc86d8d` | docs(48): mark fix-invalid-spel-act-expression todo as done |

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
PASS: invalid expression (subjectToken?.act?.sub != null) removed
PASS: "No custom mapping needed" present at line 426
PASS: "RFC 8693 §4.4 behavior" present
PASS: "Where the chain is enforced" present
PASS: Scopes tab immediately follows at line 434
PASS: todo moved to .planning/todos/done/
```

## Self-Check: PASSED

- [x] `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` modified — confirmed
- [x] Commits `d4c0a7a` and `fc86d8d` exist — confirmed
- [x] Todo in done directory — confirmed
- [x] No other files modified — `git show --stat d4c0a7a` shows only the doc file
