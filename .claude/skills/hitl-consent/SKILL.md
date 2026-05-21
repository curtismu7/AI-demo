---
name: hitl-consent
description: 'Human-in-the-Loop consent and transaction approval patterns for Super Banking. USE FOR: Phase 170 transfer consent enforcement, 428 status code on missing consentChallengeId, transactionConsentChallenge service, createChallenge/confirmChallenge/verifyOtp/verifyAndConsume flow, hitl_consent_mfa_mode enum flag (onetime/device_picker/homegrown), PingOne one-time OTP path (initiateOneTimeOtp/verifyOneTimeOtp), PingOne device-picker MFA path (initiateDeviceAuth/submitOtp), confirm_threshold_usd, transfer-type-always-requires-consent rule, OTP HMAC hashing + timing-safe compare, AgentConsentModal across all three agent UI modes, MCP Gateway → POST /challenges in demo_hitl_service, /challenges/:id/respond approve/deny, mcpToolAuthorizationService confirm vs step-up gates. DO NOT USE FOR: PingOne MFA step-up itself (use oauth-pingone); session storage internals beyond req.session.txConsentChallenges (use bff-sessions); MCP tool registration (use mcp-server).'
argument-hint: 'Describe the HITL, consent, or transaction approval question'
---

# Human-in-the-Loop Consent — Super Banking demo

> **Emoji rule:** only `⚠️`, `✅`, `❌` allowed anywhere in this repo (skills, code, UI, docs). No other emojis. See `regression-guard` skill for the project-wide rule.

## Two HITL surfaces — keep them straight

This repo has **two** HITL paths that look similar but serve different callers:

1. **Direct UI transactions** — user clicks Transfer in the dashboard. Enforced by `demo_api_server/services/transactionConsentChallenge.js` against the user's express-session. Returns **428 Precondition Required** when consent is missing. **Phase 170.**
2. **MCP/agent-initiated transactions** — agent calls a banking tool. The MCP Gateway / PingAuthorize returns an INDETERMINATE / HITL obligation, which creates a challenge in the standalone `demo_hitl_service` (port 3009). Dashboard or webhook approves.

When the user says "HITL," ask which path. They reuse concepts (challenge id, threshold, approval) but the implementations are deliberately separate so each one can fail/scale independently.

---

## Path 1 — Direct UI transactions (Phase 170)

### The contract

`POST /api/transactions` with a transaction body. The BFF returns:

- **200** if no consent is needed (e.g., admin, or deposit/withdraw under the threshold) and the transaction executes.
- **428 Precondition Required** if HITL is required and no `consentChallengeId` was provided. The 428 body echoes the original transaction fields so the UI can replay them after consent.
- **4xx** if the consent challenge was provided but failed verification (snapshot mismatch, expired, OTP not verified).

### The transfer-always-requires-consent rule (REGRESSION_PLAN §1)

In `services/transactionConsentChallenge.js`, `createChallenge` has this load-bearing check:

```js
// Transfer type ALWAYS requires consent challenge regardless of amount (Phase 170)
if (v.normalized.type === 'transfer') {
  console.log(`[ConsentChallenge] TRANSFER requires HITL: ...`);
  // Skip amount check — proceed directly to challenge creation
} else if (v.normalized.amount <= getConfirmThreshold()) {
  return { ok: false, status: 400, ... };
}
```

**Do not** revert this. Do not move the `transfer` check after the amount threshold check. Phase 170 made transfers always require HITL regardless of amount; deposits/withdrawals still gate on `confirm_threshold_usd` (default `$250`, override via `CONFIRM_THRESHOLD_USD`).

And in `routes/transactions.js`:

```js
if (!hitlEnabled) {
  // ff_hitl_enabled=false — skipped by feature flag
} else if (!req.body.consentChallengeId) {
  return res.status(428).json({ ...body, fromAccountId, toAccountId, amount, type });
} else {
  const consumed = txConsent.verifyAndConsumeChallenge(req, req.body.consentChallengeId, req.body);
  if (!consumed.ok) return res.status(consumed.status).json(consumed.json);
  // proceed
}
```

The 428 enforcement is the second half of the contract. Removing it (or reverting to a 400) breaks the React UI's modal flow.

