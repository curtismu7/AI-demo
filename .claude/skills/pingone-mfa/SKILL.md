---
name: pingone-mfa
description: 'Authoritative PingOne MFA device-lifecycle guide for the Super Banking BFF. USE FOR: MFA device lifecycle (create / list / activate / order / delete / rename), worker token + MFA scope matrix (p1:read:user, p1:update:user, p1:read:device, p1:create:device, p1:update:device, p1:delete:device), device-authentication-policies API (list / by-name / create-from-template), enroll + OTP activation flows, SMS, Email, TOTP, FIDO2/passkey/WebAuthn, WhatsApp, mobile-push device types, deviceAuthentications status transitions, banking mfaService.js / routes/mfa.js / mfaStepUp.js / mfaTest.js, MFA curl debug recipe, common MFA error codes. DO NOT USE FOR: MFA during authentication — ACR / step-up / acr_values / CIBA / pi.flow / DaVinci sign-on (use oauth-pingone); generic Management API users / attributes / app registration (use pingone-api-calls); MCP server tools (use mcp-server); session/cookie custody (use bff-sessions).'
argument-hint: 'Describe the MFA device operation (e.g. enroll SMS device, list devices, create device-auth policy)'
---

# PingOne MFA — Device Lifecycle Guide
## Super Banking demo

> **Boundary.** This skill owns MFA **device** management (the things a worker
> token does against the PingOne Platform / MFA APIs). MFA *during login*
> (ACR, step-up, `acr_values`, CIBA, `pi.flow`, DaVinci) belongs to
> `oauth-pingone`. Generic Management API user CRUD belongs to
> `pingone-api-calls`.

> **Config rule (CLAUDE.md non-negotiable).** Route handlers and services read
> PingOne config via `configStore.getEffective(key)` — **never** `process.env`
> directly in a handler. `mfaService.js` resolves env id, region, worker creds
> and policy id this way.

---

## Which MFA flow to use

| Scenario | `mfaService.js` methods | Prerequisite | Reference |
|---|---|---|---|
| **One-time OTP** (default step-up) — user may not have enrolled devices | `initiateOneTimeOtp` → `verifyOneTimeOtp` | User's `email` or `mobilePhone` from PingOne user record | [reference/onetime-otp-flow.md](reference/onetime-otp-flow.md) |
| **Full PingOne MFA** — user has enrolled devices, show device picker | `initiateDeviceAuth` → `selectDevice` → `submitOtp` | User must have ACTIVE enrolled device(s) + MFA policy | [reference/device-authentications-api.md](reference/device-authentications-api.md) |
| **FIDO2 / push** — enrolled FIDO2 or mobile push device | `initiateDeviceAuth` → `selectDevice` → `submitFido2Assertion` / poll `getDeviceAuthStatus` | Enrolled FIDO2/MOBILE device | [reference/device-fido2.md](reference/device-fido2.md), [reference/device-mobile-push.md](reference/device-mobile-push.md) |

**Default choice:** one-time OTP. No enrollment friction, works for any user as long as they have an email or phone on their PingOne record.

**Shared across all flows:**
- Same two endpoints: `POST {authBase}/{envId}/deviceAuthentications` (initiate) and `POST/{daId}` (verify)
- Same token rule: **user token to initiate, worker token to verify**
- Same `_wrapError` / `_tryRefresh` error handling
- Same `_debug` pattern on every service method

---

---

## 0. Two API surfaces — don't confuse them

PingOne MFA spans **two different base URLs**. `mfaService.js` has separate
helpers (`_authBaseUrl()`, `_apiBaseUrl()`) for exactly this reason.

| Surface | Base URL | Purpose |
|---|---|---|
| **Platform / MFA device** | `https://api.pingone.{region}/v1/environments/{envId}` | Device CRUD: create, list, activate, delete, rename; `mfaEnabled`; `mfaPolicies` / `deviceAuthenticationPolicies` |
| **MFA device authentication** | `https://auth.pingone.{region}/{envId}` (NOT `/as`) | `deviceAuthentications` — runtime challenge: device selection, OTP check, FIDO2 assertion, push poll |

Device **enrollment** lives on the Platform API. Device **authentication**
(proving possession at challenge time) lives on the auth host at
`/deviceAuthentications` — note **no `/as` segment**, unlike the OIDC endpoints.

---

## 1. Worker token + MFA scope matrix

Device management uses a **worker (client_credentials) token**, not the user's
access token. `mfaService._getWorkerToken()` mints it from worker creds
(`pingone_worker_token_client_id` / `_secret`, falling back to management
creds) at `getTokenEndpoint()`.

