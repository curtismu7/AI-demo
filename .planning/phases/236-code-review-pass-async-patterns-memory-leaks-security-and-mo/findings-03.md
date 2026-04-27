# Findings — Batch 03: Auth and Token Services

## Batch 03 — Part 1: Auth / Token Services

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Major** | Async Patterns | `oauthService.js:197,784` | `require('jsonwebtoken')` called inline inside two hot async methods (`exchangeCodeForToken`, `refreshAccessToken`). Dynamic `require` inside async hot-paths adds unnecessary module-lookup overhead on every call. | Hoist to module top-level: `const jwt = require('jsonwebtoken')` |
| **Major** | Security | `oauthService.js` (module) | No PKCE `state` validation helper exists in this service. `generateState()` creates the value; `generateAuthorizationUrl()` embeds it; but there is no `validateState(received, expected)` function. The service does not enforce one-time use of `codeVerifier` either. Callers must implement both checks in the router, making it easy to omit them. | Add a `validateState(receivedState, sessionState)` helper with a JSDoc note that callers MUST invoke it on callback. |
| **Minor** | Security | `oauthService.js:855-857` | `revokeToken` adds `client_secret` directly to the body regardless of auth method (`body.set('client_secret', ...)`), bypassing the `applyAdminTokenEndpointClientAuth` helper. For Basic-auth clients this would send credentials in both the Authorization header and the body — technically harmless but inconsistent with the configured method. | Use `applyAdminTokenEndpointClientAuth(this.config, body, headers)` for the revoke call. |
| **Minor** | Maintainability | `oauthService.js:474-529,594-649` | `getAgentClientCredentialsToken` and `getAgentClientCredentialsTokenWithExpiry` are ~55-line functions sharing ~90% logic (credential resolution, body build, auth, error enrichment). Only the return shape differs. | Merge: `async getAgentClientCredentialsToken({ includeExpiry = false } = {})`. |

---

### cibaService.js

**CIBA Polling Interval Lifecycle — CONFIRMED CLEAN (Critical acceptance criterion)**

`cibaService.js` uses a `for` loop with `await _sleep(interval * 1000)` — NOT `setInterval`. There is no interval handle. Polling exits naturally on success, denial, or `maxAttempts` exhaustion. No timer leak is possible.

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Major** | Async Patterns | `cibaService.js:103-109` | `initiateBackchannelAuth` calls `axios.post` without a try/catch. If PingOne returns non-2xx, the raw axios error propagates unformatted. Every other service method enriches errors; this one does not. | Wrap in try/catch; enrich with `error.response?.data` and rethrow a structured error. |
| **Major** | Async Patterns | `cibaService.js:135-143` | `pollForTokens` is a public export that calls `axios.post` without a try/catch. Direct callers who do not catch will receive an unformatted axios error. | Document in JSDoc that callers must catch; or add internal enrichment. |
| **Minor** | Security | `cibaService.js:129-143` | `pollForTokens(authReqId)` accepts any `authReqId` string without verifying it was initiated by the current session. An attacker with BFF access could poll with a guessed/stolen `auth_req_id`. The router presumably restricts access, but there is no in-service session binding. | Accept a `sessionId` parameter; validate that `authReqId` was issued to this session before calling PingOne. |
| **Minor** | Maintainability | `cibaService.js:154` | `maxAttempts = 60` and `intervalSeconds = 5` are undocumented defaults. The effective max wait time (5 min) is invisible to readers. | Add comment: `// 60 attempts × 5s ≈ 5-minute timeout ceiling` |

---

### agentTokenService.js

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Critical** | Security | `agentTokenService.js:41-79` | `validateAgentActorToken` is a **stub** — it always returns `{ valid: true, actorId: 'placeholder-actor-id', scopes: [...] }` regardless of the token. The comment admits "Placeholder implementation." Any code path that calls this to gate access is completely bypassed. The function name, JSDoc, and app event logging all suggest it is functional. | Implement real validation via introspection service, OR remove all callers and replace with `audValidationService`. Add a loud `// SECURITY STUB — DO NOT USE IN PRODUCTION` banner. |
| **Major** | Maintainability | `agentTokenService.js:41-79` | The stub emits real app events and has production-looking JSDoc — a deception hazard for reviewers and future developers. | Add `// TODO(SECURITY): THIS IS A STUB — DOES NOT VALIDATE` at the top of the function body. |
| **Minor** | Async Patterns | `agentTokenService.js:41` | Function is `async` but contains no `await`. It is synchronous internally. | Either make non-async (return a resolved promise or plain object) or add real async validation. |

---

### agentMcpTokenService.js

