---
name: hitl-consent
description: 'Human-in-the-Loop consent and transaction approval patterns for Super Banking. USE FOR: Phase 170 transfer consent enforcement, 428 status code on missing consentChallengeId, transactionConsentChallenge service, createChallenge/sendOtp/verifyOtp/verifyAndConsume flow, ff_hitl_enabled feature flag, confirm_threshold_usd, transfer-type-always-requires-consent rule, OTP HMAC hashing + timing-safe compare, AgentConsentModal across all three agent UI modes, MCP Gateway → POST /challenges in banking_hitl_service, /challenges/:id/respond approve/deny, mcpToolAuthorizationService confirm vs step-up gates. DO NOT USE FOR: PingOne MFA step-up itself (use oauth-pingone); session storage internals beyond req.session.txConsentChallenges (use bff-sessions); MCP tool registration (use mcp-server).'
argument-hint: 'Describe the HITL, consent, or transaction approval question'
---

# Human-in-the-Loop Consent — Super Banking demo

> **Emoji rule:** only `⚠️`, `✅`, `❌` allowed anywhere in this repo (skills, code, UI, docs). No other emojis. See `regression-guard` skill for the project-wide rule.

## Two HITL surfaces — keep them straight

This repo has **two** HITL paths that look similar but serve different callers:

1. **Direct UI transactions** — user clicks Transfer in the dashboard. Enforced by `banking_api_server/services/transactionConsentChallenge.js` against the user's express-session. Returns **428 Precondition Required** when consent is missing. **Phase 170.**
2. **MCP/agent-initiated transactions** — agent calls a banking tool. The MCP Gateway / PingAuthorize returns an INDETERMINATE / HITL obligation, which creates a challenge in the standalone `banking_hitl_service` (port 3009). Dashboard or webhook approves.

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

And in `routes/transactions.js` around line ~471:

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

### The 4-step OTP flow

State lives in `req.session.txConsentChallenges` keyed by challenge id. The flow:

| Step | Endpoint | Function | Resulting status |
|---|---|---|---|
| 1 | `POST /consent-challenge` | `createChallenge` | `pending` |
| 2 | `POST /consent-challenge/:id/confirm` | `sendOtp` (async — emails OTP) | `otp_pending`, hashed OTP stored |
| 3 | `POST /consent-challenge/:id/verify-otp` | `verifyOtp` | `confirmed` |
| 4 | `POST /transactions` with `consentChallengeId` | `verifyAndConsumeChallenge` | executes, challenge consumed |

Timing constants (in the file):
- `CHALLENGE_TTL_MS = 10 minutes` — time to confirm
- `CONFIRMED_TTL_MS = 5 minutes` — time to consume after OTP verified
- `OTP_TTL_MS = 5 minutes` — time to enter the code
- `OTP_MAX_ATTEMPTS = 3` — lockout
- `MAX_PENDING_PER_SESSION = 8`

### OTP storage rules (security)

- The raw 6-digit OTP is **never** stored in the session. Only `hashOtp(otp, salt)` (HMAC-SHA256 with a per-challenge random salt) is.
- Comparison uses `crypto.timingSafeEqual` via `safeEqual` to avoid timing oracles.
- If you add a new OTP-like flow, copy this pattern — don't invent a new one.

### Snapshot equality

`verifyAndConsumeChallenge` compares the POST body against the snapshot taken at `createChallenge` time. Fields compared: `type`, `amount` (rounded to 2dp), `fromAccountId`, `toAccountId`, `description.trim()`. If anything drifted between consent and execution, the challenge is **rejected** rather than executed — even by one cent. This is intentional; do not loosen the check.

### Feature flag

`ff_hitl_enabled` (default `'true'` in `configStore`). When `false`, the 428 enforcement is skipped entirely — useful for demos that want to show the "before" state. Don't add new code paths that bypass HITL without checking this flag in the same place.

---

## Path 2 — MCP / agent-initiated (banking_hitl_service)

Standalone Express service on port 3009. Source: `banking_hitl_service/src/`.

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

## Test patterns

Critical tests for this area:

```bash
# From repo root:
npx jest hitlRoute.regression hitlRoute.integration
```

- **regression**: `configStore` is mocked, returns `{ ff_hitl_enabled: 'true', confirm_threshold_usd: '500' }` as constants. Tests logic in isolation.
- **integration**: real `configStore` reads `.env`. Verifies the route under whatever flags the demo machine actually has.

Add a regression+integration test pair when you add any new flag-driven HITL branch.

The full critical suite (43 tests):
```bash
npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration
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
| MCP-initiated HITL never resolves | `banking_hitl_service` not running on 3009; or MCP Gateway polling the wrong URL; or `notifyUser` swallowed an error silently (check logs) |
| Inline/dock agent HITL different from float | `HitlInlineCard` reintroduced somewhere — all three must use `AgentConsentModal` |

---

## See Also

- [oauth-pingone skill](../oauth-pingone/SKILL.md) — PingOne MFA step-up flow, `acr`/`amr` claims, PingAuthorize mechanics
- [bff-sessions skill](../bff-sessions/SKILL.md) — session storage internals (where `txConsentChallenges` lives)
- [mcp-server skill](../mcp-server/SKILL.md) — MCP tool registration and scope checks
- [pingone-api-calls skill](../pingone-api-calls/SKILL.md) — Management API calls that may need HITL gating
- [regression-guard skill](../regression-guard/SKILL.md) — REGRESSION_PLAN §1 entries for transfer-HITL, demo-controls diagnose
- [typescript-banking skill](../typescript-banking/SKILL.md) — TS/JS style for consent-service code