### MFA modes — `hitl_consent_mfa_mode` enum

The consent flow supports three verification methods, controlled by the **`hitl_consent_mfa_mode`** configStore enum (set via Feature Flags page in the admin UI):

| Mode | Behaviour | When to use |
|---|---|---|
| `onetime` **(default)** | PingOne sends OTP to the user's email or phone from their P1 account. No device enrollment needed. | Any user with email or phone on their PingOne record. |
| `device_picker` | Full PingOne MFA: device picker → OTP/push/FIDO2. Amount-gated by `confirm_stepup_threshold_usd`. | Users with enrolled MFA devices. |
| `homegrown` | BFF-generated OTP, delivered via the app's own email service. | Fallback / no PingOne MFA configured. |

Read the flag in `confirmChallenge`:
```js
const mfaMode = configStore.getEffective('hitl_consent_mfa_mode') || 'onetime';
```

Priority rule: `device_picker` only fires when `mfaMode === 'device_picker' && challengeAmount >= stepUpThreshold`. If the amount is below the step-up threshold, it falls through to homegrown even in device_picker mode. `onetime` has no amount gate.

### Complete consent flow (4 + 1 steps)

State lives in `req.session.txConsentChallenges` keyed by challenge id.

#### Homegrown OTP path (mode = `homegrown`)

| Step | Endpoint | Function | Resulting status |
|---|---|---|---|
| 1 | `POST /consent-challenge` | `createChallenge` | `pending` |
| 2 | `POST /consent-challenge/:id/confirm` | `sendOtp` (emails OTP) | `otp_pending` |
| 3 | `POST /consent-challenge/:id/verify-otp` | `verifyOtp` | `confirmed` |
| 4 | `POST /transactions` with `consentChallengeId` | `verifyAndConsumeChallenge` | executes, challenge consumed |

#### PingOne one-time OTP path (mode = `onetime`)

| Step | Endpoint | Function | Resulting status |
|---|---|---|---|
| 1 | `POST /consent-challenge` | `createChallenge` | `pending` |
| 2 | `POST /consent-challenge/:id/confirm` | `confirmChallenge` → `getPingOneUserContact` → `initiateOneTimeOtp` | `otp_pending` |
| 2a (no contact) | `POST /consent-challenge/:id/confirm` returns `needsContact:true` | `confirmChallenge` | still `pending`, `pendingContact:true` |
| 2b (user provides contact) | `POST /consent-challenge/:id/confirm-contact` | `confirmOnetimeContact` | `otp_pending` |
| 3 | `POST /consent-challenge/:id/verify-otp` (route dispatches to `verifyMfa`) | `verifyMfa` → `verifyOneTimeOtp` | `confirmed` |
| 4 | `POST /transactions` with `consentChallengeId` | `verifyAndConsumeChallenge` | executes |

Session markers set by `confirmChallenge` for one-time path:
- `ch.oneTimePath = true` — signals all downstream code to use `verifyOneTimeOtp`
- `ch.pendingContact = true` — set when no contact found; cleared after `confirmOnetimeContact`
- `ch.daId` — PingOne `deviceAuthentications` transaction id
- `ch.otpExpiresAt` — expiry from PingOne response

`getChallengePath(req, challengeId)` returns `'onetime'` when `ch.oneTimePath === true`. The verify-otp route checks this to dispatch to `verifyMfa` instead of `verifyOtp`.

**`maskedContact`** — PingOne returns a masked version of the contact address (e.g., `us**@example.com`) in the one-time OTP initiation response: `resp._embedded.devices[0][type.toLowerCase()]`. The confirm endpoint includes it in the response body so the UI can display "A code was sent to us**@example.com" without ever exposing the full address.

#### PingOne device-picker path (mode = `device_picker`, amount >= threshold)

