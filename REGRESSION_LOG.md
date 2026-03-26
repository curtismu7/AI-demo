# Regression Log

A running record of production bugs, their root causes, and the tests that prevent them from recurring.
Update this file whenever a bug is fixed: add the bug, cause, fix, and test reference.

---

## 2026-03-26 — MCP token exchange “skipped”; `get_account_balance` “Account optional not found”; floating agent scroll / expand layout

**Symptom**: Token Chain / toasts said token exchange was **skipped** (`MCP_RESOURCE_URI` unset) and the user token was forwarded; NL “Check my account balance” failed with **`Account optional not found`**; floating Banking Agent could not scroll chat; clicking **expand (⊞)** left the **Recent Transactions** results panel in the wrong place (still bottom-right while the agent centered).

**Root cause**: (1) **`resolveMcpAccessTokenWithEvents`** returned the **user access token** when `mcp_resource_uri` was unset — no RFC 8693, no audience/scope narrowing. (2) Groq/Gemini NL prompts used **`"accountId":"optional"`** as schema documentation; models copied the literal **`optional`** as `account_id`, producing **`Account optional not found`**. (3) Flex layout: left rail **`min-height: auto`** let the column dictate row height so **`.banking-agent-messages`** never got a bounded scroll area. (4) Results panel CSS assumed a **docked** agent width; **expanded** mode centers the agent but results still used the old **`right:`** position.

**Fix**: **Mandatory** `mcp_resource_uri` / `MCP_RESOURCE_URI` for MCP — **no passthrough**; **≥ `MIN_USER_SCOPES_FOR_MCP_EXCHANGE`** (default 5) distinct scopes on the user JWT before exchange; **admin + user OAuth** `scopes` now include **banking scopes** from `getScopesForUserType` so authorize requests enough scopes to narrow. NL prompts/sanitizer + **`mcpLocalTools.get_account_balance`** ignore placeholder **`optional`**. **BankingAgent.css**: flex **`min-height: 0`** on columns, **`touch-action: pan-y`** on messages. **BankingAgent.js**: **`useMemo`** positions **`ResultsPanel`** when **`isExpanded`** (left of centered agent). **`server.js` / `mcpInspector`**: return **`err.httpStatus`**, **`err.code`**, **`err.tokenEvents`** on resolution failures.

**Tests**: `agentMcpTokenService.test.js`, `nlIntentSanitize.test.js`; `npm test` subsets for MCP + NL.

---

## 2026-03-26 — HOME rail opened dashboard instead of marketing landing

**Symptom**: **HOME** navigated to **`/admin`** / **`/dashboard`** (same as the dashboard FAB), not the public marketing page.

**Root cause**: **`homeFabPath`** was set to the same paths as the second dashboard button for “nested splat” reliability.

**Fix**: **`homeFabPath`** → **`/welcome`** when signed in; route **`/welcome`** renders **`LandingPage`**; **Admin** / **Dashboard** FABs unchanged.

**Tests**: Manual.

---

## 2026-03-26 — “Session expired” toast while still signed in; Banking Agent panel too large

**Symptom**: Red toast “Your session has expired…” appeared during normal use; floating/embedded Banking Agent UI dominated the screen.

**Root cause**: `UserDashboard.fetchUserData` retried **401** on accounts but not before the final failure path; **`GET /api/transactions/my`** could return **401** during JWT/session lag while the BFF still reported an authenticated user via `/api/auth/oauth/user/status`. Admin dashboard showed the same toast on **401** after retries without re-checking admin session.

**Fix**: Retry **401** up to three times with backoff; **401** after retries calls **`resolveSessionUser()`** — if a user is still returned, show a **warning** (refresh / agent token) instead of the session-expired toast; **pending refetch** after a soft 401 remains allowed. Admin dashboard: same check before **`toastAdminSessionError`**. Banking Agent default size **halved** (e.g. **260×210** float, **320×260** expanded, narrower left column and results panel; embedded dock default/max heights halved in `App.js`).

**Tests**: Manual / existing `accountsHydration` unit tests.

---

## 2026-03-26 — Demo config save shows `invalid_token` toast

**Symptom**: Saving demo configuration showed **invalid_token** toasts (regression; save had worked before).

**Root cause**: `authenticateToken` validated the OAuth access token from `session.oauthTokens` when no `Authorization` header was present; an **expired or JWKS-invalid** access token produced **401** even when the BFF session cookie and `session.user` were still valid.

