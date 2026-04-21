# Phase 207: Agent AI Login Flow — Complete Specification Reference

## 📋 Core Specification

**Location:** [.planning/ROADMAP.md - Phase 207 Section](../../ROADMAP.md)

**Direct GitHub URL (main branch):**
```
https://github.com/curtismu7/banking-demo/blob/main/.planning/ROADMAP.md
```

Search for: `### Phase 207: Agent AI — Digital Assistant login flow`

---

## 📁 Phase 207 Repository Structure

```
.planning/phases/207-agent-ai-digital-assistant-login-flow-with-mcp-server-token-exchange-and-pingone-authorization/
├── PHASE-207-REFERENCE.md (this file)
├── PHASE-207-ARCHITECTURE.md (planning diagram reference)
└── [Pending] 207-01-PLAN.md (Wave 1: Policy + Authorize integration)
└── [Pending] 207-02-PLAN.md (Wave 2: MFA + HITL enforcement)
└── [Pending] 207-03-PLAN.md (Wave 3: Agent UI + error handling)
```

---

## 🏗️ Phase 207 Architecture Diagram

**Reference Architecture** (source: provided in planning):

The provided diagram shows the complete orchestration:

```
┌─────────────────────────────────────────────────────────────────────┐
│ User Login with Agent Token Exchange & Policy Authorization         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  User → OAuth Flow → PingOne/PFI/AIC                                │
│                                                                       │
│  Agent                Token Exch              MCP                    │
│  ┌─────┐             ┌──────┐              ┌─────┐                 │
│  │Agent│─Tokens─────→│Token │─Delegated───→│MCP  │                │
│  │     │ Exchange    │Exch  │   Token     │     │                 │
│  └─────┘             └──────┘              └─────┘                 │
│   client_id           (RFC 8693)            Authorize              │
│   agent               2-exchange            Decision                │
│   token               delegation            Routing                 │
│                                                │                     │
│  SDK     Route/         MCP        OAuth RS   │                     │
│  ┌─────┐HTTP-bind    ┌──────┐    ┌───────┐  │                     │
│  │Tools│──1-exch────→│tools │───→│Policy │  │                     │
│  │List │ "2F"        │list  │ call│authz  │←─┘                     │
│  └─────┘             └──────┘    └───────┘                         │
│                                                                       │
│  Decision Routing:                                                   │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │ MCP Receives Decision from Authorize                     │       │
│  │ ├─ DENIED (insufficient_scope)                          │       │
│  │ ├─ MFA_REQUIRED (device list, methods)                  │       │
│  │ ├─ HITL_REQUIRED (approval modal)                       │       │
│  │ └─ APPROVED (proceed with tool)                         │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                       │
│  Tools List:                     Tools Call:                        │
│  ├─ "Show my accounts"          ├─ POST /api/mcp/tool             │
│  ├─ "Show my transactions"      │  Body: {toolName, params}       │
│  ├─ "Create a transfer"         │  → Policy evaluation             │
│  └─ "Request a withdrawal"      │  → Agent receives decision       │
│                                 └─ Agent enforces decision         │
└─────────────────────────────────────────────────────────────────────┘

Wave Structure:
├─ RFC 8693: 2-Exchange Delegation (1-exchange or 2-exchange)
├─ Policy Layer: MCP → Authorize → Decision
└─ Agent Layer: Decision enforcement (DENIED/MFA/HITL/APPROVED)
```

---

## 📊 Complete Phase 207 Specification

### Goal
Implement complete digital assistant (agent) login flow where:
1. MCP server orchestrates RFC 8693 token exchange
2. Queries the **home-built authorization server** for fine-grained policy decisions
3. Decision routes MCP → BFF (`mcpInstructions.js`) → Agent
4. Agent enforces decisions (MFA, consent modal, permission error)
5. **One policy in MCP matches the home-built authz server policy** — all logic flows MCP ↔ home-built authz ↔ Agent

> **Note:** "PingOne Authorize" references in older spec versions refer to the home-built authorization server. A future project will integrate PingOne Authorize as the policy engine; Phase 207 uses the existing home-built authz server coded in `banking_api_server`.

### Key Requirements (18 total)

**Architecture & Policy (3)**
- POLICY-ARCH-01: Centralized policy (no duplication in agent)
- POLICY-EVAL-01: MCP queries Authorize with context
- AUTHZ-DECISION-02: MCP decision schema (HTTP 200 response body)

**HTTP Status Codes (Preserve Existing + New Layer)**
- AUTHZ-HTTP-401: Token-level failures (no token/expired/wrong audience) — **Unchanged**
- AUTHZ-HTTP-403: Token structural failures (missing act/rate limit) — **Unchanged**
- NEW: HTTP 200 + decision enum for policy evaluation results

