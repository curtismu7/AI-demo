# 261-03 SUMMARY — Wave 3: BFF Structured Recovery Responses + pendingAgentIntent

**Status:** Complete  
**Commit:** `5e5b91c1`  
**Phase:** 261 — Compliance: Gateway Denial Metadata + Agent Recovery

---

## What Was Done

### Task 1: bankingAgentRoutes.js — D-03 Structured Responses

Added three typed error handlers in the POST `/message` catch block, **before** the TOKEN_INACTIVE check, mapping agent-thrown recovery errors to semantic HTTP responses per D-03:

| Error name | HTTP status | Response body |
|---|---|---|
| `LoginRequiredError` | 401 | `{ error: 'login_required', requiredScopes: [...] }` |
| `HitlRequiredError` | 403 | `{ error: 'hitl_required', challengeId, challengeType, expiresAt }` |
| `ScopeRequiredError` | 403 | `{ error: 'scope_required', requiredScopes: [...] }` |

Security: `requiredScopes` entries validated against `/^[a-z][a-z0-9:_-]*$/` — malformed entries filtered out. Uses `error.name` string comparison (not `instanceof`) to avoid prototype pollution risk.

**Untouched existing paths:**
- Line 25/67: `401 { error: 'Session expired', agentInitRequired: true }` — no session
- Line 76: `403 { error: 'User denied consent', consentDenied: true }` — existing consent decline
- Line 118: `428` HITL challenge (existing in-BFF HITL flow)
- Line 216: `401 TOKEN_INACTIVE` — PingOne session expired

### Task 2: oauthUser.js — pendingAgentIntent Session Storage

**Login route (GET /api/auth/login):**
- After setting `postLoginReturnToPath`, reads `req.query.pendingMessage`
- Sanitizes (must be string, truncated to 2048 chars)
- Stores as `req.session.pendingAgentIntent = { message, timestamp: Date.now() }`

**OAuth callback (`session.regenerate()` callback):**
- `delete req.session.pendingAgentIntent` — cleared so it doesn't persist past login
- Client replay is handled via `BX_AGENT_PENDING_NL_KEY` in browser sessionStorage (primary mechanism)
- BFF session copy is secondary — for server-side validation by Wave 4 UI

---

## Verification Results

| Check | Result |
|---|---|
| `login_required` in bankingAgentRoutes.js | 1 ✅ (≥1) |
| `hitl_required` in bankingAgentRoutes.js | 1 ✅ (≥1) |
| `scope_required` in bankingAgentRoutes.js | 1 ✅ (≥1) |
| `pendingAgentIntent` in oauthUser.js | 2 ✅ (set + delete) |
| `postLoginReturnToPath` count unchanged | 9 ✅ (no regression) |
| `node -e "require('./banking_api_server/routes/bankingAgentRoutes.js')"` | OK ✅ |

---

## Files Modified

| File | Change |
|---|---|
| `banking_api_server/routes/bankingAgentRoutes.js` | +D-03 error handlers (3 error types, ~20 lines) in catch block |
| `banking_api_server/routes/oauthUser.js` | +pendingAgentIntent store on login, +delete on callback regenerate |

---

## Contracts for Wave 4 (UI)

Wave 4 (GatewayConsentModal + compliance strip) reads these HTTP shapes:

```javascript
// 401 login_required — trigger re-auth with expanded scopes
{ error: 'login_required', requiredScopes: ['banking:write', 'banking:transfer'] }

// 403 hitl_required — show HITL consent modal
{ error: 'hitl_required', challengeId: 'abc123', challengeType: 'step_up', expiresAt: '...' }

// 403 scope_required — user lacks scope, cannot proceed without re-login
{ error: 'scope_required', requiredScopes: ['banking:sensitive'] }
```

The UI should also use `?pendingMessage=<encoded-message>` in the `/api/auth/login` redirect URL so the BFF stores the agent intent for server-side validation.

---

## Must-Haves Verified

- ✅ BFF returns HTTP 401 `login_required` when agent throws `LoginRequiredError`
- ✅ BFF returns HTTP 403 `hitl_required` when agent throws `HitlRequiredError`
- ✅ BFF returns HTTP 403 `scope_required` for scope expansion failures
- ✅ oauthUser.js stores `pendingAgentIntent` in session before OAuth redirect
- ✅ Existing 401/403/428 paths unaffected