**Fix**: When token validation fails but `req.session.user` exists and the route is not blocked, attach **`req.user`** from session (with `sessionAccessTokenInvalid: true`) and **`next()`** — same trust model as `_cookie_session`. **`DemoDataPage`** maps **`invalid_token`** to a short user-facing hint (refresh token in Banking Agent or sign in again).

**Tests**: `banking_api_server` — `demo-scenario-api.test.js` and auth-related Jest suites pass.

---

## 2026-03-26 — Session BFF contract tests + `test:session` script

**Symptom**: Risk of regressions in `GET /api/auth/session` (`sessionStoreHealthy` / `sessionStoreError`) and session debugging without a dedicated test or npm script.

**Fix**: `banking_api_server` adds `npm run test:session` (Jest subset). `authSession.test.js` includes a **production-shaped** middleware block that sets `req._sessionStoreHealthy` / `req._sessionStoreError` before auth routes, asserting the JSON contract. `banking_api_ui/tests/e2e/session-regression.spec.js` adds Playwright API smoke for `/api/auth/session` and `/api/auth/debug`. Runbook: `docs/runbooks/session-regression.md`.

**Tests**: `banking_api_server/src/__tests__/authSession.test.js` — `session store ping contract`; `npm run test:session`; `npm run test:e2e:session` or `npm run test:e2e:api` in `banking_api_ui` (with API server up).

---

## 2026-03-26 — OAuth callback redirected to dashboard when session save failed

**Symptom**: After PingOne login the browser reached `?oauth=success` while `/api/auth/debug` could still show `accessTokenStub: true` — user appeared “logged in” but MCP/NL and token-backed routes failed.

**Root cause**: `req.session.save()` errors in the OAuth **callback** were treated as non-fatal: the code still set the signed `_auth` cookie and redirected to `/dashboard` or `/admin`, so the UI looked successful even when persistence did not complete.

**Fix**: On `saveErr`, call `req.session.destroy()`, `clearAuthCookie()`, and redirect to `/login?error=session_persist_failed` (end-user and admin OAuth callbacks). Login shows a dedicated message. **Note:** `UpstashSessionStore.set()` and the wire `faultTolerantStore` still invoke `cb(null)` when Redis SET fails, so many persistence failures never surface as `saveErr`; server logs remain important.

**Tests**: `banking_api_server/src/__tests__/oauth-e2e-integration.test.js` — still green; callback success paths unchanged when save succeeds.

---

## 2026-03-26 — Banking Agent blamed “unhealthy Redis” when Upstash was healthy (stub token)

**Symptom**: Session debug showed `sessionStoreHealthy: true` and `sessionStoreError: null`, but `accessTokenStub: true` and MCP/NL failed. The Banking Agent copy implied the session **store** was broken.

**Root cause**: Cookie-restore injects `oauthTokens.accessToken === '_cookie_session'`. With no `sessionStoreError`, the agent’s “not hydrated” message defaulted to generic “unhealthy store” wording instead of “tokens missing for this session / cookie restore.”

**Fix**: `buildSessionNotHydratedChat` branches on healthy store vs quota vs errors; `/api/auth/session` returns `sessionStoreHealthy`; `/api/auth/debug` adds `oauthTokenSummary`, `diagnosisHints`, `sessionInMemoryCache`, `sessionCircuitLastError`, and optional `?deep=1` Redis row probe (`getPersistenceDebug`). Banking Agent “Open session debug” uses `/api/auth/debug?deep=1`.

**Tests**: `banking_api_server/src/__tests__/upstashSessionStore.test.js` — `getPersistenceDebug()` suite.

---

## 2026-03-26 — AI agent FAB: opens then immediately closes (flash)

**Symptom**: Clicking the floating banking agent to expand showed the panel briefly, then it collapsed again (or felt like it “flashed”).

**Root cause**: `isBankingAgentOpenByDefaultForPath` was stubbed to always return `false`, but several `useEffect` hooks still called `setIsOpen(isBankingAgentOpenByDefaultForPath(...))` whenever **`user`** resolved, on **mount session discovery**, and on every **`userAuthenticated`** event. After the user opened the panel, the next auth sync forced **`isOpen` back to `false`**.

**Fix**:

