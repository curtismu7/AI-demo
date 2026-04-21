# Phase 207 — Plan Quality Review

**Reviewed:** 2026-04-20  
**Reviewer:** Claude Code (Sonnet 4.6)  
**Artifacts reviewed:** PHASE-207-REFERENCE.md, PHASE-207-ARCHITECTURE.md, ROADMAP.md §Phase 207  
**Spec version:** 3 (Policy Architecture + 401/403 Preservation + 3-Layer Model)  
**Clarifications received:** 2026-04-20 (see §6)

---

## 1. Summary

Phase 207 adds a fine-grained authorization layer between MCP token validation and tool execution. After a valid RFC 8693 delegated token passes, the MCP server calls the **home-built authorization server** (not PingOne Authorize — that integration is a future project), maps the policy decision to an enum (`DENIED | MFA_REQUIRED | HITL_REQUIRED | APPROVED`), and routes the decision back through the BFF to the agent UI, which enforces it by showing the appropriate modal or error — without touching the existing 401/403 token-validation paths.

**Decision routing flow (confirmed):** MCP evaluates policy → routes decision back to BFF via `mcpInstructions.js` → BFF sends decision to agent.

**18 requirements, 12 success criteria, 3-wave delivery.** The architecture is sound and the 3-layer response model is the right call. Most risks are in integration unknowns rather than spec gaps. The plan is close to execution-ready but has several gaps that could stall Wave 1 or introduce security regressions if not addressed before planning begins.

---

## 2. Strengths

- **3-layer model is clean and correct.** Keeping HTTP 401/403 at the token layer and HTTP 200+decision at the policy layer avoids conflating authentication failures with authorization decisions. This is the right RFC 8693 pattern.
- **Wave gating.** Requiring all 4 decision paths (DENIED / MFA_REQUIRED / HITL_REQUIRED / APPROVED) to pass before Wave 2 starts is good engineering discipline. It prevents building UI on top of an untested policy engine.
- **Test matrix (10 scenarios).** The matrix is specific and covers the boundary between the two layers (rows 1–5 vs. rows 6–10). This is the clearest part of the spec.
- **Edge cases are named.** MFA-TIMEOUT, MFA-REFRESH, MFA-CANCEL, AUTHZ-CLAIMS, CONSENT-COEXIST are all enumerated as requirements, not afterthoughts.
- **Session correlation schema is defined.** `{ taskId, mcpClientId, userId, startTime, mfaRequestId, mfaMethod }` is concrete enough to implement. Concurrent flow handling is often glossed over; naming it here is good.
- **No policy duplication.** POLICY-ARCH-01 is explicit: agent receives decisions, never evaluates policy. This is the right boundary.

---

## 3. Concerns

### HIGH severity

**H-1 — Phase 206 has no plans and is blocking** ✅ RESOLVED  
Phase 206 is a "vault" dependency — required but not yet defined. It is deferred and will not block Phase 207 planning. Treat Phase 207 as self-contained; do not wait on Phase 206 outputs.

**H-2 — PingOne Authorize is not configured in env** ✅ RESOLVED (architectural change)  
The authorization server is **home-built and already coded** — not PingOne Authorize. The commented-out `PINGONE_AUTHORIZE_*` env vars are for a *future* PingOne Authorize integration project and are not relevant to Phase 207. All spec references to "PingOne Authorize" should be read as "home-built authz server." No external service configuration is needed for Wave 1.  
**Action:** Update PHASE-207-REFERENCE.md to replace "PingOne Authorize" with "home-built authorization server" throughout. Remove references to `PINGONE_AUTHORIZE_POLICY_ID` etc. as Phase 207 prerequisites.

**H-3 — `agentMcpTokenService.js` path does not exist** ⚠️ STILL OPEN  
No answer was provided. Before Wave 1 planning: locate the actual file implementing RFC 8693 2-exchange delegation, confirm it is active under `FF_TWO_EXCHANGE_DELEGATION=true`, and update the reference doc with the correct path.

