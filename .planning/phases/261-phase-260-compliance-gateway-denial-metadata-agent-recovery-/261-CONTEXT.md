# Phase 261: Phase 260 Compliance — Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the existing agent/gateway/BFF/UI stack fully compliant with the Phase 260
architecture spec. Six work areas in strict wave order:

1. Gateway structured denial metadata (Wave 1)
2. Agent service recovery and retry logic (Wave 2)
3. BFF propagation and login resume context (Wave 3)
4. UI flow checklist and status visibility (Wave 4)
5. MCP OLB downstream resource token exchange (Wave 5)
6. PingOne claim and scope compliance diagnostics (Wave 6)

**No new services. No new frameworks. No page redesign. No architecture changes.**
Step 9a (vault/invest path) is out of scope.

</domain>

<decisions>
## Implementation Decisions

### D-01: Auth Recovery UX — Redirect + Auto Re-fire

When `login_required` fires mid-agent-flow:
- Use the existing redirect path via `navigateToCustomerOAuthLogin` (already imported in
  `BankingAgent.js`).
- Store the pending NL message in `BX_AGENT_PENDING_NL_KEY` (sessionStorage) before
  redirecting — this key and the replay-on-return logic already exist.
- After OAuth callback completes, the pending message re-fires **automatically** — the
  user does not re-submit manually.
- No new UI component. Extend the existing pattern only.

### D-02: Flow Checklist Placement — All Three Surfaces

The 12-step compliance diagram must appear on all three surfaces simultaneously:

**A. `agentFlowDiagramService.js` extension:**
Add the 12 compliance steps as a named step group with `pending/active/done/error`
states. The existing diagram service already has this shape — add step IDs and labels
that map to the 12a diagram steps.

**B. Education panel tab:**
Add a new tab or collapsible section in the existing education/token-chain panel showing
the compliance checklist. Purpose: conference presenter narration. Alongside existing
"Token Chain", "RFC Index" panels.

**C. Inline status strip in `BankingAgent.js`:**
A compact strip above the chat messages showing the current active step and overall
progress. Updates in real-time as the agent flow progresses. Purpose: end-user
real-time understanding of what is happening.

All three are additive to existing surfaces — no layout redesign.

### D-03: BFF Recovery Response Shape — Semantic HTTP Status Codes

When `/api/banking-agent/message` surfaces agent recovery states to the UI:

- `login_required` → **HTTP 401** with structured body:
  `{ "error": "login_required", "requiredScopes": [...] }`
- `scope_required` → **HTTP 403** with structured body:
  `{ "error": "scope_required", "requiredScopes": [...] }`
- `hitl_required` → **HTTP 403** with structured body:
  `{ "error": "hitl_required", "challengeId": "...", "challengeType": "consent|step_up", "expiresAt": "..." }`

Rationale: semantic and teachable — students watching DevTools see the correct HTTP
status codes alongside the recovery body, which reinforces the auth standard being
demonstrated.

### D-04: Gateway HITL — New Consent UI with Two Variants

Do NOT reuse `TransactionConsentModal` for gateway HITL challenges.

Create a new gateway-specific consent component with two distinct variants:
- **`consent`**: Simple human approval — "Do you want to allow this action?"
- **`step_up`**: MFA — "Verify your identity to continue" (may reuse
  `FidoStepUpModal` / `OtpStepUpModal` internally for the MFA mechanism, but
  the outer component and wording are gateway-specific).

**How the variant is determined:** The gateway MUST emit a `challenge_type` field
(`"consent"` or `"step_up"`) in the `-32002` HITL error data alongside the existing
`challengeId` and `expiresAt` fields. This is a **Wave 1 addition** to the gateway.

The UI reads `error.data.challenge_type` to decide which variant to render.

### the agent's Discretion

- Exact component name and file location for the new gateway consent UI — planner
  chooses a name consistent with existing modal naming conventions
  (`FidoStepUpModal`, `OtpStepUpModal`, `TransactionConsentModal`).