- Introduce `isBankingAgentFloatingDefaultOpen(pathname)` in `banking_api_ui/src/utils/bankingAgentFloatingDefaultOpen.js` (collapsed on dashboard homes, open on other routes — aligned with `isBankingAgentDashboardRoute`).
- **Only** apply that default when **`location.pathname` changes** (and for initial `useState`), not when `user` / session / `userAuthenticated` updates.
- Remove `setIsOpen` from user/session/`userAuthenticated` effects; keep welcome-message and `checkSelfAuth` behavior.

**Tests**: `banking_api_ui/src/utils/__tests__/bankingAgentFloatingDefaultOpen.test.js`

---

## 2026-03-26 — Customer dashboard: no account rows after login

**Symptom**: After customer login, the dashboard showed “No account data” / empty table even though the demo should auto-provision accounts.

**Root causes (combined)**:

- **401 / session drift** — OAuth status could show authenticated before `GET /api/accounts/my` accepted the token (partially addressed elsewhere by `refreshIfExpiring` on `/api/auth/oauth`).
- **Transient 5xx / 503** — the UI retried some 5xx but **excluded 503**, so cold-start style responses were not retried.
- **Empty list** — no client-side retry when the first response returned **200 with `accounts: []`** (provision race).

**Fix**:

- `banking_api_ui/src/services/accountsHydration.js` — `fetchMyAccountsWithResilience`: bounded retries with backoff for **401**, **5xx including 503**, and **empty** lists; respects `userLoggedOut`.
- `UserDashboard.js` — uses the helper for hydration; empty-state copy + **Retry loading accounts** button.
- Transient classification for this flow: **429** is not retried in the helper (rate-limit UX unchanged).

**Tests**: `banking_api_ui/src/__tests__/accountsHydration.test.js`

**Ops**: `docs/runbooks/customer-account-hydration.md`

---

## 2026-03-26 — API traffic log spam (oauth status / session loop)

**Symptom**: Api Traffic showed endless `GET /api/auth/oauth/status`, `/api/auth/oauth/user/status`, and `/api/auth/session` in quick succession (all 200).

**Root cause**: `BankingAgent`’s `checkSelfAuth()` dispatched `userAuthenticated` after **every** successful self-check. `App.js` listens and runs `checkOAuthSession()` (same three endpoints). The agent also listens and runs `checkSelfAuth()` again → dispatch again → infinite loop.

**Fix**: Stop dispatching `userAuthenticated` from `checkSelfAuth` (mount and OAuth-retry paths still dispatch once when they first discover a session). Narrowed `userAuthenticated` listener effect deps and used a ref for welcome copy so `sessionUser` updates do not re-bind the listener unnecessarily.

**Tests**: `banking_api_ui/src/__tests__/App.session.test.js` — pass.

---

## 2026-03-26 — Could not transfer from savings / only one transfer

**Symptom**: Transfers from savings failed or only one transfer seemed possible.

**Root cause**: `POST /api/transactions` enforced **Transfer amount must be at least $50** (and the same check in `transactionConsentChallenge.validateIntent`, MCP `create_transfer`, and local inspector tools). After moving a large amount out of savings, the **remaining balance was often below $50**, so further transfers from savings were rejected. Small transfers under $50 from savings were also rejected.

**Fix**: Drop the transfer-specific $50 floor; keep **positive amount** and **insufficient balance** checks. UI: hint under transfer amount and `min="0.01"` on the amount input. Small transfers under $50 from savings are allowed.

**Tests**: `banking_mcp_server/tests/tools/BankingToolRegistry.test.ts` — `create_transfer` amount `minimum` is `0.01`.

---

## 2026-03-26 — Recent transactions blank after transfer

**Symptom**: After completing a transfer, the Recent Transactions list went empty or looked blank.

**Root causes**:

1. **Client**: `setTransactions` used `data?.transactions ?? []` — any non-array / missing payload cleared the list. Full `fetchUserData()` after a write set `loading` to true and replaced the whole dashboard with the loading screen.
2. **Server**: `provisionDemoAccounts` deleted **all** user transactions whenever it ran, including when `getAccountsByUserId` returned **no rows** (e.g. race or cold instance). That could wipe history before re-seeding sample data.

**Fix**:

- **UI**: Only call `setTransactions` / `setAccounts` when the response is an actual array; after transfer/deposit/withdraw (and after high-value consent return), refresh with `fetchAccountsOnly` + `fetchTransactionsOnly` (no full-page loading).
- **API**: Delete transactions in `provisionDemoAccounts` only when they reference **deleted** account IDs — do not mass-delete when no accounts were removed.

**Tests**: Manual verification; no new automated test.

---

## 2026-03-26 — Had to log out twice