**Token Exchange (Already Enabled)**
- TOKEN-EXCH-01: RFC 8693 exchange enabled
- TOKEN-EXCH-02: Session correlation for concurrent flows

#### Home-built Authz Integration (New in Phase 207)

- AUTHZ-01: MCP calls home-built authz server after token validation; result routes MCP → BFF (`mcpInstructions.js`) → Agent
- AUTHZ-02: Authz server evaluates individual tool decisions (scopes, limits, MFA, HITL); tool list is filtered client-side from token scopes (PingOne Authorize compatible pattern)
- AUTHZ-03: MCP enforcement actions (DENIED|MFA_REQUIRED|HITL_REQUIRED|APPROVED)

**MFA Flow (New Decision-Based Routing)**
- MFA-01: Agent receives MFA decision (HTTP 200, not 401)
- MFA-02: Agent calls `/api/mfa/challenge` with choice
- MFA-03: Device discovery on MCP server-side
- MFA-04: OTP validation with 3 retries + 429 handling

**Authorization Decisions**
- HITL-01: HITL from policy (not hardcoded)
- SCOPE-CHECK-01: Insufficient scope → DENIED decision (HTTP 200, not 403)
- MFA-TIMEOUT: Timeout → DENIED decision
- MFA-REFRESH: Token expiry during MFA
- MFA-CANCEL: User closes modal → token revoked
- AUTHZ-CLAIMS: Post-MFA token validation (acr + act)
- CONSENT-COEXIST: Both MFA + HITL in single decision

### Success Criteria (12 specific tests)

1. ✅ 2-exchange integration verified (existing tests pass)
2. ✅ 401 preserved (no token/expired/wrong audience)
3. ✅ 403 preserved (missing act/rate limit)
4. 🔄 DENIED decision for scope violations (HTTP 200)
5. 🔄 Policy centralization (one rule in MCP + Authorize)
6. 🔄 MFA decision routing
7. 🔄 HITL decision routing
8. 🔄 MFA + HITL coexistence
9. 🔄 Session correlation for concurrency
10. 🔄 Timeout resilience
11. 🔄 OTP resilience (429 Too Many Attempts)
12. 🔄 Claims validation (acr + act)

---

## 📝 Specification Documents

### Main ROADMAP (Complete Spec)
- **File**: `.planning/ROADMAP.md`
- **Section**: Phase 207 (lines approx. 2168-2235)
- **GitHub**: https://github.com/curtismu7/banking-demo/blob/main/.planning/ROADMAP.md#phase-207-agent-ai--digital-assistant-login-flow-with-mcp-server-token-exchange-and-pingone-authorization

### Session Memory Documents (Analysis & Planning)

**Verification Document:**
```
/memories/session/phase-207-verification-complete.md
```
- 3-layer response model
- Wave 1-3 implementation guidance
- E2E test matrix (8 scenarios)
- Risk mitigation strategies

**Integration Document:**
```
/memories/session/phase-207-integration-verification.md
```
- Current state (pre-Phase 207)
- 2-exchange + 401/403 details
- New decision layer explanation
- Implementation constraints

**Requirements Document:**
```
/memories/session/phase-207-requirements.md
```
- Final spec with policy orchestration
- Wave structure
- Success criteria

---

## 🔗 Related Files & Components

### Authentication/Authorization
- `banking_api_server/config/oauthUser.js` — OAuth scopes config
- `banking_api_server/.env` — Auth endpoints
- `banking_mcp_server/src/middleware/mcpTokenValidator.js` — RFC 8693 validation on MCP side

### Token Exchange (Already Enabled)
- **`banking_api_server/services/agentMcpTokenService.js`** — RFC 8693 2-exchange implementation (main entry point)
  - Function: `resolveMcpAccessTokenWithEvents(req, toolName)` — resolves token and tracks events
- **`banking_api_server/services/oauthService.js`** — OAuth token operations
  - Function: `performTokenExchange(subjectToken, audience, scopes)` — 1-exchange
  - Function: `performTokenExchangeWithActor(subjectToken, actorToken, audience, scopes)` — 2-exchange
- Related files:
  - `banking_api_server/services/agentMcpScopePolicy.js` — Scope narrowing policy
  - `banking_api_server/services/tokenChainService.js` — Token event tracking for UI
  - `banking_api_server/services/tokenExchangeConfigValidator.js` — Config validation
  - `banking_api_server/services/enhancedTokenExchangeService.js` — Enhanced exchange support