Required PingOne API scopes on the worker app (least privilege — do not expand
without reason):

| Scope | Enables |
|---|---|
| `p1:read:user` | Read user objects (lookup by username/email) |
| `p1:update:user` | Update user (e.g. `mfaEnabled` flag) |
| `p1:read:device` | List / read a user's MFA devices |
| `p1:create:device` | Create devices (SMS, Email, TOTP, FIDO2, ...) |
| `p1:update:device` | Activate device, change nickname/status |
| `p1:delete:device` | Delete a device |

Optional (only if the flow needs it):

| Scope | Enables |
|---|---|
| `p1:create:pairingKey` | QR / mobile pairing flows |
| `p1:read:pairingKey` | Read pairing-key metadata |
| `p1:update:userMfaEnabled` | Explicitly toggle a user's MFA-enabled flag |

Rules: keep the scope set in one place; on a 403 from a device endpoint, the
fix is almost always a missing `p1:*:device` scope on the worker app. Never log
the worker `access_token`, OTP codes, or full phone numbers.

> Banking-specific: the BFF also performs an RFC 8693 exchange
> (`_exchangeTokenForDeviceAuth`) when `pingone_resource_device_auth_uri` is set,
> narrowing the user token to the `device-authentication` audience for
> challenge-time calls. RFC 8693 mechanics live in `oauth-pingone`.

---

## 2. Device-authentication-policies API

A device-auth policy decides which device types are allowed and OTP/lockout
behavior. `mfaService._getDefaultMfaPolicy()` resolves the default when
`pingone_mfa_policy_id` is unset.

| Operation | Request |
|---|---|
| List all | `GET {apiBase}/deviceAuthenticationPolicies` → `_embedded.deviceAuthenticationPolicies[]` |
| Resolve default | filter list for `default === true`, else first entry |
| By name | list, then filter on `name` (no native by-name endpoint) |
| Create from template | read template policy, strip `id`/`createdAt`/`updatedAt`/`_links`, set new `name`, `POST {apiBase}/deviceAuthenticationPolicies` |

> Banking note: `mfaService.js` reads `GET {apiBase}/mfaPolicies` (the legacy
> alias) and caches the resolved default id in `_cachedDefaultPolicyId`
> (`_resetDefaultPolicyCache()` clears it for tests). Newer code should prefer
> `deviceAuthenticationPolicies`. Policy create-from-template payloads:
> see [reference/policy-and-scopes.md](reference/policy-and-scopes.md).

Create-from-template (server-side, config-driven):

```javascript
const configStore = require('../services/configStore');
const region = configStore.getEffective('pingone_region') || 'com';
const envId  = configStore.getEffective('pingone_environment_id');
const apiBase = `https://api.pingone.${region}/v1/environments/${envId}`;

const tpl = (await axios.get(`${apiBase}/deviceAuthenticationPolicies`, {
  headers: { Authorization: `Bearer ${workerToken}` }, timeout: 10000,
})).data._embedded.deviceAuthenticationPolicies.find(p => p.default) || {};

