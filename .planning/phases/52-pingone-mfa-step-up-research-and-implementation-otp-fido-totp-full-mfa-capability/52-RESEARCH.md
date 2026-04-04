# Phase 52 — Research Findings

**Date:** 2026-04-04  
**Sources:** PingOne MFA API Reference (live docs), codebase audit

---

## §1 — API Endpoint Correction (CONTEXT.md vs Reality)

The locked decision D-01 referenced endpoint paths that differ from the actual PingOne API. The correct paths are:

| CONTEXT.md (intent) | Actual PingOne API | Notes |
|---|---|---|
| `GET /environments/{envId}/users/{userId}/mfaDevices` | `GET {{apiPath}}/environments/{{envID}}/users/{{userID}}/devices` | Path is `/devices` not `/mfaDevices` |
| `POST /environments/{envId}/users/{userId}/authentication` | `POST {{authPath}}/{{envID}}/deviceAuthentications` | At **auth server** (`auth.pingone.com`), not mgmt server; top-level endpoint, not nested under user |
| `PUT /environments/{envId}/users/{userId}/authentication/{authId}` | `PUT {{authPath}}/{{envID}}/deviceAuthentications/{{daId}}` | Same auth server pattern |

**Architectural implication:** `deviceAuthentications` lives at `authPath` and requires the **user's access token** (Bearer), NOT the worker/management token. Device listing at `apiPath` uses the **worker token**.

---

## §2 — Device Authentication Flow (`authPath`)

**Initiate:**
```
POST https://auth.pingone.{region}/{envID}/deviceAuthentications
Authorization: Bearer {userAccessToken}   ← req.session.oauthTokens.accessToken
Content-Type: application/json

{
  "user": { "id": "{userId}" },
  "policy": { "id": "{mfaPolicyId}" }
}
```

Response:
```json
{
  "id": "{daId}",
  "status": "DEVICE_SELECTION_REQUIRED",
  "_embedded": {
    "devices": [
      { "id": "{deviceId}", "type": "EMAIL", "nickname": "...", "status": "ACTIVE" }
    ]
  }
}
```

**Select device:**
```
PUT https://auth.pingone.{region}/{envID}/deviceAuthentications/{daId}
Authorization: Bearer {userAccessToken}

{ "selectedDevice": { "id": "{deviceId}" } }
```

Response: `{ "status": "OTP_REQUIRED" | "ASSERTION_REQUIRED" | "PUSH_CONFIRMATION_REQUIRED" }`

**Submit OTP/TOTP:**
```
PUT .../deviceAuthentications/{daId}
{ "selectedDevice": { "id": "{deviceId}", "otp": "123456" } }
```
Response: `{ "status": "COMPLETED" }` → success

**Cancel / change device:**
```
PUT .../deviceAuthentications/{daId}
{ "reason": "CHANGE_DEVICE" }
```

---

## §3 — MFA Device Listing (`apiPath` + worker token)

```
GET https://api.pingone.{region}/v1/environments/{envID}/users/{userId}/devices
Authorization: Bearer {workerToken}   ← getManagementToken() pattern
```

Response: array of devices with:
- `id` — device UUID
- `type` — `EMAIL` | `SMS` | `TOTP` | `FIDO2` | `MOBILE` | `OATH_TOKEN`
- `status` — `ACTIVE` | `ACTIVATION_REQUIRED`
- `nickname` — user-assigned name
- `lock.status`, `block.status` — compliance flags

Filter active only: `?filter=(status eq "ACTIVE")`

**Note:** The device list from `GET /devices` is distinct from the `_embedded.devices` returned during initiation. The initiation call also returns available devices. For the demo, prefer the initiation response directly (avoids the extra Management API call and worker token requirement for listing).

---

## §4 — Status State Machine

```
POST /deviceAuthentications
  → DEVICE_SELECTION_REQUIRED  (devices[] available)
      ↓ PUT selectedDevice.id
  → OTP_REQUIRED               (EMAIL, SMS, TOTP)
      ↓ PUT selectedDevice.otp
  → COMPLETED ✓

  → ASSERTION_REQUIRED         (FIDO2)
      ↓ UI: navigator.credentials.get(publicKeyCredentialRequestOptions)
      ↓ PUT assertion
  → COMPLETED ✓

  → PUSH_CONFIRMATION_REQUIRED (MOBILE push)
      ↓ poll GET status
  → COMPLETED ✓ | PUSH_CONFIRMATION_TIMED_OUT ✗

  → FAILED ✗
```

---

## §5 — FIDO2 WebAuthn Relay Pattern

FIDO2 requires browser-side WebAuthn API. BFF cannot complete assertion without the browser.

Flow:
1. BFF initiates → status `ASSERTION_REQUIRED` + response body contains `publicKeyCredentialRequestOptions` (JSON string)
2. UI: `const credential = await navigator.credentials.get(JSON.parse(publicKeyCredentialRequestOptions))`
3. UI formats assertion as JSON and POSTs to BFF
4. BFF: `PUT /deviceAuthentications/{daId}` with the assertion payload
5. `origin` in the assertion must match the relying party domain (configured in PingOne FIDO2 Policy)

**Implementation:** BFF route exposes `GET /api/auth/mfa/challenge/:daId/status` which returns the `publicKeyCredentialRequestOptions` for the UI to consume. UI component `Fido2Challenge.js` handles steps 2–4.

