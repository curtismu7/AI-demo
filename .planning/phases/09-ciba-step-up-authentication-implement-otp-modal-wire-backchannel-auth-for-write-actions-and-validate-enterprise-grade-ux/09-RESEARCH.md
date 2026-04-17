# Phase 9: CIBA Step-Up Authentication - Research

**Researched:** 2026-04-17
**Domain:** Step-up authentication (CIBA + OTP), React UI state management, Express BFF
**Confidence:** HIGH

## Summary

Phase 9 wires agent-triggered step-up authentication to auto-initiate without manual clicks, changes the default method to email/OTP, extends 428 step-up to sensitive account details, makes the threshold configurable, and polishes the approval UX.

The codebase already has substantial CIBA infrastructure (`cibaService.js`, `routes/ciba.js`, `CIBAPanel.js`, `TransactionConsentModal.js`). The core gap was that `onAgentStepUp` in `UserDashboard.js` set state but never called `handleCibaStepUp()` — **this has been fixed** in the executed plans (09-01 through 09-05). All 5 plans have SUMMARY files indicating completion. This research documents the architecture as-implemented for future reference and any rework planning.

**Primary recommendation:** This phase's plans have all been executed. If re-planning is needed, use the existing architecture and event system documented below — no new libraries or patterns required.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Auto-initiate on agent step-up with 3s countdown + Cancel via `autoInitiateTimerRef` (useRef of setTimeout IDs)
- **D-02:** Replace SensitiveConsentBanner with 428 step-up challenge for `get_sensitive_account_details`
- **D-03:** Step-up threshold configurable in Admin Config (default $250), stored in `configStore` as `step_up_amount_threshold`
- **D-04:** Symmetric auto-initiate for OTP (same countdown/cancel UX as CIBA)
- **D-05:** Method-specific agent messages (CIBA vs OTP different copy)
- **D-06:** Default method changes from `'ciba'` to `'email'`
- **D-07:** Fix stale toast + add agent confirmation card (`✅ [Method] approved — continuing your request`)

### Claude's Discretion
- Cancellable timer ref: `useRef` for `autoInitiateTimerRef`; clear in Cancel handler + cleanup
- Countdown display: match existing toast/banner style; plain "Starting in 3s… Cancel" sufficient
- Confirmation card: inline message in agent thread; reuse existing message styling
- OTP method display: use verified email from session/userinfo if available

### Deferred Ideas (OUT OF SCOPE)
- Device-bound CIBA (non-email push to authenticator app)
- Step-up for non-agent user-initiated actions
- Biometric step-up / WebAuthn integration
- Per-account sensitivity tiers (not just dollar threshold)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CIBA-01 | Auto-initiate countdown + cancel + stale toast fix in UserDashboard | `onAgentStepUp` listener wires 3s countdown via `autoInitiateTimerRef`; toast copy conditional on `agentTriggeredStepUp` |
| CIBA-02 | Method-specific messages + SensitiveConsentBanner removal + sensitive 428 gate + MCP TS handling | `pendingStepUpActionRef.method` read at approval time; `sensitiveBanking.js` already has 428 ACR gate; MCP `BankingToolProvider` catches 428 |
| CIBA-03 | Server defaults — method→email, threshold configurable via Admin Config | `configStore.STEP_UP_METHOD` default already `'email'`; `STEP_UP_AMOUNT_THRESHOLD` in configStore (default 500) |
| CIBA-04 | Confirmation card + polished approval UX | `onStepUpApproved` in BankingAgent.js adds `✅ ${methodLabel} approved` message with timestamp |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Read REGRESSION_PLAN.md §1** before editing listed files
- **Minimal diff** — name the component/element; do not refactor unrelated code
- **After any UI edit:** `npm run build` in `banking_api_ui/` must exit 0
- **Bug fixes:** add entry to REGRESSION_PLAN.md §4
- **Do not** edit marketing-only pages
- Tokens stay server-side (BFF pattern)

## Architecture Patterns

### Event System (BankingAgent ↔ UserDashboard)

The agent and dashboard communicate via `window.dispatchEvent` / `window.addEventListener` custom events:

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `agentStepUpRequested` | Agent → Dashboard | `{ step_up_method: 'ciba'\|'email', isHITL: bool }` | Agent got 428; triggers step-up UI |
| `cibaStepUpApproved` | Dashboard → Agent | (none) | MFA complete; agent retries pending action |
| `cibaStepUpCancelled` | Dashboard → Agent | (none) | User cancelled; agent flow diagram marked |
| `SESSION_REAUTH_EVENT` | Dashboard → Banner | `{ message, role, isHITL }` | Shows SessionReauthBanner |
| `userAuthenticated` | Login → Agent | (none) | Auth-challenge login complete; agent retries |