**RFC 8693 error path coverage — CONFIRMED ADDRESSED (acceptance criterion)**

Every `oauthService.performTokenExchange*` call in `resolveMcpAccessTokenWithEvents` is wrapped in try/catch. Errors are enriched, logged to the audit store, and rethrown (hard fail, no silent fallback). The 2-exchange path has per-step try/catch at all four steps. Error coverage is comprehensive.

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Major** | Security | `agentMcpTokenService.js:1062-1081` | RFC 8693 §3 subject mismatch is logged as `console.warn` and a `tokenEvents` entry but does NOT throw. The mismatched exchanged token is returned to the caller and forwarded to the MCP server. A token where `sub` differs from the original user is a potential impersonation vector. | Change: if `mcpAccessTokenClaims.sub !== userSub`, throw `throwTokenResolutionError(...)` or return `{ token: null }`. |
| **Major** | Async Patterns | `agentMcpTokenService.js:~822,1120,1195,1364,1481,1505` | Multiple `void writeExchangeEvent(...)` fire-and-forget calls. `void` suppresses the promise result but if `writeExchangeEvent` throws synchronously before returning a promise (e.g. import failure), the error is not caught. | Wrap: `writeExchangeEvent({...}).catch(err => console.warn('[audit]', err.message))` |
| **Major** | Async Patterns | `agentMcpTokenService.js:461-513` | `performDualModeTokenExchange` calls `exchangeTokenRfc8693` which internally catches errors and returns `null`. The outer try/catch in the dual-mode function never fires for RFC 8693 failures, meaning `err.tokenEvents` is never attached. Callers get `null` with zero diagnostic context. | In `exchangeTokenRfc8693`, rethrow enriched errors rather than returning `null`; let dual-mode handle them. |
| **Minor** | Maintainability | `agentMcpTokenService.js:1539-1589` | `mapErrorToStructuredResponse` is defined AFTER the first `module.exports = {...}` block (line 1528) and appended via `module.exports.mapErrorToStructuredResponse = ...` (line 1589). This works in CommonJS but is fragile; the function is also called at line 1192 from code defined above it. | Move `mapErrorToStructuredResponse` to before the first `module.exports` block. |
| **Minor** | Modern JS | `agentMcpTokenService.js:354-362` | `generateTransactionId` uses a `Math.random()`-based UUID fallback for older Node. The fallback is not cryptographically secure. Node 18+ (required by this app) always has `crypto.randomUUID()`. | Remove the fallback; require `crypto.randomUUID()` directly. |
| **Minor** | Modern JS | `agentMcpTokenService.js:354` | `const crypto = require('crypto')` is inlined inside `generateTransactionId`. | Hoist to module top-level. |

---

### delegationService.js

**Delegation identity verification — CONFIRMED PRESENT (acceptance criterion)**

`grantDelegation`: self-delegation blocked (`delegatorEmail === delegateEmail`); duplicate active delegation blocked. `revokeDelegation(id, delegatorUserId)`: SQLite path fetches `WHERE id = ? AND delegator_user_id = ?`; memory path checks `rec.delegator_user_id !== delegatorUserId` before allowing revocation. A user cannot revoke another user's delegation. Identity enforcement is correct at the service layer.

Note: The service trusts `delegatorUserId` as passed by the caller. If any route passes a user-supplied body field instead of `req.session.userId`, that would be a bypass — this is a router-layer concern noted for completeness.

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Major** | Async Patterns | `delegationService.js:157` | `fetchPingOneUserByUsername(delegateEmail).catch(() => ({ user: null }))` silently swallows ALL errors including network failures and 500s. If PingOne is temporarily unavailable, the code falls through to provisioning a new user, potentially creating duplicates. | Inspect `err.response?.status`; only return `{ user: null }` on 404; rethrow on network/server errors. |
| **Major** | Async Patterns | `delegationService.js:117-233` | `grantDelegation` body is not wrapped in a top-level try/catch. If `getStorage()` throws (SQLite disk-full) or `storage.db.prepare(...)` throws mid-execution, an unformatted error surfaces to the caller instead of the expected `{ ok: false, error, message }` return shape. | Wrap function body in try/catch; return `{ ok: false, error: 'internal_error', message: err.message }`. |
| **Minor** | Memory | `delegationService.js:25-56` | In-memory store (`_mem = new Map()`) used on Vercel has no eviction. Revoked delegations remain in the Map indefinitely (status updated but entry never deleted). | Periodically delete revoked entries or cap the Map size. |
| **Minor** | Security | `delegationService.js:117` | JSDoc does not state that `delegatorUserId` must originate from `req.session`, not the request body. | Add JSDoc: `@param {string} delegatorUserId - MUST be from authenticated session, never from request body.` |