---

## §6 — TOTP + Push Flows

**TOTP:**
- User selects TOTP device → `OTP_REQUIRED` (same as email OTP)
- User opens authenticator app, enters 6-digit code
- `PUT /deviceAuthentications/{daId}` with `{ selectedDevice: { id, otp: totpCode } }`
- Same API path as email OTP — only the UI prompt changes

**Push:**
- User selects push device (MOBILE type) → `PUSH_CONFIRMATION_REQUIRED`
- Notification sent to PingOne mobile app
- Client polls `GET /api/auth/mfa/challenge/:daId/status` every 3 seconds
- Status transitions: `PUSH_CONFIRMATION_REQUIRED` → `COMPLETED` | `PUSH_CONFIRMATION_TIMED_OUT`
- Rate limit: MFA Polling 500/s — 3-second polling interval is safe

---

## §7 — Required Tokens

| Operation | Token Type | Source |
|---|---|---|
| `POST /deviceAuthentications` | User access token | `req.session.oauthTokens.accessToken` |
| `PUT /deviceAuthentications/{daId}` | User access token | Same |
| `GET /environments/{envId}/users/{userId}/devices` | Worker token | `getManagementToken()` |

---

## §8 — Rate Limits

- MFA API (initiate, select, submit): 100 req/second
- MFA Polling (GET status): 500 req/second
- 3-second polling interval is safe for push

---

## §9 — Required Configuration

New env var needed for the MFA policy ID:
- `PINGONE_MFA_POLICY_ID` — PingOne environment's MFA Device Policy ID
- Find in: PingOne Admin Console → Security → MFA Policies → copy default policy ID
- **Required** for `POST /deviceAuthentications` body `policy.id`
- Must be added to `.env.example` and Vercel environment variables

---

## §10 — Existing Code Audit

### ✅ Silent SSO Toast (D-04) — ALREADY DONE

`oauthUser.js` L461-466: timing-based detection (`loginElapsedMs < 2000ms`) → sets `silentSso` flag  
`oauthUser.js` L544: appends `&sso_silent=1` to redirect  
`App.js` L300-316: reads param, removes from URL, fires `notifyInfo` toast  
**No new code needed.** D-04 is functionally complete. Plan 52-03 includes a verify step.

### ✅ CIBA Event Dispatch — ALREADY DONE

`UserDashboard.js` L471: dispatches `cibaStepUpApproved` when `agentTriggeredStepUp` and CIBA poll approved  
`BankingAgent.js` L1068: listens for `cibaStepUpApproved`, re-fires pending action  
**Gap:** `ciba.js` poll route does NOT set `req.session.stepUpVerified = true` on approval → re-fired tool call still blocked  
**Fix (52-02):** Add single line `req.session.stepUpVerified = true;` before `req.session.save()` in ciba.js poll route approval branch

### ⚠️ Step-Up Threshold Fallback Bug

`mcpLocalTools.js` L50: `const threshold = runtimeSettings.get('stepUpAmountThreshold') || 250;`  
If threshold is set to `0`, JavaScript's `||` evaluates `0 || 250 = 250` — default is **never** 0.  
**Fix (52-02):** Change `|| 250` → `?? 0` (nullish coalescing)

### ✅ SecuritySettings.js min Constraint

`SecuritySettings.js` FIELD_META: `stepUpAmountThreshold.min: 1` blocks entering 0 in Admin UI.  
**Fix (52-02):** Change `min: 1` → `min: 0`; update description text.

### 🔄 Custom OTP vs PingOne MFA

Current `initiate-otp` / `verify-otp` in `oauthUser.js` uses BFF-custom OTP (crypto.randomInt + emailService).  
Phase 52 replaces this path in `UserDashboard.js` — UI calls new `/api/auth/mfa/challenge` routes instead.  
The old `/api/auth/initiate-otp` and `/api/auth/verify-otp` routes remain in place but are no longer called from the OTP step-up modal (they may still be used for CIBA-adjacent flows — do not delete them).

---

## §11 — Architecture Decision: initiation via device list vs. direct initiation

**Two approaches:**

| Approach | Device list first | Direct initiation |
|---|---|---|
| Steps | (1) GET /devices with worker token → (2) POST /deviceAuthentications with user token → (3) select | (1) POST /deviceAuthentications with user token → returns DEVICE_SELECTION_REQUIRED with __embedded.devices |
| Worker token needed? | Yes (for step 1) | No |
| Pro | Know devices before initiating | Fewer API calls, no management token needed |
| Con | Extra management token call | Device list only available after initiation |

**Decision:** Use direct initiation. The `POST /deviceAuthentications` response at `DEVICE_SELECTION_REQUIRED` includes `_embedded.devices` — no separate device listing call needed. This avoids the management token dependency and reduces latency.

`mfaService.listMfaDevices()` remains as a utility for the device management UI (future use) but is NOT used in the step-up challenge flow.

---

## §12 — Standard Stack for mfaService.js

- Use `axios` (already in banking_api_server package.json)
- Use `configStore.getEffective()` for env vars
- Follow `cibaService.js` service module pattern (no class, exported async functions)
- Error logging: `console.error('[MFA]', ...)` prefix