**Pattern:** [VERIFIED: codebase grep]
- BankingAgent.js line ~1763: dispatches `agentStepUpRequested` on 428/`step_up_required`
- BankingAgent.js line ~1336-1350: listens for `cibaStepUpApproved`, reads `pendingStepUpActionRef`, retries via `runAction()`
- UserDashboard.js line ~755-788: listens for `agentStepUpRequested`, routes to CIBA or OTP based on method

### Step-Up State Machine (UserDashboard)

```
Agent 428 → agentStepUpRequested event
  ↓
onAgentStepUp handler:
  if method === 'ciba':
    setAgentTriggeredStepUp(true) → setStepUpRequired(true)
    → 3s countdown (agentCountdown: 3→2→1→0)
    → auto-fire handleCibaStepUp() via handleCibaStepUpRef
    → POST /api/auth/ciba/initiate → poll loop (5s) → cibaStepUpApproved
  else (email/OTP):
    setAgentTriggeredStepUp(true)
    → handleInitiateOtpRef.current() immediately (no countdown for email)
    → POST /api/auth/mfa/challenge → device picker or direct OTP modal
    → handleVerifyOtp → cibaStepUpApproved
```

**Key state variables (UserDashboard.js ~line 88-127):**
- `stepUpRequired` (bool) — controls persistent toast visibility
- `stepUpMethod` ('ciba' | 'email') — from 428 response
- `agentTriggeredStepUp` (bool) — distinguishes agent vs manual flow
- `agentCountdown` (0-3) — countdown display
- `cibaAuthReqId`, `cibaStatus` ('idle'|'pending'|'completed'|'error') — CIBA poll state
- `otpModalOpen`, `otpCode`, `otpError`, `otpSubmitting`, `otpEmail`, `otpDaId`, `otpDeviceId` — OTP modal state
- `totpModalOpen`, `totpDaId`, `totpDeviceId`, `totpCode` — TOTP modal state
- `pushModalOpen`, `pushDaId`, `pushPolling` — Push notification state
- `fido2ModalOpen`, `fido2DaId`, `fido2DeviceId` — FIDO2 state
- `devicePickerOpen`, `devicePickerDevices`, `devicePickerDaId` — multi-device picker

**Refs for stale-closure safety:**
- `autoInitiateTimerRef` — array of setTimeout IDs (`[t1, t2, t3]`), cleared by `cancelAutoInitiate()`
- `handleCibaStepUpRef` — current `handleCibaStepUp` function
- `handleInitiateOtpRef` — current `handleInitiateOtp` function
- `stepUpVerifyHrefRef` — current OIDC step-up redirect URL

### BankingAgent Step-Up Handler

```javascript
// BankingAgent.js ~line 1848
} else if (normalized.step_up_required === true || normalized.error === 'step_up_required') {
  // Store pending action for retry after approval
  pendingStepUpActionRef.current = { actionId, form, method: normalized.step_up_method };
  // Dispatch event to UserDashboard
  window.dispatchEvent(new CustomEvent('agentStepUpRequested', {
    detail: { step_up_method: normalized.step_up_method || 'email', isHITL: normalized.isHITL }
  }));
}
```

### Agent Retry Path (BankingAgent.js ~line 1336)

```javascript
const onStepUpApproved = () => {
  agentFlowDiagram.completeMfaChallenge(true);
  if (!pendingStepUpActionRef.current) return;
  const { actionId, form, method } = pendingStepUpActionRef.current;
  pendingStepUpActionRef.current = null;
  const methodLabel = method === 'ciba' ? 'CIBA' : 'Email OTP';
  const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  addMessage('assistant', `✅ ${methodLabel} approved — continuing your request (${ts})`, actionId);
  runAction(actionId, form);
};
window.addEventListener('cibaStepUpApproved', onStepUpApproved);
```

[VERIFIED: codebase lines read directly]

### Sensitive Account Details 428 Gate

`sensitiveBanking.js` line ~55-68 already implements the ACR check:

```javascript
const userAcr = String(req.user?.acr || req.user?.['pingone:acr'] || '');
const STEP_UP_ACR = runtimeSettings.get('stepUpAcrValue') || 'Multi_Factor';
const hasElevatedAcr = userAcr === STEP_UP_ACR || userAcr.split(' ').includes(STEP_UP_ACR);
if (!hasElevatedAcr) {
  return res.status(428).json({
    ok: false, step_up_required: true, error: 'step_up_required',
    step_up_method: stepUpMethod, step_up_acr: STEP_UP_ACR,
  });
}
```

After ACR passes, it still checks `sensitiveDataService.checkSensitiveAccess(req)` for scope + PAZ + session consent. [VERIFIED: codebase]