---

### audValidationService.js

**aud matching strictness — CONFIRMED STRICT (acceptance criterion)**

`validateAudClaim` normalizes `aud` to array, then uses `Array.some(v => v === expectedAud)` — exact string equality, no wildcards, no partial matching. FAIL CLOSED: missing `aud` returns `{ valid: false }`. Security event is logged on mismatch. RFC-compliant and strict.

Design note: a token with `aud: ['api-A', 'api-B']` passes validation for `expectedAud = 'api-A'` even though it was also issued for `api-B`. This is RFC 6749/7519-compliant but means cross-audience tokens are not rejected. Not a bug, but worth documenting as a known trade-off.

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Minor** | Security | `audValidationService.js:240` | `_createTestToken` is exported from the production module. Test helpers should not appear in production exports. | Remove `_createTestToken` from `module.exports`; move to a `__tests__/helpers.js` file. |
| **Minor** | Maintainability | `audValidationService.js:68-86` | The mismatch error message (`Token aud [${tokenAuds.join(', ')}] does not match expected [${expectedAud}]`) and the structured log field (`tokenAuds`) are redundant. | Keep the structured log field; simplify error string to `aud mismatch`. |

---

---

## Batch 03 — Part 2: Core Infrastructure Services

### configStore.js

**Secret exposure risk — CONFIRMED MITIGATED (acceptance criterion)**

Secrets in `SECRET_KEYS` are encrypted with AES-256-GCM before SQLite write. In-memory cache holds plaintext but is server-side only. `getMasked()` replaces all secret values with `'••••••••'`. Unknown keys filtered at `setConfig` (`if (!(key in FIELD_DEFS)) continue`), blocking prototype pollution. Secret handling is sound for normal usage.

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Major** | Security | `configStore.js:185` | `_getEncryptionKey()` silently falls back to `'dev-fallback-key-do-not-use-in-production'` when neither `CONFIG_ENCRYPTION_KEY` nor `SESSION_SECRET` is set. In production this means all secrets in SQLite are encrypted with a well-known, public key — effectively plaintext to anyone with source access. No runtime warning is emitted. | Add: `if (!process.env.CONFIG_ENCRYPTION_KEY && !process.env.SESSION_SECRET) { console.error('[ConfigStore] CRITICAL: Using hardcoded dev encryption key — set CONFIG_ENCRYPTION_KEY in production'); }` |
| **Major** | Security | `configStore.js:212-216` | `_decrypt()` catches all errors and silently returns `''`. If the encryption key changes (e.g. `SESSION_SECRET` rotation), all secrets silently become empty strings on the next load. Operators may not notice that credentials were cleared — they get confusing "not configured" errors rather than a clear key-mismatch warning. | Log a warning per-key when decryption returns empty: `console.warn('[ConfigStore] Could not decrypt', row.key, '— re-enter the credential')`. |
| **Minor** | Maintainability | `configStore.js:551-633` | `validateTwoExchangeConfig` is a free function defined after the `ConfigStore` class but references `configStore` (the singleton defined at line 942). It works because the function is called lazily, but creates a forward reference that confuses readers and static analysis. | Move to after line 942 (after the singleton declaration), or pass configStore as a parameter. |
| **Minor** | Security | `configStore.js:375-486` | `getEffective` env-fallback keys are all lowercase, but `FIELD_DEFS` uses UPPERCASE keys for some fields. Direct `configStore.get('PINGONE_ENVIRONMENT_ID')` hits the cache; `configStore.getEffective('pingone_environment_id')` hits the fallback map. Inconsistent casing across the codebase risks subtle misses. | Document in JSDoc that `getEffective` keys must be lowercase to use the env fallback map. |

---

### pingOneAuthorizeService.js

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Major** | Async Patterns / Performance | `pingOneAuthorizeService.js:106-141` | `getWorkerToken()` fetches a fresh client-credentials token on every call. `evaluateTransaction`, `getRecentDecisions`, `getDecisionEndpoints`, and `provisionDemoDecisionEndpoints` all call it independently. For frequent MCP tool evaluations this doubles PingOne API round-trips and could trigger rate limiting. | Cache token in module-level variable with `expiresAt`; reuse if `Date.now() < expiresAt - 30000`. |
| **Minor** | Async Patterns | `pingOneAuthorizeService.js:392-421` | `checkStepUpRequired` catch block only `console.warn`s on evaluation failure — no structured app event. Consistent with `ff_authorize_fail_open` but makes tracing difficult. | Add `logAppEvent('auth_lifecycle', 'warning', ...)` in the catch block. |
| **Minor** | Maintainability | `pingOneAuthorizeService.js:636-662` | `_extractStepUpRequired` and `_extractHitlRequired` are nearly identical — both iterate `raw.obligations` and `raw.advice` checking a string pattern. | Refactor to `_extractObligationSignal(raw, pattern)` used by both. |
| **Minor** | Security | `pingOneAuthorizeService.js` (module) | All URL construction uses `configStore`-sourced `envId` and `regionTld` — no user input reaches URLs. Policy/endpoint IDs come from configStore. No SSRF risk. Clean. | — (CLEAN) |