**Symptom**: After clicking Log out, the app still behaved as signed in (or session came back) until logging out again.

**Root cause**: The startup `useEffect` removed `userLoggedOut` from `localStorage` immediately while `fetch('/api/auth/clear-session')` was still in flight. A second effect run (e.g. React Strict Mode remount or `checkOAuthSession` reference update) could run `checkOAuthSession` before cookies were cleared, restoring the user.

**Fix**: Remove `userLoggedOut` only in the `clear-session` `finally` callback; treat `/logout` as a post-logout landing path; `history.replaceState` to `/` after cleanup. Module-level `_didLogOut` still guards in-session re-runs.

**Tests**: `banking_api_ui/src/__tests__/App.session.test.js` — `userLoggedOut` flag cleared after `fetch` completes; no `/api/auth/*` GETs during logout path.

---

## 2026-03-26 — Vercel production UI build failed (ESLint)

**Symptom**: `cd banking_api_ui && npm run build` exited with 1 on Vercel (`CI=true` treats warnings as errors).

**Root cause**: `import/first` — `axios.defaults.withCredentials = true` sat between import statements in `App.js`. `no-unused-vars` — unused `subscribe` import in `ApiTrafficPage.js`.

**Fix**: Move the axios default below all imports; remove unused import.

**Tests**: CI build; no new unit test.

---

## 2026-03-26 — Admin token exchange ignored “Client Secret Post”

**Symptom**: PingOne returned `invalid_client` / “Unsupported authentication method” on the admin OAuth callback when the PingOne app expected `client_secret_post`.

**Root cause**: `refreshAccessToken` used configurable basic/post auth, but `exchangeCodeForToken` still always sent `Authorization: Basic` after a partial refactor.

**Fix**: Single helper `applyAdminTokenEndpointClientAuth`; config `admin_token_endpoint_auth_method` / env `PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH` (`post` | `basic`).

**Tests**: `banking_api_server/src/__tests__/oauthService.test.js` — PKCE + confidential client sends secret in body when `tokenEndpointAuthMethod` is `post`.

---

## 2026-03-26 — 429 on `/api/demo-scenario` and dashboard hydration

**Symptom**: `GET /api/demo-scenario` returned 429 (Too Many Requests) on Vercel; dashboard loads could fail alongside other `/api/*` calls.

**Root cause**: The global IP rate limiter applied to almost every API route. Paths such as `/api/demo-scenario`, `/api/tokens/*`, and session/OAuth status endpoints were **not** excluded (unlike `/api/accounts/my` / `/api/transactions/my`). Shared IPs or a low `RATE_LIMIT_MAX` exhausted the 15‑minute window during normal SPA hydration.

**Fix**: `shouldSkipGlobalRateLimit()` in `server.js` now excludes `/api/demo-scenario`, `/api/tokens`, `/api/auth/session`, `/api/auth/oauth/status`, and `/api/auth/oauth/user/status`. The UI coalesces concurrent `fetchDemoScenario()` calls to avoid duplicate GETs (e.g. React Strict Mode).

**Tests**: No dedicated rate-limit unit test; behavior verified in production. Client dedupe is in `demoScenarioService.js`.

---

## 2026-03-26 — 401 on `/api/accounts/my` while OAuth status looked signed-in

**Symptom**: After login, `GET /api/auth/oauth/user/status` could show `authenticated: true` while `GET /api/accounts/my` returned 401.

**Root cause**: `refreshIfExpiring` (RFC 6749 silent refresh) ran only on routes like `/api/accounts` and **not** on `/api/auth/oauth/*`. The OAuth status handlers only checked that a non–`_cookie_session` access token **existed**, not that it was still valid. `authenticateToken` on data routes validates the JWT with PingOne — expired tokens failed there first.

**Fix**: Apply `refreshIfExpiring` to the `/api/auth/oauth` path prefix in `server.js` so tokens refresh before OAuth status and related handlers run.

**Tests**: Existing `tokenRefresh` / OAuth integration coverage; manual verification on Vercel.

---

## 2026-03-25 — Redis cold-start 500 on `/api/accounts/my`

**Symptom**: "Failed to load your account information" banner after login.  
**Error log**: `{"error":"server_error","error_description":"An internal server error occurred","path":"/api/accounts/my"}`

**Root cause**:  
`RedisStore.get()` was calling `cb(err)` when Upstash had not yet completed its TLS handshake.
`express-session` propagated that error to Express's `next(err)`, which `oauthErrorHandler` converted to a 500.

