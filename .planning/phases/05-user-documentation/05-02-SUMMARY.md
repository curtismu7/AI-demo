---
phase: 05-user-documentation
plan: 02
status: complete
---

# 05-02 SUMMARY

**Plan:** Audit 3 draw.io sequence diagrams for stale naming  
**Requirements:** DOC-02  
**Status:** COMPLETE

## What Was Done

### Task 1: Audited AuthCode-PKCE and CIBA diagrams
- `Super-Banking-AuthCode-PKCE-Flow.drawio` — No stale patterns found, already clean
- `Super-Banking-CIBA-Flow.drawio` — `banking:write` in stale short-form (scope=banking:write) already in canonical form; no env var stale refs

### Task 2: Fixed TokenExchange diagram (3 patterns corrected)
- `PINGONE_AI_CORE_CLIENT_ID` → `PINGONE_ADMIN_CLIENT_ID` (1 occurrence in note cell)
- `AGENT_OAUTH_CLIENT_ID` → `PINGONE_AI_AGENT_CLIENT_ID` (3 occurrences: step labels + act claim note)
- `banking:accounts:read/write` → `banking:general:read/write` (2 occurrences in token state note cells)

All files remain valid draw.io XML (mxGraphModel present in all 3).

## Verification
- `grep "AI_CORE" docs/Super-Banking-TokenExchange-Flow.drawio` → 0 matches ✅
- `grep "AGENT_OAUTH" docs/Super-Banking-TokenExchange-Flow.drawio` → 0 matches ✅
- `grep "banking:accounts:" docs/Super-Banking-TokenExchange-Flow.drawio` → 0 matches ✅
- `grep -c "mxGraphModel"` → 2 per file (open/close XML elements) ✅

## Commits
- `1f50745` — docs(05-02): fix stale naming in draw.io diagrams

## Artifacts
- `docs/Super-Banking-AuthCode-PKCE-Flow.drawio` (verified, no changes)
- `docs/Super-Banking-CIBA-Flow.drawio` (verified, no changes)
- `docs/Super-Banking-TokenExchange-Flow.drawio` (modified — 3 patterns fixed)
