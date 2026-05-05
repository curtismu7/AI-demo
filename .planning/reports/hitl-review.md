# HITL Review: What Exists & How to Simplify

**Date:** 2026-05-05  
**Scope:** All HITL / transaction consent logic across BFF, MCP gateway, HITL service, and UI

---

## Target architecture (direction of travel)

**MCP is a router, not a decision-maker.** It forwards tool calls and passes back whatever the authorization layer requires. All decisions live in PingOne Authorize.

```
Agent → MCP (route only)
  → Authorize evaluates the request
  ← Returns: allowed | denied | hitl_required { type: confirm | consent | mfa }
  → MCP creates challenge of the correct type and returns it to the agent
```

Authorize owns the policy. MCP owns the routing and challenge lifecycle. The BFF enforces the challenge before executing the transaction.

**MFA in HITL (current scope):** Simple OTP with demo code `123123`. No PingOne MFA device integration yet — that is a future task (see backlog below).

---

## Backlog tasks

- [ ] **Integrate PingOne MFA into HITL flow** — replace demo OTP `123123` with real PingOne device-based MFA (push/FIDO2/SMS). Authorize returns `hitl_required { type: mfa }`, BFF initiates PingOne MFA challenge, UI shows device selector. Deferred until base HITL simplification is complete.

---

## What HITL does in this app

HITL (Human-in-the-Loop) gates high-value or sensitive transactions so a human must actively approve before they execute. The app has **two independent HITL systems** that co-exist without coordinating:

| System | Where | Trigger |
|--------|-------|---------|
| Browser consent (session-bound) | BFF `routes/transactions.js` | Transfer OR amount > $250 |
| Gateway HITL (policy-driven) | `banking_mcp_gateway` | PingAuthorize returns INDETERMINATE |

---

## Full flow: Browser consent (Path A)

```
UI (TransactionConsentModal)
  → POST /api/transactions/consent-challenge          # create challenge, store in session
  → POST /api/transactions/consent-challenge/:id/confirm  # agree, send OTP email
  → POST /api/transactions/consent-challenge/:id/verify-otp  # enter OTP code
  → POST /api/transactions { consentChallengeId }     # submit transaction, challenge consumed
```

State lives in `req.session.txConsentChallenges[challengeId]` (Redis in production).  
Challenge has a 10-minute TTL; confirmed state has a 5-minute window to submit.

### Challenge state machine

```
pending
  → otp_pending         (after user clicks Agree + OTP sent)
  → confirmed           (after OTP verified)

pending
  → mfa_device_selection   (if user selects MFA path instead of OTP)
  → mfa_awaiting_verification
  → confirmed
```

MFA and OTP paths share the same challenge object, which is why the service is 600+ lines.

---

## Full flow: Gateway HITL (Path B)

```
Agent → MCP Gateway (tools/call)
  → guardToolCall() calls PingAuthorize
  → If INDETERMINATE → createHitlChallenge() at banking_hitl_service
  ← Agent receives JSON-RPC error -32002 with challengeId

User approves challenge at dashboard
  → POST /challenges/:id/respond { decision: 'approved' }

Agent retries tools/call with _hitl_challenge_id param
  → Gateway verifies challenge is 'approved'
  → Allows call to proceed
```

State lives in `banking_hitl_service` (in-memory Map, Redis in production).

---

## Three authorization gates in `routes/transactions.js`

All three run sequentially, all return HTTP 428, client must parse `error` field to tell them apart:

1. **HITL consent gate** (line ~457) — checks `consentChallengeId` in request body  
   Error: `consent_challenge_required`

2. **Step-up MFA gate** (line ~525) — checks ACR claim against user's token  
   Error: `step_up_required`

3. **PingOne Authorize gate** (line ~598) — calls external policy engine  
   Error: `step_up_required` or 403 `denied`

**Problem:** A user can pass gate 1, then hit gate 2, then hit gate 3 — three separate 428s with no combined status. Debugging requires tracing all three independently.

---

## Files involved