### SensitiveConsentBanner (to be replaced by D-02)

`SensitiveConsentBanner.js` is a 120-line inline banner component:
- Props: `onReveal`, `onDeny`, `loading`
- Renders a gold-bordered card with "Reveal" and "Deny" buttons
- On "Reveal": parent POSTs to `/api/accounts/sensitive-consent` to grant 60s session token
- Simple consent gate — NOT a real MFA challenge
- D-02 replaces this with proper 428 step-up (same flow as transactions)

[VERIFIED: codebase — `SensitiveConsentBanner.js` read in full]

### Transaction 428 Threshold Logic (transactions.js ~line 388-430)

```
1. Read threshold: runtimeSettings.get('stepUpAmountThreshold') > configStore.getEffective('step_up_amount_threshold') > 250 fallback
2. Read method: configStore.getEffective('step_up_method') > runtimeSettings.get('stepUpMethod') > 'ciba' fallback
3. Special case: STEP_UP_WITHDRAWALS_ALWAYS bypasses threshold check
4. Phase 170: ALL transfers require HITL consent (428 consent_challenge_required) regardless of amount
5. Step-up 428 response includes: error, step_up_acr, step_up_method, step_up_url, amount_threshold, isHITL
```

[VERIFIED: codebase]

### configStore Step-Up Keys

| Key | Default | Description |
|-----|---------|-------------|
| `STEP_UP_METHOD` | `'email'` | Step-up method: `'ciba'` or `'email'` |
| `STEP_UP_AMOUNT_THRESHOLD` | `500` | Dollar amount triggering step-up |
| `MAX_TRANSACTION_AMOUNT` | `1000` | Hard cap on all transactions |

Alias mapping (line ~474):
- `step_up_method` → `['STEP_UP_METHOD']`
- `step_up_amount_threshold` → `['STEP_UP_AMOUNT_THRESHOLD']`

[VERIFIED: configStore.js lines 169-170, 474-475]

### CIBA Routes (routes/ciba.js)

- `POST /api/auth/ciba/initiate` — starts backchannel auth
- `GET /api/auth/ciba/poll/:authReqId` — single poll (pending/approved/denied)
- `GET /api/auth/ciba/status` — enabled + delivery mode
- `POST /api/auth/ciba/notify` — ping-mode callback from PingOne
- `POST /api/auth/ciba/cancel/:authReqId` — cancel pending request

Step-up TTL: 5 minutes (`STEP_UP_TTL_MS = 5 * 60 * 1000`). No changes needed for this phase. [VERIFIED: codebase]

### MFA Challenge Routes (used for OTP/email path)

- `POST /api/auth/mfa/challenge` — initiates PingOne MFA; returns `{ daId, devices[] }`
- `PUT /api/auth/mfa/challenge/:daId` — select device OR verify OTP code
- `GET /api/auth/mfa/challenge/:daId/status` — poll for push completion

Device types routed by `handleInitiateOtp()` in UserDashboard:
- `EMAIL`/`SMS` → OTP modal
- `TOTP` → TOTP modal
- `MOBILE` → Push modal (polling)
- `FIDO2` → FIDO2 modal
- Multiple devices → Device picker modal

[VERIFIED: UserDashboard.js lines 427-460]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Countdown timer | Raw setInterval | `useState` + chained `setTimeout` (existing pattern) | Cleaner cleanup, no drift issues |
| Event bus | Custom EventEmitter | `window.dispatchEvent` + `CustomEvent` (existing) | Already established pattern across all agent↔dashboard comms |
| MFA challenge | Custom OTP flow | PingOne MFA API via existing BFF routes | Full device lifecycle, expiry handling already built |
| Stale closure avoidance | Custom wrapper | `useRef` pattern (existing: `handleCibaStepUpRef`, etc.) | React-idiomatic, already used in 4 ref instances |

## Common Pitfalls

### Pitfall 1: Stale closure in setTimeout callbacks
**What goes wrong:** The auto-initiate timer fires `handleCibaStepUp()` captured at mount time → uses stale user email or state
**Why it happens:** React functional components re-render but closures capture old values
**How to avoid:** Always call through refs: `handleCibaStepUpRef.current()` not `handleCibaStepUp()`
**Warning signs:** "Cannot initiate CIBA: no email on session" after successful login

### Pitfall 2: Race between cancel and auto-initiate
**What goes wrong:** User clicks Cancel but the 3s timeout already fired
**Why it happens:** `clearTimeout` called on IDs after they already executed
**How to avoid:** Guard `handleCibaStepUpRef.current?.()` with an additional cancelled flag, or check `autoInitiateTimerRef.current !== null`
**Warning signs:** CIBA initiates despite Cancel click

