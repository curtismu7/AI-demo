---
phase: 11
plan: 1
subsystem: banking_api_ui/education
tags: [education, rfc8693, token-exchange, act-claims, audit]
dependency_graph:
  requires: []
  provides: [accurate-education-panels]
  affects: [TokenExchangePanel.js]
tech_stack:
  added: []
  patterns: [RFC 8693 §4.1 canonical sub claim]
key_files:
  created: []
  modified:
    - banking_api_ui/src/components/education/TokenExchangePanel.js
decisions:
  - Keep `may_act`/`act` showing `sub` (RFC 8693 §4.1 canonical) rather than `client_id` (PingOne-specific); `client_id` form is documented separately in RFC8693Panel.js canonical-vs-alternative section
metrics:
  duration: ~15 min
  completed: "2026-04-07"
  tasks_completed: 5
  files_modified: 1
---

# Phase 11 Plan 1: Education Content Review and Accuracy Audit Summary

**One-liner:** Audited all four key education panels; fixed RFC 8693 §4.1 `act`/`may_act` claim key from `client_id` to canonical `sub` in TokenExchangePanel.

## What Was Done

Full audit of five education panels:

| Panel | File | Finding |
|-------|------|---------|
| AgentGatewayPanel | AgentGatewayPanel.js + enhancedRFC9728Content.js | ✅ No issues — RFC 9728 fields accurate, endpoint path correct, live fetch target correct |
| Oidc21Panel | Oidc21Panel.js | ✅ No issues — PKCE description accurate, nonce mentioned, RFC links correct (7636, 8707, 9700) |
| McpProtocolPanel | McpProtocolPanel.js + educationContent.js | ✅ No issues — spec URL already 2025-11-25, no stale version strings, no JSON-RPC error codes in content |
| TokenExchangePanel | TokenExchangePanel.js | ❌ Fixed — see below |
| RFC8693Panel | RFC8693Panel.js | ✅ No issues — act.sub documented as canonical form, multi-hop delegation correct |

## Fix Applied

**File:** `banking_api_ui/src/components/education/TokenExchangePanel.js`

**Issue:** Three locations showed `{ client_id: "bff" }` for `may_act`/`act` claims, and two description strings said "this client_id is/IS acting..." — all inconsistent with RFC 8693 §4.1 which specifies `sub` as the canonical actor identifier.

**Changes:**
1. User Token card — `may_act` value: `{ client_id: "bff" }` → `{ "sub": "bff-client-id" }`
2. MCP Token card — `act` value: `{ client_id: "bff" }` → `{ "sub": "bff-client-id" }`
3. AFTER tab bullet — `act` = `{ "client_id": "bff-client-id" }` → `{ "sub": "bff-client-id" }`
4. may_act table row description: "this client_id is allowed to exchange" → "this service (sub) is allowed to exchange"
5. act table row description: "this client_id IS acting right now on behalf of sub" → "this service (sub) IS acting right now on behalf of the user"

## Notes on Verdict

- **RFC9728Content.js** (standalone file at `banking_api_ui/src/components/education/RFC9728Content.js`) contains stale content (claims `resource_documentation` is unimplemented when BFF does implement it); however this file has **no active imports** and is never rendered — no fix needed.
- **TokenChainEducationPanel.js** also uses `client_id` in act claim examples (lines 31, 88, 166, 198, 234, 235) but those files were not in scope for this plan. Deferred.
- The `act.client_id` format IS what PingOne emits in practice; the RFC8693Panel.js canonical-vs-alternative table documents both forms. The TokenExchangePanel fix now aligns with the RFC §4.1 canonical form consistently.

## Deviations from Plan

None — plan executed as described. Tasks 1-3 and 5 were audited and found accurate. Task 4 had one file with five related line fixes.

## Verification

- `npm run build` in `banking_api_ui/` exits **0** ✅
- No new console errors introduced
- Commit: `943c32d`

## Self-Check: PASSED

- File modified: `banking_api_ui/src/components/education/TokenExchangePanel.js` ✅
- Commit `943c32d` exists ✅
- Build exit 0 ✅