| File | Role | Lines |
|------|------|-------|
| `banking_api_server/services/transactionConsentChallenge.js` | Core consent + OTP + MFA service | ~600 |
| `banking_api_server/routes/transactions.js` | REST routes + all three auth gates | ~700 |
| `banking_api_server/middleware/hitlGatewayMiddleware.js` | **UNUSED** — legacy consent evaluator | ~140 |
| `banking_api_server/services/transactionAuthorizationService.js` | PingOne Authorize evaluation | ~150 |
| `banking_api_server/services/mcpLocalTools.js` | Local MCP tools, hardcoded HITL error | ~300 |
| `banking_mcp_gateway/src/index.ts` | Gateway WebSocket server, HITL challenge creation | ~400 |
| `banking_mcp_gateway/src/pingAuthorizeGuard.ts` | PingAuthorize guard | ~100 |
| `banking_mcp_gateway/src/hitlClient.ts` | HTTP client for HITL service | ~60 |
| `banking_hitl_service/src/routes/challenges.js` | REST API for challenge CRUD | ~100 |
| `banking_hitl_service/src/store/challengeStore.js` | In-memory challenge store | ~80 |
| `banking_api_ui/src/components/TransactionConsentModal.tsx` | UI: all consent states in one file | ~460 |
| `banking_api_ui/src/components/AgentConsentModal.js` | Legacy/secondary consent UI | ~200 |

---

## Problems found

### Dead code: hitlGatewayMiddleware.js
`evaluateToolCall()`, `storeConsentRequest()`, `getConsentDecision()` — zero callers in the codebase. Safe to delete.

### Three auth gates, same HTTP status
All three gates return 428. Client parses `error` field string to distinguish them. There is no single place that evaluates all gates together before responding, so a user experiences them as three sequential rejections if multiple apply.

### Session race condition on Vercel - GET RID OF VERCEL
Challenge is created in session and `req.session.save()` is called before responding. On a cold Lambda, the next request (from a different Lambda) may not see the session yet. The code acknowledges this in a comment and explicitly calls `save()` — but no retry/poll mechanism exists.

### OTP fallback leaks plaintext
If PingOne email fails, `otpCodeFallback` (the raw OTP) is returned in the API response body. This is intentional for demo purposes when email isn't configured, but it means the OTP is visible in browser dev tools on any email failure in production.

### Demo bypass hardcoded in service logic - LEAVE THIS IN FOR DEMO
OTP `123123` bypasses verification (line ~372 of transactionConsentChallenge.js). There is no feature flag; it always applies.

### MFA embedded inside consent challenge
The consent challenge object handles both OTP and MFA paths by mutating `status` to `mfa_device_selection` or `mfa_awaiting_verification`. This makes the state machine hard to follow and means `transactionConsentChallenge.js` owns three concerns: consent, OTP, and MFA.

### resolveAccountId() duplicated three times
Nearly identical function exists in `transactionConsentChallenge.js:106`, `routes/transactions.js:74`, and `mcpLocalTools.js:164`. The mcpLocalTools version has extra prefix/UUID handling not in the other two.

### Gateway HITL has no feature flag
`ff_hitl_enabled` only gates session-bound consent. The MCP gateway calls PingAuthorize and creates HITL challenges independently of this flag. Disabling the flag does not disable gateway HITL.

### Local MCP tools return an error, not a challenge
When a local MCP tool detects HITL is needed, it returns a plain error message telling the agent to "go to the dashboard." The gateway, by contrast, creates a challenge with a challengeId. The two paths are inconsistent; agents calling local tools cannot get a challenge to retry.

### TransactionConsentModal.tsx is too large
460 lines handling: challenge polling, checkbox state, OTP entry, MFA device selection, FIDO2, denial confirmation, draggable panel positioning. Every HITL UI state lives in one component with no sub-component split.

---

## Simplification plan

The goal is to converge on the target architecture: Authorize decides, MCP routes, BFF enforces. Below are the phases in priority order.

### Phase 1: Dead code removal — DONE