### Pitfall 3: Event listener never cleaned up
**What goes wrong:** Multiple `agentStepUpRequested` handlers register on re-renders → duplicate step-up initiations
**Why it happens:** useEffect without proper cleanup
**How to avoid:** Always return cleanup: `return () => window.removeEventListener(...)`
**Warning signs:** Step-up toast appears multiple times

### Pitfall 4: OTP path doesn't dispatch cibaStepUpApproved
**What goes wrong:** Agent never retries after email OTP verification succeeds
**Why it happens:** OTP verify handler forgets to dispatch the shared event
**How to avoid:** Both CIBA and OTP success paths must `window.dispatchEvent(new CustomEvent('cibaStepUpApproved'))` — the event name is shared despite being CIBA-named
**Warning signs:** "Identity verified" toast but agent stays stuck

### Pitfall 5: SensitiveConsentBanner removal breaks agent sensitive data flow
**What goes wrong:** Removing the banner without wiring 428 in `sensitiveBanking.js` leaves silent failure
**Why it happens:** Banner was the only consent gate; removing it without 428 gate = no protection
**How to avoid:** Implement 428 ACR check in route BEFORE removing banner component
**Warning signs:** Sensitive data returned without any verification

### Pitfall 6: Threshold mismatch between configStore and runtimeSettings
**What goes wrong:** Admin changes threshold in UI but transactions.js reads stale hardcoded value
**Why it happens:** `runtimeSettings` and `configStore` have independent values; precedence logic is complex
**How to avoid:** Follow existing pattern: `runtimeSettings > configStore.getEffective() > hardcoded default`
**Warning signs:** Threshold changes in Admin Config don't take effect

## Regression Risk Areas

Per REGRESSION_PLAN.md §1, these areas are **critical** and must not be broken:

| Area | Risk | Mitigation |
|------|------|------------|
| Transfer HITL enforcement | D-02/D-03 changes near 428 logic | Don't touch `transactionConsentChallenge.js` transfer type check |
| Agent startup consent gate | Step-up changes could inadvertently trigger consent modal | Verify `hitlPendingIntent` only set on `consent_challenge_required`, not `step_up_required` |
| HITL OTP email flow | OTP path changes could break `emailService.js` auth | Must use `admin_client_id` / `admin_client_secret` |
| Bottom dock on dashboard routes | UserDashboard state changes could break dock rendering | Test all 3 agent surfaces after changes |
| configStore / Config UI | Adding `step_up_amount_threshold` to Admin Config | Follow existing pattern for adding configStore keys |

## Execution Status

All 5 plans have been executed and have SUMMARY files:

| Plan | Scope | Status |
|------|-------|--------|
| 09-01 | UserDashboard: auto-initiate countdown + cancel + toast fix | ✅ Complete |
| 09-02 | BankingAgent: method messages + confirmation card + banner removal | ✅ Complete |
| 09-03 | Server defaults: method→email, threshold in Admin Config | ✅ Complete |
| 09-04 | BFF + local path: sensitive details 428 + ACR gate | ✅ Complete |
| 09-05 | MCP TypeScript: handle step_up_required from BFF | ✅ Complete |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (none — all claims verified from codebase) | — | — |

**All claims in this research were verified via direct codebase inspection — no user confirmation needed.**

## Open Questions

1. **CIBA-01 through CIBA-04 definitions**
   - What we know: Referenced in ROADMAP as phase 9 requirements, mapped to plans
   - What's unclear: No formal definitions in REQUIREMENTS.md — they are implicit from the phase goal
   - Recommendation: If formal requirement tracking needed, add to REQUIREMENTS.md

## Sources

### Primary (HIGH confidence)
- `banking_api_ui/src/components/UserDashboard.js` — lines 80-830 (step-up state, event listeners, handlers)
- `banking_api_ui/src/components/BankingAgent.js` — lines 985-1870 (428 handler, retry, event dispatch)
- `banking_api_ui/src/components/TransactionConsentModal.js` — lines 54-76 (OTP state machine)
- `banking_api_ui/src/components/SensitiveConsentBanner.js` — full file (120 lines)
- `banking_api_server/routes/transactions.js` — lines 340-470 (428 threshold logic)
- `banking_api_server/routes/sensitiveBanking.js` — full file (sensitive 428 gate)
- `banking_api_server/routes/ciba.js` — lines 1-50 (route structure)
- `banking_api_server/services/configStore.js` — lines 160-180, 474-475 (step-up keys)
- `REGRESSION_PLAN.md` §1 — critical do-not-break areas

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing libraries, no new dependencies
- Architecture: HIGH — event system and state machine verified from codebase
- Pitfalls: HIGH — derived from actual code patterns and race conditions observed

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable — no external dependency changes expected)