| Step | Endpoint | Function | Resulting status |
|---|---|---|---|
| 1 | `POST /consent-challenge` | `createChallenge` | `pending` |
| 2 | `POST /consent-challenge/:id/confirm` | `confirmChallenge` → `initiateDeviceAuth` | `mfa_pending`, returns `mfaRequired:true + devices[]` |
| 3 | `POST /consent-challenge/:id/select-device` | `selectDevice` → `submitOtp` (PingOne) | `otp_pending` |
| 4 | `POST /consent-challenge/:id/verify-otp` (route dispatches to `verifyMfa`) | `verifyMfa` | `confirmed` |
| 5 | `POST /transactions` with `consentChallengeId` | `verifyAndConsumeChallenge` | executes |

Session markers set by `confirmChallenge` for device-picker path:
- `ch.mfaPath = true` — signals downstream to use `submitOtp`/`submitFido2Assertion`
- `ch.daId` — PingOne `deviceAuthentications` id
- `ch.devices[]` — enrolled device list returned to UI for selection

### `confirmChallenge` dispatch logic (internal)

```js
const mfaMode = configStore.getEffective('hitl_consent_mfa_mode') || 'onetime';

// Device picker: only if mode=device_picker AND amount >= step-up threshold
if (mfaMode === 'device_picker' && challengeAmount >= stepUpThreshold) {
  // calls mfaService.initiateDeviceAuth
}
// One-time OTP: default path, no amount gate
if (mfaMode === 'onetime') {
  // calls mfaService.getPingOneUserContact → mfaService.initiateOneTimeOtp
  // if no contact: returns { ok:true, needsContact:true }
}
// Homegrown (fallthrough): mode=homegrown or device_picker below threshold
// calls sendOtp (BFF email OTP)
```

### OTP storage rules (security)

- The raw 6-digit OTP is **never** stored in the session. Only `hashOtp(otp, salt)` (HMAC-SHA256 with a per-challenge random salt) is.
- Comparison uses `crypto.timingSafeEqual` via `safeEqual` to avoid timing oracles.
- PingOne paths (`onetime`, `device_picker`) do not store any OTP in session — PingOne owns the OTP. The session only stores the `daId` and expiry.
- If you add a new OTP-like flow, copy the homegrown hash+timingSafeEqual pattern for BFF-owned codes.

### Demo bypass code

OTP `123123` bypasses PingOne verification in both `verifyMfa` paths (onetime and device_picker) — promotes the challenge to `confirmed` without calling PingOne. This is intentional for demos without a live PingOne environment. Never gate real security on its absence.

### Snapshot equality

`verifyAndConsumeChallenge` compares the POST body against the snapshot taken at `createChallenge` time. Fields compared: `type`, `amount` (rounded to 2dp), `fromAccountId`, `toAccountId`, `description.trim()`. If anything drifted between consent and execution, the challenge is **rejected** rather than executed — even by one cent. This is intentional; do not loosen the check.

### Timing constants (in `transactionConsentChallenge.js`)

- `CHALLENGE_TTL_MS = 10 minutes` — time to confirm
- `CONFIRMED_TTL_MS = 5 minutes` — time to consume after OTP verified
- `OTP_TTL_MS = 5 minutes` — time to enter the code
- `OTP_MAX_ATTEMPTS = 3` — lockout
- `MAX_PENDING_PER_SESSION = 8`

### Feature flags

| Flag | Type | Default | Purpose |
|---|---|---|---|
| `ff_hitl_enabled` | boolean | `true` | When `false`, skips all 428 enforcement |
| `hitl_consent_mfa_mode` | enum | `onetime` | Controls OTP delivery method: `onetime` / `device_picker` / `homegrown` |
| `confirm_threshold_usd` | configStore | `250` | Minimum amount for withdrawal/deposit to require HITL |
| `confirm_stepup_threshold_usd` | configStore | `500` | Minimum amount for device_picker MFA mode to activate |

---

## Path 2 — MCP / agent-initiated (demo_hitl_service)

Standalone Express service on port 3009. Source: `demo_hitl_service/src/`.

### REST contract

| Method | Path | Caller | Purpose |
|---|---|---|---|
| `POST` | `/challenges` | MCP Gateway | Create a HITL challenge when PingAuthorize returns INDETERMINATE/HITL |
| `GET` | `/challenges/:id` | MCP Gateway | Poll for the human's decision |
| `POST` | `/challenges/:id/respond` | Dashboard / webhook | Human approves or denies |
| `GET` | `/challenges` | Dashboard | List pending challenges |
| `GET` | `/health` | Liveness probe | — |