---

### simulatedAuthorizeService.js

**Production-mode guard — NO IN-MODULE GUARD (acceptance criterion)**

`simulatedAuthorizeService.js` has no production guard. The simulation is only activated when the caller checks `ff_authorize_simulated` (via `isSimulatedModeEnabled(configStore)` exported from this module). A developer who directly imports and calls `evaluateTransaction` from this module bypasses all feature flags silently.

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Major** | Security | `simulatedAuthorizeService.js` (module level) | No in-module production guard. Direct import of this service bypasses the `ff_authorize_simulated` feature flag silently. If any route accidentally imports this instead of `pingOneAuthorizeService`, real authorization is skipped with no error. | Add runtime check inside each exported evaluation function: `if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATED_AUTHORIZE !== 'true') { throw new Error('simulatedAuthorizeService cannot be used in production'); }` |
| **Minor** | Maintainability | `simulatedAuthorizeService.js:287-292` | `isSimulatedModeEnabled(configStore)` takes `configStore` as a parameter rather than importing it directly, unlike every other service in this batch. This is inconsistent and means callers must pass the dependency explicitly. | Either import configStore at module top, or add a JSDoc comment explaining why dependency injection is used here. |
| **Minor** | Memory | `simulatedAuthorizeService.js:29-33` | `_recentSimulated` capped at 50 via `.slice(0, 50)`. `_seq` counter is unbounded but will never realistically overflow. Both are Clean. | — (CLEAN) |

---

### configHostnameService.js

**X-Forwarded-Host validation — NOT APPLICABLE (acceptance criterion)**

`configHostnameService.js` does NOT read `X-Forwarded-Host` or any request headers. The hostname comes exclusively from: (1) in-memory cache `_hostnameCache`, (2) `configStore.get(CONFIG_KEY)`, (3) `process.env.PUBLIC_APP_URL`. All are server-controlled. No SSRF or redirect-manipulation risk exists in this file.

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| **Minor** | Security | `configHostnameService.js:33` | `HOSTNAME_REGEX` allows `http://` (non-TLS) hostnames to be stored as the BFF URL. In production, OAuth redirect URIs must be HTTPS. An `http://` misconfiguration would produce opaque OAuth failures rather than a clear validation error. | In `validateHostname`: if `NODE_ENV === 'production'` and hostname starts with `http://`, throw `InvalidHostnameError('Production requires https://')`. |
| **Minor** | Maintainability | `configHostnameService.js:102-104` | Comment "do NOT cache the fallback" is correct and important but easy to miss. A future developer could add `_hostnameCache = DEFAULT_HOSTNAME` as an optimization, breaking config hot-reloading. | Elevate to: `// INTENTIONAL: fallback is NOT cached — allows config changes and env-var overrides to apply without restart.` |
| **Minor** | Async Patterns | `configHostnameService.js` (module) | All exported functions are synchronous except `setConfiguredHostname` (async due to `configStore.setConfig`). No fire-and-forget patterns. Clean. | — (CLEAN) |

---

## Acceptance Criteria — Final Status

| Criterion | Result |
|-----------|--------|
| cibaService.js CIBA polling interval lifecycle | **CLEAN** — `await _sleep()` loop, no `setInterval`, no timer handle to leak |
| delegationService.js delegation identity verification | **PRESENT** — `revokeDelegation` checks `delegator_user_id`; self-delegation blocked; **Major** finding: no top-level try/catch |
| audValidationService.js aud matching strictness | **STRICT** — exact string equality, FAIL CLOSED, RFC-compliant array normalization |
| agentMcpTokenService.js RFC 8693 error path coverage | **ADDRESSED** — all exchange calls wrapped; **Major** finding: subject mismatch warns-not-throws |
| configStore.js secret exposure risk | **MITIGATED** — AES-256-GCM encryption; **Major** finding: silent fallback to known dev key in production |
| simulatedAuthorizeService.js production-mode guard | **MISSING** in-module — guard is at caller layer only; **Major** finding flagged |
| configHostnameService.js X-Forwarded-Host validation | **NOT APPLICABLE** — hostname never derived from request headers |