const { id, createdAt, updatedAt, _links, ...clone } = tpl;
const created = await axios.post(
  `${apiBase}/deviceAuthenticationPolicies`,
  { ...clone, name: 'BankingMfaPolicy' },
  { headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
);
```

---

## 3. Generic device lifecycle spine

Every device type is a variation on this. Endpoint patterns
(`{apiBase} = https://api.pingone.{region}/v1/environments/{envId}`):

| Step | Method + path | Notes |
|---|---|---|
| Lookup user | `GET {apiBase}/users?filter=username eq "..."` | Get `userId`; or use the session user id |
| (Pre) Enable MFA | `PUT {apiBase}/users/{userId}/mfaEnabled` `{ "mfaEnabled": true }` | Required before enrollment in some policies |
| Create device | `POST {apiBase}/users/{userId}/devices` | Body carries `type` + type-specific fields |
| Activate device | `PUT {apiBase}/users/{userId}/devices/{deviceId}` | `Content-Type: application/vnd.pingidentity.device.activate+json`, body `{ "otp": "123456" }` |
| List devices | `GET {apiBase}/users/{userId}/devices?filter=(status eq "ACTIVE")` | `_embedded.devices[]` |
| Rename | `PATCH {apiBase}/users/{userId}/devices/{deviceId}` `{ "nickname": "..." }` | |
| Delete | `DELETE {apiBase}/users/{userId}/devices/{deviceId}` | |

### Device status transitions (enrollment)

```
(create) -> ACTIVATION_REQUIRED -> (activate w/ OTP or attestation) -> ACTIVE
            (worker-only create, no OTP) ------------------------------> ACTIVE
```

- A device created with the **user's** token typically returns
  `ACTIVATION_REQUIRED` (PingOne sends an OTP, user must confirm).
- A device created with a **worker** token only can be `ACTIVE` immediately.
- TOTP/FIDO2 are always `ACTIVATION_REQUIRED` — the user proves possession
  (code from authenticator app, or WebAuthn attestation).

### deviceAuthentications status transitions (challenge time)

`{authBase} = https://auth.pingone.{region}/{envId}` (no `/as`):

```
POST /deviceAuthentications -> DEVICE_SELECTION_REQUIRED
  -> (select device) -> one of:
       OTP_REQUIRED               -(POST .../otp)----------> COMPLETED | FAILED
       ASSERTION_REQUIRED         -(POST assertion check)--> COMPLETED | FAILED
       PUSH_CONFIRMATION_REQUIRED -(poll GET)-------------> COMPLETED | PUSH_CONFIRMATION_TIMED_OUT
```

PingOne content-types at challenge time (used in `mfaService.js`):

| Operation | Content-Type |
|---|---|
| Select device | `application/vnd.pingidentity.device.select+json` |
| Check OTP | `application/vnd.pingidentity.otp.check+json` |
| Check FIDO2 assertion | `application/vnd.pingidentity.assertion.check+json` |
| Activate device (enrollment) | `application/vnd.pingidentity.device.activate+json` |

> Token rule observed in `mfaService.js`: `initiateDeviceAuth` and `submitOtp`
> use the **user** access token; `selectDevice` and `getDeviceAuthStatus`
> require the **worker** token (PingOne rejects user tokens on
> `/deviceAuthentications/{daId}` with `INVALID_TOKEN`).

---

## 4. Banking grounding

| Code | Role |
|---|---|
| `banking_api_server/services/mfaService.js` | All device + deviceAuthentications calls. Worker token, default policy cache, RFC 8693 device-auth exchange, `_debug` request/response capture |
| `banking_api_server/routes/mfa.js` | `POST /challenge`, `PUT /challenge/:daId`, `GET /challenge/:daId/status`, `POST /test/otp-verify`, `GET /devices`, `DELETE /devices/:deviceId`, `PATCH /devices/:deviceId/nickname`, `POST /enroll/{sms-init,sms-complete,email,fido2-init,fido2-complete}` |
| `banking_api_server/routes/mfaStepUp.js` | `POST /sms`, `POST /sms/verify` — step-up shim |
| `banking_api_server/routes/mfaTest.js` | `/integration/*` teaching harness exercising the full lifecycle with `_debug` surfaced to the UI |

Wired device types in `mfaService.js`:

| Type | Enroll | Activate | Status |
|---|---|---|---|
| EMAIL | `enrollEmailDevice` | OTP via deviceAuthentications | ✅ wired |
| SMS | `enrollSmsDevice` | `completeSmsEnrollment` (PUT + OTP) | ✅ wired |
| FIDO2 | `initFido2Registration` | `completeFido2Registration` (attestation) | ✅ wired |
| TOTP | — | — | reference only — see [reference/device-totp.md](reference/device-totp.md) |
| WHATSAPP | — | — | reference only — see [reference/device-whatsapp.md](reference/device-whatsapp.md) |
| MOBILE push | challenge handles `PUSH_CONFIRMATION_REQUIRED` | — | reference only — see [reference/device-mobile-push.md](reference/device-mobile-push.md) |

Service contract notes:
- Every service method attaches `_debug: { request, response }` so the
  teaching UI / Token Chain can render the exact PingOne round-trip. Keep this
  when adding methods.
- `_wrapError` maps PingOne `401 → code:'token_expired'`,
  `404|410 → code:'challenge_expired'`; these drive a one-shot
  refresh + retry via `_tryRefresh` (defined in `mfaService.js`, called from
  `routes/mfa.js`).
- New Management-API device operations go on `mfaService.js` — do not fork a
  parallel service in a route file (`pingone-api-calls` rule).

---

## 5. curl debug recipe

Worker-token → lookup user → create device → activate. Replace `{...}`.

```bash
ENV=...; REGION=com; WT="<worker_token>"
API="https://api.pingone.${REGION}/v1/environments/${ENV}"

# 1. Worker token (client_credentials) — confirm scopes
curl -s -X POST "https://auth.pingone.${REGION}/${ENV}/as/token" \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d 'grant_type=client_credentials' \
  -d 'scope=p1:read:user p1:read:device p1:create:device p1:update:device p1:delete:device'

# 2. Lookup user by username
curl -s "$API/users?filter=username%20eq%20%22user@example.com%22" \
  -H "Authorization: Bearer $WT"

# 3. Create SMS device (worker-created → may be ACTIVE; user-token → ACTIVATION_REQUIRED)
curl -s -X POST "$API/users/$UID/devices" \
  -H "Authorization: Bearer $WT" -H 'Content-Type: application/json' \
  -d '{"type":"SMS","phone":"+15551234567"}'

# 4. Activate with the OTP texted to the phone
curl -s -X PUT "$API/users/$UID/devices/$DID" \
  -H "Authorization: Bearer $WT" \
  -H 'Content-Type: application/vnd.pingidentity.device.activate+json' \
  -d '{"otp":"123456"}'
```

Banking debug surfaces: `[MFA]` log tags in `/tmp/bank-api-server.log`;
`GET /api/auth/mfa-test/worker-token`, `/api/auth/mfa-test/integration/*`
return `_debug` request/response for the UI.

---

## 6. Common MFA error codes

| HTTP | PingOne signal | Meaning / fix |
|---|---|---|
| 400 | `INVALID_DATA` / "Invalid OTP" | Wrong/expired OTP; phone not E.164; bad device body |
| 400 | `INVALID_VALUE` | Device type not allowed by the device-auth policy |
| 401 | `INVALID_TOKEN` | Wrong token kind (user token on `/deviceAuthentications/{daId}` needs worker; or token expired) |
| 403 | insufficient scope | Worker app missing `p1:*:device` / `p1:*:user` scope |
| 404 | `NOT_FOUND` | Wrong `userId`/`deviceId`, or device already deleted |
| 409 | `UNIQUENESS_VIOLATION` | Device (or policy name) already exists |
| 410 | gone | deviceAuthentications transaction expired — start a new challenge |
| 429 | `REQUEST_LIMITED` / `LIMIT_EXCEEDED` | Device cap hit — delete an old device and retry (`initFido2Registration` does this) |

`_wrapError` collapses `404|410 → challenge_expired` and `401 → token_expired`.

---

## 7. Reference index

| File | Wired? | Contents |
|---|---|---|
| [reference/device-sms.md](reference/device-sms.md) | ✅ wired | SMS enroll (E.164), OTP activate, resend, SMS errors |
| [reference/device-email.md](reference/device-email.md) | ✅ wired | Email device enroll + OTP activation |
| [reference/device-totp.md](reference/device-totp.md) | reference only | TOTP secret/`keyUri` QR provisioning, activate by code |
| [reference/device-fido2.md](reference/device-fido2.md) | ✅ wired | FIDO2/passkey WebAuthn attestation, usernameless |
| [reference/device-whatsapp.md](reference/device-whatsapp.md) | reference only | WhatsApp device (two-route), OTP delivery |
| [reference/device-mobile-push.md](reference/device-mobile-push.md) | reference only | Mobile push SDK pairing, device order, push vs OTP fallback |
| [reference/policy-and-scopes.md](reference/policy-and-scopes.md) | partial | Device-auth-policy templates, full scope matrix, pairing flags |
| [reference/device-authentications-api.md](reference/device-authentications-api.md) | ✅ wired | **Implementation cheatsheet** — one-time SMS/Email OTP (no device registration): full request/response examples, token rules (user vs worker per step), flow states, error codes, test mode, user lookup pattern |
| [reference/devices-api.md](reference/devices-api.md) | ✅ wired | Full Platform API device lifecycle: all types + properties, create/activate/delete/order/lock/block, custom pairing notifications |
| [reference/onetime-otp-flow.md](reference/onetime-otp-flow.md) | ✅ wired | **One-time OTP skill** — default MFA path (no device registration): full two-call flow, JS code for `mfaService.js` methods, route shape, session storage, error handling, polling notes |

---

## See Also

- [oauth-pingone skill](../oauth-pingone/SKILL.md) — MFA during login: ACR, step-up, CIBA, `pi.flow`, RFC 8693 mechanics
- [pingone-api-calls skill](../pingone-api-calls/SKILL.md) — generic Management API (user CRUD, app registration), worker-token pattern
- [bff-sessions skill](../bff-sessions/SKILL.md) — token custody, `configStore` lookup
- [regression-guard skill](../regression-guard/SKILL.md) — pre-edit rules for files touching PingOne config
- [typescript-banking skill](../typescript-banking/SKILL.md) — style rules for new service code
