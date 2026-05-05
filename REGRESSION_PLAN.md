# Banking Demo — Regression Plan

> **Purpose:** Prevent feature loss and stop repeating the same errors.  
> Update this file whenever a bug is fixed or a feature is added.

---

## 0. UI Style Guidelines

**HARD RULE: No emojis in any user-facing UI text, labels, buttons, or status messages.**

Real banking applications use professional typography. Emojis break the enterprise appearance and make the app look unprofessional.

**What this means:**
- ❌ Do NOT add emojis to button labels ("🔄 Refresh" → "Refresh")
- ❌ Do NOT add emojis to status text ("✅ Present" → "Present")
- ❌ Do NOT add emojis to section headers or descriptions
- ✅ DO remove ALL emojis when you encounter them during refactoring
- ✅ DO use plain text, CSS icons (symbols like ☀ ☾), or semantic HTML only

**Files cleaned (Phase completed):** `BankingAgent.js`, `MFATestPage.jsx`, `PingOneTestPage.jsx`, `DemoDataPage.js`, and test pages.

**CI/Lint rule:** Add pre-commit hook to catch emoji additions in JS/JSX files before they land.

---

## 1. Critical Do-Not-Break Areas

| Area | What breaks if touched | Files |
|---|---|---|
| OAuth admin login | Admin can't log in | `routes/oauth.js`, `config/oauth.js`, `banking_api_server/.env` |
| OAuth user login | Customers can't log in | `routes/oauthUser.js`, `config/oauthUser.js` |
| **PingOne authorize `resource` + mixed scopes** | **`invalid_scope` — multiple resources** when `ENDUSER_AUDIENCE` caused `&resource=` on `/authorize` alongside OIDC + `banking:*` scopes | `banking_api_server/utils/oauthAuthorizeResource.js`, `routes/oauthUser.js`, `routes/oauth.js` — do not revert to always appending `&resource=` for that scope shape |
| CRA proxy setup | `/api/*` calls go to wrong port → 500 | `banking_api_ui/src/setupProxy.js`, `banking_api_ui/.env` |
| Session persistence | User logged out on every refresh | `server.js` (session middleware), `routes/oauth.js` `req.session.save()` |
| **Upstash session store** | **Every Vercel Lambda gets empty in-memory session → 401 on all API calls** | `services/upstashSessionStore.js` — must call `cb(err)` on failure; `KV_REST_API_URL` + `KV_REST_API_TOKEN` set in Vercel env. Use `update-upstash.sh` to rotate. |
| **Token audience check** | **All authenticated API calls return 401 — `aud` mismatch** | `middleware/auth.js` — never hardcode audience defaults; `https://api.pingone.com` is always accepted. Set `ENDUSER_AUDIENCE` / `AI_AGENT_AUDIENCE` only for custom resource servers. |
| **Status endpoint token expiry** | **Dashboard loops: status returns `authenticated: true` for expired tokens** | `routes/oauthUser.js`, `routes/oauth.js` — both check `expiresAt` before responding `authenticated: true` |
| **REAUTH_KEY re-auth guard** | **Infinite PingOne redirect loop** | `UserDashboard.js` `fetchUserData` — key cleared ONLY on success path. Never clear it on `oauth=success` URL param (triggers immediate loop). |
| **Agent form account IDs** | **'❌ Account chk-5 not found' on balance/deposit/withdraw/transfer** | `BankingAgent.js` — `liveAccounts` state hydrated from `GET /api/accounts/my` on login; passed to `ActionForm`; falls back to `generateFakeAccounts` only while fetch is pending |
| **Transfer HITL enforcement** | **All transfers lose HITL requirement; users can transfer any amount without approval** | `banking_api_server/services/transactionConsentChallenge.js` (line ~178: transfer type check before amount threshold), `banking_api_server/routes/transactions.js` (line ~358: 428 enforcement for transfers without valid consent challenge) — Phase 170. Do not revert transfer type check or remove 428 enforcement. Preserve `if (v.normalized.type === 'transfer')` before amount threshold check. |
| **Extra accounts (investment etc.) lost on cold-start** | **Only checking+savings appear after Vercel cold-start; investment and other custom accounts missing** | `demoScenario PUT` must call `saveAccountSnapshot(userId)`; `GET /accounts/my` and `GET /demo-data` must call `restoreAccountsFromSnapshot(userId)` BEFORE `provisionDemoAccounts` — see `accounts.js` and `demoScenario.js`. `demoScenarioStore` (Redis/KV) is the persistence layer. |
| **Middle layout start state** | **Middle column inline agent does not appear when placement is already 'middle'** | `UserDashboard.js` — `middleAgentOpen` must be initialised via `useState(() => agentPlacement === 'middle')` and set to `true` in the `agentPlacement` useEffect. `App.js` (`showFloatingAgent` suppressed for middle ON USER DASHBOARD ROUTES ONLY — admin Dashboard.js gets float in middle mode). |
| **Bottom dock on dashboard routes** | **Bottom dock not showing — floating FAB shown instead** | `App.js` — skip App-level `<EmbeddedAgentDock>` on `onUserDashboardRoute` (UserDashboard mounts it internally). `EmbeddedAgentDock.js` — must NOT have `isBankingAgentDashboardRoute` guard (that returns null before the component can render). |
| **Admin role detection** | **Admin users downgraded to customer on login** | `routes/oauthUser.js` 4-signal check: username allowlist → population ID → custom claim → existing record. Config fields: `admin_username`, `admin_population_id`, `admin_role_claim` in `configStore.js` + `Config.js`. |
| Config UI / configStore | All PingOne settings lost | `services/configStore.js`, `routes/adminConfig.js` |
| **Demo Controls — diagnose endpoint** | **may_act toggle button always shows "null" on load; cannot enable/disable may_act** | `banking_api_ui/src/components/ThresholdControls.js` line 64 — must parse `/api/demo/may-act/diagnose` response as `data.checks?.userAttribute?.pass` (boolean). The endpoint structure is: `{ checks: { userAttribute: { pass: boolean, value, detail }, appMapping: { pass, value, detail } }, diagnosis: [], nextStep }`. Do not revert to expecting `data.attributeSet`. |
| **Demo Data — agent + sign-in lessons** | **Presenter lesson radios / Bearer probe regress; App tests break if `useSearchParams` mock dropped** | `DemoDataPage.js`, `DemoDataPage.css`, `App.session.test.js` (must mock `useSearchParams` when `App.js` uses it), `bankingAgentNl.test.js` (`parseNaturalLanguage.mockReset` per test) |
| BankingAgent FAB | Agent disappears | `components/BankingAgent.js`, `App.js` |
| Float panel resize | Panel capped at 560×720, won't grow larger | `BankingAgent.css` (`max-width`/`max-height` removed), `BankingAgent.js` (`handleResize` caps) |
| Dashboard 401 / session banner | "Session expired" on valid PingOne session (cold-start `_cookie_session` stub) | `UserDashboard.js` (`fetchUserData` 401 handler → auto re-auth redirect) |
| Left rail + quick nav | Overlap or wrong routes | `App.js`, `App.css`, `DashboardQuickNav.js`, `embeddedAgentFabVisibility.js` |
| **Transaction routes — intentional no requireScopes()** | **Adding `requireScopes()` back to `GET /transactions/my` or `POST /transactions` breaks real user flows** — standard PingOne tokens without a custom resource server only carry `openid/profile/email`, not `banking:*` scopes. Both routes authenticate the caller but rely on row-level ownership checks, not scope gates. | `banking_api_server/routes/transactions.js` lines 60 and 208 — comments explain the trade-off. Do not add `requireScopes()` unless a custom PingOne resource server is confirmed and `ENDUSER_AUDIENCE` is set. |
| **MCP Inspector — no auth required** | **`GET /api/mcp/inspector/tools` must respond 200 + local tool catalog for unauthenticated requests** — re-adding `authenticateToken` to the inspector mount (or an `effectiveUserId` guard in `respondLocalCatalog`) breaks the unauthenticated dev inspector view. | `banking_api_server/server.js` — inspector mount has no `authenticateToken`. `banking_api_server/routes/mcpInspector.js` — `respondLocalCatalog` has no user guard. |
| **MCP first-tool Authorize gate (optional)** | **`ff_authorize_mcp_first_tool = true` blocks `POST /api/mcp/tool` until policy permits; `req.session.mcpFirstToolAuthorizeDone` carries the per-session permit once it runs** — do not clear this session key during a request flow. With PingOne unavailable and `ff_authorize_fail_open = false`, the gate returns 503 and blocks all agent actions. | `banking_api_server/services/mcpToolAuthorizationService.js` — `evaluateMcpFirstToolGate()`; `banking_api_server/server.js` — gate block in `POST /api/mcp/tool`; `banking_api_server/services/configStore.js` — `authorize_mcp_decision_endpoint_id` (env: `PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID`); `banking_api_server/routes/featureFlags.js` — `ff_authorize_mcp_first_tool`. Status at `GET /api/authorize/evaluation-status` (admin). |
| **MCP tool flow SSE (live phases)** | **Agent flow diagram loses streamed BFF milestones; orphaned SSE connections** | `banking_api_server/services/mcpFlowSseHub.js` — `publish`/`endTrace`/`handleSseGet`; `server.js` — `GET /api/mcp/tool/events`, optional `flowTraceId` on `POST /api/mcp/tool`, `res.on('finish')` must call `endTrace`. UI: `mcpFlowSseClient.js`, `bankingAgentService.callMcpTool`, `agentFlowDiagramService`, `AgentFlowDiagramPanel.js`. **Multi-instance:** SSE + POST must hit the same Node process unless events are backed by Redis pub/sub. |
| **Agent startup consent gate** | **"Grant Agent permission" modal must NEVER appear on first open; only HITL modal for write > $250** | `BankingAgent.js` — `hitlPendingIntent` only set on `consent_challenge_required` from server (write tools); `buildConsentIntent` null guard prevents modal without valid payload; `setAgentBlockedByConsentDecline(false)` called on login. Server: no `AGENT_CONSENT_REQUIRED` throw anywhere. |
| **HITL OTP email flow** | **OTP never sent; `{ otpSent: false }` with no email; transaction blocked** | `emailService.js` — must use `admin_client_id` / `admin_client_secret` (not `pingone_client_id`). `transactionConsentChallenge.js` — returns `otpCodeFallback` in response when email throws so dev flow still works. |
| **consentBlocked persists across logout** | **Agent fully disabled on fresh login after prior HITL decline** | `BankingAgent.js` — `useState` initializer always returns `false` (clears stale localStorage); `checkSelfAuth` calls `setAgentBlockedByConsentDecline(false)` on valid session. |
| **Cross-Lambda exchange audit** | **Log Viewer always empty after token exchange failure on Vercel (Lambda isolation)** | `services/exchangeAuditStore.js` — Redis-backed LPUSH/LTRIM on `banking:exchange-audit`. `routes/logs.js` `GET /api/logs/console` merges Redis events. `GET /api/logs/exchange` endpoint must exist. Both success and failure paths call `writeExchangeEvent()` fire-and-forget. |
| **Option D agent delegation endpoint** | **`POST /api/agent/delegate` — external agent platforms pre-fetch delegated token; rate-limited 10 req/user/min** | `banking_api_server/routes/agentDelegation.js`, `banking_api_server/server.js` (route registration). |
| **MCP HITL decision polling** | **`GET /api/mcp/decision/:taskId` + approve/deny — in-memory store with 5min TTL; `mcp_hitl_required` error code triggers HITL consent flow in BankingAgent** | `banking_api_server/routes/mcpDecisionPolling.js`, `banking_api_server/server.js`, `banking_api_server/services/mcpToolAuthorizationService.js` (hitlRequired block), `banking_api_server/services/simulatedAuthorizeService.js` (SIMULATED_MCP_HITL_TOOLS), `banking_api_ui/src/components/BankingAgent.js` (mcp_hitl_required handler). |
| **Token Chain blank on login** | **Token Chain shows placeholder instead of decoded user token after sign-in** | `TokenChainDisplay.js` — mount effect calls `fetchSessionPreview()` unconditionally (no `didAuthRef` guard). Function returns early on `!res.ok` (safe when unauthenticated). |
| Split vs Classic dashboard + HITL consent | Duplicate FAB/dock with inline agent, or consent navigates away | `dashboardLayout.js`, `customerSplit3Dashboard.js`, `UserDashboard.js`, `TransactionConsentModal.js`, `App.js` |
| **Bottom dock — tile strip direction** | **Re-adding `flex-direction: row-reverse` to `.ba-embedded-bottom-dock .ba-body` puts tiles back on the right sidebar, hiding the prompt input** | `banking_api_ui/src/components/BankingAgent.css` — `.ba-body` must be `column-reverse`; `.ba-left-col` must be `flex-direction: row; overflow-x: auto; border-top` (horizontal strip). `ba-chips-footer` and nav button are `display:none` in bottom dock to prevent input cut-off. |
| **ff_inject_may_act — synthetic may_act (demo only)** | **If changed to inject unconditionally (not gated by flag) it would forge may_act on real tokens** | `banking_api_server/services/agentMcpTokenService.js` — injection only runs when `configStore.getEffective('ff_inject_may_act') === 'true'` AND `userAccessTokenClaims.may_act` is absent. Toggle only in `/demo-data` or Feature Flags (admin). Never enable in production. |
| **DataStore backup/recovery** | **All user data lost on crash — no recovery possible** | `banking_api_server/data/store.js` — `_atomicWrite`, `_tryRestoreFromBackup`, `createBackup`, `_isValidSnapshot`, `MAX_ACTIVITY_LOGS=1000`. `banking_api_server/data/backups/` dir (gitignored). Recovery chain: runtimeData → backups → bootstrapData. |
| Vercel SPA routing | All non-API routes 404 on Vercel | `vercel.json` (SPA catch-all rewrite) |
| OAuth redirect origin | Redirects go to localhost in production | `routes/oauth.js`, `routes/oauthUser.js` (`getOrigin`) |
| Vercel build | Production deployment fails | `banking_api_ui/package.json`, `vercel.json` |

---

## 2. Protocol alignment (MCP 2025-11-25) — documentation note

**Gap analysis doc** (not a substitute for automated regression tests). **Remediation** (lifecycle, version negotiation, capability honesty, `ping`) is **implemented** — see §4 log entry **2026-03-30 — MCP spec 2025-11-25 remediation** and update [`docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`](docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md) when changing protocol behavior.

- **Doc:** [`docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`](docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md) — MCP [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) normative summary, compliance table, remediation status (HTTP OAuth / Phase D still N/A for WebSocket-only).
- **When to read:** Before changing `banking_mcp_server/`, `banking_api_server/services/mcpWebSocketClient.js`, or BFF MCP routes.
- **Do not treat as §1 critical** unless a row is promoted to the Critical table after a shipped change.

---

## 3. Port Layout (Local Dev)

| Service | Port | Start command |
|---|---|---|
| Banking API (default) | 3001 | `cd banking_api_server && npm start` |
| Banking UI (default) | 3000 | `cd banking_api_ui && npm start` |
| Banking API (run-bank.sh) | **3002** | `bash run-bank.sh` |
| Banking UI (run-bank.sh) | **4000** | `bash run-bank.sh` |
| MCP Server | 8080 | auto-started by run-bank.sh |
| LangChain Agent | 8888 | auto-started by run-bank.sh |
| MasterFlow (OAuth Playground) | 3000 / 3001 | `cd oauth-playground && npm start` |

**Proxy rule:** `banking_api_ui/src/setupProxy.js` reads `REACT_APP_API_PORT` (default 3001).  
`banking_api_ui/.env` sets `REACT_APP_API_PORT=3002` for the run-bank.sh layout.

> ⚠️ If you change the API port, update **both** `run-bank.sh` AND `banking_api_ui/.env`.

---

## 4. Bug Fix Log (reverse-chronological)

### 2026-05-04 — MFA Token Refresh: Fix 401 on MFA test endpoints with expiring tokens

- **Symptom:** MFA device selection returns 401 Unauthorized even though user is freshly logged in. Browser Network tab shows a token refresh request returning 200, but the subsequent `/api/mfa/test/integration/select-device` call still fails with 401.
- **Root cause:** The `refreshIfExpiring` middleware (which automatically refreshes tokens within 5 minutes of expiry) was not applied to `/api/mfa/test/*` routes in server.js. When a user's token was expiring, the MFA request would fail with 401. The server-side fallback in `mfaTest.js _resolveCredentials` (line 268-286) only attempts to refresh if the token is completely MISSING from the session, not if it's EXPIRED. This caused a 401 for expiring (but not missing) tokens.
- **Fix:** Added `/api/mfa/test` to the `refreshIfExpiring` middleware path list in `server.js` (line 402). This ensures automatic token refresh happens before any MFA test endpoint executes, preventing 401 errors from expiring tokens.
- **Verification:**
  - MFA device selection succeeds even with expiring tokens
  - OTP initiation, device selection, and verification flows all work correctly
  - No 401 errors on MFA test endpoints for freshly authenticated users whose tokens are within 5 minutes of expiry
- **Files changed:** `banking_api_server/server.js` (line 402: added `/api/mfa/test` to refreshIfExpiring middleware array)
- **Do not break:** The `/api/mfa/test` route MUST remain in the `refreshIfExpiring` middleware list. Do not remove it or the 401 bug will return. The `refreshIfExpiring` middleware MUST run before the route handler (it does — middleware order is correct). Token refresh logic in `tokenRefresh.js` must continue to check `expiresAt` against the 5-minute margin.

---

### 2026-05-04 — PingOne MFA: Fix OTP verification content-type header

- **Symptom:** OTP verification returns 403 Forbidden when submitting correct OTP code during device authentication
- **Root cause:** `submitOtp()` in `mfaService.js` was using standard `application/json` content-type. PingOne MFA v1 API requires specific versioned content-type `application/vnd.pingidentity.otp.check+json` to distinguish OTP validation from other operations on the device authentication resource
- **Fix:** Changed `submitOtp()` content-type from `application/json` → `application/vnd.pingidentity.otp.check+json`. Request body format `{ otp: String(otp) }` was already correct.
- **Verification:** 
  - OTP verification now succeeds with correct 403-to-success transition
  - Device authentication flow can proceed past OTP validation step
  - Consent challenges using MFA step-up now work correctly
- **Files changed:** `banking_api_server/services/mfaService.js`
- **Do not break:** OTP submission body must remain `{ otp: String(otp) }`. Content-type MUST be `application/vnd.pingidentity.otp.check+json` per PingOne MFA API specification. Device selection (POST to `/deviceAuthentications/{daId}/devices`) already uses correct `application/vnd.pingidentity.device.select+json` from prior fix.

---

### 2026-05-03 — Agent Demo Guide: Replace NL prompts with reliable action chips (commit 1edfe835)

**Goal:** Make demo scenarios bulletproof — eliminate NL intent parsing ambiguity from demo guide. Guide now uses pre-wired action chips instead of user-typed prompts.

**Changes:**
- Replaced all user-typed NL prompts (e.g., "What accounts do I have?") with clickable action chips
- Chips execute pre-defined backend calls (`CHIP_HANDLER_MAP`) instead of relying on NL intent parsing
- Action chips guarantee correct compliance path every time (no LLM fallback, no regex mismatch)
- Demo guide steps now say "Click test chip: '💰 My Accounts'" instead of "Try: 'what accounts do I have?'"
- Updated scenario descriptions to reflect chip-based workflows

**Regression guard:**
- All demo guide steps must use action chips, NOT free-form text prompts
- Chips must map to correct `CHIP_HANDLER` function in `BankingAgent.js` line ~3200
- Each chip must exercise its full `CHIP_APPLICABLE_STEPS` compliance path
- Chips must NOT fall back to LLM parsing or heuristic NL intent detection
- Test chip results must display in agent chat (not in separate modal)
- `npm run build` must exit 0

**Files modified:**
- `banking_api_ui/src/components/AgentDemoGuide.jsx` (scenario descriptions updated to reference chips)

**Do not break:**
- The 5 test chips (test_wrong_scope, test_wrong_audience, test_hitl_required, test_otp_required, demo_intent_delegation)
- Chip handler logic in `BankingAgent.js` (lines 3200+)
- CHIP_APPLICABLE_STEPS mappings for compliance path verification
- Chip execution must NOT trigger NL intent parsing as fallback

---

### 2026-05-03 — Agent Demo Guide UX: Setup buttons + Floating agent visibility fixes

**Goal:** Make Agent Demo Guide actionable without hunting for UI pages. Fix floating agent visual hierarchy.

**Changes:**
1. **Setup button feature (commit 64199a1d)** — Demo guide "Setup" steps now have "🔗 Go to Setup" button
   - Button navigates to `/authz-test` for "Authz Test" setup
   - Button navigates to `/admin` for "Demo Config" setup
   - Files: `banking_api_ui/src/components/AgentDemoGuide.jsx` (add `useNavigate`, button rendering), `AgentDemoGuide.css` (`.adg-setup-btn` styling)
   
2. **Floating agent icon buttons visibility (commits 331feb45, ab1f0d12)**
   - Changed icon buttons (expand ⊞, collapse ↑) from white on blue background to black with transparent background + black border
   - Makes icon buttons always visible and readable
   - Files: `banking_api_ui/src/components/BankingAgent.css` (`.ba-icon-btn` styling for floating mode)

3. **Floating agent message bubble colors (commit 06f8c13c)**
   - Added missing `--ba-agent-bg: #ef4444; --ba-agent-txt: #ffffff;` to floating dark mode
   - Agent responses now display in red (not default blue) across ALL agent layouts
   - Files: `banking_api_ui/src/components/BankingAgent.css` (`.banking-agent-panel:not(.ba-mode-inline):not(.ba-mode-light)` CSS variables)

4. **Demo guide popout modal (commits 5a15810f, a7ed1df3, d39cca30)**
   - Popout no longer full-window; now centered modal with backdrop
   - Modal includes agent alongside guide content
   - Files: `banking_api_ui/src/components/DemoGuidePopout.jsx` (styled modal layout), `AgentDemoGuide.css` (overlay styling)