- Environment: `FF_TWO_EXCHANGE_DELEGATION=true`, `USE_AGENT_ACTOR_FOR_MCP=true` (✅ **ENABLED**)

### MCP Server
- `banking_mcp_server/src/services/mcpErrorFormatter.js` — 401/403 responses
- `banking_mcp_server/src/tools/` — Tool definitions

### Phase 207 Files to Create

- `banking_mcp_server/services/policyEnforcementService.js` — Policy engine (calls home-built authz server)
- `banking_api_server/routes/authorizeDecision.js` — Home-built authz server wrapper (BFF-side)
- `banking_api_server/routes/mcpInstructions.js` — BFF route: receives MCP decision, routes to agent via `taskId` (MCP → BFF → Agent)
- `banking_api_ui/services/agentDecisionHandler.js` — Agent UI decision enforcement (React integration TBD in Wave 3)

---

## 🚀 Wave Breakdown

### Wave 1: Policy Architecture + Home-built Authz Integration

**Focus**: Establish policy engine and home-built authz server communication

- Create `policyEnforcementService.js` on MCP (calls home-built authz server)
- Create `authorizeDecision.js` wrapper on BFF (home-built authz server client)
- Create `mcpInstructions.js` BFF route (MCP → BFF → Agent decision routing by `taskId`)
- Integrate into tool call flow (after token validation, before tool execution)
- Update `mcpErrorFormatter` rate-limit code from 403 → 429
- Session correlation schema: `{ taskId, mcpClientId, userId, startTime, mfaRequestId, mfaMethod, hitlApproved }` stored in SQLite
- Test matrix: scope denied, HITL trigger, MFA-only, all-required, authz server down
- Success: All 4 decision paths + authz-unavailable path return HTTP 200 with correct decision enum

### Wave 2: MFA + HITL Decision Enforcement

**Focus**: Agent receives decisions and shows appropriate UI

- Implement device discovery on MCP side
- Agent shows MFA modal per decision
- Agent shows HITL approval modal per decision (`hitlType: 'mfa' | 'consent'`)
- HITL approval sets `hitlApproved: true` in SQLite session (BFF session claim proof)
- OTP validation with retry logic (3 attempts max, 429 on 4th)
- Post-MFA token must have `acr: Multi_Factor` + correct `act` claim (AUTHZ-CLAIMS test)
- CONSENT-COEXIST: second call detected by `acr` claim on new token → authz returns HITL_REQUIRED
- Success: After Wave 1 E2E test passes for all 4+1 paths

### Wave 3: Agent UI + Error Handling

**Focus**: Polish error messages, edge cases, and revocation

- Permission error messaging (DENIED reasons)
- MFA timeout handling (60s timeout → DENIED/mfa_timeout)
- Cancellation flow: build `POST /api/auth/revoke` BFF endpoint → token revocation
- Claims validation (acr + act checks)
- Investigate React state management for `agentDecisionHandler.js` integration point

---

## 📌 Implementation Notes

### Critical: Layer Separation

```
Layer 1 (HTTP Status):     HTTP 401/403 (no change)
├─ Token validation (RFC 8693)
├─ No token, expired, wrong audience → 401
├─ Missing act, rate limit → 403
└─ Layer 1 does NOT change in Phase 207

Layer 2 (MCP Decision):    HTTP 200 + decision body (NEW)
├─ Token valid → home-built authz server evaluation
├─ Policy engine processes context (userId, toolName, scopes, amount, acr)
├─ Returns: DENIED|MFA_REQUIRED|HITL_REQUIRED|APPROVED
├─ MCP routes decision → BFF (mcpInstructions.js) → Agent via taskId
└─ Agent receives in HTTP 200 response body

Layer 3 (Agent Action):    UI enforcement (NEW)
├─ DENIED → show error (no re-login)
├─ MFA_REQUIRED → show MFA prompt
├─ HITL_REQUIRED → show approval modal
└─ APPROVED → proceed with tool
```

### Do NOT Break

- ❌ Existing 401/403 token validation
- ❌ Existing RFC 8693 code (tests must still pass)
- ❌ Build must exit 0: `npm run build` in `banking_api_ui`

### Do Implement

- ✅ New SCOPE_CHECK-01 path (after token passes RFC 8693)
- ✅ Policy evaluation between validation and tool execution
- ✅ Decision enum mapping from Authorize response
- ✅ Agent decision handler (UI routing per decision)

---

## 🧪 Test Matrix (Wave 1 E2E)

