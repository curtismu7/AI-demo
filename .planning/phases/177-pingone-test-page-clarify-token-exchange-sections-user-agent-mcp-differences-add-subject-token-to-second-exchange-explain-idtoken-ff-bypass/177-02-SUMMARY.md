---
plan: 177-02
status: complete
---

## Summary

Removed 80-char truncation from TokenLineageDiff (both JS slicing and CSS max-width/ellipsis). Full URLs, act objects, may_act objects now display completely. Added expectedChanges prop to categorize expected vs unexpected claim changes with visual distinction (green checkmark + reduced opacity for expected, bold for unexpected).

## Key Files
- banking_api_ui/src/components/PingOneTestPage.jsx — Rewrote TokenLineageDiff with expectedChanges support
- banking_api_ui/src/components/PingOneTestPage.css — Full-value display + expected/unexpected styles

## Commit
d9ff0be