**Fix**:  
Wrapped `RedisStore.get/set/destroy` in `services/faultTolerantStore.js`.
`get` errors return `cb(null, null)` (empty session → 401); `set`/`destroy` errors are logged and `cb(null)` is called.

**Tests**:  
`src/__tests__/session-store-resilience.test.js` — `faultTolerantStore wrapper` suite.

---

## 2026-03-25 — `?error=session_error` on customer sign-in

**Symptom**: Clicking "Customer Sign-In" on the homepage redirected to `/login?error=session_error` instead of PingOne.

**Root cause**:  
`oauthUser.js /login` called `req.session.save()` to persist the PKCE state.
When Redis was slow on a cold start the save callback received `err`, and the route responded with `res.redirect('/login?error=session_error')` before the user reached PingOne.
The PKCE state was already stored in a signed cookie (the fallback), so the session save was not essential.

**Fix**:  
Changed the `session.save()` callback in `/login` to log a `console.warn` and redirect to PingOne regardless of the error.
Applied the same non-fatal pattern to `session.regenerate()` and `session.save()` in the `/callback` routes of both `oauthUser.js` and `oauth.js`.

**Tests**:  
`src/__tests__/oauth-login-resilience.test.js` — `oauthUser /login — session.save() resilience` suite.

---

## 2026-03-25 — Eager Redis connect race condition

**Symptom**: Even with fault-tolerant store wrappers, the first cold-start request would block for ~8 s waiting for Redis to connect, and subsequent requests raced against a connect that had not started yet.

**Root cause**:  
`redisClient.connect()` was called lazily inside `awaitSessionRedisReady` (the first request middleware), meaning every cold start incurred the full TLS handshake latency on the hot path.

**Fix**:  
`redisClient.connect()` is now called **eagerly at module load time** in `server.js`, storing the promise as `_redisConnectPromise`.
`awaitSessionRedisReady` simply awaits the already-in-flight promise rather than issuing a new connect.
This allows the TLS handshake to overlap with the remaining Express startup cost.

**Tests**:  
`src/__tests__/session-store-resilience.test.js` — `awaitSessionRedisReady middleware` suite.

---

## 2026-03-25 — `userEmail: null` in session debug

**Symptom**: `/api/auth/debug` returned `"userEmail": null` even though the user had an email in PingOne.

**Root cause**:  
PingOne's `/userinfo` endpoint did not return the `email` claim because the attribute mapping had not been configured in the PingOne application.
`oauthService.createUserFromOAuth()` only looked at `userInfo.email`, so the email was null.

**Fixes applied**:
1. `oauthUser.js` callback decodes the ID token and merges its claims into `userInfo` before calling `createUserFromOAuth`, providing a fallback when `/userinfo` is incomplete.
2. `oauthService.createUserFromOAuth()` also checks `userInfo.email_address` (PingOne alternate claim) before giving up.
3. User configured the PingOne attribute mapping (permanent fix at the IdP level).

**Tests**:  
`src/__tests__/oauthService.test.js` — `createUserFromOAuth — email / name fallbacks` suite.

---

## 2026-03-25 — E2E scope tests incorrectly asserted 403 on `/my` dashboard routes

**Symptom**: CI failures: two tests in `oauth-e2e-integration.test.js` expected 403 on `/api/accounts/my` and `/api/transactions/my` when called with a write-only or accounts-read-only token.

**Root cause**:  
The tests were written assuming scope enforcement applied to all routes.
The `/my` routes are intentionally **scope-free** (BFF dashboard pattern): any authenticated user can read their own data regardless of which scopes are in the Bearer token.
Scope enforcement is only applied to admin/collection endpoints (`GET /api/transactions`, `GET /api/accounts`, etc.).

**Fix**:  
Updated the two tests to:
- Assert 200 on `/api/accounts/my` and `/api/transactions/my` for any valid token.
- Assert 403 on `GET /api/transactions` (collection endpoint) to verify that scope enforcement still works.

**Tests**:  
`src/__tests__/oauth-e2e-integration.test.js` — `Scope-based Access Control in E2E Flow` suite.

---

## Rule: Test Every Bug Fix

When fixing a production bug:
1. Add an entry here describing the symptom, root cause, and fix.
2. Write (or update) a focused unit test that reproduces the bug and verifies the fix.
3. Run the full suite (`npm test` in `banking_api_server/`) before committing.
4. The PR description must reference the test file and test name.