- ~~Delete `hitlGatewayMiddleware.js`~~ — **correction:** `bankingAgentRoutes.js` (LangChain agent path) imports `storeConsentRequest`, `getConsentDecision`, `recordConsentDecision` from it. File is kept for now; revisit when the LangChain agent path is evaluated for removal.
- [x] Extracted shared `resolveAccountId()` to `banking_api_server/utils/accountUtils.js` — all three local copies removed from `transactionConsentChallenge.js`, `routes/transactions.js`, and `mcpLocalTools.js`. Shared version uses the mcpLocalTools logic (most complete: handles chk-/sav- prefixes, UUID detection, stale ID fallback).
- Keep demo OTP bypass `123123` as-is — intentional for demos

### Phase 2: Authorize owns the decision (core simplification)

Replace the three sequential auth gates in `routes/transactions.js` with a single Authorize call that returns the full requirement. Authorize owns all decisions — including whether consent or step-up is needed. The runtimeSettings-based step-up admin controls are removed; policy is managed via the Authorize UI instead.

Target 428 response shape (unified):

```javascript
// hitl required (consent or mfa):
{ error: 'hitl_required', hitl: { type: 'consent' | 'mfa' | 'confirm' } }

// step-up required (from Authorize):
{ error: 'step_up_required', hitl: { type: 'step_up' }, step_up_acr, step_up_method, step_up_url }
```

#### Step 1: Simulated Authorize — add consent rule

Add `consentRequired: true` to `simulatedAuthorizeService.js` for all transfers, matching the current Gate 1 hardcoded behavior. Simulated returns `{ decision: 'INDETERMINATE', consentRequired: true }` for transfer type. This keeps demos consistent with the target architecture when PingOne Authorize is not configured.

#### Step 2: transactionAuthorizationService.js — handle consentRequired, unify response shape

- Handle `consentRequired` from both simulated and PingOne engines; emit `{ ran: true, block: { status: 428, body: { error: 'hitl_required', hitl: { type: 'consent' } } } }`
- Add `hitl: { type: 'step_up' }` to existing step-up 428 body for UI consistency (existing `step_up_acr`, `step_up_method`, `step_up_url` fields stay)

#### Step 3: routes/transactions.js — restructure gates

- Remove Gate 2 entirely (~lines 521-592: `stepUpEnabled`, `stepUpAmountThreshold`, `stepUpTransactionTypes`, `stepUpWithdrawalsAlways`, `stepUpAcrValue` runtimeSettings reads and all associated logic)
- Move Authorize call to run first (before Gate 1)
- Gate 1 becomes challenge verification only: if Authorize returns `type: consent` and a `consentChallengeId` is present, verify and consume it; if absent, return the `hitl_required` 428
- Single 428 response per request — no more sequential rejections

#### Step 4: MCP server — update error detection

Files: `banking_mcp_server/src/banking/BankingAPIClient.ts`, `banking_mcp_server/src/tools/BankingToolProvider.ts`

- `BankingAPIClient.ts` lines ~332-343 (step_up) and ~514 (consent): detect `error: 'hitl_required'` with `hitl.type`; remove `consent_challenge_required` string detection
- `BankingToolProvider.ts` lines 874-885 (consent handler) and 899-912 (step-up handler): update `errorCode` checks and emitted error shapes to use `hitl_required` + `hitl.type`

#### Step 5: UI — update consent and step-up detection

Files: `banking_api_ui/src/components/UserDashboard.js`, `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/TransactionConsentModal.tsx`

- `UserDashboard.js` lines 1362, 1446, 1535: replace `d?.error === "consent_challenge_required"` with `d?.error === "hitl_required" && d?.hitl?.type === 'consent'`
- `BankingAgent.js` lines 846, 3789, 4314: update consent detection (checks both `consent_challenge_required` boolean and error string) to use `hitl_required` + `hitl.type`; update step-up detection at lines 3852-3853 and 4428 to read `hitl.type === 'step_up'`
- `TransactionConsentModal.tsx`: verify it reads the right trigger field; update if it checks the error string directly