- Which existing MFA sub-component (`FidoStepUpModal` vs `OtpStepUpModal`) the
  `step_up` variant delegates to — or whether it supports both with method detection.
- Exact copy/wording inside the new consent modal variants.
- Education panel tab label and position within the existing tab strip.
- Inline status strip visual design (height, color, icon usage) — minimal, must not
  dominate the chat area.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Deployment guide (source of truth for wave order, files, and acceptance criteria)
- `/Users/cmuir/Documents/260-EXECUTION-CHECKLIST.md` — Full Phase 260 deployment
  guide: pre-flight env tables, 6 waves with tasks/files/verification, blast radius,
  code audit corrections (3 findings), end-to-end smoke tests. Planner MUST read this.

### Gateway — Wave 1 source files
- `banking_mcp_gateway/src/index.ts` — WebSocket JSON-RPC handler; jsonRpcError() at
  line 174; denial at lines 210 and 293; HITL errors at lines 278-287. Wave 1 adds
  `data` to these calls AND adds `challenge_type` to HITL errors.
- `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts` — HTTP path denial;
  Wave 1 adds `required_scopes` and `login_required` to 403 body.
- `banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` — Returns only
  `{decision, reason}`. Does NOT return `required_scopes`. Gateway must own its own
  tool-to-scope map (`toolScopes.ts`) modelled on MCP server's `toolScopeMap.ts`.

### Agent service — Wave 2 source files
- `banking_agent_service/src/mcpGatewayClient.ts` — `callTool()` at line ~80;
  error collapse at line 88 loses `error.code` and `error.data`. Wave 2 fixes this.
- `banking_agent_service/src/agentOrchestrator.ts` — Linear tool loop; no recovery
  branching. Wave 2 adds `-32403` and `-32002` error-code branches.
- `banking_agent_service/src/tokenResolver.ts` — Cache key is `hash(userToken)` only.
  Wave 2 changes to `hash(userToken)+sortedScopes` for scope-aware retry.

### BFF — Wave 3 source files
- `banking_api_server/routes/oauthUser.js` — Has `postLoginReturnToPath` session field
  and `redirectEndUserOAuthSpaFailure`. Wave 3 extends with pending-intent storage.
- `banking_api_server/routes/ciba.js` — Reuse as-is for CIBA/HITL polling.
- BFF response shape: HTTP 401/403 with structured body (per D-03).

### UI — Wave 4 source files
- `banking_api_ui/src/components/BankingAgent.js` — Imports `navigateToCustomerOAuthLogin`,
  `BX_AGENT_PENDING_NL_KEY` sessionStorage key, `TransactionConsentModal`,
  `FidoStepUpModal`, `OtpStepUpModal`. Wave 4 adds inline status strip and new
  gateway consent component.
- `banking_api_ui/src/services/agentFlowDiagramService.js` — Already has
  `pending/active/done/error` step states, `serverEvents`, `PHASE_LABELS` map.
  Wave 4 extends with 12 compliance step group.

### MCP server — Wave 5 source file
- `banking_mcp_server/src/tools/BankingToolProvider.ts` — `agentToken` branch at
  ~line 375 uses gateway token directly; session-based RFC 8693 exchange at lines
  389-440 is complete and MUST NOT be touched. Wave 5 changes the agentToken branch
  only, gated on `BANKING_API_RESOURCE_URI` env var.
- `banking_mcp_server/src/tools/toolScopeMap.ts` — `getScopesForTool(toolName)` and
  `TOOL_SCOPES` map already complete. Used by Wave 5 agentToken branch.

### Existing patterns not to break
- `REGRESSION_PLAN.md` §1 — protected areas list; read before any change.
- Session-based resource exchange path in `BankingToolProvider.ts` (lines 389-440) —
  DO NOT TOUCH.
- `jsonRpcError()` helper existing signature — Wave 1 only adds optional `data` arg,
  does not change existing callers.

</canonical_refs>