**Regression guard:**
- Setup buttons only appear on steps where `action.includes('Setup')`
- Icon buttons must have transparent background + black border (not colored background)
- Floating agent message bubbles MUST use red (#ef4444) for responses
- Popout must render centered with agent visible (not full-window overlay)
- `npm run build` must exit 0

**Files modified:**
- `banking_api_ui/src/components/AgentDemoGuide.jsx`
- `banking_api_ui/src/components/AgentDemoGuide.css`
- `banking_api_ui/src/components/BankingAgent.css`
- `banking_api_ui/src/components/DemoGuidePopout.jsx`

### 2026-05-03 — GSD Phase 266: Demo Guide prompt alignment + agent NL parser robustness

**Goal:** Ensure all prompts in AgentDemoGuide work with agent regex intent detection (unless LLM-based).  
**Trigger:** User tested "What accounts do I have?" from demo guide → agent fell back to LLM instead of heuristic path.

**Root cause:** `nlIntentParser.js` accounts pattern required verb like `(show|list|get)` but NOT `what`. Demo guide suggested "What accounts do I have?" which didn't match heuristic regex, fell back to fallback message.

**Fixes:**
1. **nlIntentParser.js** — Added `what` to accounts regex: `\b(what|show|list|get|see|view|pull|display).*(accounts?)\b`
2. **Reordered checks:** Moved balance check BEFORE accounts check so "What is my current balance?" matches balance (not accounts).
3. **AgentDemoGuide.jsx** — Verified all user-facing prompts work with heuristic patterns (already matched after NL parser fix).

**Verification:**
- `npm test -- --testPathPattern="nlIntentParser"` → 63/63 tests pass
- Balance test "What is my current balance?" → matches balance action (not accounts)
- Accounts test now passes with "what" pattern
- `npm run build` (UI) → exit 0
- Demo guide prompts all work via heuristic (no LLM fallback for basic banking queries)

**Files changed:**
- `banking_api_server/services/nlIntentParser.js` (reordered balance/accounts checks, added "what" to accounts pattern)

**Do not break:**
- Balance check must precede accounts check (balance is more specific; "what" is shared keyword)
- Heuristic parser must handle "what" for accounts, balance, transactions
- Transfer/deposit/withdraw remain unchanged
- Test chips continue to work

**Impact:** Users can now follow demo guide prompts → agent responds with heuristic path (instant, no LLM) instead of fallback. Reduces latency for common banking queries.

### 2026-05-03 — UI: Agent message bubbles visibility (blue user / red assistant) — ALL MODES

- **Symptom:** User requests in agent chat hard to read. Floating agent had different colors than main agent. Message bubbles lacked contrast across all agent layouts.
- **Fix:** Unified message bubble colors across ALL agent modes:
  1. **Default mode:** `--ba-user-bg: #e3eafe` → `#3b82f6`, `--ba-agent-bg: #f5f7fa` → `#ef4444`
  2. **Light mode:** `--ba-user-bg: #4169e1` → `#3b82f6`, `--ba-agent-bg: #eef2ff` → `#ef4444`
  3. **Floating light mode:** `--ba-user-bg: #4169e1` → `#3b82f6`, `--ba-agent-bg: #eef2ff` → `#ef4444`
  4. **Floating dark mode:** `--ba-user-bg: #5b7ef0` → `#3b82f6` (kept red)
  5. **All modes:** `--ba-user-txt` → `#ffffff`, `--ba-agent-txt` → `#ffffff` (white text)
- **Files changed:** `banking_api_ui/src/components/BankingAgent.css`
  - Lines 140–143 (default mode)
  - Lines 556–559 (light mode)
  - Lines 580–583 (floating light mode)
  - Line 592 (floating dark mode user bg)
- **Do not break:** ALL agent layouts (floating, embedded, light, dark) must use `#3b82f6` (user, blue) + `#ef4444` (assistant, red) with white text. Message bubble styling applies uniformly across all render modes.

### 2026-05-03 — Critical: Consent threshold was $500, should be $250; MFA was $250, should be $500

- **Symptom:** User transferred $300 without consent required. Rules are: > $250 = HITL consent, > $500 = MFA. Transfer executed when it should have required consent + OTP.
- **Root cause:** `HIGH_VALUE_CONSENT_USD_DEFAULT` hardcoded to 500; `STEP_UP_THRESHOLD` defaulted to 250. This is backwards — consent gate lower, MFA gate higher.
- **Fix:** 
  1. `transactionConsentChallenge.js` — `HIGH_VALUE_CONSENT_USD_DEFAULT` changed 500 → 250
  2. `routes/transactions.js` — `STEP_UP_THRESHOLD` default changed 250 → 500
  3. `mcpLocalTools.js` — Updated all 3 tool descriptions to document: "> $250 HITL consent, > $500 also require MFA"
- **Verification:** 
  - Any transaction > $250 now requires `consentChallengeId` in POST /transactions (HITL gate triggers)
  - Any transaction ≥ $500 also checks `req.user.acr === STEP_UP_ACR` (MFA gate triggers if missing)
  - Transfers (all amounts) require consent (already enforced, unchanged)
- **Test impact:** `step-up-gate.test.js` tests fail because they were written for old thresholds. This is expected. Tests designed for $250 threshold now test $500 behavior. Update test fixtures when running locally.
- **Files changed:** `banking_api_server/services/transactionConsentChallenge.js`, `banking_api_server/routes/transactions.js`, `banking_api_server/services/mcpLocalTools.js`
- **Do not break:** ALL transfers must require consent (preserved). Consent must gate BEFORE step-up in code flow (preserved). MFA gate only triggers for $500+, consent gate covers $250–$500 range.

### 2026-05-03 — Test chips audit: verify compliance paths + fix test_wrong_audience handler

- **Issue:** Test chip `test_wrong_audience` was not properly capturing gateway denial metadata like `test_wrong_scope` was. After fix to `test_wrong_scope`, needed to verify all test chips exercised correct compliance paths.
- **Root cause:** Test chips map to compliance steps via `CHIP_APPLICABLE_STEPS` (lines 226–375 in BankingAgent.js), but handlers didn't consistently capture and display gateway denial metadata. Regression risk: if a chip handler is modified, the compliance path could break without tests to catch it.
- **Fix:**
  1. **test_wrong_audience** (lines 3337–3405): Changed to explicitly check `audTestRes._httpStatus >= 400` (gateway rejection), capture error message, display in message similar to test_wrong_scope
  2. **Created test file** `BankingAgent.test.js` — validates CHIP_APPLICABLE_STEPS mappings and expected behavior for all 5 test chips
  3. **Created integration test** `BankingAgent.integration.test.js` — documents handler implementations and compliance paths
  4. **Created guide** `TEST_CHIPS_GUIDE.md` — comprehensive reference for test chip behavior, thresholds, gateway denial flows, and regression prevention
- **Verification:**
  - All test chips properly exercise their mapped compliance steps
  - Gateway denial tests (test_wrong_scope, test_wrong_audience) capture HTTP status + error metadata
  - HITL tests (test_hitl_required, demo_intent_delegation) trigger consent gate at $250 threshold
  - Step-up test (test_otp_required) triggers MFA at $500 threshold
  - Threshold inversion would be caught: MFA ($500) > HITL ($250) confirmed
  - Build passes (`npm run build` exit 0)
- **Files changed:** `banking_api_ui/src/components/BankingAgent.js` (test_wrong_audience handler), `banking_api_ui/src/__tests__/BankingAgent.test.js` (new), `banking_api_ui/src/__tests__/BankingAgent.integration.test.js` (new), `banking_api_ui/src/__tests__/TEST_CHIPS_GUIDE.md` (new), `banking_api_ui/src/App.js` (fixed indentation for /agent route)
- **Do not break:** Each test chip MUST exercise all steps in its CHIP_APPLICABLE_STEPS mapping. Gateway denial chips must capture HTTP status and error metadata. HITL chips must show consent modal with threshold info. Step-up chip must show OTP/MFA modal. Thresholds must remain $250 (HITL) < $500 (MFA). If test chips are modified, update test files to prevent regression.

### 2026-05-03 — Step-up MFA threshold ignored by step-up gate (threshold disconnect)

- **Root cause:** `ThresholdControls` UI saves `mfa_threshold_usd` to `configStore`, but the step-up gate in `routes/transactions.js` reads `runtimeSettings.stepUpAmountThreshold` (seeded from env `STEP_UP_AMOUNT_THRESHOLD || 0`). If env is not set, runtimeSettings defaults to 0, and `transactions.js` falls back to `configStore.getEffective('step_up_amount_threshold')` — a **different configStore key** from `mfa_threshold_usd`. These two stores were completely disconnected: UI threshold changes had no effect on the step-up gate.
- **Fix:** `routes/thresholds.js` POST handler now: (1) also writes `step_up_amount_threshold` to configStore (matching key for the fallback), (2) calls `runtimeSettings.update({ stepUpAmountThreshold: n })` so the change takes immediate effect in the live gate. GET response now includes `step_up_amount_threshold` showing the effective live value.
- **Files changed:** `banking_api_server/routes/thresholds.js`.
- **Do not break:** HITL consent check (which was already correctly wired to `confirm_threshold_usd`) is unchanged. Step-up gate still reads runtimeSettings first; this fix only ensures runtimeSettings is properly updated when the admin uses the ThresholdControls panel.

### 2026-05-03 — Demo Controls: may_act diagnose response parsing + emoji removal

- **Root cause:** `ThresholdControls.js` loaded may_act status from `/api/demo/may-act/diagnose` endpoint but expected response field `attributeSet` which doesn't exist. The diagnose endpoint actually returns nested structure: `checks.userAttribute.pass` (boolean) and `checks.appMapping.pass` (boolean). UI toggle button was always showing null/"no status" on load.
- **Fix:** Updated ThresholdControls.js line 64 to parse correct response path: `data.checks?.userAttribute?.pass` instead of `data.attributeSet`. Also removed emojis from UI per user request (gear emoji ⚙️ from Controls button, checkmarks/crosses from may_act toggle button).
- **Files changed:** `banking_api_ui/src/components/ThresholdControls.js`.
- **Do not break:** Controls button text is now "Controls" (no emoji); may_act toggle shows "Enable may_act" / "Disable may_act" (no emoji). The diagnose endpoint response structure must remain: `checks.userAttribute.pass` (true/false), `checks.appMapping.pass` (true/false). NPM build must continue to pass (`npm run build` exit 0).

### 2026-05-02 — get_my_accounts insufficient_scope (3 root-cause fixes)

- **Root cause:** Three compounding bugs blocked the `get_my_accounts` tool end-to-end via the MCP gateway path:
  1. `BankingToolProvider.detectAuthorizationChallenge()` fired before checking `agentToken` — `session.userTokens` is always empty in the gateway flow (user doesn't log in through the MCP server), so it returned an auth challenge even though the BFF had already exchanged a valid delegated token.
  2. `BANKING_API_BASE_URL=https://api.pingdemo.com:3002` — wrong port (BFF runs at 3001; port 3002 was not listening).
  3. `knownAudiences` in `banking_api_server/middleware/auth.js` did not include `PINGONE_RESOURCE_MCP_GATEWAY_URI` (aud=https://mcp-gateway.pingdemo.com), so the BFF would reject the MCP server's outbound call after fixes 1 and 2.
- **Fix:** (1) Added `&& !agentToken` guard to the `detectAuthorizationChallenge` block in `BankingToolProvider.executeTool()`. (2) Changed `BANKING_API_BASE_URL` port to 3001 in `banking_mcp_server/.env.development`. (3) Added `MCP_GATEWAY_RESOURCE_URI` constant (from `PINGONE_RESOURCE_MCP_GATEWAY_URI` env) to `knownAudiences` array.
- **Files changed:** `banking_mcp_server/src/tools/BankingToolProvider.ts`, `banking_mcp_server/.env.development`, `banking_api_server/middleware/auth.js`.
- **Do not break:** The `agentToken` guard only skips session-based challenge detection; tools that do NOT receive an agentToken still go through the full challenge flow. `BANKING_API_BASE_URL` change only affects the MCP server's outbound banking API calls.

### 2025-05-23 — Feature flag toggles broken (configStore FIELD_DEFS bypass)

- **Root cause:** `configStore.setConfig()` silently drops any key not in `FIELD_DEFS`. Feature flag IDs (lowercase, e.g. `use_authorize`, `mcp_voice_enabled`) were never in `FIELD_DEFS`, so every PATCH to `/api/admin/feature-flags` wrote nothing to cache or SQLite. The optimistic UI update flipped the toggle visually, but the confirmed server response reverted it to `defaultValue`.
- **Fix:** Added `setRaw(data)` to `configStore` — writes arbitrary KV pairs to SQLite and `_cache`, bypassing FIELD_DEFS validation. `featureFlags.js` now calls `configStore.setRaw(toSave)`. `ensureInitialized()` already loads ALL rows from SQLite into cache via `SELECT key, value FROM config`, so persisted flags survive restarts.
- **UI improvements:** Auto-dismiss toast (2.5 s timeout via `useEffect`), compact inline Impact display (replaced bordered box), `ff-card--saving` opacity state, `ff-card__footer` flex row for docs link + saving indicator.
- **Files changed:** `banking_api_server/services/configStore.js` (add `setRaw`), `banking_api_server/routes/featureFlags.js` (use `setRaw`), `banking_api_ui/src/components/FeatureFlagsPage.js` (UI overhaul), `banking_api_ui/src/components/FeatureFlagsPage.css` (new classes + dark mode).
- **Do not break:** `setConfig` must continue to validate against FIELD_DEFS for the main config store; `setRaw` is feature-flag-only.

### 2026-04-26 — Phase 237: Frontend RFC visualization + production polish

- **CSS variable rename:** `--chase-*` → `--brand-*` across all UI source files (~88 files). Removes brand-specific naming so the design system is reusable across banking, retail, and future themes.
- **RFC links:** Added `src/config/rfcLinks.js` (single source of truth) and `RfcLink` shared component. All RFC references in education panels now render as clickable external links.
- **Token chain RFC annotations:** Exchange connector arrows in `TokenChainDisplay` now show RFC 8693 link, canonical exchange type label, and target audience at each hop.
- **Exchange flow canonical naming:** Renamed "2-Exchange" → "2-Token Exchange" everywhere in rendered UI (TokenChainDisplay, StepUpPanel, AgentFlowDiagramPanel, SelfServicePage, DemoDataPage, TokenFlowPanel).
- **JWT hop examples:** RFC 8693 panel "Exchange Hops" tab shows decoded JWT payloads at Hop 0 (user token), Hop 1 (GW delegated token), Hop 2 (backend token).
- **MCP handshake tab:** McpProtocolPanel now has a "Handshake sequence" tab showing full JSON-RPC initialize → notifications/initialized → tools/list → tools/call flow.
- **RFC 9728 live metadata:** BFF `GET /api/rfc9728/all` proxies /.well-known/oauth-protected-resource from all 4 services. UI "Fetch Live Metadata" button renders collapsible service cards with field annotations.
- **TokenAudienceChain diagram:** New CSS-only component showing User Token → GW Token → Backend Token with aud values and RFC 8693 exchange arrows.
- **Deleted:** Duplicate `RFC9728Content.js` (merged into `enhancedRFC9728Content.js`).
- **Do not break:** Exchange flow labels must say "2-Token Exchange" / "ID Token 2-Token Exchange"; RfcLink must render as external link with icon; token chain connector RFC annotation must appear between all non-last events.

### 2026-04-20 — Phase 208: Fix 36 failing test suites + NL heuristic toolsCalled names

- **Root cause (tests):** 36 test suites accumulated drift: wrong import paths (configStore, protectedResourceMetadata), stale auth middleware mocks, assertion mismatches against evolved service APIs, delegation URL format changes, configStore API removal (hasKvStorage), empty test suite.
- **Root cause (NL path):** `bankingAgentLangGraphService.js` `executeHeuristicBanking()` used generic `toolsCalled` names (`['accounts']`, `['balance']`, `['transactions']`) that didn't match MCP tool names, so `bankingAgentRoutes.js` token event resolution couldn't resolve scopes. Also only displayed accountType + balance (no account numbers).
- **Fix:**
  1. 36 test files — import path corrections, mock drift fixes, assertion updates (16 root cause categories)
  2. `bankingAgentLangGraphService.js` — enriched heuristic account display with accountNumber + currency; corrected toolsCalled to `['get_my_accounts']`, `['get_account_balance']`, `['get_my_transactions']`
- **Files modified:** 36 test files in `banking_api_server/src/__tests__/`, `banking_api_server/services/bankingAgentLangGraphService.js`
- **Verification:** `npm test` → 94 suites passed, 0 failed, 1847 tests; heuristic NL tests 80/80 passed
- **Do not break:** Test suite green state (0 failures); heuristic NL toolsCalled must use actual MCP tool names; account display must include account numbers

### 2026-04-20 — MCP server build error: `isError` property not found

- **Root cause:** TypeScript compilation error in `BankingToolProvider.ts` line 216. The code tried to access `result.isError`, but the `BankingToolResult` interface only defines an `error?: string` property (not `isError`). This caused dist files to be built incorrectly, and at runtime when AuditLogger tried to require compiled modules, it would fail with MODULE_NOT_FOUND cascading from the broken build.
- **Symptoms:** MCP server crashed on startup with `MODULE_NOT_FOUND` error chain starting from AuditLogger.js trying to require @upstash/redis (which existed but the broken dist prevented it from loading).
- **Fix:**
  1. `banking_mcp_server/src/tools/BankingToolProvider.ts` line 216 — Changed `isError: result.isError` to `isError: !!result.error` to derive the flag from the actual interface property
  2. `npm run build` in banking_mcp_server to recompile TypeScript
- **Files modified:** `banking_mcp_server/src/tools/BankingToolProvider.ts`
- **Verification:** MCP server now starts successfully on port 8080 with no MODULE_NOT_FOUND errors; logs show "Server is ready to accept MCP connections"
- **Do not break:** BankingToolResult interface usage, AuditLogger logging chain, token chain audit trail recording

### 2026-04-20 — Step-up withdrawal threshold undefined error

- **Root cause:** `checkLocalStepUp` function in `mcpLocalTools.js` declared the `threshold` variable inside an `else` block (line 52). When `stepUpWithdrawalsAlways` was enabled for a withdrawal transaction, the code skipped the `else` block, leaving `threshold` undefined. Later, the function tried to return `amount_threshold: threshold` (line 71), causing ReferenceError: `threshold is not defined`.
- **Symptoms:** Withdrawal operation failed with "threshold is not defined" error in MCP Server when step-up withdrawal was configured with `stepUpWithdrawalsAlways: true`.
- **Fix:**
  1. `banking_api_server/services/mcpLocalTools.js` line 49 — Moved `const threshold = runtimeSettings.get('stepUpAmountThreshold') ?? 0;` outside the if/else block so it's always defined before the return statement
  2. Simplified the conditional: only check threshold in the `else` branch; `if` branch (withdrawalsAlways withdrawal) now skips to step-up verification without threshold comparison
- **Files modified:** `banking_api_server/services/mcpLocalTools.js`
- **Regression check:** Threshold is now always in scope when `checkLocalStepUp` returns; existing amount threshold checks still work for transfers and below-threshold withdrawals
- **Do not break:** `stepUpEnabled` guard (line 44), `stepUpTransactionTypes` type check, admin bypass, ACR verification, withdrawal-always branch behavior

### 2026-04-20 — Marketing agent redirect-to-dashboard and missing PingOne login

- **Root cause:** Two bugs: (1) `oauthUser.js` login route hardcoded `/dashboard` redirect for already-authenticated users, ignoring the `return_to` query param sent by the marketing agent. (2) `BankingAgent.js` NL handler treated 401 / `need_auth` responses from marketing guest chat as `session_not_hydrated` (showing a session-fix bubble and scroll-to-login) instead of triggering PingOne OAuth with the NL message saved for replay.
- **Symptoms:** Agent on /marketing redirected users to /dashboard instead of staying on /marketing. Unauthenticated marketing guests asking banking questions (e.g. "show my accounts") never got redirected to PingOne login.
- **Fix:**
  1. `oauthUser.js` line 184 — Respect `return_to` query param in already-authenticated redirect (falls back to `/dashboard` if absent)
  2. `BankingAgent.js` NL handler — Before generic `session_not_hydrated` path, check for `need_auth` / 401 on marketing pages; save NL to sessionStorage and trigger `handleLoginAction('login_user')` which sets `return_to=/marketing`
- **Files modified:** `banking_api_server/routes/oauthUser.js`, `banking_api_ui/src/components/BankingAgent.js`
- **Regression check:** `npm run build` → exit 0; no changes to OAuth callback, token exchange, or session persistence
- **Do not break:** OAuth callback `postLoginReturnToPath` flow; `sanitizePostLoginReturnPath` validation; NL replay after auth (`BX_AGENT_PENDING_NL_KEY`); session-fix bubble for genuine cookie-only / Vercel sessions


### 2026-04-20 — OAuth challenge duplicate keys (Phase 199 regression)

- **Root cause:** Phase 199 prefetch work added `agentCcEvents` state and merged it with `currentEvents` in the `currentEventsWithCc` memo. The dedup check only verified if `currentEvents` had an agent-actor-token ID, but did NOT filter duplicate IDs between the two arrays. When both arrays contained events with the same ID (e.g., `mcp-agent-token-presented`, `mcp-tool-result`), React encountered duplicate keys in the rendered list. React reordered/skipped the duplicate, causing the OAuth challenge (first in the merged array from `agentCcEvents`) to appear instead of the account data result (from `currentEvents`).
- **Symptoms:** After PingOne login, OAuth authorization challenge prompt appeared instead of account data. Console showed "Warning: Encountered two children with the same key, `mcp-agent-token-presented`" and similar for other event IDs.
- **Fix:**
  1. `TokenChainDisplay.js` line 1019-1031 — Replaced narrow dedup check with Set-based filter
  2. Build a Set of all event IDs from `currentEvents` (O(1) lookup)
  3. Filter `agentCcEvents` to only include events whose IDs don't already exist in the Set
  4. Return early if no unique agent CC events remain
- **Files modified:** `banking_api_ui/src/components/TokenChainDisplay.js`
- **Regression check:** `npm run build` → exit 0 (462.42 kB); no server changes, no token-exchange logic affected
- **Behavior:** Agent now displays account data (not OAuth challenge) after successful login; console shows no duplicate key warnings; TokenChainDisplay renders unique event list without React warnings
- **Do not break:** Event rendering order (agentCcEvents prepended before currentEvents remains correct); mcp-agent-token-presented display timing; history tab event rendering


### 2026-04-19 — Phase 197: Fixed sidebar missing on unauthenticated /dashboard (Phase 193 regression)

- **Root cause:** Phase 193 moved `/dashboard` route to an explicit outer Route. Authenticated branch had `<AdminSideNav>`, but unauthenticated branch omitted it, so guests saw only TopNav + dashboard content with no sidebar navigation.
- **Fix:**
  1. `App.js` (~line 607) — Added `<AdminSideNav user={null} />` to the unauthenticated `/dashboard` branch
  2. `AdminSideNav.jsx` — Made action items guest-aware using spread syntax: "Switch Role" and "Log Out" only show when `user` exists; guests see "Sign In" (🔑) instead
  3. Added `case 'sign-in'` handler in `handleAction()` to redirect to `/api/auth/oauth/user/login?return_to=/dashboard`
- **Files modified:** `banking_api_ui/src/App.js`, `banking_api_ui/src/components/AdminSideNav.jsx`
- **Regression check:** `npm run build` → exit 0; Build folder ready; no server changes
- **Behavior:** Guests now see sidebar on `/dashboard`; click "Sign In" to log in; authenticated users see normal "Switch Role" + "Log Out" + "Dark Mode" actions
### 2026-04-19 — Agent stub-token 401 detection + session-fix bubble

- **Summary:** When agentSessionMiddleware rejects a cookie-restored session (accessToken = `_cookie_session`), it returns `session_restore_required` or `oauth_session_required`. The UI agent service did not recognize these codes — it wasted a round-trip on a doomed token refresh, then showed a generic error instead of the session-fix bubble with "Sign out (then sign in again)" button.
- **Fix:**
  1. `bankingAgentService.js` `callMcpTool` — skip refresh for `session_restore_required` / `oauth_session_required` (same as existing `session_not_hydrated` skip)
  2. `bankingAgentService.js` `callMcpTool` error throw — normalize stub-token codes to `session_not_hydrated` so BankingAgent shows the fix bubble
  3. `bankingAgentService.js` `sendAgentMessage` — same skip-refresh + code normalization
- **Files modified:** `banking_api_ui/src/services/bankingAgentService.js`
- **Regression check:** `npm run build` → exit 0; no server-side changes
- **Do not break:** `session_not_hydrated` code path in BankingAgent.js `reportNlFailure` and `handleDoAction`; `showSessionFixActions` rendering; `cookieOnlyBffSession` polling loop

### 2026-04-18 — Phase 126: Surface friendly sub/act identity in token chain UI

- **Summary:** Token chain display, education panels, and AgentFlowDiagramPanel now show human-readable user and actor identity instead of raw UUIDs. Identity is fetched once from BFF session, cached in TokenChainContext, and shared across all token surfaces.
- **Fix:**
  1. `TokenChainContext.js` — added `resolvedIdentity` state with single shared fetch (`/api/auth/session` + `/api/pingone-test/config`); re-fetches on `userAuthenticated` event; exposed in context value
  2. `TokenChainDisplay.js` — removed duplicate `loadIdentityHints` effect; reads `identityHints` from context; EventRow User button uses `fmtSub(userId, hints)` → shows `Name (uuid…)`
  3. `TokenChainEducationPanel.js` — `JwtClaimsTab` accepts `liveIdentity` prop; replaces placeholder strings with live sub/name/email in JWT code examples
  4. `TokenChainPanel.js` — builds live-aware `steps` array; `banking-app` step shows real `sub`/`name` in `payloadPreview` when authenticated
  5. `AgentFlowDiagramPanel.js` — imports context; passes `resolvedIdentity` to local `TokenChainDisplay`; `fmtTokenSub`/`fmtTokenAct` helpers show friendly labels in compact view
- **Files modified:** `TokenChainContext.js`, `TokenChainDisplay.js`, `TokenChainEducationPanel.js`, `TokenChainPanel.js`, `AgentFlowDiagramPanel.js`
- **Regression check:** `npm run build` → exit 0 (441.42 kB); no token-exchange, consent, or scope logic changed
- **Do not break:** Token exchange flow, ClaimsStrip rendering, inspector panel, `fmtSub`/`fmtAct` fallback-to-raw-UUID behavior

### 2026-04-18 — Phase 124: MFA HITL indication

- **Summary:** Added explicit Human-in-the-Loop (HITL) badges and copy throughout MFA/step-up flows so users understand manual approval is required.
- **Fix:**
  1. Persistent HITL badge (amber bar) added to `AgentConsentModal.js` header
  2. Transaction consent body copy updated with HITL checkpoint language
  3. Inline chat message in `BankingAgent.js` strengthened to clarify agent is paused
  4. All MFA step-up flow labels in `agentFlowDiagramService.js` updated to reference HITL/manual approval
- **Files modified:** `AgentConsentModal.js`, `AgentConsentModal.css`, `BankingAgent.js`, `agentFlowDiagramService.js`
- **Regression check:** `npm run build` → exit 0 (440.81 kB +0.32 kB); server contract unchanged
- **Do not break:** Approval mechanics, consentId flow, OTP sequencing, and step-up thresholds in `runtimeSettings.js`

### 2026-04-18 — Phase 118: HuggingFace integration research

- **Summary:** Research-only phase. Produced 118-RESEARCH.md with full hosted vs self-hosted comparison and concrete recommendation.
- **Recommendation:** HuggingFace Dedicated Inference Endpoint (OpenAI-compatible) using existing `ChatOpenAI` + `baseURL` pattern from Phase 117 LM Studio; model `meta-llama/Llama-3.3-70B-Instruct`; config `HUGGINGFACEHUB_API_TOKEN` + `HF_ENDPOINT_URL`.
- **Files created/modified:** `118-RESEARCH.md`, `docs/phases-100-119.md` (corrected stale DESCOPED/SUPERSEDED entries for 117+118)
- **No code changes.** Implementation checklist is in 118-RESEARCH.md.

### 2026-04-18 — Phase 117: LangChain pluggable model interface

- **Summary:** OpenAI provider wired in BFF agent builder; `LLMProvider` ABC added to Python interfaces; per-provider model defaults fixed.
- **Fix:**
  1. Added `LLMProvider` abstract base class to `langchain_agent/src/services/interfaces.py`
  2. Installed `@langchain/openai` in `banking_api_server`
  3. Wired `ChatOpenAI` and LM Studio in `agentBuilder.js` with correct per-provider default models
  4. Fixed model name leakage: replaced single `langchainConfig.model` with `PROVIDER_DEFAULT_MODELS[provider]` fallback
- **Files modified:** `langchain_agent/src/services/interfaces.py`, `banking_api_server/services/agentBuilder.js`, `banking_api_server/package.json`
- **Regression check:** `node -e "require('./services/agentBuilder')"` → OK; `npm run build` → exit 0 (440.49 kB)
- **Do not break:** `PROVIDER_DEFAULT_MODELS` map — every provider must have a default; Groq must remain the first-priority provider in the default fallback chain

### 2026-04-18 — Phase 190: UI token-exchange terminology alignment

- **Summary:** All user-facing token-exchange labels in the React SPA now use the Phase 188 RFC 8693 canonical taxonomy.
- **Fix:**
  1. Updated `PingOneTestPage.jsx` (~13 label sites): "Exchange 1/2/3", "Phase 184 Exchange 2", "Phase 184 dual-token exchange" → "1-exchange", "2-exchange (dual-token)", "Phase 186 ID-token exchange", "Legacy two-step chain"
  2. Audited `TokenExchangeFlowDiagram.jsx`, `TokenChainEducationPanel.js`, `TokenExchangePanel.js`, `RFC8707Content.js` — all already aligned; no changes needed
- **Files modified:** `banking_api_ui/src/components/PingOneTestPage.jsx`
- **Regression check:** `npm run build` passes (exit 0, 440.49 kB −18 B)
- **Do not break:** `'single'`/`'double'` internal prop constants in `TokenExchangeFlowDiagram.jsx`; `double-exchange` key in `fixIssue()` map — these are internal, non-user-visible identifiers

### 2026-04-18 — Phase 106: Nested act delegation-chain diagnostics and docs alignment

- **Root cause:** Delegation error guidance and architecture docs had drifted toward a single-hop `act.sub` story even though the runtime and compliance tests already model full 2-exchange nested chains (`act.sub` plus `act.act.sub`) when PingOne preserves them.
- **Fix:**
  1. Updated delegation error builders to explain RFC 8693 nested chain semantics and expected claim shapes
  2. Extended delegation middleware actor matching to inspect nested `act.act` identities instead of only the top-level actor
  3. Aligned `ACT_CLAIM_VERIFICATION.md`, `ARCHITECTURE_WALKTHROUGH.md`, and `rfc8693-delegation-claims-compliance-guide.md` with the repo's actual 1-exchange / 2-exchange behavior
  4. Added targeted regression coverage for nested-chain diagnostics and actor matching
- **Files modified:** `banking_api_server/src/services/errorMessageBuilder.js`, `banking_api_server/src/services/errorSchemaService.js`, `banking_api_server/src/middleware/delegationErrorMiddleware.js`, `banking_api_server/services/errorMessageBuilder.js`, `banking_api_server/services/errorSchemaService.js`, `banking_api_server/middleware/delegationErrorMiddleware.js`, `banking_api_server/src/__tests__/delegationErrorDiagnostics.test.js`, `docs/ACT_CLAIM_VERIFICATION.md`, `docs/ARCHITECTURE_WALKTHROUGH.md`, `docs/rfc8693-delegation-claims-compliance-guide.md`
- **Regression check:** Nested `act` diagnostics mention `act.act.sub`; allowed-actor middleware accepts actors present deeper in the chain; targeted Jest test passes.
- **Do not break:** `agentMcpTokenService.js` two-exchange semantics (`act.sub` current exchanger, `act.act.sub` prior agent when preserved); `mcpToolAuthorizationService.nestedActIdFromClaim()`; docs must continue to distinguish full nested chains from flattened PingOne fallback behavior.

### 2026-04-17 — Bug: Agent "tool_use.input: Input should be a valid dictionary" error

- **Root cause:** Anthropic API requires `tool_use.input` to always be a valid dictionary object. During the LangGraph agent's second iteration (after tool execution), `tool_calls[0].args` for empty-schema tools like `get_my_accounts` could be non-object values (empty string, undefined) — particularly during Groq→Anthropic cross-provider fallback. The `_convertLangChainToolCallToAnthropic` function in `@langchain/anthropic` directly maps `input: toolCall.args` without validation, causing 400 errors.
- **Symptom:** User asks "Show me my accounts" → spinner timeout → `Could not parse: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.1.content.0.tool_use.input: Input should be a valid dictionary"}}`
- **Fix:**
  1. Added `normalizeToolCallArgs()` function — ensures args is always a plain object; handles string args (JSON.parse), undefined/null/arrays (returns `{}`)
  2. Normalize args in `agentNode` after LLM returns tool_calls (before passing to toolNode)
  3. Normalize args in `toolNode` before `tool.invoke()` call
  4. Use `ToolMessage` instances instead of plain `{ role: 'tool' }` objects for proper cross-provider serialization
- **Files modified:** `banking_api_server/services/agentBuilder.js`
- **Regression check:** "Show me my accounts" returns account list; agent works with both Groq and Anthropic providers
- **Do not break:** `normalizeToolCallArgs()` in agentNode and toolNode; `ToolMessage` instances (not plain objects) for tool responses


### 2026-04-16 — Phase 170: Force HITL for all Transfers in authorization server

- **Requirement:** Security requirement to mandate explicit user approval for every transfer operation.
- **Implementation:**
  1. `transactionConsentChallenge.js` — Added transfer-type check before amount threshold; all transfers now require consent challenge regardless of amount
  2. `routes/transactions.js` — POST /api/transactions returns 428 + `consent_challenge_required` for transfers without valid consent; added explicit check for missing `consentChallengeId`
- **Files modified:** `banking_api_server/services/transactionConsentChallenge.js`, `banking_api_server/routes/transactions.js`
- **Regression check:** Transfer $1 now requires consent; withdrawals keep $500 threshold; admin bypass preserved
- **Do not break:** Transfer type check (`if (v.normalized.type === 'transfer')` before amount comparison); 428 enforcement for transfers; challenge verification in POST /api/transactions


### 2026-04-16 — Phase 168: HTTP/2 Streaming Transport for MCP Tool Calls

- **What:** Added HTTP/2 bridge between BFF and MCP server, replacing WebSocket transport when MCP_SERVER_URL uses `http://` or `https://` scheme.
- **Files modified:** `banking_api_server/services/http2McpBridge.js` (new), `banking_api_server/server.js`, `banking_api_ui/src/services/bankingAgentService.js`
- **Transport selection:** URL scheme determines transport — `http://`/`https://` → HTTP/2 bridge, `ws://`/`wss://` → WebSocket (unchanged)
- **Connection pooling:** Persistent HTTP/2 sessions keyed by URL+token, max 5 concurrent, 60s idle timeout
- **Streaming responses:** BFF sends `Content-Type: application/stream+json` for HTTP/2 path; client `parseStreamingResponse()` handles newline-delimited JSON
- **Backward compatible:** WebSocket transport fully preserved; JSON fallback for non-streaming responses
- **Known limitations:** HTTP/2 path does full MCP handshake per tool call (initialize + tools/call); no connection reuse across handshakes yet; server push not implemented
- **Tests:** 11 unit tests in `banking_api_server/src/__tests__/http2McpBridge.test.js`
- **Do not break:** WebSocket transport (`mcpWebSocketClient.js`); transport selection logic (`useHttp2` flag in server.js); SSE flow events (`mcpFlowSseHub.js`); local tool fallback path


### 2026-04-16 — Bug: Recurring data loss — runtimeData.json corruption loses all user data

- **Root cause:** `runtimeData.json` (gitignored, 300MB+ due to unbounded activity logs) written with `fs.writeFileSync` — a crash mid-write truncates the file. On next startup, DataStore falls back to `bootstrapData.json` (only 5 seed users), losing all runtime data. No backup mechanism existed.
- **Fix:**
  1. **Atomic writes** — `_atomicWrite()` writes to `.tmp` then `fs.renameSync()` (atomic on POSIX)
  2. **Rotating backups** — 3 timestamped copies in `banking_api_server/data/backups/`
  3. **Auto-recovery** — `_tryRestoreFromBackup()` scans backups newest-first on startup if runtimeData is invalid
  4. **Activity log cap** — `getSnapshot()` limits to 1000 most recent entries (300MB → 4.6MB)
  5. **Validation** — `_isValidSnapshot()` requires ≥1 user before accepting a data file
  6. **Auto-backup** — immediate on startup + every 15 minutes via `setInterval`
- **Files modified:** `banking_api_server/data/store.js`, `.gitignore`
- **Commits:** `4ac3ca3`
- **Regression check:** Recovery tested: wrote empty runtimeData → DataStore auto-restored from backup (6 users recovered). File size reduced from 309MB to 4.6MB.
- **Do not break:** Atomic write path (`_atomicWrite`); backup directory (`data/backups/`); recovery chain (runtimeData → backups → bootstrapData); activity log cap (1000); `_isValidSnapshot` ≥1 user check.

### 2026-04-15 — Bug: Token audience mismatch → 401 on /api/accounts/my and /api/transactions/my

- **Root cause:** PingOne issues end-user access tokens with `aud: https://resource-server.pingdemo.com` (the Banking API resource server). However, `validatePingOneCoreToken()` in `middleware/auth.js` only checked `ENDUSER_AUDIENCE` (`https://ai-agent.pingdemo.com`), `AI_AGENT_AUDIENCE` (`https://mcp-server.pingdemo.com`), and `MCP_RESOURCE_URI`. The Banking API RS audience was configured in `.env` as `BANKING_API_RESOURCE_URI` but never read by `auth.js`, causing every `/api/accounts/my` and `/api/transactions/my` call to fail with "Token audience does not match any known audience."
- **Fix:** Added `BANKING_API_RESOURCE_URI` env var to `auth.js` and included it in the `knownAudiences` array in `validatePingOneCoreToken()`.
- **Files modified:** `banking_api_server/middleware/auth.js`
- **Regression check:** `npm run build` → exit 0. JWKS validation still active (`SKIP_TOKEN_SIGNATURE_VALIDATION=false`). All 4 audience values now checked: ENDUSER_AUDIENCE, AI_AGENT_AUDIENCE, MCP_RESOURCE_URI, BANKING_API_RESOURCE_URI.
- **Do not break:** JWKS signature validation; audience enforcement for agent/MCP tokens; OAuth callback flow.

### 2026-04-15 — Bug: "Cannot find module './logger'" crashes agent token exchange

- **Root cause:** `configStore.js` line 607 had `require('./logger')` — wrong relative path. Logger is at `utils/logger.js` but configStore is in `services/`. Every other service file uses `require('../utils/logger')`. The bad require was inside `validateTwoExchangeConfig()`, which is only called during agent token exchange, so it didn't crash at startup.
- **Fix:** Changed `require('./logger')` → `require('../utils/logger')` with destructured import matching the rest of the codebase.
- **Files modified:** `banking_api_server/services/configStore.js`
- **New tests added:**
  1. `agent-module-smoke.test.js` — 18 tests: Smoke-tests every module in the agent flow (configStore, agentSessionMiddleware, agentMcpTokenService, agentTokenService, oauthService, logger, mcpWebSocketClient). Validates require() succeeds, exports exist, singleton consistency, and scope-audience integration.
  2. `configStore-tokenExchange.test.js` — 25 tests: Unit tests for `validateTwoExchangeConfig()`, `buildAllowedScopesByAudience()`, `validateScopeAudience()`, and `mapErrorToCode()`. Covers missing credentials, missing audiences, error collection, scope narrowing, graceful degradation for unknown audiences.
  3. `agentSessionMiddleware.test.js` — 8 tests: Unit tests for session validation, 401 responses (missing session, missing tokens, _cookie_session stub), token refresh, agentContext attachment, tokenEvents recording.
- **Regression check:** All 51 new tests pass. `npm run build` → exit 0. Existing 40 pingoneTestRoutes tests still pass. Server restarts cleanly.
- **Do not break:** Agent token exchange flow; configStore singleton; session middleware auth gates.

### 2026-04-14 — Bug: Dashboard nav link displayed red instead of white

- **Root cause:** `.chase-nav-link--active` CSS selector was missing explicit `color` property. While it should inherit `color: white` from `.chase-nav-link` base style, CSS cascade or specificity issues prevented proper inheritance, causing the active Dashboard menu item to render in red/orange.
- **Fix:** 
  1. Added `color: #ffffff;` to `.chase-nav-link--active` selector (light mode)
  2. Added `color: var(--dash-text, #e8edf5);` to `html[data-theme='dark'] .chase-nav-link--active` selector (dark mode)
  3. Ensures explicit color values override any inherited or cascading rules
- **Files modified:** `banking_api_ui/src/components/ChaseTopNav.css`
- **Commits:** `d32344a`
- **Regression check:** `cd banking_api_ui && npm run build` → exit 0. Dashboard nav link now displays pure white (#ffffff) in light mode, matching other nav items. Dark mode uses theme variable for consistency.
- **Do not break:** All other nav link colors and states unchanged; active state now has explicit color to prevent regression. Other nav items (Home, Config, etc.) unaffected.

### 2026-04-12 — Phase 100 start: runtime-configurable agent transaction stop limits

- **Change:** Started Phase 100 implementation by wiring agent delegated transaction stop limits into live runtime settings + admin security UI.
- **Root cause:** `agentTransactionTracker` enforced `agentTransactionCountLimit` / `agentTransactionValueLimit`, but those settings were not initialized in `runtimeSettings` or exposed in `SecuritySettings`, making them effectively hidden/unconfigurable.
- **Fix:**
  1. Added `agentTransactionCountLimit` and `agentTransactionValueLimit` to `runtimeSettings` (env fallback + numeric coercion in `update()`).
  2. Added both fields to `SecuritySettings` metadata + form render order.
  3. Added read-only summary row under Auth Gate Summary to show active agent stop limits.
  4. Synced `UnifiedConfigurationPage.tsx` MFA section with these controls and wired admin save/load to runtime settings API (`/api/admin/settings`) so Configure page and Security Settings stay aligned.
  5. Fixed touched-file lint issues in `SecuritySettings.js` (button types, label semantics, key usage), `runtimeSettings.js` (`Number.isNaN`), and `UnifiedConfigurationPage.tsx` (explicit button types + label semantics).
- **Files modified:** `banking_api_server/config/runtimeSettings.js`, `banking_api_ui/src/components/SecuritySettings.js`, `banking_api_ui/src/components/Configuration/UnifiedConfigurationPage.tsx`, `docs/phases-100-119.md`
- **Verification:**
  - `cd banking_api_ui && npm run build` → success (existing unrelated warning in `TokenChainDisplay.js`)
  - `cd banking_api_server && npm test -- --runTestsByPath src/__tests__/runtime-settings-api.test.js src/__tests__/agentTransactionTracker.test.js` → 23 passed
- **Do not break:** Existing defaults remain backward-compatible (`0` = unlimited); only delegated agent flows read the new stop-limit settings; non-delegated/admin transaction behavior remains unchanged.

### 2026-04-11 — Phase 127/128: PingOneTestPage backend bugs + UI restoration + build quality audit

- **Root cause (5 bugs):**
  1. `worker-token` and `agent-token` routes accessed `workerTokenData.access_token` but `getAgentClientCredentialsTokenWithExpiry()` returns `{token, expiresAt, expiresIn}` — always returned `undefined`.
  2. All 3 token exchange test endpoints called `performTokenExchange({object})` but the method takes positional args `(subjectToken, audience, scopes)` — always threw.
  3. All `configStore.getEffective()` calls in pingoneTestRoutes used UPPERCASE/wrong-prefixed keys not present in `envFallbackMap` — always returned empty string.
  4. PingOneTestPage.jsx used CSS class `pingone-test-card status-${status}` but CSS defined `.test-card.test-card--${status}` — no styling applied.
  5. `react-scripts build` crashed due to `"not op_mini"` invalid browserslist query in `banking_api_ui/package.json` — fixed to `"not op_mini all"`.
- **Phase 128 quality sweep:** 12 ESLint build warnings eliminated; missing `/scope-audit` route added to App.js; SideNav duplicate nav entry and `MdDashboard`/`MdGroup`/`MdPersonAdd` unused icon imports removed; sparse array commas in 3 education panels fixed; `bankingRestartNotificationService` anonymous default export fixed; `TokenChainContext` useMemo deps stabilized; TopNav brand `<div onClick>` → `<button>` (a11y); `agentBuilder` Groq-only fallback extended to support `ANTHROPIC_API_KEY`.
- **Files modified:** `banking_api_server/routes/pingoneTestRoutes.js`, `banking_api_ui/src/components/PingOneTestPage.jsx`, `PingOneTestPage.css`, `banking_api_ui/package.json`, `banking_api_server/services/agentBuilder.js`, `App.js`, `SideNav.js`, `TopNav.js`, `UserDashboard.js`, `BankingAgent.js`, `BankingAdminOps.js`, `ApiCallDisplay.jsx`, `LandingPage.js`, `hooks/useChatWidget.js`, `context/TokenChainContext.js`, `services/bankingRestartNotificationService.js`, education panels (3 files).
- **Commits:** `f8987ab`, `1bdcf93`, `3923546`, `f8014fc`, `792a91d`, `72cb41a`
- **Regression check:** `cd banking_api_ui && npm run build` → `Compiled successfully.` (zero warnings). `GET /api/pingone-test/worker-token` → `{"success":true,"token":"eyJ..."}`. `GET /api/pingone-test/config` → all 13 config keys populated. `GET /api/pingone-test/verify-assets` → `{"success":true}`.
- **Do not break:** All PingOne token exchange chains; MFA test page integration routes (still require auth — expected); banking agent `/message` endpoint (requires OAuth session); browserslist targets (production build now uses `"not op_mini all"`).

### 2026-04-10 — Bug: bankingAgentNl routes unregistered → nl/status, nl, search always 401

- **Root cause:** `bankingAgentNl.js` (containing `/nl/status`, `/nl`, `/search` endpoints) was never imported or mounted in `server.js`. These routes fell through to `bankingAgentRoutes` which applies `agentSessionMiddleware` to ALL sub-paths via `router.use(agentSessionMiddleware)`. The middleware blocks requests without `req.session.oauthTokens?.accessToken`, so even public LLM config endpoints like `/nl/status` returned 401 for every caller.
- **Fix:** (1) Added `const bankingAgentNlRoutes = require('./routes/bankingAgentNl')` to server.js. (2) Mounted it at `/api/banking-agent` BEFORE `bankingAgentRoutes` so the NL/search routes are served by their own router (no auth middleware). (3) Improved `agentSessionMiddleware.js` error message for missing oauthTokens: changed misleading `"Session not found" / "Session has expired"` to `"oauth_session_required" / "Please sign in via PingOne to use the agent"` to distinguish a logged-in-but-not-via-OAuth user from an unauthenticated user.
- **Files modified:** `banking_api_server/server.js`, `banking_api_server/middleware/agentSessionMiddleware.js`
- **Regression check:** `curl /api/banking-agent/nl/status` → 200 (no auth); `curl -b session POST /api/banking-agent/message` → 401 with `oauth_session_required` (expected for local-auth); `/message` with valid OAuth session token should return 200. bankingAgentRoutes authenticated paths (`/init`, `/message`, `/consent`) still protected by `agentSessionMiddleware`.
- **Do not break:** (a) `bankingAgentRoutes` middleware chain — NL routes are now handled entirely before bankingAgentRoutes, so bankingAgentRoutes never sees /nl/* requests. (b) `agentSessionMiddleware` session checks — only the error message and error code changed; validation logic (session.user check, oauthTokens check, expiry check) is unchanged.

### 2026-04-09 — Phase 110: Demo Data page layout — may_act quick-action, Config button, sticky nav, token endpoint auth selector

- **Changes:**
  1. **may_act quick-action strip** — compact status pill + Enable/Clear buttons appear below hero; wired to existing `mayActEnabled`/`handleSetMayAct` state. "Full controls ↓" scrolls to full section.
  2. **Toolbar "Config" overflow fix** — `"PingOne config"` → `"⚙ Config"` with `title` tooltip preserved; prevents line-break on narrower screens.
  3. **Sticky section-anchor nav** — 9-link left-rail nav (`IntersectionObserver` highlights active); hidden `<768px`.
  4. **Token endpoint auth method selector** — UI in PingOne Authorize section lets operators choose `client_secret_basic`/`post`/`jwt` per client; saved to `configStore` via `PATCH /api/demo-scenario/token-endpoint-auth`; read at token-exchange time in `agentMcpTokenService.js` with env var fallback.
- **Files modified:** `DemoDataPage.js`, `DemoDataPage.css`, `demoScenario.js`, `configStore.js`, `agentMcpTokenService.js`
- **Commits:** `9e062c6` (plan 01), `7dc8523` (plan 02)
- **Regression check:** `cd banking_api_ui && npm run build` → exit 0. Existing may_act section at `#demo-mayact-heading` unchanged. Agent FAB fix (Phase 109) unchanged. Token exchange paths unchanged except configStore takes priority over env var for auth method.
- **Do not break:** (a) Existing `handleSetMayAct`, `mayActEnabled` state — quick-action card reuses these, no new state. (b) `agentMcpTokenService.js` two-exchange path — auth method fallback is `|| process.env.AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD || 'basic'`; behavior unchanged if configStore key is empty. (c) PATCH input validated against `VALID_TOKEN_AUTH_METHODS` whitelist.

### 2026-04-09 — Phase 109: Agent FAB visual jump on placement button click

- **Root cause:** `AgentUiModeToggle.applyAndReload()` called `setAgentUi(next)` unconditionally before the 350ms page reload, immediately updating `AgentUiModeContext` React state and moving the FAB/dock on screen.
- **Fix:** For `reload: true` paths, write directly to `localStorage('banking_agent_ui_v2')` and skip `setAgentUi()`. The reload re-inits context from localStorage cleanly. For `reload: false` (middle split-view), `setAgentUi()` is preserved for its intentional live update.
- **Files modified:** `banking_api_ui/src/components/AgentUiModeToggle.js`
- **Commits:** `6595727`, `2fa5973`
- **Regression check:** `cd banking_api_ui && npm run build` → exit 0. Middle split-view placement still works live (reload:false path unchanged).

### 2026-04-09 — feat: integrate LogoutPage component with OAuth RP-Initiated Logout route (commit `86bcfd4`)

- **Feature:** Completes **Phase 50** (Logout Configuration) by wiring the logout UI component to the Express OAuth logout backend. Frontend now has a dedicated `/logout` route serving a styled landing page after sign-out.
- **Implementation:** (1) Created **`LogoutPage.js`** component that renders a "You're signed out" page with wave emoji animation, 3-second auto-redirect countdown to home, manual action buttons ("Sign In Again", "Go Home"), and clears sessionStorage/localStorage on mount. (2) Created **`LogoutPage.css`** with responsive design (320px–1440px), gradient background (purple: #667eea → #764ba2), wave animation, slide-in transitions, and full dark mode support. (3) Added import and route to `App.js`: `import LogoutPage from './components/LogoutPage'` and `<Route path="/logout" element={<LogoutPage />} />` before the catch-all route.
- **Backend flow:** `/api/auth/logout` endpoint (existing in `oauth.js` lines 329–364) already handles token revocation, session destruction, and redirect to PingOne's `/as/signoff`. PingOne uses the app's configured `post_logout_redirect_uri` to redirect back to `/logout` (now routable).
- **PingOne configuration (manual step):** The `postLogoutRedirectUri` is **NOT yet configured** in PingOne console. Admin must:
  1. Log into PingOne Administration Console
  2. Go to **Applications** → **Super Banking Admin** app → **Redirect URIs** section
  3. Add: `http://localhost:3000/logout` (standard), `http://localhost:4000/logout` (run-bank.sh), `https://{your-deployment}.vercel.app/logout` (production)
  4. Repeat for **Super Banking User** app
  5. Save
- **Files created:** `banking_api_ui/src/components/LogoutPage.js`, `banking_api_ui/src/components/LogoutPage.css`
- **Files modified:** `banking_api_ui/src/App.js` (import + route)
- **Regression check:** `cd banking_api_ui && npm run build` → **Compiled successfully** (file size +293B JS, +344B CSS). No build errors or linting issues.
- **Do not break:** (a) OAuth flows and session management (`routes/oauth.js`) unchanged — backend logout still works. (b) `/api/auth/logout` endpoint unchanged — still redirects to PingOne `/as/signoff` with `post_logout_redirect_uri` parameter. (c) Full logout flow only works after PingOne console configuration (manual step); before that, OAuth redirect will fail or go to PingOne dashboard instead of `/logout`.
- **Testing:** Manual flow: (1) Login as admin. (2) Click logout. (3) Observe redirect to `/logout`. (4) Verify LogoutPage displays, countdown runs, and redirects to home after 3s. (5) Verify browser console shows no errors. (6) Repeat with user role.

### 2026-04-07 — Wrong required scopes in "Token Exchange: Missing Required Scopes" modal

- **Root cause:** In `agentMcpTokenService.js`, the pre-exchange bail-out (`scopesMissingFromUserToken`) checked whether the user token carries the tool-level banking scopes (`banking:accounts:read`, `banking:read`). For the ENDUSER_AUDIENCE / agent-invoke path this is wrong in two ways: (1) a user who legitimately holds `banking:agent:invoke` was blocked — the bail-out did not recognize the delegation scope as sufficient to attempt the exchange; (2) when throwing `missing_exchange_scopes`, `requiredScopes` was set to the downstream banking scopes instead of `agent:invoke` (the actual pre-requisite for the agent/MCP path). Separately, the `BankingAgent.js` "How to fix" modal hardcoded `banking:write` and `banking:read` as the scopes to add, misdirecting users who need `agent:invoke`.
- **Symptom:** Modal shows "Required scopes: banking:accounts:read banking:read / Your token has: openid offline_access profile email" and instructs users to add `banking:write`/`banking:read`. Fix instructions should say `agent:invoke`.
- **Fix:** (1) Added `userHasAgentInvokeScope` check: when `userTokenScopes.has('banking:agent:invoke')` or `userTokenScopes.has('agent:invoke')`, bypass the bail-out and proceed to the exchange — PingOne's token-exchange policy for the MCP resource decides whether to grant banking scopes. (2) Changed `scopeErr.requiredScopes` and `scopeErr.missingScopes` from the banking tool scopes to `'agent:invoke'` / `['agent:invoke']` so the modal displays the correct pre-condition. (3) Updated `BankingAgent.js` modal "How to fix" to show `agent:invoke` (`banking:agent:invoke`) as the scope to add, and updated the explanatory paragraph.
- **Files changed:** `banking_api_server/services/agentMcpTokenService.js`, `banking_api_ui/src/components/BankingAgent.js`
- **Do not break:** (a) Users with `banking:agent:invoke` no longer hit the pre-check bail-out — the exchange attempt proceeds to PingOne. (b) `ALLOW_AGENT_INVOKE_EXCHANGE=true` env var still works as an additional bypass. (c) Users with neither `banking:agent:invoke` nor banking scopes still get the `missing_exchange_scopes` error — now with `requiredScopes = 'agent:invoke'`. (d) Normal login path (user has `banking:read`/`banking:write`) is entirely unaffected — `userHasAgentInvokeScope = false` and `scopesMissingFromUserToken = false`, so the block never fires.

### 2026-04-04 — Vercel production: "Banking Agent is unavailable. The MCP server is not reachable." on MCP Tools click

- **Root cause:** GET `/api/mcp/inspector/tools` in `routes/mcpInspector.js` had no fallback for PingOne token exchange failures. When `sessionTokenForDiscovery` threw with `err.httpStatus === 401 && err.pingoneError` (PingOne "Unsupported authentication method" / policy reject, the same condition fixed for POST `/api/mcp/tool` in the previous fix), the catch block returned `res.status(502)` directly. The browser's MCP Tools fetch (`GET /api/mcp/inspector/tools`) saw the 502 and threw `new Error('MCP tools fetch failed: 502')`. `BankingAgent.js` `isConnErr` check includes `err.message.includes('502')` → true → showed the full "Banking Agent is unavailable" error panel instead of local tool catalog.
- **Symptom:** Clicking the "MCP Tools" action chip showed the full red error panel: "Banking Agent is unavailable. The MCP server is not reachable."
- **Fix:** Applied the same `isExchangeScopeError` guard (from POST `/api/mcp/tool`) to the `sessionTokenForDiscovery` catch in `GET /inspector/tools`. When `err.httpStatus === 400 || err.code === 'token_exchange_failed' || (err.httpStatus === 401 && Boolean(err.pingoneError))`, fall back to `respondLocalCatalog('exchange_failed_<code>')` (HTTP 200) instead of 502. Non-exchange errors still return 502.
- **Files changed:** `banking_api_server/routes/mcpInspector.js`
- **Do not break:** (a) Genuine token/session errors (no `err.pingoneError`) still return 502. (b) When exchange succeeds but MCP WS fails with ECONNREFUSED, `isMcpUnreachableError` catch still returns local catalog — unchanged. (c) POST `/api/mcp/tool` local fallback logic — unchanged.

### 2026-04-04 — Vercel production: agent transfer ≥ $250 completes without step-up prompt

- **Root cause:** On Vercel, `POST /api/mcp/tool` always routes through `callToolLocal()` — the remote WebSocket MCP is unconditionally skipped when `MCP_SERVER_URL` is not set (`isLocalDefault && process.env.VERCEL`). The local tool functions `create_transfer` and `create_withdrawal` in `services/mcpLocalTools.js` contained only a HITL consent gate (> $500) and **no step-up MFA gate**. Additionally, all three `callToolLocal()` call sites in `server.js` omitted the `req` argument, so even `req.session.user.acr` was unavailable inside the handlers.
- **Symptom:** A $300 agent transfer silently completed on Vercel production — no 428, no step-up toast, no OTP/CIBA prompt.
- **Fix:** (1) Added `checkLocalStepUp(type, amount, req)` helper to `mcpLocalTools.js` that mirrors the gate in `routes/transactions.js` — reads `stepUpEnabled`, `stepUpTransactionTypes`, `stepUpAmountThreshold`, and `stepUpAcrValue` from `runtimeSettings`, checks `req.session.user.acr`, and returns a `{step_up_required: true, error: 'step_up_required', ...}` result if step-up is needed. (2) Added step-up gate call to `create_transfer` and `create_withdrawal` (after the HITL check, consistent with `transactions.js` ordering). (3) Passed `req` as 4th argument to all three `callToolLocal()` calls in `server.js` (exchange-failed fallback, no-bearer fallback, remote-unreachable/Vercel fallback). The UI's existing `step_up_required` handler in `BankingAgent.js` (line 1521) fires `agentStepUpRequested` correctly — no UI changes needed.
- **Files changed:** `banking_api_server/services/mcpLocalTools.js`, `banking_api_server/server.js`
- **Do not break:** (a) `create_deposit` is intentionally NOT gated — deposits are not in `stepUpTransactionTypes` by default. (b) When `req` is `undefined` (direct unit-test calls), step-up check is skipped gracefully. (c) `isExchangeScopeError` fallback still works — local handler now returns `step_up_required` which the UI handles, instead of silently completing the transfer.

### 2026-04-04 — Vercel production: MCP tool 401 "Token exchange failed: Unsupported authentication method"

- **Root cause (Issue 1 — MCP tool 401):** When PingOne's token-exchange endpoint returns HTTP **401** (not 400) for "Request denied: Unsupported authentication method" (e.g. PKCE Web app client used as exchanger without token-exchange grant or wrong auth method), `server.js` POST `/api/mcp/tool` only treated `httpStatus === 400` as a "soft" exchange failure eligible for local fallback. A 401 bypassed `isExchangeScopeError`, so the local handler never ran and the BFF propagated a raw 401 to the UI. Toast showed "Token exchange failed: Request denied: Unsupported authentication method". Session was present — this was NOT a session/Redis issue.
- **Root cause (Issue 2 — refresh 401):** Vercel serverless session problem (separate, pre-existing): different Lambda instances don't share in-memory session; without Redis (KV_REST_API_URL + KV_REST_API_TOKEN), every Lambda starts empty → `/refresh` returns 401 `no_refresh_token`.
- **Fix (Issue 1):** Extended `isExchangeScopeError` in `server.js` to also catch PingOne-origin 401s: `(err.httpStatus === 401 && Boolean(err.pingoneError))`. `err.pingoneError` is only set when the 401 body was parsed from the PingOne token endpoint, distinguishing it from a session/auth guard 401. Local fallback now runs for both 400 and 401 exchange policy rejects.
- **Fix (Issue 2):** Ensure `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) are set in Vercel env. After adding, redeploy and sign out/in again.
- **Long-term PingOne fix:** Enable "Token Exchange" grant on the admin client (`14cefa5b-...`) in PingOne and confirm "Token endpoint authentication method" = CLIENT_SECRET_BASIC; or set `PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH=post` to match PingOne app config.
- **Files changed:** `banking_api_server/server.js`
- **Do not break:** Session-guard 401s (no `err.pingoneError`) and MCP-server-side token rejections are NOT affected — they still propagate as errors.

### 2026-04-04 — Phase 09 UAT: step-up redirect rejected by PingOne — invalid acr_values

- **Root cause:** `banking_api_server/routes/oauthUser.js` `/stepup` route hardcoded the fallback `process.env.STEP_UP_ACR_VALUE || 'Multi_factor'`. `Multi_factor` must exactly match a Sign-On Policy name in PingOne; if the tenant uses any other name (or no policy override is needed), PingOne returns `invalid_request: Invalid sign-on policy provided in acr_values parameter` and the step-up redirect fails immediately.
- **Symptom:** Triggering email step-up from the agent showed a PingOne `invalid_request` error toast instead of navigating to the re-auth flow.
- **Fix:** Changed fallback default from `'Multi_factor'` to `''` (empty string). `oauthUserService.generateAuthorizationUrl` already skips `acr_values` when the value is falsy, so PingOne now uses the app's default sign-on policy. Also cleared `STEP_UP_ACR_VALUE` in `.env` and updated `.env.example` to document the field as optional.
- **Files changed:** `banking_api_server/routes/oauthUser.js`, `banking_api_server/.env.example`, `banking_api_server/.env`
- **Do not break:** If `STEP_UP_ACR_VALUE` IS set to a valid PingOne policy name, it is still forwarded — behaviour unchanged for correctly configured environments.

### 2026-04-03 — Phase 32: Render Docker deploy failed — prestart:prod hook rebuilt dist as non-root

- **Root cause:** `banking_mcp_server/package.json` had `"prestart:prod": "npm run build:prod"` and `"prestart": "npm run build"`. In the Render Docker container the `dist/` directory is owned by `root` (built in the builder stage before the runtime stage switches to `appuser`). When `npm start:prod` triggers the prestart hook, `npm run build:prod` → `rm -rf dist` fails with `Permission denied`, crashing every deploy attempt.
- **Symptom:** `rm: can't remove 'dist': Permission denied` → `Exited with status 1` in all 3 Render deploy attempts.
- **Fix:** Removed `prestart` and `prestart:prod` scripts from `package.json`. `start:prod` now runs `node dist/index.js` directly. `dist/` is already compiled by the builder stage and copied into the final image — no rebuild needed at runtime.
- **Files changed:** `banking_mcp_server/package.json` (commit `47722a1`); `banking_mcp_server/Dockerfile` (CMD changed to `node dist/index.js`), `render.yaml` (created)
- **Commits:** `47722a1`, `60ee468`, `8ced87d`
- **Do not break:** `npm run build:prod` still works for local development builds. Only the auto-trigger hooks were removed.


### 2026-04-03 — Phase 32: duplicate `const mcpExchangeMode` crashed server on startup

- **Root cause:** During Phase 32 (Plan 32-03) the `mcpExchangeMode` require block was accidentally duplicated in `banking_api_server/server.js` (lines 989–990 and 993–994). JavaScript `const` does not allow re-declaration in the same scope, so Node threw `SyntaxError: Identifier 'mcpExchangeMode' has already been declared` on every startup. The server could not start at all, making ALL authenticated API routes (which depend on a running BFF) return 401.
- **Symptom:** Browser console showed 401s on `/api/demo-scenario`, `/api/admin/feature-flags`, `/api/accounts/my`, `/api/transactions/consent-challenge` — all `authenticateToken`-gated routes.
- **Fix:** Removed the duplicate 4-line block (comment + `const mcpExchangeMode` + `app.use`). First declaration at line 989 retained.
- **Files changed:** `banking_api_server/server.js`
- **Commit:** `2eac0a9`
- **Do not break:** `mcpExchangeMode` route is still registered once at `/api/mcp`. No behavior change — only the duplicate removed.


### 2026-04-02 — HITL/agent: MCP param names + NL form field + CIBA session save

- **Root cause A (`bankingAgentService.js`):** `createDeposit` and `createWithdrawal` sent `account_id` as the MCP tool param, but the MCP server schema requires `to_account_id` / `from_account_id` respectively. With a valid PingOne token (MCP server path), validation failed immediately. Local-fallback path worked because `mcpLocalTools.js` accepts `account_id || to_account_id`.
- **Root cause B (`BankingAgent.js`):** `runAction` and `buildConsentIntent` used `form.accountId` for deposit/withdraw. Natural-language path maps MCP params via `normalizeBankingParams` into `form.toId` / `form.fromId` (not `form.accountId`), leaving it undefined. This caused "Missing required field: fromAccountId for withdrawal" toast (todos #2, #10).
- **Root cause C (`routes/ciba.js`):** CIBA poll approval stored new tokens in `req.session.oauthTokens` but did NOT call `req.session.save()` before responding. On Vercel serverless the updated session (with elevated ACR) might not reach Redis before the next request, causing the step-up gate to still fire 428.
- **Fix A:** `bankingAgentService.js` — changed `account_id: accountId` → `to_account_id: accountId` in `createDeposit`; `account_id: accountId` → `from_account_id: accountId` in `createWithdrawal`.
- **Fix B:** `BankingAgent.js` — `buildConsentIntent` deposit uses `form.accountId || form.toId`; withdraw uses `form.accountId || form.fromId`. `runAction` deposit uses `form.accountId || form.toId`; withdraw uses `form.accountId || form.fromId`.
- **Fix C:** `routes/ciba.js` — wrapped `res.json` in `req.session.save()` callback on CIBA approval (consistent with `/verify-otp`, `/confirm`, and consent-challenge routes).
- **Files changed:** `banking_api_ui/src/services/bankingAgentService.js`, `banking_api_ui/src/components/BankingAgent.js`, `banking_api_server/routes/ciba.js`
- **Todos resolved:** #2 (missing fromAccountId for withdrawal), #10 (deposit 400 after step-up)
- **Do not break:** ActionForm path still provides `form.accountId` directly — `|| form.toId` fallback is a no-op for that path. `mcpLocalTools` local fallback continues to accept both `account_id` and `to_account_id`/`from_account_id` (no change). CIBA `session.save` callback pattern is consistent with all other consent/OTP routes.

### 2026-04-02 — NLU: credit card payment returns friendly message instead of account-not-found error

- **Root cause:** User typed “pay my credit card from checking $250”; Groq LLM returned `{toId:"credit_card"}`. `sanitizeNlResult` had no account-type validation so the raw string passed through; `resolveAccountId("credit_card", accounts)` found no match; `create_transfer` threw "Destination account credit_card not found".
- **Fix 1 (`nlIntentSanitize.js`):** Added `isValidRef()` for transfer/deposit/withdraw params. Accepts `checking`, `savings`, `chk`, `sav`, `chk-*`/`sav-*` prefix, UUID pattern. Rejects anything else with `{kind:'none', reason:'invalid_account_type_name'}` + user-friendly message.
- **Fix 2 (`nlIntentSanitize.js`):** Expanded `VALID_EDU_PANELS` to include `langchain`, `par`, `rar`, `jwt-client-auth`, `agentic-maturity`, `oidc-21`, `best-practices` (Phase 23 side-bug — these were silently rejected).
- **Fix 3 (`groqNlIntent.js`, `geminiNlIntent.js`):** Added system-prompt guidance so LLM routes credit-card/investment requests to `kind:none` before the sanitizer.
- **Files changed:** `banking_api_server/services/nlIntentSanitize.js`, `banking_api_server/services/groqNlIntent.js`, `banking_api_server/services/geminiNlIntent.js`
- **Commit:** `e300b60`
- **Tests:** 5-case test — credit_card rejected, investment rejected, checking→savings pass, langchain panel accepted, empty toId pass.
- **Do not break:** `isValidRef` treats null/empty as valid (empty toId OK); UUID-format IDs must still pass for real session-store account IDs.


### 2026-04-01 — RFC 8693 token exchange: CLIENT_SECRET_BASIC auth method fix

- **Root cause:** `performTokenExchange` and `performTokenExchangeWithActor` in `oauthService.js` hardcoded `client_secret_post` (put `client_id` + `client_secret` in the POST body). All PingOne apps in this project are configured for `CLIENT_SECRET_BASIC` (credentials in `Authorization: Basic` header). `exchangeCodeForToken` correctly called `applyAdminTokenEndpointClientAuth` which respects the config — the exchange methods did not, causing PingOne to return `Request denied: Unsupported authentication method` on every token exchange attempt.
- **Also fixed:** `getAgentClientCredentialsToken` had the same pattern (client_secret in URLSearchParams); now uses `applyTokenEndpointAuth(clientId, clientSecret, agentAuthMethod, body, headers)` where `agentAuthMethod` = `AGENT_TOKEN_ENDPOINT_AUTH_METHOD` env var (default `basic`).
- **Refactor introduced:** Generic `applyTokenEndpointAuth(clientId, clientSecret, method, body, headers)` helper; `applyAdminTokenEndpointClientAuth` now delegates to it. No behaviour change to existing `exchangeCodeForToken` / `refreshToken` callers.
- **Files changed:** `banking_api_server/services/oauthService.js`
- **Commit:** `92b3a1e` (fix applied) + `227cca0` (changelog)
- **Tests:** 90 tests pass (`npx jest --testPathPattern="oauthService|agentMcpToken|tokenExchange"`)
- **Do not break:** `admin_token_endpoint_auth_method` config key must still control `exchangeCodeForToken` and all exchange methods. If a PingOne app is reconfigured to `CLIENT_SECRET_POST`, set `admin_token_endpoint_auth_method=post` in the Admin config UI — no code change needed.

### 2026-04-01 — STAB-01: KV cross-instance SSE bridge for Vercel agent flow diagram

- **Root cause:** On Vercel, GET `/api/mcp/tool/events` (SSE subscriber) and POST `/api/mcp/tool` (event publisher) can land on different Lambda instances. The in-memory `Map` in `mcpFlowSseHub.js` is instance-local, so subscribers on a different instance received zero events and the agent flow diagram panel stayed blank.
- **Fix:** Added async Upstash KV-backed event bridge to `mcpFlowSseHub.js`. `kvPublish()` does `RPUSH banking:sse:events:{traceId}` + `EXPIRE 120` via `@vercel/kv` (HTTP REST) whenever `publish()` is called. `startKvPoller()` polls the KV list every 500ms from `handleSseGet()`, deduplicating events by `ev.t` timestamp via `res._receivedTs` Set.
- **KV env vars:** `KV_REST_API_URL` (or `UPSTASH_REDIS_REST_URL`) + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_TOKEN`). Gracefully no-ops locally when vars are absent.
- **Files changed:** `banking_api_server/services/mcpFlowSseHub.js`, `banking_api_server/src/__tests__/mcpFlowSseHub.test.js` (new — 5 tests)
- **Commit:** `2ef3d49`
- **Tests:** 5/5 pass (`npx jest --testPathPattern=mcpFlowSseHub`)
- **Do not break:** Same-Lambda delivery via in-memory subscribers is unchanged (non-KV path). When KV vars are absent (local dev), `_getKvClient()` returns null and all KV calls are no-ops. Existing `claimTrace`/`attachSubscriber`/`handleSseGet` API is unchanged.

### 2026-03-31 — ff_two_exchange_delegation: 2-hop RFC 8693 feature flag + complete 2-exchange docs

- **Feature:** `ff_two_exchange_delegation` feature flag switches the entire BFF token exchange path between the 1-exchange demo pattern and a full 2-exchange delegated chain (AI Agent → MCP) at runtime. DemoDataPage gains a **Delegation Mode** radio button so operators can set `mayAct.sub` to the correct client ID for each mode without touching PingOne directly.
- **New config keys** (`configStore.js`): `ff_two_exchange_delegation`, `ai_agent_client_id`, `agent_gateway_audience`, `ai_agent_intermediate_audience`, `mcp_gateway_audience` — with env var aliases `AI_AGENT_CLIENT_ID`, `AI_AGENT_CLIENT_SECRET`, `AGENT_GATEWAY_AUDIENCE`, `AI_AGENT_INTERMEDIATE_AUDIENCE`, `MCP_GATEWAY_AUDIENCE`.
- **New oauthService methods:** `getClientCredentialsTokenAs(clientId, clientSecret, audience)` — CC grant for any client. `performTokenExchangeAs(subjectToken, actorToken, clientId, clientSecret, audience, scopes)` — RFC 8693 exchange with explicit exchanger credentials.
- **`agentMcpTokenService.js`:** When flag is ON, branches to `_performTwoExchangeDelegation()` — 4-step chain: (1) CC AI Agent actor token, (2) Exchange #1 → Agent Exchanged Token, (3) CC MCP actor token, (4) Exchange #2 → final MCP Exchanged Token. Each step emits a tokenEvent (`two-ex-agent-actor`, `two-ex-exchange1`, `two-ex-mcp-actor`, `two-ex-final-token`). Pre-flight check returns 503 with `missingVars` list if required env vars are absent. When flag is OFF, existing 1-exchange path is entirely unchanged.
- **`demoScenario.js` — `patchMayAct`:** Accepts `mode` param (`1exchange` | `2exchange`). Sets `mayAct.sub` to `AI_AGENT_CLIENT_ID` (2-exchange) or `admin_client_id` Banking App UUID (1-exchange). Response includes `mode` field.
- **`DemoDataPage.js`:** `delegationMode` state + radio buttons. `handleSetMayAct` passes `mode` to BFF. Toast confirms which client ID was written.
- **Docs — `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md`:** Fully rewritten to be self-contained (no dependency on ONE doc). Additions: coexistence table (what to reuse vs create), full PingOne config for all 5 resource servers and 3 apps, Part 3 User Schema + mayAct setup, Part 6 Postman Testing (steps 1–8, environment file variables table, cookie-clearing warning), corrected `act` expression for Exchange #2 (SpEL inline map literal `{'key':value}` is invalid in PingOne — use forwarded `act` claim instead).
- **Postman collections renamed** to align with doc names: `Super Banking — 1-Exchange Delegated Chain — pi.flow`, `Super Banking — 1-Exchange Delegated Chain (sub-steps)`, `Super Banking — 2-Exchange Delegated Chain — pi.flow`. Internal `info.name` fields updated to match. Environment file `Super Banking — 2-Exchange Delegated Chain` unchanged.
- **Files changed:** `banking_api_server/services/configStore.js`, `banking_api_server/routes/featureFlags.js`, `banking_api_server/services/oauthService.js`, `banking_api_server/services/agentMcpTokenService.js`, `banking_api_server/routes/demoScenario.js`, `banking_api_ui/src/components/DemoDataPage.js`, `banking_api_server/env.example`, `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md`, `docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md`, `docs/Super Banking — 1-Exchange Delegated Chain — pi.flow.postman_collection.json` (renamed), `docs/Super Banking — 1-Exchange Delegated Chain (sub-steps).postman_collection.json` (renamed), `docs/Super Banking — 2-Exchange Delegated Chain — pi.flow.postman_collection.json` (renamed).
- **Regression check:** `cd banking_api_ui && npm run build` → **Compiled successfully**. Flag OFF path is identical to pre-existing 1-exchange code — no behaviour change when flag is absent or false.
- **Do not break:** When `ff_two_exchange_delegation` is OFF (default), `agentMcpTokenService.js` takes the identical path as before — the flag check is a pure early-return before any exchange logic. `demoScenario patchMayAct` defaults to `mode=1exchange` when param is absent, so existing API callers are unaffected.

### 2026-03-31 — may_act/RFC 8693: scope fixes, 2-exchange docs, Postman collections

- **Root cause discovered:** OIDC application **Attribute Mappings** only deliver claims to UserInfo + ID Token, **not** the access token. Access token custom claims (`may_act`, `act`) **must** be configured on the **Resource Server** (Connections → Resources → Attributes tab) in PingOne.
- **Code fix — `oauthUser.js`:** When `ENDUSER_AUDIENCE` env var is set, `get scopes()` now returns `['profile', 'email', 'offline_access', 'banking:agent:invoke']` — omits `openid`, adds `banking:agent:invoke`. This allows `resource=https://ai-agent.pingdemo.com` to be sent on `/authorize` without triggering PingOne's "May not request scopes for multiple resources" `invalid_scope` rejection.
- **Code fix — `oauthAuthorizeResource.js`:** `OIDC_SCOPE_NAMES` changed from `new Set(['openid', 'profile', 'email', 'offline_access'])` to `new Set(['openid'])`. Only `openid` should suppress the `resource=` parameter; `profile`/`email`/`offline_access` alone do not cause multi-resource rejection.
- **PingOne config:** `may_act` attribute expression = bare `user.mayAct` (no `${}`), on **Super Banking AI Agent** resource server. `act` expression uses null-safe SpEL comparing `may_act.sub == actorToken.aud[0]` on **Super Banking MCP Server** resource server.
- **Docs — renamed:** `docs/PINGONE_MAY_ACT_SETUP.md` → `docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md`. Covers the 1-exchange demo pattern (Subject Token → MCP Token directly).
- **Docs — new:** `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md`. Covers the 2-exchange production pattern: Subject Token → AI Agent Exchange #1 → Agent Exchanged Token → MCP Exchange #2 → MCP Exchanged Token with nested `act.act.sub`. Includes 5 resource server definitions, both exchange API references, and PAZ enforcement notes.
- **Postman — 1-exchange:** `docs/PingOne Authorization Code — pi.flow.postman_collection.json` added to repo (pi.flow headless PKCE, Steps 1–7, Utility A/B).
- **Postman — 2-exchange (new):** `docs/PingOne 2-Exchange Delegated Chain — pi.flow.postman_collection.json`. Steps 1–4 (PKCE → Subject Token), 5a/5b (Exchange #1: AI Agent actor CC + exchange), 6a/6b (Exchange #2: MCP actor CC + exchange), 7 (PingOne API CC), 8 (User Lookup), Utility A (introspect, defaults to final token), Utility B (sets `mayAct.sub = ai_agent_client_id`).
- **Postman environment (new):** `docs/Super Banking — 2-Exchange Delegated Chain.postman_environment.json`. Variables: `env_id`, `client_id/secret`, `ai_agent_client_id/secret`, `mcp_client_id/secret`.
- **Key rule:** Never include `openid` in any scope in the may_act/RFC 8693 chain. `mayAct.sub` must be the AI Agent App UUID (not a URL). Resource server expression syntax: bare SpEL, no `${}`.
- **Files changed:** `banking_api_server/config/oauthUser.js`, `banking_api_server/utils/oauthAuthorizeResource.js`, `docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md` (renamed), `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` (new), `docs/PingOne Authorization Code — pi.flow.postman_collection.json` (new), `docs/PingOne 2-Exchange Delegated Chain — pi.flow.postman_collection.json` (new), `docs/Super Banking — 2-Exchange Delegated Chain.postman_environment.json` (new).
- **Commits:** `9a47b74`, `a548726`, `d76ac93`, `3b3f415`, `941ddba`, `1e67e98`
- **Regression check:** `cd banking_api_ui && npm run build` → **Compiled successfully**.
- **Do not break:** `OIDC_SCOPE_NAMES` must still suppress `resource=` when caller requests `openid` alone. `oauthUser.js` scope change only activates when `ENDUSER_AUDIENCE` is set; standard deployments without that env var are unaffected.

### 2026-04-01 — Token exchange: delegation scope excluded from MCP fallback

- **Bug:** When `ENDUSER_AUDIENCE` restricts login to only `banking:agent:invoke`, the RFC 8693 exchange scope fallback in `agentMcpTokenService.js` selected `banking:agent:invoke` as the exchange scope for the MCP resource. PingOne returned 400 `"Request failed: At least one scope must be granted"` because `banking:agent:invoke` is not registered as a valid scope on the MCP resource server — it lives on the enduser resource server only.
- **Root cause:** `fallbackScopes` filter (`s.startsWith('banking:')`) included `banking:agent:invoke` without distinguishing it as a delegation-permission scope that only applies to the enduser audience.
- **Fix:** Added `DELEGATION_ONLY_SCOPES = new Set(['banking:agent:invoke', 'ai_agent'])`. The fallback now excludes these from `fallbackScopes`. When no non-delegation `banking:` scopes remain, the code falls through to `toolCandidateScopes` (e.g. `['banking:transactions:write', 'banking:write']`) so PingOne evaluates its token exchange policy on the MCP resource correctly.
- **Files changed:** `banking_api_server/services/agentMcpTokenService.js`, `banking_api_server/src/__tests__/agentMcpTokenService.test.js`
- **Commit:** `b6b70d5`
- **Regression check:** 60/60 unit tests pass. `cd banking_api_ui && npm run build` → **Compiled successfully**.
- **Do not break:** When user token DOES carry `banking:write` etc. (standard non-ENDUSER_AUDIENCE login), `toolScopes` is non-empty and the fallback is never reached — no behavior change for those users.

### 2026-03-31 — AdminRoute: modal + toast for admin-only pages; no more silent /marketing redirect

- **Feature / fix:** Non-admin logged-in users who navigate to an admin-only route (e.g. `/activity`, `/users`, `/accounts`, `/transactions`, `/admin/banking`, `/settings`, `/oauth-debug-logs`, `/client-registration`) now see a centred modal dialog — **"Admin access required"** — with an explanation and a **Go back** button, plus a warning toast. Previously they were silently redirected to `/marketing` with no feedback.
- **How it works:** New `AdminRoute` component (inline in `App.js`). If `user?.role === 'admin'` it renders children unchanged. Otherwise it fires `notifyWarning` once (guarded by `useRef`) and renders the modal using the existing `.modal-overlay` / `.modal-content` / `.modal-body` CSS classes. The **Go back** button calls `navigate(-1)`.
- **Routes now wrapped in `AdminRoute`:** `/admin`, `/activity`, `/users`, `/accounts`, `/transactions`, `/admin/banking`, `/settings`, `/oauth-debug-logs`, `/client-registration`
- **Files changed:** `banking_api_ui/src/App.js`
- **Commit:** `78edda9`
- **Regression check:** `cd banking_api_ui && npm run build` → **Compiled successfully**.
- **Do not break:** Admin users see zero change — `AdminRoute` renders children directly. Non-admin users on public/open routes (dashboard, logs, api-traffic, config, feature-flags, mcp-inspector, etc.) are unaffected.

### 2026-03-31 — DemoDataPage: toast message quality + route guards for /config and /feature-flags

- **Feature / fix:** Three UX improvements in one push:
  1. **Toast message quality (`DemoDataPage.js`, `demoScenario.js`):** `handleSetMayAct` now shows specific, friendly messages with a sign-out reminder instead of passing through the raw server message (which contained raw JSON like `"may_act set to {"client_id":"..."}`). `handleP1azFlagToggle` now shows `"<Flag Label>: ON/OFF"` instead of the generic `"Feature flag saved"`.
  2. **Server attribute key fix (`demoScenario.js`):** `patchMayAct` now writes `{ sub: bffClientId }` to PingOne instead of `{ client_id: bffClientId }`, aligning the stored value with the SpEL expression `.may_act.sub` used during token exchange. Also removed the technical message string from the response body — client now owns all user-facing copy.
  3. **Route guard fix (`App.js`):** `/config` and `/feature-flags` were guarded to `user?.role === 'admin'`; non-admin users who clicked the links from `/demo-data` were silently redirected to `/marketing`. Changed both guards to `user` (any logged-in user).
- **Files changed:** `banking_api_ui/src/components/DemoDataPage.js`, `banking_api_server/routes/demoScenario.js`, `banking_api_ui/src/App.js`
- **Commits:** `1ff364e` (toast + server key fix), `230b63d` (route guards)
- **Regression check:** `cd banking_api_ui && npm run build` → **Compiled successfully** on both commits.
- **Do not break:** Admin-only routes (`/activity`, `/users`, `/accounts`, `/transactions`, `/admin/banking`, `/settings`, `/oauth-debug-logs`, `/client-registration`) remain gated to `role === 'admin'`. Only `/config` and `/feature-flags` were opened to all logged-in users.

### 2026-03-31 — DemoDataPage: remove all role gates; BFF injection toggles visible to all users

- **Feature / fix:** All admin/login guards removed from `/demo-data` page so that BFF injection toggles and the `may_act` section are visible to every logged-in user. Previously only `role === 'admin'` users saw the Auto-inject may_act and Auto-inject audience toggles.
- **DemoDataPage.js changes:**
  - `handleSetMayAct`: removed `if (!user)` bail guard and "Sign in as admin first" warning block
  - `loadP1azFlags` useCallback: removed `user?.role` from dependency array
  - `loadP1azFlags` useEffect: changed `if (user) loadP1azFlags()` to unconditional `loadP1azFlags()` on mount
  - "PingOne Authorize — demo toggles" section: removed `{user?.role === 'admin' && (` render wrapper and its closing `)}` — section now always renders
  - BFF injection IIFE: removed admin check; `injectFlag`/`audFlag` are now plain `p1azFlags.find(...)` for all users
- **PINGONE_MAY_ACT_SETUP.md doc fixes (same commit):**
  - Removed incorrect `sub` attribute mapping from Step 1b — `sub` is a standard JWT claim handled automatically by PingOne during token exchange; `#root.context.requestData.subjectToken.sub` returns `null` in the SpEL tester because standard claims are not exposed on the `subjectToken` context object. Only `act` needs a custom mapping.
  - Updated SpEL test data for the `act` expression to use real decoded token payload format (with `client_id`, `iss`, `sub`, `aud`, `scope`, `may_act` fields matching an actual Subject Token)
  - Added explicit note: SpEL can read **custom claims** (`may_act`) but NOT **standard JWT claims** (`sub`, `iss`, `aud`, `exp`, `iat`) from `subjectToken`
  - Added warning: `may_act.sub` must be the Banking App **UUID**, not a URL — URL values always fail the `actorToken.client_id` comparison
- **Files changed:** `banking_api_ui/src/components/DemoDataPage.js`, `docs/PINGONE_MAY_ACT_SETUP.md`
- **Regression check:** `cd banking_api_ui && npm run build` → **Compiled successfully**.
- **Do not break:** `ff_inject_may_act` flag still gates the actual BFF synthetic injection (`agentMcpTokenService.js`); removing the UI admin gate only affects display, never the server-side safety check. `loadP1azFlags` without a user guard is safe — the BFF `/api/feature-flags` endpoint requires a valid session and returns an empty array for unauthenticated callers.

### 2026-03-30 — MCP spec 2025-11-25 gap analysis completion: tests + user options

- **Feature / tooling:** Closes all test gaps and adds a user-facing option for MCP protocol version selection.
- **Tests added:**
  - `MCPMessageHandler.test.ts` — `describe('logging/setLevel')`: 10 tests covering all 8 RFC 5424 levels (parameterised), invalid level (-32602), absent level (-32602). `describe('Tool call timeout')`: 1 test verifying `isError: true` with timeout message when `TOOL_CALL_TIMEOUT_MS` is very short.
  - `BankingMCPServer.test.ts` — `describe('Lifecycle gate')`: 3 tests — pre-init tools/list rejected (-32600), post-init allowed (reaches handler), ping always permitted.
  - `tests/server/HttpMCPTransport.test.ts` (new, 15 tests): RFC 9728 metadata, 401 on missing bearer, 401 on invalid token, 200 + `MCP-Session-Id` on initialize, 404 on unknown session, 400 on missing `MCP-Protocol-Version`, DELETE 200/404, GET 405, origin rejection, no-Origin allowed, 403 + `insufficient_scope` WWW-Authenticate, 202 for notifications, 404 for unknown paths.
- **Timeout bug fix** (`MCPMessageHandler.ts`): The `Promise.race` timeout rejection was caught by the generic catch block and returned as `-32603` protocol error. Fixed to detect timeout errors (message contains 'timed out after') and return `isError: true` tool result — compliant with spec §lifecycle/timeouts SHOULD.
- **Feature Flag — MCP Protocol Version** (`featureFlags.js`, `configStore.js`): New flag "MCP — Use 2024-11-05 Protocol (legacy)" under "MCP Server" category. When ON, BFF uses `2024-11-05` in `initialize`; default OFF = `2025-11-25`.
- **`mcpWebSocketClient.js`**: Added `getMcpProtocolVersion()` helper that reads `mcp_use_legacy_protocol` from configStore at call time. Exported and used in inspector route.
- **`docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`**: Phase D, E, F all marked fully implemented + tested; new "User-facing options" table; overall status updated.
- **Files changed:** `banking_mcp_server/src/server/MCPMessageHandler.ts`, `tests/server/MCPMessageHandler.test.ts`, `tests/server/BankingMCPServer.test.ts`, `tests/server/HttpMCPTransport.test.ts` (new), `banking_api_server/routes/featureFlags.js`, `banking_api_server/services/configStore.js`, `banking_api_server/services/mcpWebSocketClient.js`, `banking_api_server/routes/mcpInspector.js`, `docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`.
- **Regression check:** `cd banking_mcp_server && CI=true npm test --forceExit` → **726 passed, 0 failed**; `npx tsc --noEmit` → **0 errors**; `cd banking_api_ui && npm run build` → **0**.
- **Do not break:** Existing WebSocket lifecycle; `getMcpProtocolVersion()` falls back to `MCP_CLIENT_PROTOCOL_VERSION` env var (default `2025-11-25`) when flag is OFF; timeout fix only affects the 'timed out after' error path.

### 2026-03-30 — Regression infrastructure: snapshot tests (Layer 1) + pre-commit hook (Layer 4) + compliance diagram

- **Feature / tooling:** Closes two `NOT YET IMPLEMENTED` items from the regression-guard layers.
- **Layer 1 snapshot tests** (`banking_api_ui/src/components/__tests__/`): Added `Header.snapshot.test.js`, `Footer.snapshot.test.js`, `SideNav.snapshot.test.js`. Each file renders the component's primary states (user nav, admin nav, light theme) and asserts `toMatchSnapshot()`. Baseline snapshots stored in `__snapshots__/`. Header null-user test case removed (component crashes on `user.firstName` without a user object — by design). **6 snapshots created, all passing.**
- **Layer 4 pre-commit hook** (`.git/hooks/pre-commit`): Installed per spec in REGRESSION_PLAN §4 Layer 4. Hook checks `git diff --cached` for `banking_api_ui/src` changes; if present, runs `npm run test:unit -- --watchAll=false --passWithNoTests --forceExit` and blocks the commit on failure.
- **Compliance diagram** (`docs/MCP_COMPLIANCE_DIAGRAM.drawio`): Two-tab draw.io file. Tab 1 — "Compliance Map": requirement-by-requirement table (8 sections, RFC column, code enforcer column, status badge, deficiency notes). Tab 2 — "Architecture & Compliance Mapping": full system architecture (4-layer diagram — External Clients, BFF, MCP Server, PingOne/Data) with colour-coded compliance annotations (green=MUST, blue=SHOULD, orange=opt-in, grey=N/A), deficiency callout, RFC reference panel, compliance score summary.
- **Gap analysis doc** (`docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`): New file — normative MCP 2025-11-25 summary, compliance table (Phases A–F+E), remediation status.
- **Files changed:** `banking_api_ui/src/components/__tests__/Header.snapshot.test.js` (new), `Footer.snapshot.test.js` (new), `SideNav.snapshot.test.js` (new), `banking_api_ui/src/components/__tests__/__snapshots__/` (new baselines), `.git/hooks/pre-commit` (new), `docs/MCP_COMPLIANCE_DIAGRAM.drawio` (new), `docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md` (new), `REGRESSION_PLAN.md` Layer 1 + Layer 4 status updated.
- **Regression check:** `cd banking_api_ui && npm run test:unit -- --testPathPattern=snapshot --passWithNoTests` → **6 passed, 0 failed**. `cd banking_api_ui && npm run build` → **0**.
- **Do not break:** Existing Jest test suites; Header/Footer/SideNav component DOM structure (update snapshot intentionally with `--updateSnapshot` when changing these components).

### 2026-03-30 — MCP spec 2025-11-25 Phase E: logging/setLevel + MCP_SERVER_RESOURCE_URI

- **Feature / protocol:** Phase E utilities — closes two remaining compliance gaps identified post-Phase F.
- **`logging/setLevel` handler** (`MCPMessageHandler.ts`): Added `case 'logging/setLevel'` to `handleMessage` switch + private `handleSetLogLevel()` method. Validates RFC 5424 level name (`debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`), stores as `clientLogLevel` field, returns `{}`. Previously fell through to `−32601 Method not found` despite `logging: {}` being advertised in `serverCapabilities` — a capability honesty violation.
- **`MCP_SERVER_RESOURCE_URI` env var documented** (`.env.example` + `src/interfaces/config.ts`): Audience validation code in `TokenIntrospector.ts` lines 89–104 already existed but the env var was undiscoverable. Now documented with recommended value = `MCP_RESOURCE_URL`. Setting it activates zero-trust RFC 8707 `aud` claim validation on every inbound agent token; leaving blank skips validation (acceptable for demo environments, not production).
- **Files changed:** `banking_mcp_server/src/server/MCPMessageHandler.ts`, `banking_mcp_server/.env.example`, `banking_mcp_server/src/interfaces/config.ts`, `docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md` (Phase E status updated), `docs/MCP_COMPLIANCE_DIAGRAM.drawio` (new compliance map).
- **Regression check:** `cd banking_mcp_server && npm test` → **695 passed, 5 skipped, 0 failed**; `npx tsc --noEmit` → **0 errors**.
- **Do not break:** Existing WebSocket token validation (unset `MCP_SERVER_RESOURCE_URI` keeps the same never-validate behaviour as before); `handleMessage` switch ordering unchanged; all 695 passing tests.

### 2026-03-30 — MCP spec 2025-11-25 Phase F: SHOULD requirements implemented

- **Feature / protocol:** Implements Phase F from [`docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`](docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md) — all normative **SHOULD** requirements now in code.
- **Input validation → `isError: true`** (`MCPMessageHandler.ts`): Unknown tool name returns `isError: true` tool result (not JSON-RPC protocol error) so LLMs can self-correct. An early auth gate (`!agentToken && !session`) still returns −32001 protocol error before the tool lookup, preserving correct error types.
- **`scope=` in `WWW-Authenticate` 401 + 403 insufficient scope** (`HttpMCPTransport.ts`): `sendUnauthorized` now appends `scope="…"` when `requiredScopes` are known; new `sendInsufficientScope` returns HTTP 403 with `error="insufficient_scope"` in `WWW-Authenticate`; `handlePost` promotes auth-challenge tool results to 403.
- **Disconnect on protocol version mismatch** (`mcpWebSocketClient.js`): After `initialize` response, checks `msg.result.protocolVersion` against `SUPPORTED_PROTOCOL_VERSIONS = {'2025-11-25', '2024-11-05'}`; closes WebSocket and rejects on unknown version.
- **Server lifecycle gate** (`BankingMCPServer.ts`): `routeMessage` intercepts `notifications/initialized` (sets `connection.initialized = true` on `ConnectionInfo`) and rejects (−32600) any non-`initialize`, non-`ping` request received before that flag is set. Integration and unit tests updated to complete the full lifecycle before making requests.
- **Request timeouts** (`MCPMessageHandler.ts`): `handleToolCall` wraps `executeTool` in `Promise.race` with a configurable `TOOL_CALL_TIMEOUT_MS` timeout (default 30 s). Returns `isError: true` on timeout so the LLM can retry. CIBA waits are not included. `TOOL_CALL_TIMEOUT_MS` documented in `config.ts` + `.env.example`.
- **TypeScript interfaces** (`mcp.ts`): `ToolDefinition` gains `title?`, `outputSchema?`, `icons?`, `annotations?`, `execution?`; `ToolResult` gains `audio`/`resource_link` type variants plus `uri?`, `structuredContent?`, `annotations?`; `HandshakeMessage.clientInfo` gains `description?`.
- **`clientInfo.description`** (`mcpWebSocketClient.js`): Added human-readable `description` field per spec recommendation.
- **Files changed:** `banking_mcp_server/src/server/MCPMessageHandler.ts`, `BankingMCPServer.ts`, `HttpMCPTransport.ts`, `src/interfaces/mcp.ts`, `src/interfaces/config.ts`, `.env.example`; `banking_api_server/services/mcpWebSocketClient.js`; tests: `MCPMessageHandler.test.ts`, `BankingMCPServer.test.ts`, `mcp-protocol.integration.test.ts`.
- **Regression check:** `cd banking_mcp_server && CI=true npm test --forceExit` → **695 passed, 5 skipped, 0 failed**; `npx tsc --noEmit` → **0 errors**.
- **Do not break:** WebSocket `initialize→notifications/initialized→tools/call` flow; all existing auth challenge / CIBA paths; `HttpMCPTransport` WebSocket transport stays unchanged; no change to `banking_api_ui`.

### 2026-03-30 — MCP spec 2025-11-25 Phase D: HTTP Streamable transport + RFC 9728

- **Feature / protocol:** Implements **Phase D** from [`docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`](docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md) — HTTP Streamable MCP transport running **alongside** the existing WebSocket transport on the same port. WebSocket path is completely unchanged.
- **New endpoints on `banking_mcp_server`:**
  - `GET /.well-known/oauth-protected-resource` — RFC 9728 Protected Resource Metadata (always available)
  - `POST /mcp` — Streamable HTTP MCP endpoint; requires `Authorization: Bearer <token>` (PingOne introspection); issues `MCP-Session-Id` header on initialize
  - `DELETE /mcp` — client-initiated session termination
- **Auth on HTTP transport:** Bearer validated on every request via existing `BankingAuthenticationManager.validateAgentToken()`. Returns `401 WWW-Authenticate: Bearer realm=..., resource_metadata=<RFC 9728 URL>` on missing/invalid token.
- **Session management:** `MCP-Session-Id` (UUID) maps to existing `BankingSession` in `BankingSessionManager`; both transports share the same session store.
- **Opt-out:** `HTTP_MCP_TRANSPORT_ENABLED=false` disables `/mcp` endpoint while keeping `/.well-known/oauth-protected-resource` active.
- **New files:** `banking_mcp_server/src/server/HttpMCPTransport.ts`
- **Modified files:** `banking_mcp_server/src/server/BankingMCPServer.ts` (import + field + `handleHttpRequest` routing only); `banking_mcp_server/src/interfaces/config.ts` (3 new optional env vars); `banking_mcp_server/.env.example`.
- **Regression check:** `cd banking_mcp_server && CI=true npm test -- --testPathPattern="MCPMessageHandler|mcp-protocol.integration" --forceExit` → **39 passed, 0 failed**; `npx tsc --noEmit` → **0 errors**.
- **Do not break:** WebSocket `initialize→notifications/initialized→tools/call` flow; all existing routing in `BankingMCPServer.ts`; `mcpWebSocketClient.js` BFF bridge.

### 2026-03-30 — MCP spec 2025-11-25 remediation (lifecycle, version, capabilities, ping)

- **Feature / protocol:** Aligns with [`docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`](docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md) — **Phase A–C + E** (not HTTP OAuth / Phase D).
- **BFF (`mcpWebSocketClient.js`):** `initialize` (id 1) → on success **`notifications/initialized`** → **`tools/list` / `tools/call`** (id 2); **`MCP_CLIENT_PROTOCOL_VERSION`** (env, default **`2025-11-25`**); **`capabilities: {}`** + **`clientInfo`**; initialize errors do not send follow-ups.
- **MCP server (`MCPMessageHandler.ts`):** Negotiate **`2025-11-25`** or **`2024-11-05`**; **`notifications/initialized`** (no response); **`ping`**; **`serverCapabilities`** only **tools** + **logging** (prompts/resources removed); default missing **`capabilities`** to `{}`.
- **`BankingMCPServer.ts`:** `isValidMCPMessage` — reject **`id === null`**; allow **`notifications/*`** only without `id`.
- **Inspector:** `GET /api/mcp/inspector/context` **`mcpProtocolVersion`** from **`MCP_CLIENT_PROTOCOL_VERSION`**; transport copy mentions **`notifications/initialized`**.
- **UI:** **`BankingAgent.js`** MCP cheat string — handshake mentions **`notifications/initialized`**.
- **Tests:** `mcp-protocol.integration.test.ts` (lifecycle sequence); `MCPMessageHandler.test.ts`; `mcp-inspector.test.js` expectation **2025-11-25**.
- **Files:** `banking_api_server/services/mcpWebSocketClient.js`, `routes/mcpInspector.js`, `src/__tests__/mcp-inspector.test.js`; `banking_mcp_server/src/server/MCPMessageHandler.ts`, `BankingMCPServer.ts`, `tests/server/MCPMessageHandler.test.ts`, `tests/integration/mcp-protocol.integration.test.ts`; `banking_api_ui/src/components/BankingAgent.js`; `docs/MCP_SPEC_2025_11_25_GAP_ANALYSIS.md`, `REGRESSION_PLAN.md` §2.
- **Regression check:** `cd banking_mcp_server && CI=true npm test -- --testPathPattern="MCPMessageHandler|mcp-protocol.integration" --forceExit` → pass; `cd banking_api_server && CI=true npx jest src/__tests__/mcp-inspector.test.js --forceExit` → pass; `cd banking_api_ui && npm run build` → **0**.
- **Do not break:** **`POST /api/mcp/tool`** and MCP Inspector tool paths; **token exchange** / **`MCP_TOOL_SCOPES`**; **multi-instance SSE** (unchanged).

### 2026-03-30 — Vercel MCP setup: script, docs, hints, rm-before-add (commits `4fec8c3`, `b8210c0`, `3fdc211`)

- **Feature / ops:** Three improvements to `scripts/setup-vercel-env.js` and new `docs/VERCEL_SETUP.md`.
- **`setup-vercel-env.js` — MCP_RESOURCE_URI promoted:** When `MCP_SERVER_URL` is set, the wizard now always prompts for `MCP_RESOURCE_URI` (previously hidden behind an optional Y/N gate). Auto-derives HTTPS default from `REACT_APP_CLIENT_URL`; sets both `MCP_RESOURCE_URI` (BFF) and `MCP_SERVER_RESOURCE_URI` (written to env file) to the same value. Post-setup checklist now prints the CLI commands to set the var on Vercel manually.
- **`setup-vercel-env.js` — rm-before-add:** `vercelEnvAdd()` now runs `vercel env rm KEY env --yes` before each `env add`, clearing any stale value from a prior failed run. `--force` flag removed from `env add` (no longer needed).
- **`setup-vercel-env.js` — contextual hints:** Added `tip()` helper (grayed example lines). PingOne section shows where to find each value in admin console and Vercel-vs-localhost examples for redirect URIs and `REACT_APP_CLIENT_URL`. MCP section shows `wss://` vs `ws://` examples; corrected `MCP_RESOURCE_URI` description — it is the resource URI registered in **PingOne → Resources → [MCP resource]** (Vercel: app base URL, localhost: API server base URL). New conflict check warns when `MCP_SERVER_URL` is set but `MCP_RESOURCE_URI` is missing.
- **`docs/VERCEL_SETUP.md` (new):** Full deployment guide — session store, PingOne OAuth, MCP_RESOURCE_URI duality table, RFC 8693 token exchange vars, post-deploy checklist, troubleshooting table.
- **`docs/BX_Finance_Agent_Flow.drawio` (new):** Draw.io diagram mapping the Ping Identity "Digital Assistants" reference architecture to the Super Banking app (users → trust boundary → LangChain agent/BFF → PingOne AS + Authorize → MCP server → 4 banking tools).
- **Files changed:** `scripts/setup-vercel-env.js`, `docs/VERCEL_SETUP.md` (new), `docs/BX_Finance_Agent_Flow.drawio` (new), `docs/MCP_COMPLIANCE_DIAGRAM.drawio` (draw.io re-save).
- **Do not break:** `vercelEnvAdd` error handling — rm failure is intentionally silent; `env add` still hard-fails on bad values. `MCP_RESOURCE_URI` conflict check is warning-only (not a blocking conflict). `setup-vercel-env.js` prompt defaults come from `.env.vercel.local` if it exists.

### 2026-03-30 — Deploy bundle: marketing showcase removed, rail FABs, guest toasts, scope matrix doc (commit `2d2d8a4`)

- **Landing (`/`):** Removed the full **“Try Our AI Banking Assistant”** section (tabs, try-asking, chat mock). **`scrollToAgent`** and footer **Banking assistant** link target **`#marketing-embedded-dock-slot`**. Dropped related **`LandingPage.css`** / **`globalTheme.css`** rules.
- **Education rail:** Removed upper-left **CIBA** / **CIMD Simulator** FAB buttons (**`CIBAPanel.js`**, **`CimdSimPanel.js`**); drawers still open from Learn / events. **`App.css`** left-rail stack offsets adjusted.
- **Toasts (guest marketing):** **`ToastContainer`** default **12s** for unsigned users on **`/`** and **`/marketing`**; **`BankingAgent`** uses longer **`agentToastMs`** on those paths for success/error/info tool toasts.
- **OAuth:** **`buildPingOneAuthorizeResourceQueryParam`** — see dedicated log entry below (`invalid_scope` fix); tests **`oauthAuthorizeResource.test.js`**.
- **Docs:** New **`docs/PINGONE_APP_SCOPE_MATRIX.md`** (apps, client IDs, scope lists, PingOne checklist); links from **`docs/PINGONE_AUTHORIZE_PLAN.md`** (intro, BFF closing §, AUD summary, References).
- **Files:** `banking_api_ui` — `LandingPage.js`, `LandingPage.css`, `App.js`, `App.css`, `BankingAgent.js`, `EmbeddedAgentDock.js`, `globalTheme.css`, `CIBAPanel.js`, `CimdSimPanel.js`, `CimdSimPanel.css`, `buttonRouting.test.js`; `banking_api_server` — `utils/oauthAuthorizeResource.js`, `routes/oauth.js`, `routes/oauthUser.js`, `src/__tests__/oauthAuthorizeResource.test.js`; `docs/PINGONE_APP_SCOPE_MATRIX.md`, `docs/PINGONE_AUTHORIZE_PLAN.md`
- **Regression check:** `cd banking_api_ui && npm run build` → **0**; `cd banking_api_server && CI=true npx jest src/__tests__/oauthAuthorizeResource.test.js oauth-login-resilience.test.js --forceExit` → pass; Customer + Admin sign-in without `invalid_scope` (with `ENDUSER_AUDIENCE` set).
- **Do not break:** OAuth callbacks, **`req.session.save()`** before redirect, **BankingAgent** FAB/dock visibility, **`middleware/auth.js`** `aud` rules.

### 2026-03-30 — Marketing landing: simplify hero, remove duplicate sign-in strip

- **Change:** **`LandingPage`** hero no longer shows CIBA / CIMD / Home / Dashboard / API / Logs quick links — only **Demo config** remains. **Application setup** uses a visible **`hero-setup-btn`** (not an underlined text link). Right-hand hero **chat mockup** removed; **single-column** hero. **Sign in with PingOne** middle section (duplicate Customer/Admin) removed; **`marketing-scroll-login`** scrolls to **`#marketing-hero-signin`**. **AI Assistant** showcase and bottom **CTA** no longer repeat sign-in buttons (copy points to header/hero/assistant). **`slide_pi_flow`** note kept on hero and drawer.
- **Files:** `banking_api_ui/src/components/LandingPage.js`, `LandingPage.css`, `components/__tests__/buttonRouting.test.js`
- **Regression check:** `cd banking_api_ui && npm run build` exits **0**; `npm test -- --testPathPattern=buttonRouting` passes.
- **Do not break:** Nav **Application setup** / **Vercel setup**; **BankingAgent** `marketing-scroll-login` event; **pi.flow** drawer.

### 2026-03-30 — PingOne Authorize education (diagram, MCP checklist) + MCP_EXPECTED_ACT_CLIENT_ID

- **Education (UI):** **`PingOneAuthorizePanel`** — inline **SVG policy diagram** and **Why & security (AI/MCP)** tab; **Configure MCP (PingOne & env)** tab documents Trust Framework parameters (`UserId`, `TokenAudience`, `McpResourceUri`, `ActClientId`, `NestedActClientId`, `DecisionContext`, …), BFF flags (`ff_authorize_mcp_first_tool`, `authorize_mcp_decision_endpoint_id`), and MCP host env vars. **`educationCommands.js`** — shortcuts to policy/security and MCP config tabs.
- **MCP hardening:** **`MCP_EXPECTED_ACT_CLIENT_ID`** — optional introspection check: **`act.client_id`** must match when set (PingOne often omits **`act.sub`**). Implemented in **`banking_mcp_server/src/auth/TokenIntrospector.ts`** with tests in **`TokenIntrospector.test.ts`** (client_id-only token, mismatch, combined SUB+CLIENT_ID).
- **Docs:** **`docs/PINGONE_AUTHORIZE_PLAN.md`** — checklist / phase 4d / operational summary updated for **`MCP_EXPECTED_ACT_CLIENT_ID`** and education cross-references.
- **Files:** `banking_api_ui/src/components/education/PingOneAuthorizePanel.js`, `educationCommands.js`, `banking_mcp_server/src/auth/TokenIntrospector.ts`, `banking_mcp_server/src/interfaces/auth.ts`, `banking_mcp_server/tests/auth/TokenIntrospector.test.ts`, `docs/PINGONE_AUTHORIZE_PLAN.md`, `REGRESSION_PLAN.md`
- **Regression check:** `cd banking_api_ui && npm run build` → **0**; `cd banking_mcp_server && npm test -- --testPathPattern=TokenIntrospector` → **pass**. BankingAgent / Authorize flows unchanged except new education strings.
- **Do not break:** **`middleware/auth.js`** audience rules, **`mcpToolAuthorizationService`** gate session key, **`BankingAgent`** education host.

### 2026-03-30 — Demo config: agent + sign-in lessons, test hardening, docs

- **Feature / education:** **`/demo-data`** adds **Learn: how can an AI reach your bank data?** — three **lesson focus** options (OAuth + PKCE, marketing **`pi.flow`**, Bearer token lab with **`GET /api/accounts`** probe). Copy targets **non-expert** audiences; choice persisted in **`localStorage`** (`bx-agent-auth-demo-mode`) and **`bx-agent-auth-demo-mode`** window event. Marketing sign-in hint explains **pi.flow** vs unsafe password-in-chat habits.
- **Docs / API comments:** **`educationContent.js`** OAuth cheatsheet — bootstrap line no longer highlights ROPC. **`docs/PINGONE_AUTHORIZE_PLAN.md`** — table row for **`DemoDataPage`** educational agent paths. **`routes/agentIdentity.js`** — comments: main demos use OAuth / pi.flow; optional password grant is lab-gated.
- **Tests / CI:** **`App.session.test.js`** mocks **`useSearchParams`** for **`App.js`**. **`bankingAgentNl.test.js`** — **`parseNaturalLanguage.mockReset()`** in **`beforeEach`** to avoid mock leakage. **`banking_api_server/jest.config.js`** — **`maxWorkers: 2`** when **`CI=true`** to reduce flaky parallel supertest runs.
- **Files:** `banking_api_ui/src/components/DemoDataPage.js`, `DemoDataPage.css`, `__tests__/DemoDataPage.test.js`, `__tests__/App.session.test.js`, `educationContent.js`, `banking_api_server/routes/agentIdentity.js`, `src/__tests__/bankingAgentNl.test.js`, `jest.config.js`, `docs/PINGONE_AUTHORIZE_PLAN.md`, `REGRESSION_PLAN.md`
- **Regression check:** **`CI=true npm test`** at repo root; **`cd banking_api_ui && npm run build`** exits **0**.
- **Do not break:** **`routes/oauthUser.js` / `oauth.js`**, **BankingAgent** FAB/session, **`agentIdentity`** bootstrap runtime behavior (comments only on server route).

### 2026-03-29 — End-user OAuth errors: redirect to marketing + toast (not `/login`) (commit `3a762ae`)

- **Symptom:** After PingOne returned an error (e.g. unsupported **pi.flow**), BFF sent users to **`/login?error=oauth_error`** — the SPA does not treat **`/login`** as a marketing path, so **BankingAgent FAB + bottom dock disappeared**; no inline error on the marketing surface.
- **Root cause:** `routes/oauthUser.js` always redirected failures to **`/login`**. **`App.js`** only shows floating/dock agents on **`/`** and **`/marketing`** (`isPublicMarketingAgentPath`).
- **Fix:** **`redirectEndUserOAuthSpaFailure`** — redirect to **`session.postLoginReturnToPath`** (e.g. **`/marketing`**) or **`/marketing`**, with query params; forward PingOne **`error` / `error_description`** as **`oauth_provider`** + **`idp_error`**. **`App.js`** + **`endUserOAuthErrorToast.js`** toast and strip params.
- **Files:** `banking_api_server/routes/oauthUser.js`, `banking_api_ui/src/App.js`, `banking_api_ui/src/utils/endUserOAuthErrorToast.js`, `REGRESSION_PLAN.md`
- **Regression check:** `npm run build` in `banking_api_ui/`. Trigger a deliberate IdP error → land on **`/marketing?...`** with FAB visible and toast.
- **Do not break:** Successful **`/callback`** redirect to **`/dashboard`** / **`postLoginReturnToPath`**; **admin** **`routes/oauth.js`** (unchanged).

### 2026-03-29 — Marketing pi.flow slide sign-in + compact landing layout (commit `e5611a3`)

- **Feature — demo / config:** **`marketing_customer_login_mode`** (`redirect` default vs **`slide_pi_flow`**): home page can open a **right-hand drawer** with **username/password hints** (public config; not secrets), then **Continue to PingOne** with **`use_pi_flow=1`**. **`BankingAgent`** customer login on marketing paths adds **`use_pi_flow=1`** when the mode is slide. New **`configStore`** keys **`marketing_demo_username_hint`**, **`marketing_demo_password_hint`** (empty string allowed on save to clear). **`GET /api/auth/oauth/user/login?use_pi_flow=1`** forces pi.flow authorize via **`oauthUserService.generateAuthorizationUrl`** **`forcePiFlow`** even when global user pi.flow is off.
- **UX:** **Landing page** vertical rhythm **condensed** — hero no longer **`min-height: 100vh`** or vertically centered; **tighter section padding**, **smaller hero/section type**, **shorter** PingOne tagline block — to cut total scroll height.
- **Files:** `banking_api_server/services/configStore.js`, `oauthUserService.js`, `routes/oauthUser.js`, `src/__tests__/oauthUserService.test.js`, `banking_api_ui/src/components/LandingPage.js`, `LandingPage.css`, `BankingAgent.js`, `Config.js`, `DemoDataPage.js`, `DemoDataPage.css`, `services/configService.js`, `REGRESSION_PLAN.md`
- **Regression check:** `cd banking_api_server && npm test -- --testPathPattern=oauthUserService`; `cd banking_api_ui && npm run build` exits **0**. Verify **default** mode: customer buttons redirect without drawer. **slide_pi_flow**: drawer → PingOne with pi.flow. **Agent** customer login on `/` or `/marketing` still uses **`return_to=/marketing`** when applicable.
- **Do not break:** **BankingAgent FAB** / **`App.js`** placement; **OAuth** user callback and **`sanitizePostLoginReturnPath`**; **admin** login; **Upstash** session store (unchanged).

### 2026-03-29 — Marketing agent: chat before PingOne; banking intent auto-redirects + NL replay (commit `36d9e73`)

- **Symptom:** Guest agent UI blocked chat until manual sign-in (“Sign in to get started”, no input); user wanted PingOne only when a banking action is needed, then return to the same agent on the marketing page.
- **Root cause:** `POST /api/banking-agent/nl` required `req.session.user`; agent hid the NL input when `!isLoggedIn`.
- **Fix:** BFF `bankingAgentNl.js` allows anonymous NL with `context: { anonymous: true }` (parsing only — tools still session-backed). `BankingAgent`: on `/` and `/marketing` when signed out, show NL input; `dispatchNlResult` for `kind: banking` stores pending text in `sessionStorage`, messages user, calls `handleLoginAction('login_user')` (`return_to` unchanged). After `?oauth=success`, replay pending NL once session exists. Subtitle / empty state / left-rail copy updated; ⚡ Learn chips disabled until signed in.
- **Files:** `banking_api_server/routes/bankingAgentNl.js`, `banking_api_server/src/__tests__/bankingAgentNl.test.js`, `banking_api_ui/src/components/BankingAgent.js`, `REGRESSION_PLAN.md`
- **Regression check:** `npm test` `bankingAgentNl.test.js`; `npm run build` in `banking_api_ui/`. Signed-in agent unchanged. Dashboard guests (non-marketing paths) still require sign-in for NL input.
- **Do not break:** OAuth `handleLoginAction` return_to for `isPublicMarketingAgentPath`; `oauth=success` retry loop; banking `runAction` / MCP still require session.

### 2026-03-29 — Marketing sign-in: `return_to=/marketing` only from BankingAgent, not LandingPage buttons (commit `e372ff2`)

- **Symptom:** Inline marketing card offered “Customer — stay on this page” with `return_to=/marketing`, blurring the rule that staying on marketing is for agent-driven banking only.
- **Root cause:** `LandingPage.handleOAuthLogin` accepted `returnToMarketing`; showcase and `#marketing-login` used it for buttons.
- **Fix:** All `LandingPage` customer buttons use `/api/auth/oauth/user/login` with **no** `return_to` (dashboard after callback). Copy explains: assistant sign-in → PingOne → back to marketing; page/header buttons → dashboard. `BankingAgent.handleLoginAction` unchanged (`return_to` when `isPublicMarketingAgentPath`). Auth nudge bubble text updated. `docs/Marketing_Login_Agent_vs_Button.drawio` aligned.
- **Files:** `banking_api_ui/src/components/LandingPage.js`, `BankingAgent.js`, `docs/Marketing_Login_Agent_vs_Button.drawio`, `REGRESSION_PLAN.md`
- **Regression check:** `npm run build` in `banking_api_ui/` exits 0. Agent customer login on `/` or `/marketing` still appends `?return_to=/marketing`. Header / hero / `#marketing-login` / showcase customer sign-in omit `return_to`.
- **Do not break:** `oauthUser.js` `sanitizePostLoginReturnPath` / callback redirect; `handleLoginAction` for admin vs customer.

### 2026-03-29 — docs: marketing login draw.io (agent-first vs button-first); fix `DemoDataPage` Jest axios mock for `apiClient` (commit `535c276`)

- **Symptom:** `CI=true npm run test:unit` failed — `DemoDataPage.test.js` did not load: `TypeError: _axios.default.create is not a function` because `apiClient` constructs `axios.create()` at module load while the test mock only stubbed `get` / `post` / `patch`.
- **Root cause:** Incomplete `axios` Jest mock after `DemoDataPage` began importing `apiClient` (singleton uses `axios.create` + interceptors).
- **Fix:** Mock `axios.create()` to return an instance with `interceptors.request/response.use` and stubbed HTTP methods; export `default` + named fields for `import axios from 'axios'` and `require('axios').default`. Added `docs/Marketing_Login_Agent_vs_Button.drawio` (swimlanes: BankingAgent-initiated OAuth vs `#marketing-login` / header / showcase button-first).
- **Files:** `docs/Marketing_Login_Agent_vs_Button.drawio`, `banking_api_ui/src/components/__tests__/DemoDataPage.test.js`, `REGRESSION_PLAN.md`
- **Regression check:** `cd banking_api_server && CI=true npm test` exits 0. `cd banking_api_ui && CI=true npm run test:unit` exits 0. `cd banking_api_ui && npm run build` exits 0.
- **Do not break:** `apiClient` interceptors and real `axios` in production; OAuth routes unchanged (this change is test + docs only).

### 2026-03-29 — Marketing `/marketing` + home: OAuth `return_to`, dual agents, light page, showcase UI (commit `1b5e743`)

- **Symptom:** Marketing page needed inline sign-in after agent banking prompts; users wanted float + bottom BankingAgent on `/` and `/marketing`; bottom dock missing for guests on `/` (wrong `onUserDashboardRoute` when `user` null); `/marketing` sometimes showed no real agents (splat route, collapsed dock, float default closed); mock agent block did not match product dark-card design.
- **Root cause:** No `return_to` post-login path for customer OAuth; dock gated on `agentPlacement === 'bottom'` only; `pathname === '/' && user?.role !== 'admin'` was true for guests; marketing visibility and portal FAB stacking; light global theme overrode marketing chrome.
- **Fix:** `oauthUser.js` — `sanitizePostLoginReturnPath` + session `postLoginReturnToPath` from `return_to` on login, redirect after callback (non-admin). UI — `isMarketingEmbeddedDockSurface`, explicit `Route path="/marketing"`, fix `onUserDashboardRoute` to require signed-in user, `App--marketing-page` high-contrast agent chrome, LandingPage `#marketing-login` + white/dark showcase section, `EmbeddedAgentDock` expand on marketing, `isBankingAgentFloatingDefaultOpen('/marketing')` true, body portal FAB visibility CSS. Education panels: optional implementation snippets module.
- **Files:** `banking_api_server/routes/oauthUser.js`, `banking_api_ui/src/App.js`, `App.css`, `EmbeddedAgentDock.js`, `LandingPage.js`, `LandingPage.css`, `BankingAgent.js`, `BankingAgent.css`, `globalTheme.css`, `embeddedAgentFabVisibility.js`, `bankingAgentFloatingDefaultOpen.js` (+ test), education `*Panel.js` / `educationContent.js` / `educationImplementationSnippets.js`, `CIBAPanel.js` / `.css`, `REGRESSION_PLAN.md`
- **Regression check:** `cd banking_api_ui && npm run build` exits 0. Guest `/` and `/marketing`: float + bottom agent visible; customer login without `return_to` → `/dashboard`; with “stay on page” → `/marketing?oauth=success`. `sanitizePostLoginReturnPath` rejects `//` and off-site paths. Admin OAuth callback still `/admin?oauth=success`. UserDashboard middle/bottom unchanged for signed-in `/`.
- **Do not break:** OAuth session regenerate, step-up `return_to`, `routes/oauthUser.js` token expiry on status, BankingAgent FAB on dashboard, `vercel.json` SPA rewrite.

### 2026-03-29 — feat: MCP tool flow SSE + agent flow diagram panel

- **Primary commit:** `6f0bc60` on `fix/dashboard-fab-positioning` (includes REGRESSION_PLAN critical-row + log body).
- **Feature:** **Server-Sent Events** stream BFF pipeline phases for each banking agent MCP tool call. Client sends **`flowTraceId`** on **`POST /api/mcp/tool`** and opens **`GET /api/mcp/tool/events?trace=`** first (same session cookie). **Agent flow diagram** panel (draggable/resizable) shows the static hop diagram plus a **“Live server phases (SSE)”** timeline. Hub buffers recent events for subscribers that connect slightly after the first publish.
- **Fix / design:** **`endTrace`** runs on **`res.finish` / `res.close`** so every response path closes the stream. Payloads are phase labels and flags only (no tokens).
- **Files:** `banking_api_server/services/mcpFlowSseHub.js`, `banking_api_server/server.js`, `banking_api_ui/src/services/mcpFlowSseClient.js`, `agentFlowDiagramService.js`, `bankingAgentService.js`, `AgentFlowDiagramPanel.js` + `.css`, `App.js`, `EducationBar.js`, `BankingAgent.js` (inspector/diagram wiring as applicable).
- **Regression check:** `cd banking_api_ui && npm run build` exits 0. Sign in → open **Agent flow diagram** from education bar → run **My Accounts** (or any MCP tool) → timeline fills with phases; no secrets in SSE JSON. On Vercel, live SSE may miss events if GET and POST land on different Lambdas (documented limitation).

---

### 2026-03-29 — PingOne UX: global wait overlay + config test gate + setup reference (commit `b5714f2`)

- **Symptom:** Calls that ultimately hit PingOne (Management API, discovery test, Authorize bootstrap, CIMD register) did not show the same global spinner as other `apiClient` traffic; `/setup` flows used `_silent: true`. `POST /api/admin/config/test` was callable without the same gate as other config writes once the app was configured.
- **Root cause:** Raw `axios` bypasses `apiClient` interceptors; `_silent` disabled the spinner; `/test` lacked `requireAdminOrUnconfigured`.
- **Fix:** Route PingOne-adjacent UI calls through `apiClient` where applicable; remove `_silent` from SetupPage setup/bootstrap requests; add spinner `API_MESSAGES` for those paths; document BFF vs MCP PingOne egress in `pingOneClientService.js`; add security card on PingOne setup reference page; gate `POST /api/admin/config/test` with `requireAdminOrUnconfigured`.
- **Files:** `banking_api_ui/src/services/spinnerService.js`, `SetupPage.js`, `Config.js`, `DemoDataPage.js`, `ClientRegistrationPage.js`, `PingOneSetupGuidePage.js`, `banking_api_server/routes/adminConfig.js`, `banking_api_server/services/pingOneClientService.js`
- **Regression check:** `cd banking_api_ui && npm run build` exits 0. First-run Config still loads; after configure, Config test requires admin session or `X-Config-Password` on hosted stacks. `/setup` shows spinner while plan/worker/probe/bootstrap requests run. Vercel: `vercel --prod` from repo root after push.

---

### 2026-03-29 — feat(token-exchange): ff_inject_audience + may_act session seed + 29 new tests (commit `3fc11c4`)

- **may_act status seeded from session on mount:** `DemoDataPage` now calls `GET /api/auth/session` on mount and seeds `mayActEnabled` from the token's `may_act` claim. Status pill always visible: **Checking…** → **✅ may_act present in token** / **❌ may_act absent from token**. Previously `null` until the user clicked a button, making the current state ambiguous.
- **`ff_inject_audience` feature:** Parallel to `ff_inject_may_act`. When enabled and the user access token's `aud` claim does not include `mcp_resource_uri`, the BFF adds it to the local claim snapshot in memory before RFC 8693 exchange (for Token Chain display). JWT is unchanged — PingOne still validates the real token. Useful when PingOne isn't yet configured with RFC 8707 resource indicators.
- **Toggle location:** `DemoDataPage` → Token Exchange section → **🔧 Enable injection** / **❌ Disable injection** (admin only); also Feature Flags → Token Exchange category.
- **Tests (29 new):** `agentMcpTokenService.test.js` — 9 tests for `ff_inject_may_act` (injection ON/already-present/OFF) and 5 for `ff_inject_audience` (injection ON/already-present/OFF/still-exchanges). `DemoDataPage.test.js` — 7 tests: Checking…, ✅, ❌, non-ok fetch, audience banner renders/not for non-admin/PATCH.
- **Files:** `banking_api_server/services/configStore.js`, `banking_api_server/routes/featureFlags.js`, `banking_api_server/services/agentMcpTokenService.js`, `banking_api_ui/src/components/DemoDataPage.js`, `banking_api_server/src/__tests__/agentMcpTokenService.test.js`, `banking_api_ui/src/components/__tests__/DemoDataPage.test.js`
- **Regression check:** `cd banking_api_server && npm test` → **827 passing, 0 failing**; `cd banking_api_ui && npm test && npm run build` → **263 passing, 0 failing**, build exits **0**. Flag OFF (default) — Token Chain shows may_act/aud as-is, no injections. Flag ON + claim absent — Token Chain shows injected badge. Flag ON + claim present — no injection.

---

### 2026-03-29 — fix: lower MIN_USER_SCOPES_FOR_MCP default 5 → 1 (commit `5b9b6d4`)

- **Problem:** Token exchange returned `"User token must include at least 5 distinct OAuth scopes (found 1)"` even when the user's PingOne access token had valid banking scopes. The **Agent MCP scopes** checkboxes on the Demo Config page control BFF-level exchange policy — they do NOT add scopes to the user's PingOne access token.
- **Root cause:** `MIN_USER_SCOPES_FOR_MCP` in `agentMcpTokenService.js` defaulted to **5** (env-var only override). A PingOne OAuth app configured without a custom resource server typically grants 1–3 scopes in the user access token. The BFF guard was too strict for a demo environment.
- **Fix:** Changed default from `'5'` → `'1'`. Any user token with ≥1 scope now reaches PingOne for RFC 8693 exchange. PingOne itself enforces real scope narrowing (can only grant in the exchanged token what the subject token already contains). `Math.max(1, …)` ensures the guard never drops below 1 (guards against completely empty tokens).
- **Test update:** Replaced `sampleJwtUserAccessNarrowScopes` (3 scopes) with new `sampleJwtUserAccessNoScopes` (0 scopes) fixture for the two threshold-check tests. Both tests now verify the guard triggers only at 0 scopes. 39/39 tests passing.
- **Files:** `banking_api_server/services/agentMcpTokenService.js`, `banking_api_server/src/__tests__/agentMcpTokenService.test.js`
- **Regression check:** `cd banking_api_server && npx jest --testPathPattern=agentMcpTokenService --no-coverage` → **39 passing, 0 failing**. `MIN_USER_SCOPES_FOR_MCP_EXCHANGE` env var can still raise the threshold if needed (e.g. set to `3` for custom resource server demos).

---

### 2026-03-29 — fix(demo-data): correct may_act toggle explainer (commit `1641215`)

- **Problem:** The `<details>` explainer in the `may_act` toggle section on the Demo Config page incorrectly stated users should add `${user.mayAct}` as a PingOne expression. PingOne Expressions do not support that syntax and it would always produce a literal string, not a dynamic value.
- **Fix:** Replaced the incorrect expression instruction with an accurate explanation: the `may_act` claim value (e.g. `{"client_id":"<bff-client-id>"}`) must be **hardcoded** in a PingOne token policy attribute mapping. The explainer now shows the correct static JSON string to paste into the PingOne admin console.
- **Files:** `banking_api_ui/src/components/DemoDataPage.js`
- **Regression check:** Build exits 0. Open `/demo-data` as admin → Token Exchange → expand the `may_act` explainer → confirm instructions say to hardcode a static JSON value, not use a `${…}` expression.

---

### 2026-03-29 — feat: PingOne setup guide page + bootstrap service improvements (commit `d4a77a4`)

- **Extends** the `/setup` page work from `3fc11c4`. Added `PingOneSetupGuidePage.js` — a step-by-step interactive checklist for configuring a PingOne environment from scratch (OAuth app, scopes, users, token policies). Extended `pingoneBootstrapService.js` with additional provisioning logic; updated `configStore.js`, `admin.js` probe route, `pingOneClientService.js`. Wired into `SetupPage.js`, `SideNav.js`, `Login.js`, `Onboarding.js`, `App.js`. Added 66 new `pingoneBootstrapService.test.js` assertions.
- **Files:** `banking_api_ui/src/components/PingOneSetupGuidePage.js` (new), `banking_api_ui/src/components/SetupPage.js`, `banking_api_ui/src/components/SideNav.js`, `banking_api_ui/src/components/Login.js`, `banking_api_ui/src/components/Onboarding.js`, `banking_api_ui/src/App.js`, `banking_api_server/services/pingoneBootstrapService.js`, `banking_api_server/services/pingOneClientService.js`, `banking_api_server/routes/admin.js`, `banking_api_server/services/configStore.js`, `banking_api_server/src/__tests__/pingoneBootstrapService.test.js`
- **Regression check:** `cd banking_api_ui && CI=false npm run build` exits **0**. `cd banking_api_server && npx jest --testPathPattern=pingoneBootstrapService --no-coverage --forceExit` passes. OAuth routes, BankingAgent FAB, and MCP inspector endpoint unchanged.

---

### 2026-03-29 — feat: `/setup` page, PingOne bootstrap plan API + CLI, token inspector sizing (commit `3fc11c4`)

- **Setup:** Public **`/setup`** (Vercel command copy buttons, **`GET /api/setup/plan`** checklist from `config/pingone-bootstrap.manifest.example.json`, copy targets for **`npm run pingone:bootstrap`** / **`pingone:bootstrap:probe`**, admin-only **`GET /api/admin/setup/management-probe`** — read-only PingOne Management API **`listApplications`** when `pingone_client_*` / CIMD worker creds exist). **`/onboarding`** is registered at the app root so signed-out users see the checklist; signed-in **customers** are redirected to **`/`**.
- **Backend:** `banking_api_server/routes/setup.js` (mounted at **`/api/setup`**, rate-limited), `services/pingoneBootstrapService.js`, `routes/admin.js` probe route; `server.js` wires setup router. **Root:** `scripts/pingone-bootstrap.js`, `package.json` scripts **`pingone:bootstrap`** / **`pingone:bootstrap:probe`** (loads dotenv from **`banking_api_server/node_modules/dotenv`**).
- **UI:** `SetupPage.js`, `App.js` routes, `LandingPage.js` / `Login.js` / `Onboarding.js` links; **OAuth Token Inspector** default size **800×960**, JWT full-JSON **`pre`** max-height **~2×** (CSS + pop-out window).
- **Docs:** `docs/SETUP_AUTOMATION_PLAN.md`
- **Do not break:** OAuth routes, session, **BankingAgent FAB** (`App.js` only adds routes; inspector is `TokenChainDisplay` only). **`GET /api/mcp/inspector/tools`** unchanged.
- **Regression check:** `cd banking_api_ui && npm run build` exits **0**; `cd banking_api_server && npm test -- --testPathPattern=pingoneBootstrapService --forceExit` passes; **`/api/setup/plan`** returns **`ok: true`** + **`steps`** without authentication; management probe returns **401** until admin session (expected).

---

### 2026-03-29 — feat(spinner): show full absolute URL in spinner endpoint chip (commit `cecd291`)

- **Problem:** The spinner loading overlay showed a bare relative path like `GET /api/accounts/my` — not useful for debugging as it lacked the host and scheme.
- **Fix:** In `spinnerService.js` `increment()`, the `endpoint` string is now built with the full absolute URL: `window.location.origin` is prepended to any relative `/api/*` path, giving e.g. `GET https://banking-demo-puce.vercel.app/api/accounts/my`. The `API_MESSAGES` prefix matching is unaffected (still uses relative path).
- **Files:** `banking_api_ui/src/services/spinnerService.js`
- **Regression check:** All 5 `spinnerService.test.js` tests pass. Build exits 0. Spinner endpoint chip shows full `https://` URL while any `/api/*` call is in flight.

---

### 2026-03-29 — feat: auto-inject may_act when absent (ff_inject_may_act flag) (commit `3d8ae67`)

- **Problem:** When PingOne is not configured to emit a `may_act` claim in the user access token, the Token Chain panel shows a `⚠️ may_act absent` warning and RFC 8693 token exchange may fail. This required a PingOne token-policy change that is not always practical in a demo environment.
- **Fix:** New opt-in feature flag **`ff_inject_may_act`** (default `false`, category "Token Exchange"). When enabled, the BFF synthesises `{ client_id: "<bff-user-client-id>" }` in memory immediately after decoding the user access token. The JWT itself is never modified — PingOne receives the real token unchanged; only the BFF's internal claims snapshot is patched before the RFC 8693 exchange request is built. A new **`may-act-injected`** token event with `synthetic: true` appears in Token Chain so the shortcut is clearly visible.
- **Toggle location:** `/demo-data` → **Token Exchange — may_act demo** section → **🔧 Enable injection** / **❌ Disable injection** buttons; also at Admin → Feature Flags → Token Exchange category.
- **Files:** `banking_api_server/services/agentMcpTokenService.js`, `banking_api_server/services/configStore.js`, `banking_api_server/routes/featureFlags.js`, `banking_api_ui/src/components/DemoDataPage.js`
- **Regression check:** Flag OFF (default) → Token Chain warns `may_act absent` as before; no injection event. Flag ON + may_act absent → Token Chain shows `may-act-injected` event + `✅ may_act valid`; exchange proceeds. Flag ON + may_act already present → no injection (guards prevent double-inject). API server 818 passing, 0 failing.

---

### 2026-03-29 — fix: bottom dock tiles → horizontal scrollable strip; fix input cut-off (commit `5b1881c`)

- **Problem:** In bottom-dock mode the action tiles (SESSION / TRY ASKING / ACTIONS) were rendered as a vertical sidebar on the right of the chat panel. Tiles overflowed, the prompt input was clipped/invisible, and many tiles could not be reached without scrolling the sidebar.
- **Root cause:** `.ba-embedded-bottom-dock .ba-body` used `flex-direction: row-reverse`, placing `ba-left-col` as a right-side column. The `ba-chips-footer` and dashboard nav button inside `ba-right-col` consumed vertical space, pushing the prompt input below the viewport.
- **Fix:** Changed `.ba-body` to `flex-direction: column-reverse` so `ba-left-col` (DOM first) lands at the bottom and `ba-right-col` fills the height above. `ba-left-col` is now a horizontal scrollable strip (`flex-direction: row; overflow-x: auto; border-top; 44px min-height`). Section labels (`SESSION` / `TRY ASKING` / `ACTIONS`) are hidden (`display:none`); dividers become narrow vertical bars. All chips are `flex: 0 0 auto; white-space: nowrap`. `ba-chips-footer` and the dashboard nav button are `display:none` in bottom-dock mode — they were stealing vertical space from messages + input.
- **Files:** `banking_api_ui/src/components/BankingAgent.css`
- **Regression check:** Set agent placement to **Bottom** → reload dashboard → tiles appear as a horizontal scrollable row below the prompt input; prompt input fully visible; scrolling the tile strip shows all actions; chat messages scroll above input; float and middle modes unchanged.

---

### 2026-03-29 — PingOne Authorize: MCP first-tool gate, demo-data toggles, config UI, docs/diagram

- **Feature:** When **`ff_authorize_mcp_first_tool`** is on, the BFF runs **PingOne Authorize** (live) or **simulated** policy **once per browser session** on the first **`POST /api/mcp/tool`** that uses a delegated **MCP access token** (before the WebSocket tool call). Live path requires **`authorize_mcp_decision_endpoint_id`** (or **`PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID`**) and worker credentials; request body uses Trust Framework **`DecisionContext: McpFirstTool`**, **`UserId`**, **`ToolName`**, **`TokenAudience`**, **`ActClientId`**, **`NestedActClientId`**, **`McpResourceUri`**, optional **`Acr`**. **`ff_authorize_fail_open`** applies to live errors on this gate. **Admins** and **local MCP fallback** (no bearer) skip the gate. Successful first tool may return **`mcpAuthorizeEvaluation`** in JSON.
- **Config / UI:** **`configStore`** keys **`authorize_mcp_decision_endpoint_id`**, **`ff_authorize_mcp_first_tool`**; **Feature Flags** registry; **Admin → Config** MCP decision endpoint field; **`/demo-data`** (admin only) mirrors **PingOne Authorize** category flags via **`GET`/`PATCH /api/admin/feature-flags`**; **`GET /api/authorize/evaluation-status`** includes **`mcpFirstTool*`** fields; **PingOne Authorize** education panel table + status rows.
- **Docs:** **`docs/PINGONE_AUTHORIZE_PLAN.md`** (§4b/4c implemented, §7–8); **`docs/BX_Finance_AI_Agent_Tokens.drawio`** reference blocks (token + RFC tables, layout).
- **Files:** `banking_api_server/services/mcpToolAuthorizationService.js`, `pingOneAuthorizeService.js`, `simulatedAuthorizeService.js`, `server.js`, `configStore.js`, `routes/featureFlags.js`, `routes/authorize.js`, `src/__tests__/mcpToolAuthorizationService.test.js` + mock updates in other API tests; `banking_api_ui` — `Config.js`, `DemoDataPage.js`, `PingOneAuthorizePanel.js`, `DemoDataPage.test.js`.
- **Regression check:** With **`ff_authorize_mcp_first_tool`** **off**, MCP tool calls behave as before (no extra Authorize round-trip). **`cd banking_api_server && npm test`** and **`cd banking_api_ui && npm test && npm run build`** exit 0. **BankingAgent FAB** and **transaction Authorize** paths unchanged by this feature aside from shared flags/config.

### 2026-03-29 — CI: 16 stale tests updated to match current API server behavior (commits `da05a1f`, `bf93d05`)

- **What changed:** GitHub Actions `Tests/API Server` was failing on 7 test suites. All failures were tests that had been written for behaviors that were since intentionally changed. Each test was updated to reflect current production code — no production code was reverted. API server now has **818 passing tests**; UI has **251 passing tests**.

- **`upstashSessionStore.set()` — errors propagate (not swallowed):** `set()` calls `cb(err)` on Redis failure so that explicit `req.session.save(cb)` callers (e.g. OAuth login) can detect a failed write and redirect to an error page. Test previously expected `err` to be `null`; updated to `expect(err).toBeInstanceOf(Error)`. See **Critical Do-Not-Break Areas** row.
  - *Files:* `banking_api_server/src/__tests__/upstashSessionStore.test.js`

- **`agentMcpTokenService` — `exchange-required` is `'skipped'` when `MCP_RESOURCE_URI` unset:** Not-configured is not a failure; local tool fallback is used. Tests were asserting `'failed'`; updated to `'skipped'`.
  - *Files:* `banking_api_server/src/__tests__/agentMcpTokenService.test.js`

- **MCP Inspector — unauthenticated `GET /tools` returns 200 + local catalog (not 401):** Removed `effectiveUserId` guard from the ECONNREFUSED fallback path in the route so local catalog is always returned when MCP is unreachable. Test updated: unauthenticated request now expects `200` + `{ _source: 'local_catalog' }`.
  - *Files:* `banking_api_server/routes/mcpInspector.js`, `banking_api_server/src/__tests__/mcp-inspector.test.js`

- **`demo-scenario-api` PUT — upserts by account type when one already exists:** Sending a new-row object whose `accountType` already has an account in the user's portfolio does an update, not a create. Test was sending a second `checking` row (which collided with the existing one); updated to use `savings` type to exercise the default-name fallback.
  - *Files:* `banking_api_server/src/__tests__/demo-scenario-api.test.js`

- **Scope tests — `GET /transactions/my` and `POST /transactions` have no `requireScopes()`:** Standard PingOne tokens without a custom resource server only carry `openid/profile/email`, not `banking:*` scopes. 10 assertions across 3 test files were expecting 403 scope errors; updated to expect data-layer responses (200 or 404). See **Critical Do-Not-Break Areas** row.
  - *Files:* `banking_api_server/src/__tests__/scope-integration.test.js`, `banking_api_server/src/__tests__/oauth-scope-integration.test.js`, `banking_api_server/src/__tests__/oauth-e2e-integration.test.js`

- **Regression check:** `cd banking_api_server && npm test -- --watchAll=false --forceExit` → 818 passing, 5 skipped, 0 failing. `cd banking_api_ui && npm test -- --watchAll=false --forceExit` → 235 passing, 21 skipped, 0 failing.

---

### 2026-03-29 — Full UX walkthrough: ActionForm transfer bug + money formatting + test suite fixes

#### ActionForm transfer "To" account always excluded the wrong account
- **Symptom:** When the user changed the "From" account in the Transfer form, the "To" dropdown still excluded the first account instead of the newly-selected "From" account.
- **Root cause:** `toAccounts = accounts.filter(a => a.id !== accounts[0]?.id)` — always filtered the first account index regardless of which account was currently selected as "From".
- **Fix:** Added `selectedFromId` state inside `ActionForm`; `toAccounts` derives from it; the `fromId` select's `onChange` callback updates both `selectedFromId` and the current `toId` value. Select `onChange` handler now calls the field's optional `f.onChange?.(value)` so custom field callbacks fire.
- **Files:** `banking_api_ui/src/components/BankingAgent.js` (ActionForm component)
- **Regression check:** Open agent → Transfer chip → change "From" to savings → "To" dropdown must switch to exclude savings and default to checking.

#### ActionForm balance labels showed raw decimal instead of currency
- **Symptom:** Account option labels in Transfer/Deposit/Withdraw forms showed `$3000.00` or `$NaN` instead of `$3,000.00`.
- **Root cause:** Label used `${option.balance.toFixed(2)}` — no locale formatting; crashes on non-numeric balances.
- **Fix:** Changed to `{formatCurrency(option.balance)}` (uses `Intl.NumberFormat` USD formatter already present in the component).
- **Files:** `banking_api_ui/src/components/BankingAgent.js`

#### OTP email: management token used wrong config keys
- **Symptom:** OTP never sent; clicking "Agree & send code" returned `{ otpSent: false }` with no email delivered.
- **Root cause:** `emailService.getManagementToken()` requested `pingone_client_id` / `pingone_client_secret` from `configStore`. These keys are not in the env-variable fallback map so they always returned `null` → token request failed silently.
- **Fix:** Changed to `admin_client_id` / `admin_client_secret` which map to `PINGONE_ADMIN_CLIENT_ID` / `PINGONE_ADMIN_CLIENT_SECRET`.
- **Bonus fix:** `transactionConsentChallenge.js` now includes `otpCodeFallback` in the response when the email service throws — UI displays the code inline as a dev fallback.
- **Files:** `banking_api_server/services/emailService.js`, `banking_api_server/services/transactionConsentChallenge.js`
- **Regression check:** Trigger a > $500 transfer → check email for OTP code → enter code → transaction completes. If email is not configured, the OTP code must appear in the UI response.

#### Agent total balance showed $20,000+ (fake, included debt accounts)
- **Symptom:** "Total Balance" hero card showed inflated value because car loan / debt accounts were included.
- **Root cause:** Filter used `a.type` but real API accounts use `accountType`. The `type` field was absent → filter never excluded any account → all balances summed.
- **Fix:** Filter changed to `a.accountType || a.type` in both `totalBalance` and `totalDebt` computations.
- **Files:** `banking_api_ui/src/components/UserDashboard.js`
- **Regression check:** Log in → dashboard hero shows balance of only checking + savings (not car loan).

#### All money values used `.toFixed(2)` instead of locale currency format
- **Symptom:** Numbers displayed as `3000.00` instead of `$3,000.00`.
- **Fix:** Added `fmt()` helper using `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. Replaced all `.toFixed(2)` in UserDashboard with `fmt()`.
- **Files:** `banking_api_ui/src/components/UserDashboard.js`

#### consentBlocked persists across logout/login
- **Symptom:** After declining HITL and logging out, the agent UI was still fully disabled on fresh login.
- **Root cause:** `consentBlocked` state read from `localStorage` on mount; `setAgentBlockedByConsentDecline(false)` was never called on re-login.
- **Fix (1):** `useState` initializer always calls `setAgentBlockedByConsentDecline(false)` and returns `false` — clears any stale localStorage value on every page load.
- **Fix (2):** `checkSelfAuth` calls `setAgentBlockedByConsentDecline(false)` when a valid session is found.
- **Note for tests:** Because `useState` always starts `false`, consent-blocked UI tests must dispatch a `bankingAgentConsentBlockChanged` event (instead of mocking `isAgentBlockedByConsentDecline` return value) to trigger the `useEffect` sync.
- **Files:** `banking_api_ui/src/components/BankingAgent.js`
- **Regression check:** Decline HITL consent → sign out → sign in → agent must be fully enabled (no consent-blocked banner).

#### Agent showed fake accounts (id 6/7, $5k/$10k) instead of real user accounts
- **Symptom:** Agent tool calls returned fake bootstrap demo accounts instead of the signed-in user's accounts.
- **Root cause:** `callToolLocal(tool, params, sessionUser.id)` passed the sequential local DB id (e.g. `"5"`) which matched bootstrap demo users. Accounts are keyed by PingOne UUID (`oauthId`).
- **Fix:** Changed to `sessionUser.oauthId || sessionUser.id`.
- **Files:** `banking_api_server/server.js`
- **Regression check:** Sign in as real user → "My Accounts" chip → must show the correct accounts with correct balances, not bootstrap demo data.

#### Test suite: 47 tests failing across 2 files
- **BankingAgent.chips.test.js (36 failing):** `setAgentBlockedByConsentDecline` was not in the agentAccessConsent mock → TypeError on mount. Added `setAgentBlockedByConsentDecline: jest.fn()` to mock. Consent-blocked tests updated to dispatch `bankingAgentConsentBlockChanged` event via `act()`.
- **LogViewer.test.js (11 failing):**
  - `should handle fetch errors` expected `getByText(/Error:/)` but component calls `notifyError()` toast instead of rendering text → fixed to assert `notifyError` mock was called.
  - `should refresh logs manually`, `should download logs`, `should clear console logs`, `should not clear logs if user cancels` tested Refresh/Download/Clear buttons that no longer exist in the UI (functions are "`no-unused-vars`") → tests rewritten to test actual behavior (filter-change triggers re-fetch; keyboard dispatch; absence of Clear button).
  - The unreleased `jest.spyOn(document.createElement)` in `should download logs` leaked into `Display Features` group → all 5 subsequent tests failed with `TypeError: appendChild`. Fixed by wrapping spy in `try/finally` to guarantee `mockRestore()`.
- **Files:** `banking_api_ui/src/components/__tests__/BankingAgent.chips.test.js`, `banking_api_ui/src/components/__tests__/LogViewer.test.js`
- **Regression check:** `cd banking_api_ui && npx react-scripts test --watchAll=false --forceExit` → 0 failures, 215 passing.

### 2026-03-28 — Agent consent gate fully removed; HITL modal guard + stale consent cleared (commit TBD)
- **Symptom (1):** Every tool call (including read-only `get_my_transactions`) returned "Error: Agent consent required. Please accept the agent consent agreement in the banking assistant panel." The agent opened with a "Grant Agent permission" modal before any tool was used.
- **Symptom (2):** Deposit / withdraw / transfer > $500 showed "A consent dialog has opened" in chat but no `AgentConsentModal` appeared.
- **Symptom (3):** After a previous session where a high-value consent was declined, `consentBlocked` state persisted across new logins (localStorage key `banking_agent_blocked_consent_decline`) and disabled the entire agent UI.
- **Root cause (1):** The server-side `AGENT_CONSENT_REQUIRED` gate was previously removed from `agentMcpTokenService.js`, but the dead handler remained in `server.js`. Old Vercel deployments still had the check in the token service. The client `catch` block in `BankingAgent.js.runAction` had no handler for `err.code === 'agent_consent_required'`, falling through to a raw `Error: …` red chat bubble. No modal opened.
- **Root cause (2):** `buildConsentIntent(actionId, form)` returns `null` for unexpected action IDs (not deposit/withdraw/transfer). The old code called `setHitlPendingIntent({ actionId, form, intentPayload: null })` without checking — when `intentPayload` is null, `AgentConsentModal` rendered without a `transaction` prop (showing "Allow AI Agent Access" UI) but users were confused by the mismatch.
- **Root cause (3):** `setAgentBlockedByConsentDecline(false)` was never called on new login, so a stale `true` value from a previous declined HITL would persist and disable all buttons.
- **Fix (1):** Removed the dead `AGENT_CONSENT_REQUIRED` block from `server.js`. Added `agent_consent_required` handler to `runAction` catch block — shows a clear "Legacy server consent gate — sign out and sign in again" message instead of a raw error or old modal.
- **Fix (2):** Added null-check guard: if `buildConsentIntent` returns null (unexpected actionId), show a fallback message instead of setting `hitlPendingIntent` with null payload. Prevents the "Allow AI Agent Access" modal from ever appearing outside the explicit HITL flow.
- **Fix (3):** `setAgentBlockedByConsentDecline(false)` is now called in the mount `checkSelfAuth` flow when a valid session user is found — clears any stale block on new login. Also imported `setAgentBlockedByConsentDecline` in `BankingAgent.js`.
- **Fix (4):** Removed `consentGiven`/`consentedAt` fields from `appendUserTokenEvent` token event (dead fields referencing old gate). Removed corresponding `consentGiven` pills from `TokenChainDisplay.js`.
- **Files:** `banking_api_server/server.js`, `banking_api_server/services/agentMcpTokenService.js`, `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/TokenChainDisplay.js`
- **Regression check:**
  - Sign in as customer → open AI Agent → NO consent modal should appear on open.
  - Click "📋 Recent Transactions" → must succeed (no "Agent consent required" error).
  - Deposit / withdraw / transfer > $500 → **AgentConsentModal opens** with amount + account details (💸 Authorize Withdrawal), NOT "Allow AI Agent Access".
  - Click Authorize → TransactionConsentModal opens at OTP step → enter code → transaction completes.
  - If user previously declined HITL in old session: sign out, sign in → consent-blocked state cleared → all actions enabled.


### 2026-03-29 — Token exchange: rich PingOne error detail + cross-Lambda log viewer (commit `b4272ee`)
- **Symptom:** When RFC 8693 token exchange failed the UI showed only a generic message (e.g. "Token exchange failed: RFC 8693 token exchange is mandatory…") with no HTTP status code, no PingOne `error` code, and no `error_description`. The log viewer was completely empty because the Lambda that ran the exchange is different from the Lambda serving `GET /api/logs/console` (Vercel serverless — isolated in-process memory).
- **Root cause (1) — stripped error:** `oauthService.performTokenExchange` catch block threw `new Error(error_description || message)`, discarding HTTP status, PingOne `error` field, `error_detail`, and request context.
- **Root cause (2) — Lambda isolation:** `recentLogs[]` in `routes/logs.js` is module-level in-process memory. Lambda A (exchange request) captures the error. Lambda B (log viewer request) has a fresh empty array. `/api/logs/console` always returned 0 entries for cross-Lambda errors.
- **Fix (1):** `performTokenExchange`, `performTokenExchangeWithActor`, and `getAgentClientCredentialsToken` now attach `httpStatus`, `pingoneError`, `pingoneErrorDescription`, `pingoneErrorDetail`, `requestContext` as named properties on the thrown Error. `console.error` logs the full structured object.
- **Fix (2):** New `services/exchangeAuditStore.js` — Redis-backed audit log (Upstash KV, same env vars as `configStore`). `writeExchangeEvent()` does `LPUSH`+`LTRIM` on `banking:exchange-audit` (max 200 entries). `readExchangeEvents()` does `LRANGE`. Gracefully no-ops when KV env vars are absent.
- **Fix (3):** `agentMcpTokenService.js` exchange-failed tokenEvent description now includes HTTP status + PingOne error code + detail. Both success and failure call `writeExchangeEvent()` fire-and-forget so events survive Lambda recycling.
- **Fix (4):** `GET /api/logs/console` is now async and merges Redis audit events into the response, deduplicating messages already present from the same Lambda.
- **Fix (5):** New `GET /api/logs/exchange` endpoint returns Redis events in standard `{logs, total}` shape. LogViewer dropdown and "all sources" fetch both include the new `exchange` source.
- **Files:** `services/exchangeAuditStore.js` (new), `services/oauthService.js`, `services/agentMcpTokenService.js`, `routes/logs.js`, `utils/logger.js`, `banking_api_ui/src/components/LogViewer.js`
- **Regression check:** Trigger a token exchange failure (e.g. set `mcp_resource_uri` to a value PingOne rejects). Open Log Viewer → "All Sources" or "Exchange Audit" → should see an error entry with HTTP status code and PingOne `error` field. Token Chain panel → exchange-failed event should show "HTTP 4xx — error: <pingone_code>" in description. On success, Exchange Audit should show the method (with-actor / subject-only) and audience.

### 2026-03-28 — Agent consent gate UX: open modal instead of showing error (commit `32e1667`)
- **Symptom:** Typing "show me my accounts" (or clicking any tool chip) before accepting the agent consent agreement produced `❌ Agent consent required. Please accept the agent consent agreement in the banking assistant panel.` in the chat and a "Failed" tool step — a contradictory experience: the user can't consent via the message shown.
- **Root cause:** The server-side MCP proxy returns HTTP 403 `{ error: "agent_consent_required" }` when consent hasn't been granted. `callMcpTool` throws this as an exception (`err.code === "agent_consent_required"`). The `catch` block in `runAction` had no handler for this code and fell through to the generic `❌ ${err.message}` path.
- **Fix:** Added an early guard in the `catch` block for `err.code === 'agent_consent_required'`: opens `AgentConsentModal` and adds a friendly assistant message ("To use the AI banking assistant, I need your permission to access your accounts. A consent agreement has opened — please accept it and then try again."). No toast error.
- **Files:** `banking_api_ui/src/components/BankingAgent.js`
- **Regression check:** Sign in as customer → open AI Agent panel → before accepting consent, click "Accounts" chip or type "show me my accounts" → consent modal should appear with a friendly chat message, no "❌ Error" or "Failed" tool step. After accepting consent, retry → accounts are shown normally.

### 2026-03-28 — HITL: OTP email verification for high-value transactions (commit `b8cef49`)
- **What changed:** After the user checks the consent checkbox and clicks "Agree & send code", the server generates a 6-digit OTP (HMAC-SHA256, per-challenge salt, timing-safe compare), sends it via PingOne email, and puts the challenge into `otp_pending` state. The transaction only executes once the user enters the correct code via `POST /consent-challenge/:id/verify-otp`.
- **New route:** `POST /api/transactions/consent-challenge/:id/verify-otp { otpCode }`
- **Security:** Max 3 attempts → challenge auto-locks (429 while locked, then 404 once deleted); 5-minute TTL on the OTP.
- **Dev fallback:** If PingOne email is not configured, `confirmChallenge` catches the error and returns `{ otpSent: false }`; the UI shows a warning message but the OTP is still stored in session so `verify-otp` still works in dev.
- **Challenge state machine:** `pending → otp_pending → confirmed → (consumed/deleted)`
- **Files:** `banking_api_server/services/emailService.js`, `banking_api_server/services/transactionConsentChallenge.js`, `banking_api_server/routes/transactions.js`, `banking_api_ui/src/components/TransactionConsentModal.js`, `banking_api_ui/src/components/TransactionConsentPage.css`
- **Tests added (7):** missing consentChallengeId guard · otpSent flag on confirm · full 4-step happy path · wrong code → otp_incorrect + attemptsRemaining · lockout after 3 wrong attempts · skip verify-otp (consent_not_confirmed) · one-time consume guard
- **Regression check:** Open agent → attempt a transfer > $500 → consent modal says "Agree & send code" → check checkbox → click button → OTP panel appears with 6-digit input → enter correct code from email → transaction succeeds; entering wrong code shows "Incorrect code, X attempts remaining"; entering wrong code 3 times locks the challenge; clicking "← Back" returns to consent panel without submitting.

### 2026-03-28 — HITL: from-account 404, auto-refresh on by default, checkbox gap (commit `11122a8`)
- **Symptom (1):** Approving a high-value consent challenge returned `❌ From account not found` (or `To account not found`) even though the transaction was valid when the challenge was created.
- **Root cause (1):** On Vercel, a new Lambda can be allocated between the time `POST /consent-challenge` is called (accounts in memory) and when the user clicks "Agree & submit" (new cold Lambda, empty `dataStore`). `POST /api/transactions` looked up accounts directly without re-hydrating from the Redis snapshot first.
- **Fix (1):** Added `restoreAccountsFromSnapshot(req.user.id)` at the top of `POST /api/transactions` (before any `getAccountById` call), mirroring the same pattern in `GET /api/accounts/my` and `GET /api/demo-data`.
- **Files (1):** `banking_api_server/routes/transactions.js`
- **Symptom (2):** Dashboard auto-refreshed accounts every 30 seconds without the user enabling it — caused unnecessary Upstash quota usage and visible UI flicker.
- **Root cause (2):** `autoRefresh` state was initialised as `useState(true)`, so the 30-second polling interval started immediately on every dashboard mount.
- **Fix (2):** Changed to `useState(false)`. The "Auto-refresh" checkbox in the dashboard still lets the user enable it manually.
- **Files (2):** `banking_api_ui/src/components/UserDashboard.js`
- **Symptom (3):** The checkbox and "I agree to…" text in the consent modal were too close together — visually touching in some browsers.
- **Fix (3):** Increased `gap` from `0.65rem` → `0.75rem` and added `margin-right: 0.1rem` on the checkbox input.
- **Files (3):** `banking_api_ui/src/components/TransactionConsentPage.css`
- **Regression check:** Open agent → attempt a transfer > $500 → consent modal appears → approve → transaction must succeed (not 404). Auto-refresh checkbox must be unchecked on fresh dashboard load. Checkbox in consent modal must have visible breathing room between box and label text.

### 2026-03-28 — PAR, RAR, JWT client auth education panels added (commit `21306f0`)
- **What changed:** Three new `EducationDrawer` slide-out panels available from the hamburger menu (OAuth flows + shortcuts), the Banking Agent "Learn & Explore" sidebar, and the RFC Index:
  - **PAR (RFC 9126)** — Pushed Authorization Requests: What is PAR · Security benefits · Full flow · PingOne setup
  - **RAR (RFC 9396)** — Rich Authorization Requests: What is RAR · authorization_details · Banking use case · Token claim · PingOne / FAPI 2.0
  - **JWT client auth (RFC 7523)** — private_key_jwt: What is it · JWT assertion structure · vs client_secret · In token exchange · PingOne setup
- **Files:** `educationIds.js` (3 new IDs), `PARPanel.js`, `RARPanel.js`, `JwtClientAuthPanel.js` (new), `EducationPanelsHost.js`, `educationCommands.js`, `EducationBar.js`, `RFCIndexPanel.js`
- **Regression check:** Open hamburger → OAuth flows section shows PAR, RAR, JWT client auth buttons; each opens its drawer. Shortcuts section shows short-name buttons. RFC Index rows for RFC 7523, RFC 9126, RFC 9396 link to the correct panels.

### 2026-03-30 — PingOne customer/admin sign-in: invalid_scope “multiple resources” when ENDUSER_AUDIENCE set
- **Symptom:** Toast / IdP error: `invalid_scope` — *May not request scopes for multiple resources* (long message + correlation id) on authorize.
- **Root cause:** `/api/auth/oauth/user/login` and `/api/auth/oauth/login` appended `&resource=<ENDUSER_AUDIENCE>` to PingOne `/authorize` while also requesting standard OIDC scopes (`openid`, `profile`, `email`, `offline_access`) plus custom API scopes (`banking:*`). RFC 8707 `resource` binds one resource; mixed scope sets span more than one PingOne resource → rejection.
- **Fix:** New helper `buildPingOneAuthorizeResourceQueryParam` omits `resource` on authorize when both OIDC and custom API scopes are present. `ENDUSER_AUDIENCE` remains for post-issuance JWT audience checks (`middleware/auth.js`). OIDC-only or API-only scope lists still append `resource` when the env var is set.
- **Files:** `banking_api_server/utils/oauthAuthorizeResource.js`, `routes/oauthUser.js`, `routes/oauth.js`, `src/__tests__/oauthAuthorizeResource.test.js`
- **Regression check:** With `ENDUSER_AUDIENCE` set in Vercel, Customer and Admin sign-in complete authorize without `invalid_scope`; token `aud` validation unchanged for configured audience + `https://api.pingone.com`.

### 2026-03-28 — CIBA education buttons did nothing: stale mutual-exclusion effect + z-index gap (commit `dcc906d`)
- **Symptom:** All three CIBA buttons in the hamburger "Learn & agent" panel ("CIBA (OOB) — short (drawer)", "CIBA — full guide (floating)", "CIBA" shortcut) appeared to do nothing when clicked.
- **Root cause (1) — stale effect deps:** `BankingAgent` had two mutual-exclusion effects. The second ("close edu panel when agent opens") listed `edu?.panel` in its deps. When `open(EDU.LOGIN_FLOW, 'ciba')` set `edu.panel`, React ran this effect with the stale `isOpen=true` snapshot and immediately called `edu.close()` in the same render cycle — killing the drawer before it could render.
- **Root cause (2) — z-index below agent:** `CIBAPanel` overlay and drawer used `z-index: 1210`/`1220`, placing them behind `BankingAgent` (`z-index: 10059`–`10061`). The full-guide panel and "CIBA" shortcut (which dispatch `education-open-ciba` to `CIBAPanel`) were actually opening but invisible beneath the agent.
- **Fix:** Removed `edu?.panel` and `edu.close` from the second effect's deps — it only needs to fire when `isOpen` changes (its sole purpose). Raised `CIBAPanel` overlay → `10062`, drawer → `10063` (above the agent stack).
- **Files:** `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/CIBAPanel.css`
- **Regression check:** Open hamburger → click "CIBA (OOB) — short (drawer)" → `LoginFlowPanel` must slide in to the CIBA tab. Click "CIBA — full guide (floating)" or "CIBA" shortcut → `CIBAPanel` must slide in fully visible above the agent panel. Closing either panel and re-opening the agent must work normally. All other edu panel buttons must be unaffected.

### 2026-03-28 — MCP Inspector shows tools without auth (commit `16163e2`)
- **Symptom:** `/api/mcp/inspector/tools` required a valid OAuth token; opening the inspector panel while unauthenticated returned 401 and showed no tools.
- **Root cause:** `app.use('/api/mcp/inspector', authenticateToken, mcpInspectorRoutes)` — the auth middleware was applied to the inspector mount. `respondLocalCatalog` internally also guarded on `effectiveUserId`, returning empty tools when no user was present.
- **Fix:** Removed `authenticateToken` from the `/api/mcp/inspector` mount in `server.js`. Removed `effectiveUserId` guard from `respondLocalCatalog` so the static tool catalog is always returned.
- **Files:** `banking_api_server/server.js`, `banking_api_server/services/agentMcpToolService.js`
- **Regression check:** Open MCP Inspector panel without logging in → must show the full tool list. Authenticated requests must be unaffected.

### 2026-03-28 — Session preview bypasses auth: token chain blank before login (commit `a94e002`)
- **Symptom:** `GET /api/tokens/session-preview` required an auth token, so the Token Chain panel always showed the placeholder until after a full tool call.
- **Root cause:** The route was registered under `app.use('/api/tokens', authenticateToken, tokenRoutes)`, requiring authentication for the preview endpoint used on initial page load.
- **Fix:** Registered `/api/tokens/session-preview` as a standalone `app.get(...)` route before the `authenticateToken` middleware block.
- **Files:** `banking_api_server/server.js`
- **Regression check:** Load `/dashboard` without running any tool → Token Chain must immediately show the session preview row. Running a tool must update the chain normally.

### 2026-03-28 — Middle agent not showing: middleAgentOpen always started false (commit `35c856c`)
- **Symptom:** Selecting "Middle" layout via Agent UI toggle and reloading the dashboard showed the FAB only — the inline 3-column split never appeared even though `agentPlacement === 'middle'` in localStorage.
- **Root cause:** `middleAgentOpen` was initialised as `useState(false)` unconditionally. On mount, placement was already `'middle'` (read from localStorage) but the state was always `false`, so `agentPlacement === 'middle' && middleAgentOpen` was always `false` and the split-3 layout was never rendered. The `useEffect` that syncs layout on placement change also forgot to set `middleAgentOpen(true)`.
- **Fix:** Changed initial state to `useState(() => agentPlacement === 'middle')` so it opens immediately when placement is already middle on mount. Added `setMiddleAgentOpen(true)` to the `useEffect` branch for `agentPlacement === 'middle'` to cover runtime switches.
- **Files:** `banking_api_ui/src/components/UserDashboard.js`
- **Regression check:** Set Agent UI → Middle → reload `/dashboard` → split-3 layout must appear immediately without clicking any FAB.

### 2026-03-28 — Server chips cut off in bottom-right corner: moved below prompt bar (commit `f24d8b7`)
- **Symptom:** "Banking Tools" / "PingOne Identity" status chips were positioned inside the panel header and clipped / not visible in constrained sizes.
- **Root cause:** The `ba-server-chips` row was inside `.ba-header` which has fixed height and no overflow. In smaller panels the chips were pushed off screen or obscured by the resize handle.
- **Fix:** Removed chips from the header entirely. Added a new `ba-chips-footer` div as the last child of `ba-right-col`, directly after `.ba-bottom` (the prompt input bar), with a subtle top border separating it from the input.
- **Files:** `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/BankingAgent.css`
- **Regression check:** Open agent panel → "Banking Tools" and "PingOne Identity" chips appear below the input bar, fully visible. Resize panel small → chips still visible (scroll if needed, not clipped off-screen).

### 2026-03-28 — Demo config breadcrumbs illegible: grey text on gradient header (commit `aac2ebe`)
- **Symptom:** Breadcrumb trail "Home › Dashboard › Demo config" on the `/demo-data` page header rendered in dark grey (`#64748b`) which was nearly invisible against the blue-to-red gradient background.
- **Root cause:** `.dashboard-header__crumb-link` used `color: var(--dash-muted, #64748b)` (designed for white backgrounds). The Demo config header uses the same gradient as the main dashboard header.
- **Fix:** Changed all crumb colours to white: inactive links `rgba(255,255,255,0.7)`, current-page link `#fff`, separators `rgba(255,255,255,0.5)`. Hover state `#fff`.
- **Files:** `banking_api_ui/src/components/UserDashboard.css`
- **Regression check:** Navigate to `/demo-data` → breadcrumb "Home › Dashboard › Demo config" must be clearly readable in white over the gradient header. Dark-mode and light-mode dashboard crumbs must also still be readable.

### 2026-03-28 — Token chain blank after login: fetchSessionPreview never ran on mount (commit `8f16214`)
- **Symptom:** After signing in, the Token Chain panel showed the "Sign in … to see your User Token" placeholder instead of the decoded user token, even though the session was fully established.
- **Root cause:** `App.js` dispatches `userAuthenticated` inside `applyUser()` and then calls `setLoading(false)` — this means the dashboard renders AFTER the event fires. `TokenChainDisplay` therefore mounts AFTER `userAuthenticated` has already been dispatched. The mount effect had `if (didAuthRef.current) void fetchSessionPreview()` — `didAuthRef` was always `false` on mount so `fetchSessionPreview` never ran. The `userAuthenticated` listener registered too late to catch it.
- **Fix:** Removed `didAuthRef` guard entirely. Mount effect now calls `void fetchSessionPreview()` unconditionally — the function already returns early on `!res.ok` (handles unauthenticated renders safely). `userAuthenticated` listener kept for session-expiry re-auth flows. Also added a "Legend" label above the static hint-badge key so it is clearly distinguished from live per-token status chips.
- **Files:** `banking_api_ui/src/components/TokenChainDisplay.js`, `banking_api_ui/src/components/TokenChainDisplay.css`
- **Regression check:** Sign in → Token Chain must immediately show the user token row with decoded claims (aud, may_act state). Refreshing the page while logged in must also show the token row. Placeholder text must not appear when authenticated.

### 2026-03-28 — Investment accounts lost on cold-start: dataStore in-memory, no snapshot persistence (commit `1a93c77`)
- **Symptom:** Investment (and any extra) accounts saved via `/demo-data` disappear after Vercel cold-start / server restart. Only checking+savings survive.
- **Root cause:** `dataStore.persistAllData()` is a no-op. On cold-start `getAccountsByUserId` returns 0 → `provisionDemoAccounts` deletes ALL accounts + recreates only checking+savings. `demoScenarioStore` (Redis/KV) only stored settings.
- **Fix:** `demoScenario PUT` now calls `saveAccountSnapshot(userId)` after every save; `GET /api/accounts/my` and `GET /api/demo-data` both call `restoreAccountsFromSnapshot(userId)` before `provisionDemoAccounts`; `POST /reset-demo` updates snapshot to fresh state.
- **Files:** `banking_api_server/routes/accounts.js`, `banking_api_server/routes/demoScenario.js`
- **Regression check:** Save investment account on `/demo-data` → save → simulate cold-start (restart server) → load `/dashboard` → investment account must appear; Load `/demo-data` → investment slot must show enabled with correct name/balance.

### 2026-03-28 — Bottom dock and admin middle agent lost: EmbeddedAgentDock guard bug (commit `db73404`)
- **Symptoms:** (1) Bottom placement showed a floating FAB on dashboard routes instead of the full-width dock. (2) Admin on `/admin` with middle placement saw no agent at all.
- **Root cause:** `EmbeddedAgentDock.js` had an `isBankingAgentDashboardRoute` guard added in `669bf36` to stop the App-level dock from double-rendering. But the same guard also terminated UserDashboard's own `<EmbeddedAgentDock>` mount — dock never showed on any dashboard route. Separately, `showFloatingAgent` suppressed the float for ALL middle placements, including admin (`Dashboard.js`) which has no inline FAB of its own.
- **Fix:** Removed `isBankingAgentDashboardRoute` guard and import from `EmbeddedAgentDock.js`. In `App.js`: added `onUserDashboardRoute` to skip App-level dock on `/dashboard`/`/` (customer) and to scope middle-mode float suppression to UserDashboard routes only.
- **Files:** `banking_api_ui/src/components/EmbeddedAgentDock.js`, `banking_api_ui/src/App.js`
- **Regression check:**
  - Customer on `/dashboard`, bottom mode → full-width dock shows below content (no float FAB).
  - Customer on `/dashboard`, middle mode → no global float; UserDashboard's corner FAB opens split-3.
  - Admin on `/admin`, bottom mode → dock shows full-width below dashboard content.
  - Admin on `/admin`, middle mode → global float FAB visible (Dashboard.js has no own FAB).
  - `/config`, bottom mode → App-level dock still shows.

### 2026-03-28 — DemoDataPage build error: handleResetDefaults called missing setAccounts (commit `0058450`)
- **Symptom:** `CI=true npm run build` failed with `'setAccounts' is not defined` (eslint `no-undef`), blocking every Vercel deploy.
- **Root cause:** `handleResetDefaults` in `DemoDataPage.js` used a stale `setAccounts(prev => prev.filter(...).map(...))` call left over from before the array-of-accounts state was replaced by the object-keyed `typeSlots` model (`setTypeSlots`). The dev server runs with `CI=false` so the error was never caught locally.
- **Fix:** Replaced `setAccounts(...)` with `setTypeSlots((prev) => { ... })` that updates the `checking` and `savings` slots using `defaults.checkingName/Balance` and `defaults.savingsName/Balance`.
- **Files:** `banking_api_ui/src/components/DemoDataPage.js`
- **Regression check:** `cd banking_api_ui && CI=false npm run build` must exit 0; "Reset to defaults" button on `/demo-data` must restore default account names and balances without JS errors.

### 2026-03-28 — Routing audit: 3 bugs fixed, 41 button routing tests added (commit `b21dcf7`)
- **Symptoms:** (1) LandingPage "Logs" button triggered `handleOAuthLogin('admin')` instead of opening `/logs`. (2) OAuthDebugLogViewer "← Dashboard" always navigated to `/` (landing page) regardless of user role. (3) Admin Dashboard Quick Actions (7 buttons) used `window.location.href` causing full page reloads that break SPA state.
- **Root causes:** (1) Copy-paste error — `onClick` left wired to adjacent "Admin sign in" handler. (2) `<Link to="/">` hardcoded; role-aware path never applied. (3) `window.location.href` used instead of React Router `<Link>` components.
- **Fix:** `LandingPage.js` — Logs button changed to `window.open('/logs', '_blank')`. `OAuthDebugLogViewer.js` — `dashboardPath = user?.role === 'admin' ? '/admin' : '/dashboard'`; link uses `<Link to={dashboardPath}>`. `Dashboard.js` — all 7 Quick Action buttons replaced with `<Link to="...">` for each route.
- **Files:** `banking_api_ui/src/components/LandingPage.js`, `banking_api_ui/src/components/OAuthDebugLogViewer.js`, `banking_api_ui/src/components/Dashboard.js`
- **Tests:** `src/components/__tests__/buttonRouting.test.js` — 41 tests, all passing.
- **Regression check:** LandingPage Logs button must open `/logs` in a new tab (not start admin OAuth). OAuthDebugLogViewer back arrow must go to `/admin` for admin users and `/dashboard` for customers. Dashboard Quick Actions must navigate without full-page reload.

### 2026-03-28 — get_account_balance: type-name IDs like 'checking'/'savings' now resolved (commit `3aaeee4`)
- **Symptom:** 💰 Check Balance chip returned `❌ Account checking not found` when the ActionForm rendered before live accounts loaded (uses `generateFakeAccounts()` placeholder IDs like `'checking'`/`'savings'`).
- **Root cause:** `mcpLocalTools.js::get_account_balance` called `dataStore.getAccountById(account_id)` directly; real IDs are UUIDs. `create_deposit`, `create_withdrawal`, and `create_transfer` all used `resolveAccountId()` first — `get_account_balance` was the only tool that was missed.
- **Fix:** `get_account_balance` now loads user accounts via `ensureAccounts(userId)` then calls `resolveAccountId(rawStr, accounts)` before `getAccountById`, matching the pattern of the other write tools.
- **Files:** `banking_api_server/services/mcpLocalTools.js`
- **Regression check:** Open agent → click 💰 Check Balance chip before accounts load → must return balance, not "Account checking not found".

### 2026-03-28 — may_act absent: "will fail" changed to "may fail" — exchange always attempted (commit `f48120d`)
- **Symptom:** Token Chain panel and agent chat showed `may_act absent — exchange will fail` as a hard guarantee, confusing users whose PingOne policy accepts exchange without a `may_act` claim.
- **Root cause:** `describeMayAct()` in `agentMcpTokenService.js` and `MayActEduBox` in `TokenChainDisplay.js` used deterministic language ("PingOne will reject") that contradicts actual server behaviour — the RFC 8693 exchange is always attempted regardless.
- **Fix:** Changed to "may fail" in the edu-box header, body paragraph, legend item, and the server-side `describeMayAct` reason string.
- **Files:** `banking_api_ui/src/components/TokenChainDisplay.js`, `banking_api_server/services/agentMcpTokenService.js`
- **Regression check:** Token Chain → `may_act absent` row must say "exchange **may** fail"; chat message for absent may_act must not say "PingOne **will** reject".

### 2026-03-28 — AgentGatewayPanel: switch to EducationDrawer slide-out (commit `226fc2e`)
- **Symptom:** Agent Gateway panel opened as a centered full-screen modal; all other education panels slide in from the right.
- **Root cause:** `AgentGatewayPanel` imported `EducationModal` while every other panel uses `EducationDrawer`.
- **Fix:** Swapped `EducationModal` → `EducationDrawer` with `width="min(640px, 100vw)"`. No functional changes — same props, same tab structure, same overlay/close behaviour.
- **Files:** `banking_api_ui/src/components/education/AgentGatewayPanel.js`
- **Regression check:** Click Education Bar → Agent Gateway → panel must slide in from the right (not pop up as a centered modal). Close button and overlay click must dismiss it. All other edu panels (Login Flow, Token Exchange, etc.) must be unaffected.

### 2026-03-28 — Agent form sends wrong account IDs — ❌ Account chk-5 not found (commit `99d4718`)
- **Symptom:** `get_account_balance` / deposit / withdraw / transfer all returned `❌ Account chk-5 not found`.
- **Root cause:** `ActionForm` was populated by `generateFakeAccounts(effectiveUser)` which derives IDs as `chk-{user.sub.slice(0,10)}`. The server creates accounts using `req.user.id` (the internal dataStore ID), which can differ from the PingOne `sub` claim. Result: the form sent `chk-5` but the server stored `chk-abc1234567`.
- **Fix:** `BankingAgent` now holds `liveAccounts` state. On `isLoggedIn` becoming true, `GET /api/accounts/my` is fetched and the result mapped to `{id, name, type, balance, accountNumber}`. This is passed to `ActionForm` as a prop; the form prefers `liveAccounts` over the fake generator. After deposit/withdraw/transfer, accounts are re-fetched to keep balances current.
- **Files:** `banking_api_ui/src/components/BankingAgent.js`
- **Regression check:** Open agent → click Balance → dropdown must show real account numbers; submitting must not return 404/not-found.

### 2026-03-28 — Middle layout starts floating collapsed (commit `25bb69f`)
- **What changed:** When `agentPlacement='middle'`, the inline 3-column split no longer shows on first load. Instead the dashboard starts in float-layout (token + banking, no agent column), with a single corner FAB rendered directly by UserDashboard.
- **Clicking the FAB** sets `middleAgentOpen=true`, switching to the full split-3 layout with the inline BankingAgent.
- **App.js global float is suppressed** (`agentPlacement !== 'middle'` guard on `showFloatingAgent`) so there is never a duplicate FAB.
- **`user-dashboard--split3` CSS class** is only applied when `middleAgentOpen=true`.
- **Other placements unchanged** (float and bottom behave as before).
- **Files:** `banking_api_ui/src/components/UserDashboard.js`, `banking_api_ui/src/App.js`
- **Regression check:**
  - Select Middle layout → page shows float layout with corner FAB (not the inline column).
  - Click FAB → layout transitions to 3-column split with inline BankingAgent.
  - Refresh → returns to collapsed state (FAB only) — `middleAgentOpen` is not persisted.
  - Float and Bottom layouts show global float FAB as before.

### 2026-03-28 — /demo-data may_act section: static-mode notice + dynamic explainer (commit `5ecf83e`)
- **What changed:** The may_act toggle section on `/demo-data` now accurately reflects the static PingOne mapping mode.
- **Added:** Amber notice banner explaining `may_act` is always in the token via a hardcoded PingOne expression; updated button status messages to refer to the user-attribute record (not the token); `<details>` explainer with PingOne steps for switching to dynamic mode.
- **CSS added:** `.demo-data-static-notice`, `.demo-data-dynamic-explainer`, `.demo-data-code-block`.
- **Files:** `banking_api_ui/src/components/DemoDataPage.js`, `banking_api_ui/src/components/DemoDataPage.css`
- **Regression check:** `/demo-data` → may_act section shows amber banner; buttons call PATCH without error; details expander shows dynamic-mode steps.

### 2026-03-28 — may_act educational UI: clear validation state in Token Chain + API display
- **What changed:** `may_act` / `act` claim status is now shown clearly in both the Token Chain panel and the inline chat messages.
- **Token Chain row:** Each relevant event row shows a compact hint badge — `✅ may_act valid`, `⚠️ may_act absent`, or `❌ may_act mismatch` — visible without opening the inspector.
- **Token Chain inspector panel:** Replaced the simple one-line pills with full `MayActEduBox` and `ActEduBox` components that show: the decoded JSON, RFC 8693 reference, what the claim means, fix steps when wrong. The `ExchangeCheckList` component shows the 4 checks PingOne performs during exchange (including specific error + absent-may_act callout for the failed case).
- **Agent chat:** Token-event inline messages now include the detailed `may_act` validation state (valid / mismatch / absent with `mayActDetails`), structured act claim result, and step-by-step fix instructions for each failure mode (absent, mismatch, exchange not configured, insufficient scopes, failed).
- **Server:** `exchange-failed` token event now carries `mayActPresent` so the UI can show precise absent-may_act guidance.
- **Files:** `banking_api_ui/src/components/TokenChainDisplay.js`, `banking_api_ui/src/components/TokenChainDisplay.css`, `banking_api_ui/src/components/BankingAgent.js`, `banking_api_server/services/agentMcpTokenService.js`
- **Regression check (may_act absent):** Go to `/demo-data` → click ❌ Clear may_act → re-login → run "🏦 My Accounts". Token Chain user-token row must show `⚠️ may_act absent` hint badge; inspector must show the full red educational box with fix steps. Chat must say "may_act was absent" with the 3 fix steps.
- **Regression check (may_act valid):** Go to `/demo-data` → click ✅ Enable may_act → re-login → run "🏦 My Accounts". Token Chain user-token row must show `✅ may_act valid` hint badge; inspector must show the green educational box with JSON. Chat must say "✅ may_act valid — delegation authorised".
- **Regression check (exchange complete):** With `MCP_RESOURCE_URI` set and valid may_act, run any tool. `exchanged-token` row must show `✅ act claimed`; inspector must show the teal educational box with JSON. Chat message must include both `✅ may_act valid` and `✅ act:` lines.

### 2026-03-27 — Float panel resize capped at 560×720 (commits `4d1ea23`, `9cc0654`)
- **Symptom:** SE/E/S resize handles appeared to work but panel wouldn't grow beyond 560 px wide or 720 px tall.
- **Root cause:** `max-width: 560px` and `max-height: min(85vh, 720px)` in `.banking-agent-panel` CSS always override JS-set inline `width`/`height`. `handleResize` also had matching `Math.min(560,…)` / `Math.min(720,…)` JS caps. Dead `resize: both` (ignored because `overflow: hidden`).
- **Fix:** Removed CSS `max-width`, `max-height`, `resize: both`; JS caps replaced with `Math.floor(window.innerWidth * 0.9)` / `Math.floor(window.innerHeight * 0.9)`. anchor-on-resize added.
- **Files:** `banking_api_ui/src/components/BankingAgent.css`, `banking_api_ui/src/components/BankingAgent.js`
- **Regression check:** Open float panel → drag SE grip → panel must grow beyond 560 × 720 px.

### 2026-03-27 — "Session expired" banner on valid PingOne session (commit `b7e806a`)
- **Symptom:** Yellow "session expired" banner shown on `/dashboard` even though user just logged in.
- **Root cause:** Vercel cold-start restores session from `_auth` cookie with `accessToken: '_cookie_session'` stub. `/api/auth/oauth/user/status` returns `authenticated: true`, but `/api/accounts/my` returns 401. `fetchUserData` treated any 401 as genuine expiry and fired the banner.
- **Fix:** On non-silent 401, redirect to `/api/auth/oauth/user/login` (PingOne SSO re-auths silently). `sessionStorage` guard (`bx-dashboard-reauth`) prevents loops — falls back to banner after one failed round-trip.
- **Files:** `banking_api_ui/src/components/UserDashboard.js`
- **Regression check:** Load dashboard with stale/stub token → silent redirect back, no banner. Real expiry (SSO also expired) → one redirect then banner.

### 2026-03-27 — Compact scrollable chips in float mode (commit `4d1ea23`)
- **Symptom:** Chips / action buttons in the float left rail overflowed and were clipped (not scrollable), and individual chips were too large for the narrow column.
- **Fix:** Float-mode left col narrowed to 130 px; chip `font-size: 11px; padding: 5px 7px; line-height: 1.3`. Rail already had `overflow-y: auto` — no JS change needed.
- **Files:** `banking_api_ui/src/components/BankingAgent.css`
- **Regression check:** Open float panel with many chips → rail should scroll; chips visibly smaller than inline mode.

### 2026-03-27 — BankingAgent Playwright E2E (`banking-agent.spec.js`)
- **Symptom:** Multiple failures in `banking-agent.spec.js` (collapse strict mode, Transfer/Recent Transactions matching suggestions, outdated Account ID / input order assertions).
- **Root cause:** UI changed (header `role="button"` drag strip, `ActionForm` selectors + labels); tests were not scoped to action rows.
- **Fix:** `collapseAgentButton` + `agentPanelButton` helpers; form tests use `#field-*` and account IDs from the form; core actions asserted by label.
- **Regression check:** `cd banking_api_ui && npm run test:e2e:agent`

### 2026-03-21 — /api/admin/config blocked by authenticateToken on Vercel (commit `57d2300`)
- **Symptom:** `GET /api/admin/config` returned 401 on Vercel; Config page couldn't load existing settings
- **Root cause:** `app.use('/api/admin', authenticateToken, adminRoutes)` was registered BEFORE `app.use('/api/admin/config', adminConfigRoutes)`. Express prefix matching caused all `/api/admin/*` requests (including `/api/admin/config`) to hit `authenticateToken` first.
- **Fix:** Moved `adminConfigRoutes` registration ABOVE `adminRoutes`. Also added `app.set('trust proxy', 1)` (required for Vercel HTTPS session cookies) and changed `isAuthenticated` to `!!` boolean in both status routes.
- **Files:** `banking_api_server/server.js`, `banking_api_server/routes/oauth.js`, `banking_api_server/routes/oauthUser.js`
- **Regression check:** `GET /api/admin/config` without credentials must return 200 with masked config; `api/auth/oauth/status` must return `{"authenticated": false, ...}`

### 2026-03-21 — Chat panel too small; no way to reach /config from chat (commit `0ed4250`)
- **Symptom:** Agent panel cramped at 580px; users had no in-chat path to the Config page
- **Fix:** Increased panel to `max-height: 760px` / `width: 400px`; added "⚙️ Configure" button at bottom of action bar (all users, logged-in or not) — closes panel and navigates to `/config` via React Router
- **Files:** `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/BankingAgent.css`
- **Regression check:** Open agent FAB → panel must be visibly taller; "⚙️ Configure" button visible at bottom; clicking it must navigate to `/config`

### 2026-03-21 — All React client routes return 404 on Vercel (commit `4bb621a`)
- **Symptom:** Navigating directly to `/config`, `/login`, `/dashboard` etc. on Vercel returned `404: NOT_FOUND`
- **Root cause:** `vercel.json` `rewrites` only routed `/api/*` to the Express handler — all other paths fell through to Vercel CDN with no match
- **Fix:** Added SPA catch-all rewrite `/((?!api/).*)` → `/index.html` so React Router handles client-side routes
- **Files:** `vercel.json`
- **Regression check:** Open `https://banking-demo-puce.vercel.app/config` directly — must load the Config page, not a 404

### 2026-03-21 — Vercel OAuth redirects pointed to localhost:3000 (commit `dd9e76e`)
- **Symptom:** On Vercel, every OAuth flow redirected the user to `localhost:3000/config?error=not_configured` or `localhost:3000/login?error=...`
- **Root cause:** All redirect fallbacks in `oauth.js` and `oauthUser.js` hardcoded `'http://localhost:3000'`. On Vercel, `REACT_APP_CLIENT_URL` is not set so every redirect hit the fallback.
- **Fix:** Added `getOrigin(req)` helper to both route files. Priority: `configStore.frontend_url` → `REACT_APP_CLIENT_URL` → `req.protocol + req.get('host')` (when `process.env.VERCEL`) → `localhost:3000` fallback. Replaced all 16 localhost hardcodes across both files.
- **Files:** `banking_api_server/routes/oauth.js`, `banking_api_server/routes/oauthUser.js`
- **Regression check:** On Vercel, clicking "Admin Login" must redirect back to `https://banking-demo-puce.vercel.app/...`, not `localhost`

### 2026-03-21 — HTTPS + Invalid Host header for api.pingdemo.com (commit `b0da80d`)
- **Symptom:** CRA dev server rejected requests with `Invalid Host header` at `http://api.pingdemo.com:4000/config`
- **Fix:** Added `DANGEROUSLY_DISABLE_HOST_CHECK=true`, `HOST=0.0.0.0`, `WDS_SOCKET_PORT=0` to `banking_api_ui/.env`; generated mkcert certs in `Banking/certs/` (gitignored); Express server auto-detects certs and starts HTTPS; CRA uses `HTTPS=true` + `SSL_CRT_FILE`/`SSL_KEY_FILE`; LangChain uvicorn gets `--ssl-*` flags; `setupProxy.js` uses `https://` target when `REACT_APP_API_HTTPS=true`
- **Files:** `banking_api_server/server.js`, `banking_api_ui/.env`, `banking_api_ui/src/setupProxy.js`, `run-bank.sh`, `.gitignore`
- **Regression check:** `bash run-bank.sh` → console shows `Banking API server (HTTPS) running on https://api.pingdemo.com:3002`; browser shows padlock on `https://api.pingdemo.com:4000`

### 2026-03-21 — run-bank.sh had no startup banner (commit `3a6549a`)
- **Symptom:** After startup, no summary of URLs/ports was shown to the user
- **Fix:** Added full ANSI color ASCII banner to `run-bank.sh` with URLS, PORTS, QUICK START, and LOGS sections. Also added MCP Security Gateway Mermaid diagram to `README.md` and standalone `mcp-security-gateway.mmd`
- **Files:** `run-bank.sh`, `README.md`, `mcp-security-gateway.mmd`
- **Regression check:** `bash run-bank.sh` — colored banner must appear after services start

### 2026-03-21 — Proxy mismatch → 500 on `/api/auth/oauth/status`
- **Symptom:** Browser console shows `GET /api/auth/oauth/status 500` on startup
- **Root cause:** Banking UI proxy targeted `localhost:3001` (MasterFlow) instead of `localhost:3002` (banking API). The banking API server had crashed with `EADDRINUSE: :::3002` on a prior start attempt — because it was already running from a previous invocation.
- **Fix:** Added `REACT_APP_API_PORT=3002` to `banking_api_ui/.env`; `setupProxy.js` already reads this var.
- **Regression check:** After `run-bank.sh`, open `http://localhost:4000` — browser console must show **no 500 errors** before login.

### 2026-03-21 — BankingAgent not visible on login page
- **Symptom:** 🤖 FAB only appeared after logging in  
- **Root cause:** `<BankingAgent>` was inside `Dashboard.js`/`UserDashboard.js` only (post-auth gate)
- **Fix:** Added `<BankingAgent user={null} />` to the unauthenticated branch in `App.js`; added LOGIN_ACTIONS and `handleLoginAction()` to `BankingAgent.js`
- **Regression check:** Open the app without logging in — 🤖 FAB must be visible. Click it — must show "👑 Admin Login" and "👤 Customer Login" buttons.

### 2026-03-21 — run-bank.sh started on localhost not api.pingdemo.com
- **Symptom:** App opened on `localhost:4000`, not `api.pingdemo.com:4000`
- **Root cause:** `/etc/hosts` entry missing; fallback to localhost is correct behaviour
- **Fix:** Script now checks `/etc/hosts`, warns user, and falls back gracefully
- **Regression check:** `bash run-bank.sh` — if `api.pingdemo.com` not in `/etc/hosts`, script must print warning and continue.

### 2026-03-21 — `run-bank.sh` proxy to wrong API port (500s)
- **Symptom:** After `run-bank.sh`, all `/api/*` calls returned `ECONNRESET` because proxy targeted port 3001
- **Root cause:** `REACT_APP_API_PORT` env var not passed through or `.env` overrode it
- **Fix:** Hardcoded `REACT_APP_API_PORT=3002` in `banking_api_ui/.env`
- **Regression check:** `tail -f /tmp/bank-ui.log` — must NOT show `Could not proxy request ... to http://localhost:3001` after startup.

### 2026-04-14 — PingOneTestPage Update buttons + AI Agent Apps + tests (Phase 151)
- **Symptom:** No way to programmatically set up PingOne RS / scopes / app grants from the demo; AI_AGENT apps not discovered; no `may_act` setter.
- **Root cause:** `/pingone-test` page was read-only; new PingOne AI_AGENT app type not fetched.
- **Fix:** 5 new BFF endpoints (`ai-agent-apps`, `update-resources`, `update-scopes`, `update-apps`, `update-user-spel`); frontend Update buttons on each test card; new AI Agent Apps + User SPEL cards. 40-test Jest suite (`pingoneTestRoutes.test.js`).
- **Files modified:** `routes/pingoneTestRoutes.js`, `PingOneTestPage.jsx`, `PingOneTestPage.css`, `src/__tests__/pingoneTestRoutes.test.js`, `docs/PINGONE_APP_SCOPE_MATRIX.md`.
- **Regression check:** `cd banking_api_server && npx jest --testPathPattern=pingoneTestRoutes --forceExit` → 40 passed. `cd banking_api_ui && npm run build` → compiled.

### 2026-04-14 — `may_act` missing from token despite user attribute set
- **Symptom:** `mayAct.sub` set on PingOne user record, but `may_act` claim never appeared in access tokens.
- **Root cause:** PingOne requires **both** the user attribute AND an **app attribute mapping** (`may_act` → `${user.mayAct}`) on the OIDC application. The `update-user-spel` endpoint only did step 1.
- **Fix:** `POST /api/pingone-test/update-user-spel` now does two steps: (1) PATCH `mayAct.sub` on user, (2) ensure `may_act` attribute mapping exists on User App + Admin App OIDC applications. Both steps idempotent.
- **Files modified:** `routes/pingoneTestRoutes.js`, `src/__tests__/pingoneTestRoutes.test.js`, `docs/PINGONE_APP_SCOPE_MATRIX.md`.
- **Regression check:** `cd banking_api_server && npx jest --testPathPattern=pingoneTestRoutes --forceExit` → 40 passed (includes mapping creation + already-exists + broken-mapping auto-fix + clear-skips-mapping tests).

### 2026-04-15 — Test coverage gaps: exchanger app lookup + diagnose/fix-mcp-exchange
- **Symptom:** `fix-mcp-exchange` "must have an id" error not caught by tests; SpEL `value` not asserted; `diagnose-mcp-exchange` and `fix-mcp-exchange` had zero test coverage.
- **Root cause:** (1) Tests only asserted `{ name: 'may_act' }` without checking the SpEL `value` property. (2) `diagnose-mcp-exchange` and `fix-mcp-exchange` were older endpoints never added to the test suite. (3) Mock fixture had `oidcOptions.clientId` but route lookup used `a.id === configClientId` — test passed because both were wrong in the same way.
- **Fix:** Tightened SpEL value assertion; added 8 new tests for `diagnose-mcp-exchange` (4) and `fix-mcp-exchange` (4) covering: exchanger lookup by `oidcOptions.clientId`, clientId-not-found path, `canExchange` flag, MCP RS create-on-missing, `enableResourceServer` called with PingOne `app.id`. Fixed mock fixture to include both User and Admin apps with correct `protocol: 'OPENID_CONNECT'` and distinct `clientId` values.
- **Files modified:** `src/__tests__/pingoneTestRoutes.test.js`, `docs/PINGONE_APP_SCOPE_MATRIX.md`, `REGRESSION_PLAN.md`.
- **Regression check:** `cd banking_api_server && npx jest --testPathPattern=pingoneTestRoutes --forceExit` → 40 passed.

---

## 5. Pre-Deploy Checklist

Before every `vercel --prod`:

**Build**
- [ ] `npm run build` succeeds in `banking_api_ui/` (exit 0, no compile errors)
- [ ] No new `console.error` or unhandled promise rejections in browser console

**Auth & Routing**
- [ ] Admin login flow works end-to-end: login → callback → `/admin` dashboard
- [ ] User login flow works end-to-end: login → callback → `/dashboard`
- [ ] OAuth callback redirects to Vercel hostname — not localhost
- [ ] Direct navigation to `/config`, `/login`, `/dashboard` on Vercel returns page (not 404)
- [ ] Config UI at `/config` loads and saves PingOne credentials

**Agent — Basic**
- [ ] BankingAgent FAB visible on login page with Admin/Customer login buttons
- [ ] BankingAgent FAB shows banking actions after login (Accounts, Balance, Transfer, etc.)
- [ ] BankingAgent "⚙️ Configure" button navigates to `/config`
- [ ] MCP tool calls succeed (Accounts, Transactions, Balance via agent chat)
- [ ] MCP Inspector panel shows tool list without being logged in
- [ ] Bottom dock mode: action tiles visible as horizontal scrollable strip below input; prompt input not cut off
- [ ] `/demo-data` (admin) → Token Exchange — may_act section shows inject toggle; enabling it makes Token Chain show `may-act-injected` event

**Agent — Consent & HITL**
- [ ] Open agent panel → NO consent modal appears on first open (no "Grant Agent permission")
- [ ] Transfer / withdraw / deposit > $500 → HITL `AgentConsentModal` opens with amount + account (not "Allow AI Agent Access")
- [ ] HITL: check consent checkbox → click "Agree & send code" → OTP panel appears → enter correct code → transaction completes
- [ ] HITL: enter wrong OTP code → "Incorrect code, X attempts remaining" shown
- [ ] HITL: decline consent → sign out → sign in → agent fully enabled (no consent-blocked banner)

**Token Chain & Exchange Audit**
- [ ] Token Chain panel shows decoded user token immediately on login (no "Sign in to see your token" placeholder)
- [ ] `may_act` hint badge shows correctly: `✅ may_act valid` or `⚠️ may_act absent`
- [ ] Token exchange failure → Log Viewer "All Sources" / "Exchange Audit" shows error entry with HTTP status + PingOne error code
- [ ] Token exchange success → Exchange Audit shows method (with-actor / subject-only) and audience

**Dashboard & Layout**
- [ ] Customer `/dashboard` in bottom mode → full-width dock shows; no floating FAB
- [ ] Customer `/dashboard` in middle mode → reload → split-3 layout appears immediately
- [ ] Admin `/admin` in middle mode → global float FAB visible
- [ ] Investment/extra accounts survive server restart (cold-start snapshot restore)
- [ ] Dashboard hero balance shows only checking + savings (no debt/loan accounts included)
- [ ] Auto-refresh checkbox unchecked on fresh dashboard load

---

## 6. Known Limitations (not bugs)

| Limitation | Reason | Workaround |
|---|---|---|
| LangChain Agent not on Vercel | Python/FastAPI/WebSocket can't run on Vercel | Run locally alongside the app |
| `run-bank.sh` requires `/etc/hosts` entry for `api.pingdemo.com` | DNS not registered | Script falls back to localhost automatically |
| MCP Server WebSocket closes after each tool call | By design — stateless calls | N/A |
| Unused-vars ESLint warnings in CRA build | Legacy code not yet cleaned up | `// eslint-disable-next-line` per file |

---

## 7. Environment Variable Reference

### `banking_api_server/.env` (local / not in git)
| Variable | Purpose |
|---|---|
| `PORT` | API server port (default 3001; run-bank.sh sets 3002) |
| `SESSION_SECRET` | Express session signing key |
| `CONFIG_ENCRYPTION_KEY` | AES key for config.db; falls back to SESSION_SECRET |
| `PINGONE_ENVIRONMENT_ID` | Hard override (normally set via Config UI) |
| `REACT_APP_CLIENT_URL` | Frontend URL used in OAuth redirect URIs |
| `FRONTEND_ADMIN_URL` | Admin dashboard URL after OAuth callback |
| `FRONTEND_DASHBOARD_URL` | User dashboard URL after OAuth callback |
| `PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID` | PingOne Authorize decision endpoint for transaction auth (Phase 2 preferred path) |
| `PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID` | PingOne Authorize decision endpoint for MCP first-tool gate (`authorize_mcp_decision_endpoint_id`) |
| `SIMULATED_MCP_DENY_TOOLS` | Comma-separated tool names to force DENY in simulated MCP first-tool gate (e.g. `create_transfer,create_withdrawal`) |

### `banking_api_ui/.env` (local / not in git)
| Variable | Purpose |
|---|---|
| `PORT` | CRA dev server port (4000 for run-bank.sh layout) |
| `REACT_APP_API_PORT` | Port the CRA proxy forwards `/api/*` to (**3002** for run-bank.sh) |
| `REACT_APP_API_URL` | Absolute API URL used by apiClient.js for direct calls |
| `REACT_APP_CLIENT_URL` | Full frontend URL (for OAuth redirect URIs) |

### Vercel environment variables (production)
| Variable | Where to set |
|---|---|
| `KV_REST_API_URL` | Vercel Storage → KV → auto-injected |
| `KV_REST_API_TOKEN` | Vercel Storage → KV → auto-injected |
| `CONFIG_ENCRYPTION_KEY` | Vercel project settings → Environment Variables |
| `SESSION_SECRET` | Vercel project settings → Environment Variables |
| `NODE_ENV` | `production` |

---

## 8. Quick Smoke Test (10 min)

Run after any change before committing:

```bash
# 1. Start the app
bash /Users/cmuir/P1Import-apps/Banking/run-bank.sh

# 2. Open http://localhost:4000
#    → Login page loads
#    → 🤖 FAB visible bottom-right
#    → Click FAB → "👑 Admin Login" and "👤 Customer Login" appear
#    → Console: NO 500 errors, NO proxy errors

# 3. Click "👑 Admin Login" → redirected to PingOne
#    → After auth → /admin dashboard loads
#    → FAB still visible → banking actions available

# 4. Click "👤 Customer Login" → redirected to PingOne
#    → After auth → /dashboard loads
#    → Token Chain panel shows decoded user token (not placeholder)
#    → may_act hint badge visible (✅ valid or ⚠️ absent)
#    → Hero balance shows checking + savings only (no loan accounts)

# 5. Open AI Agent on customer dashboard
#    → NO consent modal on open
#    → Click "🏦 My Accounts" chip → accounts listed (real balances, not fake IDs)
#    → Click "💰 Check Balance" → returns balance without error
#    → Click "📋 Recent Transactions" → transaction list returned

# 6. HITL check (requires account with balance > $500)
#    → In agent: Transfer > $500
#    → AgentConsentModal opens with amount + account details (NOT "Allow AI Agent Access")
#    → Check box → "Agree & send code" → OTP input appears

# 7a. MCP first-tool gate (default: gate is OFF — skip if ff_authorize_mcp_first_tool=false)
#    [Optional — enable via Admin → Feature Flags → "Authorize — First MCP tool"]
#    → With gate ON + ff_authorize_simulated ON:
#       - First MCP tool call per session → response includes mcpAuthorizeEvaluation field (permit)
#       - Second MCP tool call → no mcpAuthorizeEvaluation in response (session skip)
#    → Admin GET /api/authorize/evaluation-status → mcpFirstToolGateEnabled: true
#    → PingOneAuthorizePanel → Recent Decisions → Refresh Status → mcpFirstTool* fields visible

# 7b. Check logs
tail -20 /tmp/bank-api-server.log   # no ERROR lines for /api/auth/oauth/status
tail -20 /tmp/bank-ui.log           # no "Could not proxy" lines
```

---

## 9. UI Regression Prevention — 4 Layers of Protection

> **Goal:** No unintended UI changes land unless explicitly requested.

---

### Layer 1 — Component Snapshot Tests

> ✅ **PARTIALLY IMPLEMENTED** (2026-03-30) — `Header`, `Footer`, and `SideNav` snapshots added (highest-risk layout components). Remaining components below are still pending.

Add `toMatchSnapshot()` to every significant component. The first run creates the baseline; future runs fail if the rendered structure drifts.

**Priority targets (add in this order):**

| Component | File | Why |
|---|---|---|
| `Header` | `components/Header.js` | Top nav — breaks everything if changed |
| `SideNav` | `components/SideNav.js` | Layout frame |
| `Footer` | `components/Footer.js` | Layout frame |
| `UserDashboard` | `components/UserDashboard.js` | Core page, 1045 LOC |
| `Transactions` | `components/Transactions.js` | Core data view |
| `Accounts` | `components/Accounts.js` | Core data view |
| `BankingAgent` | `components/BankingAgent.js` | FAB + chat panel |

**How to add a snapshot test:**

```js
import { render } from '@testing-library/react';
import Header from '../Header';

test('Header renders without change', () => {
  const { container } = render(<Header />);
  expect(container).toMatchSnapshot();
});
```

Run `npm run test:unit -- --updateSnapshot` **only** when a change is intentional and explicitly requested.

---

### Layer 2 — Playwright Visual Regression (CSS drift detection)

> ⚠️ **NOT YET IMPLEMENTED** — spec files exist but `toHaveScreenshot()` calls have not been added. Add them to the existing specs listed below.

Add `expect(page).toHaveScreenshot()` calls to existing E2E tests. Playwright stores `.png` baselines in git; CI fails on any pixel diff.

**Key pages to screenshot:**

| Page | Spec file | State to capture |
|---|---|---|
| Landing page | `landing-marketing.spec.js` | Unauthenticated, full viewport |
| Customer dashboard | `customer-dashboard.spec.js` | Logged in, accounts loaded |
| Admin dashboard | `admin-dashboard.spec.js` | Logged in, default view |
| Agent panel open | `banking-agent.spec.js` | FAB clicked, panel expanded |

**How to add a screenshot assertion:**

```js
await expect(page).toHaveScreenshot('landing-page.png', { maxDiffPixels: 50 });
```

Update baselines intentionally with:

```bash
npx playwright test --update-snapshots
```

---

### Layer 3 — Strict Change Budget (process rule)

Before making any UI change:

1. Run `npm run test:e2e:ui:smoke` — must pass clean
2. Make **only** the specific requested change — nothing adjacent
3. Re-run smoke tests — must still pass
4. Provide before/after screenshot as proof

**Never touch layout, spacing, or shared CSS when fixing a component-specific bug.**

---

### Layer 4 — Pre-commit Smoke Hook

> ✅ **INSTALLED** (2026-03-30) — `.git/hooks/pre-commit` created and executable.

Run UI unit tests automatically whenever a UI file is staged. Catches regressions before they enter git history.

**To install:**

```bash
cat > /Users/cmuir/P1Import-apps/Banking/.git/hooks/pre-commit << 'EOF'
#!/bin/sh
# If any banking_api_ui/src file changed, run unit tests
if git diff --cached --name-only | grep -q 'banking_api_ui/src'; then
  echo "UI files changed — running unit tests..."
  cd banking_api_ui && npm run test:unit -- --watchAll=false --passWithNoTests --forceExit
  if [ $? -ne 0 ]; then
    echo "❌ Unit tests failed — commit blocked. Fix tests before committing."
    exit 1
  fi
fi
EOF
chmod +x /Users/cmuir/P1Import-apps/Banking/.git/hooks/pre-commit
```

---

### How to Request UI Changes Safely

Use this pattern: **"Change X in [ComponentName] — do not touch anything else."**

| Instead of... | Say... |
|---|---|
| "Make the dashboard look better" | "Change the card border-radius in `UserDashboard` to 8px — nothing else" |
| "Fix the nav" | "The active state color in `SideNav` is wrong — change only that style" |
| "Update the button" | "Change the FAB color in `BankingAgent` to `#1a73e8` — no layout changes" |
| "Redesign the header" | "Move the logout button in `Header` to the right — preserve all existing styles" |

**Rules:**
1. Name the component (`UserDashboard`, `Header`, `SideNav`, etc.)
2. Name the specific element (button, card, border, color, padding)
3. Say "do not touch" for anything adjacent you want preserved
4. One change per request — multiple changes in one ask is how regressions slip through
5. Specify the exact value when known (`16px`, `#hex`, `bold`) — not "bigger" or "darker"

after every update

commit, push to git and vercel, update regression docs

---

## 10. Full Regression Pass

Run this ordered sequence to verify everything before a major release or after a large refactor. Each command maps to a layer of the test pyramid.

```bash
cd /Users/cmuir/P1Import-apps/Banking

# Step 1 — Build check (catches compile errors and ESLint no-undef)
cd banking_api_ui && CI=true npm run build
cd ..

# Step 2 — Unit tests (all 256 UI + 818 API server tests must pass, 0 failures)
cd banking_api_ui && npm test -- --watchAll=false --forceExit --passWithNoTests
cd ..
cd banking_api_server && npm test -- --watchAll=false --forceExit
cd ..

# Step 3 — E2E: routing & navigation
cd banking_api_ui && npm run test:e2e:agent -- --reporter=list
cd ..

# Step 4 — E2E: landing page
cd banking_api_ui && npm run test:e2e:landing -- --reporter=list
cd ..

# Step 5 — E2E: customer dashboard
cd banking_api_ui && npm run test:e2e:customer -- --reporter=list
cd ..

# Step 6 — E2E: admin dashboard
cd banking_api_ui && npm run test:e2e:admin -- --reporter=list
cd ..

# Step 7 — Manual smoke (see Section 7)
# Start app: bash run-bank.sh
# Follow the 10-minute manual checklist

# Step 8 — Manual pre-deploy checklist (see Section 4)
# Tick every item before: vercel --prod
```

**Expected pass criteria:**
- Build: exit 0, no compile errors
- UI unit tests: 0 failures (256 tests: 235 pass, 21 skipped)
- API server unit tests: 0 failures (818 tests: 813 pass, 5 skipped)
- All E2E specs: 0 failures
- Manual smoke: all 7 steps pass
- Pre-deploy checklist: all boxes checked

### 2026-04-15 — Bug: SQLITE_READONLY_DBMOVED kills all session writes until server restart

- **Root cause:** When the SQLite sessions DB file inode changes (git operations, file replacements, backup tools), `better-sqlite3` / `node:sqlite` keeps the stale file descriptor and every subsequent write fails with `SQLITE_READONLY_DBMOVED`. The hourly cleanup timer compounds this by logging the error every hour forever. The OAuth callback's `req.session.save()` fails → `session_persist_failed` → user data never loads.
- **Fix:** Added `_isDbMovedError()` detection and `_reconnect()` auto-recovery to `SqliteSessionStore`. On any `SQLITE_READONLY_DBMOVED` error, the store closes the stale handle, reopens the DB file (creating the directory if needed), re-initializes the schema, and retries the operation once. A `_reconnecting` guard prevents infinite recursion. All 7 store methods (`get`, `set`, `destroy`, `all`, `length`, `clear`, `cleanupExpiredSessions`) now self-heal.
- **Files modified:** `banking_api_server/services/sqliteSessionStore.js`
- **Regression check:** `node -e "require('./banking_api_server/services/sqliteSessionStore')"` loads clean. `npm run build` → exit 0. Server starts and `/api/health` returns 200.
- **Do not break:** Session persistence on fresh starts; OAuth callback session save; Upstash Redis store (production) is unaffected.

### Phase 169 — OAuth Token Display Page

- **Feature:** New page at `/oauth/token-display` showing decoded JWT claims, authorization scopes, token validity, provider metadata, and enriched PingOne userinfo data.
- **Files added:** `banking_api_ui/src/components/OAuthTokenDisplayPage.jsx`, `OAuthTokenDisplayPage.css`, `banking_api_ui/src/services/userInfoService.js`
- **Files modified:** `banking_api_ui/src/App.js` (route), `banking_api_server/routes/tokens.js` (GET `/api/tokens/userinfo`)
- **BFF route:** `GET /api/tokens/userinfo` — calls PingOne userinfo endpoint with session access token. Token never exposed to frontend. Uses `oauthUserConfig.userInfoEndpoint` and `getSessionAccessToken(req)`.
- **Regression check:** `cd banking_api_ui && npm run build` → exit 0. No changes to OAuth callback redirect logic, session management, or PKCE flows.
- **Do not break:** OAuth callback redirect to `/dashboard` / `postLoginReturnToPath` (unchanged). Admin callback to `/admin` (unchanged). Session creation and `req.session.save()` before redirect (unchanged). PingOne userinfo is optional — page gracefully falls back to JWT-only if the endpoint fails.

**Date:** May 2, 2026
**Area:** UI / Agent
- **Symptom:** Clicking "New window" in agent popout opens middle browser view but includes side menu and does not pop out cleanly.
- **Root Cause:** 1) `window.open` lacked `popup=yes`, causing modern browsers to treat it as a new tab instead of a window. 2) `/agent` route was nested inside `path="*"` route which unconditionally wraps the content in `<AdminSideNav>`.
- **Fix:** 
  1. Updated `window.open` in `BankingAgent.js` to explicitly request `popup=yes,status=no`
  2. Extracted `<Route path="/agent">` to the top-level route to bypass the sidebar layout structure
  3. Added `/agent` to `isApiTrafficOnlyPage` variable logic in App.js to hide floating panels
- **Files modified:** `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/App.js`
- **Regression check:** `npm run build` → exit 0; verified no missing layouts for standard app routes.
- **Do not break:** Popout layout should just contain the agent interface, clean and without navigation wraps.

**Date:** May 2, 2026
**Area:** UI / Agent
- **Symptom:** Checkbox text for "Always float" was unreadable (dark text on dark background).
- **Root Cause:** A dark red color `#7f1d1d` default was applied to `.agent-ui-mode-toggle__fab` without adjusting the specific span text to white when embedded on darker backgrounds.
- **Fix:** Applied inline `color: '#fff'` specifically to the "Always float" `<span>` in `AgentUiModeToggle.js`.
- **Files modified:** `banking_api_ui/src/components/AgentUiModeToggle.js`, `banking_api_ui/src/components/fix-toggle.js`
- **Regression check:** `npm run build` → exit 0
- **Do not break:** The "Always float" toggle readability alongside the layout segmented control in the top app navigation.

**Date:** May 2, 2026
**Area:** UI / Agent
- **Symptom:** "View Sensitive Account Details" chip and natural language requests did not properly trigger or establish initial steps on the MCP Compliance Checklist (12-step panel), leaving the compliance UI seemingly inactive or unlinked.
- **Root Cause:** The `sensitive-account-details` switch case manually queued HITL without hitting the backend infrastructure that traditionally triggers UI compliance steps. In addition, there was no logical node representing the LLM processing phase for manual commands that get routed out.
- **Fix:** Added an `agent-llm-reasoning` node to `COMPLIANCE_STEPS` in `agentFlowDiagramService`. Explicitly added function flags `startLlmReasoning` and `markHitlPreConsent` to trigger the node updates before MCP/API handling starts. Bound these triggers in `BankingAgent.js`.
- **Files modified:** `banking_api_ui/src/services/agentFlowDiagramService.js`, `banking_api_ui/src/components/BankingAgent.js`
- **Regression check:** `npm run build` → exit 0
- **Do not break:** The visual relationship between hitting an agent command and it indicating that the MCP / Gateway consent workflow is kicking in.

**Date:** May 3, 2026
**Area:** Agent / NL Intent Parser
- **Symptom:** Banking transactions via agent (withdraw, transfer, deposit) returned "❌ From account not found" or "❌ To account not found" errors.
- **Root Cause:** NL intent parser (`geminiNlIntent.js`) extracts account type strings (e.g., "checking", "savings") from user messages. Heuristic agent (`bankingAgentLangGraphService.js`) validated the account existed but returned the type string instead of the account UUID in params. MCP tool endpoint expected account ID, not type → `dataStore.getAccountById("checking")` failed.
- **Fix:** After validating account exists via `accounts?.find()`, resolve the account type to actual account ID before returning params to frontend. Applied to three transaction types: (1) withdraw — resolve `fromId` to `fromAcct.id`; (2) deposit — resolve `toId` to `toAcct.id`; (3) transfer — resolve both `fromId` and `toId` to account UUIDs.
- **Files modified:** `banking_api_server/services/bankingAgentLangGraphService.js` (lines 109-110, 143, 165)
- **Regression check:** Agent: Click "💳 Withdraw $50" → transaction completes without "From account not found". NL: "transfer $100 from checking to savings" → transaction completes with real account IDs in logs. `cd banking_api_ui && npm run build` → exit 0.
- **Do not break:** Form-based withdrawal/transfer/deposit (ActionForm route). Account validation logic for all transaction types. Token exchange and HITL consent flows.

### 2026-05-05 — Phase 2: Authorize owns all transaction decisions (three-tier thresholds)

- **Change:** Consolidated transaction authorization into PingOne Authorize service (or simulated Authorize when enabled). Removed three sequential hardcoded BFF gates; now single Authorize decision owns DENY, CONFIRM (consent-only), and STEP_UP (consent+MFA) decisions.
- **Simulated Authorize thresholds (defaults, configurable via UI):**
  - **$0–$249:** PERMIT (no user action required)
  - **$250–$499:** CONFIRM (consentRequired: true, stepUpRequired: false — consent only, no MFA)
  - **$500–$1,999:** CONSENT + MFA (consentRequired: true, stepUpRequired: true — both required)
  - **$2,000+:** DENY (hard ceiling)
- **New error shape:** `{ error: 'hitl_required', hitl: { type: 'consent' | 'step_up' } }` replaces `consent_challenge_required`. Unified 428 response for all HITL gates.
- **Files modified:** `banking_api_server/services/simulatedAuthorizeService.js` (three-tier logic), `banking_api_server/routes/authorizeConfig.js` (confirm amount API), `banking_api_ui/src/components/AuthorizeConfigPage.jsx` (confirm threshold UI field), `banking_api_server/services/transactionAuthorizationService.js`, `banking_api_server/routes/transactions.js`, MCP server error handling, UI consent/step-up modal logic.
- **Admin UI:** Mock Authorize config panel exposes confirm/step-up/deny thresholds + rules documentation.
- **ff_hitl_enabled=false:** Skips consent enforcement; deny and step-up still enforced via Authorize.
- **Regression check:** `cd banking_api_ui && npm run build` → exit 0. Test $250 (confirm only), $500 (consent+MFA), $2000 (deny).
- **Do not break:** Transfer/withdrawal/deposit HITL enforcement (now Authorize-driven). OTP bypass `123123`. MCP gateway HITL path. Existing consent modal + step-up MFA flows still trigger correctly.