**H-4 — MFA-REFRESH: stored subject token security not specified** ✅ RESOLVED  
Running locally; SQLite is available and is the chosen store. Subject token for re-exchange will be stored in the SQLite session database (same DB used by `banking_api_server`).  
**Remaining action:** Spec the TTL (suggest: match the token's own `exp` claim) and confirm whether the token column is stored as plaintext or encrypted. Add this to the Wave 1 data model.

---

### MEDIUM severity

**M-1 — Authorize API failure mode is unspecified** ✅ RESOLVED  
On authz server error/timeout: surface a **distinct error** to the agent (not fail-open, not silent fail-closed).  
**Decision:** HTTP 200 `{ decision: 'DENIED', reason: 'policy_unavailable' }` with a logged server-side error. Add scenario 11 to the Wave 1 test matrix for this case. Timeout value TBD — suggest 5s.

**M-2 — CONSENT-COEXIST sequencing is underspecified** ✅ RESOLVED  
The policy detects MFA completion via the **`acr` claim on the new token**. After MFA succeeds the agent gets a new token with `acr: Multi_Factor`; on retry the home-built authz server sees this claim and shifts the decision from `MFA_REQUIRED` to `HITL_REQUIRED`.  
**Also confirmed:** HITL is not always MFA. HITL can be triggered by either (a) MFA required, or (b) user simply pressing OK on an approval modal (e.g., high-value transfer consent). These are two distinct HITL sub-types; the decision schema's `hitlReason` field should distinguish them.  
**Action:** Add `hitlType: 'mfa' | 'consent'` to the decision schema and document the `acr`-based branch in the authz policy spec.

**M-3 — `agentDecisionHandler.js` React integration is not specified** ⚠️ STILL OPEN  
Unknown. Before Wave 3 planning: investigate the existing FAB/chat component's state management pattern (Redux, context, local state) and document the integration point. This is a Wave 3 pre-condition, not a Wave 1 blocker.

**M-4 — tools/list policy filtering is ambiguous** ✅ RESOLVED  
The authz server **filters the tool list** — it returns only the tools the user is permitted to call. The agent never sees tools it cannot invoke. This eliminates the "user sees transfer but gets DENIED" UX problem.  
**Action:** Update AUTHZ-01 requirement to state: "MCP passes full tool list to authz server; authz server returns permitted subset. `tools/list` response contains only authorized tools."

**M-5 — HITL approval callback is not specified** ✅ RESOLVED  
HITL proof mechanism: **BFF session claim (option B)**. PingOne Authorize does not issue short-lived approval tokens. After user approves the HITL modal, the BFF records approval in the session (keyed by `taskId`). On retry, MCP reads the session claim and the authz server sees the approval flag, returning `APPROVED`.  
**Action:** Add `hitlApproved: boolean` to the session correlation schema `{ taskId, mcpClientId, userId, startTime, mfaRequestId, mfaMethod, hitlApproved }`. Spec the BFF endpoint that sets this flag when the user clicks OK.

**M-6 — Session correlation wave ordering** ✅ RESOLVED (via M-2 resolution)  
Session correlation must be working before MFA flows (Wave 2). Running locally (no multi-Lambda concern for now), so the urgency is lower than originally assessed. However, the `taskId` correlation schema is still needed in Wave 1 to support concurrent tool calls correctly. Keep Wave 1 gate: confirm session store links `taskId` → `mfaRequestId` before Wave 2 begins.

---

### LOW severity

**L-1 — Rate limiting row in test matrix is mislabeled** ✅ RESOLVED  
HTTP **429** is the correct status for rate limiting (standard). The existing `mcpErrorFormatter` returning 403 for rate limit is the bug — it should be updated to 429 as part of Phase 207. Add this formatter fix to Wave 1 scope.

**L-2 — `banking_api_server/routes/mcpInstructions.js` purpose is unclear** ✅ RESOLVED  
This is the **BFF intermediary route** in the MCP → BFF → Agent decision routing flow. MCP evaluates the policy, then routes the decision response back to the BFF via this endpoint, and the BFF forwards the decision to the agent.  
**Contract:** POST `/api/mcp/instructions` — receives `{ taskId, decision, reason?, mfaMethods?, deviceList?, hitlReason? }` from MCP, looks up the waiting agent SSE/WebSocket connection by `taskId`, and pushes the decision to the agent.  
**Action:** Add this route contract to PHASE-207-ARCHITECTURE.md.

**L-3 — AUTHZ-CLAIMS test not in Wave matrix** — still applies  
Add to Wave 2 test matrix: "Post-MFA token missing `acr: Multi_Factor` or wrong `act` → agent rejects with logged alert, does not retry."

**L-4 — MFA-CANCEL token revocation is untestable without revoke endpoint** ✅ RESOLVED  
Token revocation endpoint **must be built as part of Phase 207** (Wave 3). Add to Wave 3 scope: implement `POST /api/auth/revoke` on BFF, call PingOne token revocation endpoint, verify subsequent tool calls return HTTP 401.

---

## 4. Suggestions (updated after clarifications)

1. **Pre-flight checklist for Wave 1:** (a) locate the actual 2-exchange implementation file (H-3 still open), (b) confirm SQLite schema for subject token storage and define TTL, (c) document the home-built authz server's evaluation API contract (inputs MCP sends, outputs it returns), (d) verify `taskId` session correlation is wired up.

2. **Add scenario 11 to Wave 1 test matrix:** authz server unreachable → HTTP 200 `{ decision: 'DENIED', reason: 'policy_unavailable' }`. Agree on timeout value (suggest 5s) and add it to AUTHZ-01.

3. **Update all spec references from "PingOne Authorize" to "home-built authorization server"** in REFERENCE.md and ARCHITECTURE.md. Remove `PINGONE_AUTHORIZE_*` env vars from the Phase 207 prerequisite list.

4. **Extend the session correlation schema** to include `hitlApproved: boolean`. Document the BFF endpoint that sets this flag when the user clicks OK on the HITL modal. Add to Wave 2 scope.

5. **Add `hitlType: 'mfa' | 'consent'` to the decision schema** and document the `acr`-based branching rule: if new token has `acr: Multi_Factor`, authz server skips `MFA_REQUIRED` and evaluates HITL separately.

6. **Update AUTHZ-01 to state tool-list filtering behavior:** "MCP passes full tool list to authz server; authz server returns permitted subset. `tools/list` response contains only authorized tools."

7. **Fix `mcpErrorFormatter` rate-limit code to 429** as part of Wave 1 scope (confirmed correct standard). Update test matrix scenario 5 accordingly.

8. **Add `mcpInstructions.js` contract to ARCHITECTURE.md:** `POST /api/mcp/instructions` — receives decision from MCP, looks up waiting agent connection by `taskId`, pushes decision. This is the BFF leg of the MCP → BFF → Agent routing path.

9. **Investigate React state management pattern** before Wave 3 planning (M-3 still open). Read the FAB/chat component and document where `agentDecisionHandler.js` should hook in.

10. **Add Wave 3 scope items:** (a) `POST /api/auth/revoke` BFF endpoint for MFA-CANCEL, (b) AUTHZ-CLAIMS test in Wave 2 matrix.

---

## 5. Risk Assessment (updated)

| Risk | Status | Likelihood | Impact | Mitigation |
| ------- | ------- | ----------- | ------- | ----------- |
| PingOne Authorize not configured (H-2) | CLOSED | — | — | Using home-built authz server |
| Phase 206 dependency ambiguity (H-1) | CLOSED | — | — | Deferred; 207 is self-contained |
| `agentMcpTokenService.js` not found (H-3) | OPEN | Medium | Invalidates "already enabled" assumption | Locate file before Wave 1 plan |
| Subject token storage for MFA-REFRESH (H-4) | PARTIAL | Low | Security gap if TTL unset | Use SQLite; define TTL = token exp |
| Authz server failure mode (M-1) | CLOSED | — | — | Distinct error: `policy_unavailable` |
| CONSENT-COEXIST sequencing (M-2) | CLOSED | — | — | acr claim drives second-call decision |
| React integration for decision handler (M-3) | OPEN | Medium | Wave 3 stall | Investigate FAB component state before Wave 3 |
| HITL approval callback (M-5) | CLOSED | — | — | BFF session claim (`hitlApproved`) |
| Session correlation wave ordering (M-6) | CLOSED | — | — | Needed in Wave 1; local SQLite sufficient |
| Token revocation not built (L-4) | CLOSED | — | — | In Wave 3 scope |

**Overall risk: LOW-MEDIUM** (down from MEDIUM-HIGH). Nine of twelve concerns are resolved. Two remain open (H-3, M-3) but neither blocks Wave 1. The architectural change from PingOne Authorize to the home-built authz server significantly reduces external dependency risk. Wave 1 can begin once the 2-exchange file location is confirmed.

---

## 6. Clarifications Received (2026-04-20)

| # | Question | Answer |
| --- | ---------- | ------- |
| 1 | Phase 206 dependency | Phase 206 is a vault — deferred, does not block 207 |
| 2 | PingOne Authorize configuration | Home-built authz server is used; PingOne Authorize integration is a future project |
| 3 | `agentMcpTokenService.js` location | Not answered — still open |
| 4 | Subject token storage for MFA-REFRESH | SQLite (local); TTL to be defined |
| 5 | HITL approval proof mechanism | BFF session claim; PingOne does not support short-lived approval tokens. HITL = MFA or user pressing OK on modal |
| 6 | Authz server failure mode | Distinct error (not fail-open, not silent fail-closed) |
| 7 | tools/list filtering | Authz server returns permitted tool subset |
| 8 | CONSENT-COEXIST mechanism | `acr` claim on new token signals MFA complete; drives HITL decision on retry |
| 9 | React integration for decision handler | Unknown — needs investigation |
| 10 | Rate limiting HTTP status | 429 (standard); update `mcpErrorFormatter` |
| 11 | `mcpInstructions.js` purpose | BFF route: receives MCP decision → routes to agent (MCP → BFF → Agent) |
| 12 | Token revocation endpoint | Must be built as part of Phase 207 Wave 3 |

---

*Review complete. No implementation was performed. This document is advisory.*