| Scenario | Token Status | Policy | Expected HTTP | Expected Decision | User Experience |
|----------|--------------|--------|----------------|--------------------|-----------------|
| 1. No token | Missing | N/A | 401 | N/A | "Session expired" |
| 2. Expired token | Expired | N/A | 401 | N/A | "Session expired" |
| 3. Wrong audience | Invalid | N/A | 401 | N/A | "Session expired" |
| 4. Missing act | Invalid structure | N/A | 403 | N/A | "Request blocked" |
| 5. Rate limited | Valid | N/A | 429 | N/A | "Try later" |
| 6. Insufficient scope | Valid | DENIED | 200 | DENIED | "Permission denied" |
| 7. MFA required | Valid | REQUIRED | 200 | MFA_REQUIRED | MFA prompt |
| 8. HITL required | Valid | REQUIRED | 200 | HITL_REQUIRED | Approval modal |
| 9. MFA + HITL | Valid | BOTH | 200 | MFA_REQUIRED* | MFA then HITL |
| 10. Approved | Valid | OK | 200 | APPROVED | Proceed |

*Then second request returns HITL_REQUIRED after MFA token obtained

---

## 📖 Reference Documentation

- RFC 8693: OAuth 2.0 Token Exchange — https://tools.ietf.org/html/rfc8693
- Home-built authz server — `banking_api_server/services/pingOneAuthorizeService.js` + `banking_api_server/routes/authorize.js`
- PingOne P1MFA — FIDO2 + OTP device management
- MCP Spec — Model Context Protocol
- **PingOne Authorize (future)** — A later project will replace the home-built authz server with PingOne Authorize. Design decisions in Phase 207 must remain compatible: use per-request evaluation (not bulk filtering), standard claim inputs (`sub`, `scope`, `act`, `acr`, `amount`), and decision enum output. See §PingOne Authorize Compatibility below.

---

## ⏳ Timeline & Status

- ✅ **Specification**: COMPLETE (18 requirements, 12 success criteria, 3-wave structure)
- ⏳ **Planning**: PENDING (awaiting `/gsd-plan-phase 207` for 207-01/02/03-PLAN.md)
- ⏳ **Implementation**: PENDING (Wave 1-3 execution)
- ⏳ **Regression Documentation**: PENDING (add 3+ files to REGRESSION_PLAN.md §1)

---

## 🔄 How to Use This Reference

1. **For Planning**: Use ROADMAP.md Phase 207 as the base. Expand into 207-01/02/03-PLAN.md
2. **For Architecture Review**: See "3-Layer Response Model" section and test matrix above
3. **For Implementation**: Follow "Wave Breakdown" and "Do NOT Break / Do Implement" sections
4. **For Testing**: Use "Test Matrix" to verify all 10 scenarios work end-to-end

---

---

## ⚠️ PingOne Authorize Compatibility Constraints

Phase 207 uses the home-built authz server. A future phase will migrate to PingOne Authorize as the policy engine. **Do not build patterns that PingOne Authorize cannot replicate.**

### What PingOne Authorize CAN do

- Evaluate a single authorization request and return permit/deny
- Inspect token claims: `sub`, `scope`, `act`, `acr`, custom attributes
- Apply transaction threshold rules (e.g., amount > $500 → HITL)
- Require step-up authentication (MFA) as a policy decision
- Return structured decision attributes alongside permit/deny

### What PingOne Authorize CANNOT do (avoid these patterns)

- **Bulk tool list filtering** — PingOne Authorize evaluates one request at a time, not a list. Do NOT have the authz server return a filtered tool subset. Instead: filter `tools/list` client-side based on token scopes (MCP reads scopes from the validated token and omits tools requiring scopes the token lacks). This is PingOne Authorize compatible — no authz server call needed for list filtering.
- **Issuing approval tokens** — PingOne Authorize does not mint short-lived HITL approval tokens natively. Use BFF session claim (`hitlApproved: true`) instead, keyed by `taskId`.
- **Stateful MFA tracking** — PingOne Authorize is stateless per evaluation. MFA completion state (`acr` claim on new token) must come from the token itself, not from server-side session state passed to Authorize.

### Design rules for Phase 207

1. Authz server is called **once per tool call** with a structured context object — never per-list
2. Tool list filtering is **scope-based, client-side** in MCP token validator
3. HITL proof is a **BFF session claim** (`hitlApproved`), not an authz-server-issued token
4. MFA completion is signalled via **`acr` claim on the new token**, not via session state
5. All authz inputs are standard claims (`sub`, `scope`, `act`, `acr`) or request attributes (`toolName`, `amount`) — no proprietary fields

---

**Last Updated**: 2026-04-20  
**Spec Version**: 4 (Home-built authz + PingOne Authorize compatibility + MCP→BFF→Agent routing)  
**Status**: ✅ Ready for Detailed Planning