### Why it's separate

- MCP Gateway is an internal service call — no user token required to *create* a challenge.
- Approval requires a *user* token from the OLB dashboard session.
- Extracting the service lets it scale independently and lets the BFF stay focused on user-driven transactions.

### Notifications

`notifyUser(challenge, userEmail)` is fire-and-forget — wrapped in `.catch(...)` so a failed notification doesn't fail the challenge creation. If you add a new notifier (Slack, SMS, etc.), keep the same fire-and-forget pattern. Notifications are nice-to-have, not load-bearing.

---

## Two gates: confirm vs step-up (mcpToolAuthorizationService)

Bug log 2026-05-07 fixed a real incident here. `services/mcpToolAuthorizationService.js` evaluates the `evaluateMcpFirstToolGate` for agent-initiated tool calls. There are **two** independent gates:

- **`needsStepUp`** → user is sent to PingOne MFA (step-up authentication). Suppressed when `acrLooksStrong(acr)` is true (user already MFA'd this session).
- **`needsConfirm`** → user is shown the HITL consent modal. Must **also** check `&& !acrLooksStrong(acr)`. Forgetting this guard causes a confirm dialog to fire **immediately after** MFA step-up — the impossible loop bug.

If you touch either gate, make sure both check ACR. They are independent rules; one suppression doesn't imply the other.

The `ff_authorize_mcp_first_tool` flag is **no longer consulted inside `evaluateMcpFirstToolGate`** (the gate runs unconditionally — see bug log 2026-05-07). The flag itself still exists and is read by `routes/authorize.js`, `routes/authorizeConfig.js`, `routes/featureFlags.js`, `services/sensitiveDataService.js`, and elsewhere in `mcpToolAuthorizationService.js` for related surfaces — do not delete the flag wholesale. Don't reintroduce a flag check inside the first-tool gate itself; if you need to disable that gate, do it at the route level with a logged explanation.

---

## AgentConsentModal — unified across all three agent UI modes (bug log 2026-05-06)

Three agent UI placements:
1. Floating FAB
2. Middle column inline
3. Bottom dock

All three **must** use `AgentConsentModal` (portal-based draggable modal) for HITL consent. The earlier `HitlInlineCard` component was removed because it diverged in features (no drag, missing fields) from the float-mode modal.

When adding new agent UI placements, route HITL through `AgentConsentModal`, full stop. `DraggableModal` → `createPortal` works correctly in every placement context.

---

## TransactionConsentModal — UI state machine for direct-UI transactions

`demo_api_ui/src/components/TransactionConsentModal.tsx` handles the multi-step consent UI. Its state machine:

```
idle → confirming → (mfaRequired) → device_picker_step → otp_step → done
                 → (needsContact) → contact_step → otp_step → done
                 → (otpSent)      → otp_step → done
```

Key state fields:
- `mfaStep` — device picker is showing
- `contactStep` — contact collection is showing (user has no email/phone in P1)
- `otpStep` — OTP input is showing
- `maskedContact` — PingOne-masked address string (e.g., `us**@example.com`), shown in OTP panel lead copy
- `contactInput` — raw user-typed contact before submission

The `handleConfirm` function dispatches on the `/confirm` response:
- `data.mfaRequired` → device picker (device_picker mode)
- `data.needsContact` → contact collection step (onetime mode, no P1 contact)
- default → OTP step (onetime mode with contact found, or homegrown mode)

`handleSubmitContact` determines type by regex (`/^\+?\d[\d\s\-().]{6,}$/` = phone) and POSTs to `confirm-contact`. On success, sets `maskedContact` and advances to `otpStep`.

---

## Test patterns

Critical tests for this area:

```bash
# From demo_api_server/:
npx jest transactionConsentChallenge hitlRoute.regression hitlRoute.integration
# Output: 44 tests, all passing
```

- **regression**: `configStore` is mocked, returns `{ ff_hitl_enabled: 'true', confirm_threshold_usd: '500' }` as constants. Tests logic in isolation.
- **integration**: real `configStore` reads `.env`. Verifies the route under whatever flags the demo machine actually has.

Add a regression+integration test pair when you add any new flag-driven HITL branch.

### Jest `resetModules` pattern for configStore spy tests

When a test needs to spy on `configStore.getEffective` with a value that reaches a freshly-required `transactionConsentChallenge.js`, use the `freshRequires()` pattern:

```js
function freshRequires() {
  jest.mock('../../services/mfaService', () => ({
    initiateDeviceAuth: jest.fn(),
    initiateOneTimeOtp: jest.fn(),
    verifyOneTimeOtp: jest.fn(),
    getPingOneUserContact: jest.fn(),
    // ... all methods
  }));
  jest.mock('../../data/store', () => ({ /* ... */ }));
  const txConsentFresh = require('../../services/transactionConsentChallenge');
  const mfaServiceFresh = require('../../services/mfaService');
  const configStoreFresh = require('../../services/configStore');
  return { txConsentFresh, mfaServiceFresh, configStoreFresh };
}
```

`jest.resetModules()` must run in `afterEach` for this to work. All `jest.mock` factory definitions in the file must include the **full** method set — a partial mock factory in one `freshRequires()` block that's missing methods added later causes test failures that look like "function is not a function".

The full critical suite (44 tests):
```bash
npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration transactionConsentChallenge
```

---

## Common failure modes

| Symptom | Most likely cause |
|---|---|
| Transfer goes through without showing the consent modal | `transfer` check moved after the amount threshold in `createChallenge`; or `ff_hitl_enabled=false`; or `consentChallengeId` provided but route didn't 428 on missing |
| 428 response but UI doesn't show modal | UI fetch layer not propagating the 428 body to the agent component; check `AgentConsentModal` mount path |
| Confirm modal appears right after MFA step-up | `needsConfirm` missing `!acrLooksStrong(acr)` guard (bug log 2026-05-07) |
| OTP "doesn't match" even when typed correctly | Salt regeneration mid-flow, or hash comparison not using `timingSafeEqual` (don't replace it with `===`) |
| Challenge expires mid-flow on a slow demo | `OTP_TTL_MS` / `CHALLENGE_TTL_MS` — usually a demo-pacing issue, not a bug |
| MCP-initiated HITL never resolves | `demo_hitl_service` not running on 3009; or MCP Gateway polling the wrong URL; or `notifyUser` swallowed an error silently (check logs) |
| Inline/dock agent HITL different from float | `HitlInlineCard` reintroduced somewhere — all three must use `AgentConsentModal` |
| `needsContact:true` but UI never shows contact step | Check `TransactionConsentModal.handleConfirm` branches on `data.needsContact` and `contactStep` state |
| One-time OTP "PingOne call failed" | `initiateOneTimeOtp` in `mfaService.js`: verify user token is being passed (not null), and PingOne user has at minimum an email or mobilePhone. Check logs for `[mfaService]` entries. |
| `maskedContact` shows `undefined` | `_embedded.devices[0][type.toLowerCase()]` access — check the structure of PingOne's `deviceAuthentications` response for one-time OTP flows |
| Device picker not firing | Check `hitl_consent_mfa_mode=device_picker` AND `amount >= confirm_stepup_threshold_usd` AND user token present in session |

---

## See Also

- [pingone-mfa skill](../pingone-mfa/SKILL.md) — `initiateOneTimeOtp`, `verifyOneTimeOtp`, `initiateDeviceAuth`, `submitOtp`, worker token rules, one-time OTP reference
- [oauth-pingone skill](../oauth-pingone/SKILL.md) — PingOne MFA step-up flow, `acr`/`amr` claims, PingAuthorize mechanics
- [bff-sessions skill](../bff-sessions/SKILL.md) — session storage internals (where `txConsentChallenges` lives)
- [mcp-server skill](../mcp-server/SKILL.md) — MCP tool registration and scope checks
- [pingone-api-calls skill](../pingone-api-calls/SKILL.md) — Management API calls that may need HITL gating
- [regression-guard skill](../regression-guard/SKILL.md) — REGRESSION_PLAN §1 entries for transfer-HITL, demo-controls diagnose
- [typescript-banking skill](../typescript-banking/SKILL.md) — TS/JS style for consent-service code