#### Step 6: Real PingOne Authorize — obligation mapping

- Document obligation type to use in PingOne policy for consent: `HITL_CONSENT` (or equivalent)
- Update `pingOneAuthorizeService.js` to map that obligation to `consentRequired: true` in its return shape, consistent with the simulated service
- Add to the Authorize UI setup guide: policy must return `HITL_CONSENT` obligation for transfer transactions

#### Step 7: Dead code audit and app-wide simplification

With Phase 2 in place, audit for code that becomes dead or can be simplified:

- Any remaining hardcoded per-transaction-type HITL rules in routes other than `routes/transactions.js` (e.g. `routes/sensitiveBanking.js`) — replace with Authorize call or remove if redundant
- `runtimeSettings` keys that only existed to drive Gate 2 (`stepUpEnabled`, `stepUpAmountThreshold`, `stepUpTransactionTypes`, `stepUpWithdrawalsAlways`, `stepUpAcrValue`) — remove from settings store, admin UI, and any documentation
- `mcpLocalTools.js` HITL error path — currently returns a plain error message instead of a challenge; assess whether it can now delegate to the same Authorize flow as `routes/transactions.js` or be removed
- `bankingAgentRoutes.js` / `hitlGatewayMiddleware.js` LangChain path — evaluate whether this path is still needed; if the LangChain agent is dead, remove both files (unblocks the Phase 1 deferred item)
- Education/snippet files (`education/McpProtocolPanel.js`, `education/PingOneAuthorizePanel.js`, `educationImplementationSnippets.js`) — update any code snippets that show the old `consent_challenge_required` error shape

MFA type (current): When Authorize returns `type: 'mfa'`, BFF creates an OTP challenge with demo code `123123`. No PingOne device integration yet.

#### Step 8: Verify gateway HITL path matches the agent flow sequence

The target agent flow for a transfer (steps 11-12 of the sequence) is:

```text
11b. MCP gateway calls Authorize with TX token + tool call
11c. Authorize returns deny with HITL requirement (scope: transfer, type: step-up or consent)
11d. Gateway returns JSON-RPC unauthorized with transfer scope AND HITL type
12.  Agent invokes HITL — OTP by default (123123); CIBA if feature flag enabled
12a. Repeat steps 6a-10 with new token
```

HITL method: default is OTP with demo code `123123`. CIBA is optional and controlled by a feature flag. The agent flow and gateway response shape are the same either way — the flag only changes how the human challenge is delivered.

Audit the gateway path against this sequence and fix any gaps:

- `banking_mcp_gateway/src/pingAuthorizeGuard.ts` — verify Authorize returns include the HITL type and required scope when a transfer is denied; the guard must pass this through, not swallow it
- `banking_mcp_gateway/src/index.ts` — verify the JSON-RPC error returned to the agent on HITL includes both the required scope and the HITL type (step-up vs. consent); the agent uses this to invoke the right challenge flow
- `banking_mcp_gateway/src/hitlClient.ts` — verify the challenge created at the HITL service includes the HITL type from Authorize, not a hardcoded type
- `banking_agent_service/src/agentOrchestrator.ts` and `mcpGatewayClient.ts` — verify the agent reads the HITL type from the JSON-RPC error and routes to OTP (default) or CIBA (feature flag); the agent must retain original scope when performing the token exchange in step 12
- Confirm the simulated Authorize path (when PingOne Authorize is not configured) also returns a HITL type on transfer deny so the gateway+agent flow can be demoed end-to-end without a live PingOne Authorize policy

### Phase 3: Simplify transactionConsentChallenge.js

Once Phase 2 is in place, the challenge service only needs to handle the challenge types Authorize can return. Remove the embedded MFA device-selection state machine (it will be replaced by PingOne MFA in the future backlog item). The state machine simplifies to:

```text
pending → otp_pending → confirmed   (for confirm/consent/mfa types, all using OTP for now)
```

### Phase 4 (deferred): PingOne MFA in HITL

See backlog task above. Only start after Phase 2 and 3 are stable.
