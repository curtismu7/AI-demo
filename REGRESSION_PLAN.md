# Banking Demo — Regression Plan

> **Purpose:** Prevent feature loss and stop repeating the same errors.  
> Update this file whenever a bug is fixed or a feature is added.

---

## 1. Critical Do-Not-Break Areas

| Area | What breaks if touched | Files |
|---|---|---|
| OAuth admin login | Admin can't log in | `routes/oauth.js`, `config/oauth.js`, `banking_api_server/.env` |
| OAuth user login | Customers can't log in | `routes/oauthUser.js`, `config/oauthUser.js` |
| CRA proxy setup | `/api/*` calls go to wrong port → 500 | `banking_api_ui/src/setupProxy.js`, `banking_api_ui/.env` |
| Session persistence | User logged out on every refresh | `server.js` (session middleware), `routes/oauth.js` `req.session.save()` |
| **Upstash session store** | **Every Vercel Lambda gets empty in-memory session → 401 on all API calls** | `services/upstashSessionStore.js` — must call `cb(err)` on failure; `KV_REST_API_URL` + `KV_REST_API_TOKEN` set in Vercel env. Use `update-upstash.sh` to rotate. |
| **Token audience check** | **All authenticated API calls return 401 — `aud` mismatch** | `middleware/auth.js` — never hardcode audience defaults; `https://api.pingone.com` is always accepted. Set `ENDUSER_AUDIENCE` / `AI_AGENT_AUDIENCE` only for custom resource servers. |
| **Status endpoint token expiry** | **Dashboard loops: status returns `authenticated: true` for expired tokens** | `routes/oauthUser.js`, `routes/oauth.js` — both check `expiresAt` before responding `authenticated: true` |
| **REAUTH_KEY re-auth guard** | **Infinite PingOne redirect loop** | `UserDashboard.js` `fetchUserData` — key cleared ONLY on success path. Never clear it on `oauth=success` URL param (triggers immediate loop). |
| **Agent form account IDs** | **'❌ Account chk-5 not found' on balance/deposit/withdraw/transfer** | `BankingAgent.js` — `liveAccounts` state hydrated from `GET /api/accounts/my` on login; passed to `ActionForm`; falls back to `generateFakeAccounts` only while fetch is pending |
| **Extra accounts (investment etc.) lost on cold-start** | **Only checking+savings appear after Vercel cold-start; investment and other custom accounts missing** | `demoScenario PUT` must call `saveAccountSnapshot(userId)`; `GET /accounts/my` and `GET /demo-data` must call `restoreAccountsFromSnapshot(userId)` BEFORE `provisionDemoAccounts` — see `accounts.js` and `demoScenario.js`. `demoScenarioStore` (Redis/KV) is the persistence layer. |
| **Middle layout start state** | **Middle column inline agent does not appear when placement is already 'middle'** | `UserDashboard.js` — `middleAgentOpen` must be initialised via `useState(() => agentPlacement === 'middle')` and set to `true` in the `agentPlacement` useEffect. `App.js` (`showFloatingAgent` suppressed for middle ON USER DASHBOARD ROUTES ONLY — admin Dashboard.js gets float in middle mode). |
| **Bottom dock on dashboard routes** | **Bottom dock not showing — floating FAB shown instead** | `App.js` — skip App-level `<EmbeddedAgentDock>` on `onUserDashboardRoute` (UserDashboard mounts it internally). `EmbeddedAgentDock.js` — must NOT have `isBankingAgentDashboardRoute` guard (that returns null before the component can render). |
| **Admin role detection** | **Admin users downgraded to customer on login** | `routes/oauthUser.js` 4-signal check: username allowlist → population ID → custom claim → existing record. Config fields: `admin_username`, `admin_population_id`, `admin_role_claim` in `configStore.js` + `Config.js`. |
| Config UI / configStore | All PingOne settings lost | `services/configStore.js`, `routes/adminConfig.js` |
| **Demo Data — agent + sign-in lessons** | **Presenter lesson radios / Bearer probe regress; App tests break if `useSearchParams` mock dropped** | `DemoDataPage.js`, `DemoDataPage.css`, `App.session.test.js` (must mock `useSearchParams` when `App.js` uses it), `bankingAgentNl.test.js` (`parseNaturalLanguage.mockReset` per test) |
| BankingAgent FAB | Agent disappears | `components/BankingAgent.js`, `App.js` |
| Float panel resize | Panel capped at 560×720, won't grow larger | `BankingAgent.css` (`max-width`/`max-height` removed), `BankingAgent.js` (`handleResize` caps) |
| Dashboard 401 / session banner | "Session expired" on valid PingOne session (cold-start `_cookie_session` stub) | `UserDashboard.js` (`fetchUserData` 401 handler → auto re-auth redirect) |
| Left rail + quick nav | Overlap or wrong routes | `App.js`, `App.css`, `DashboardQuickNav.js`, `embeddedAgentFabVisibility.js` |
| **Transaction routes — intentional no requireScopes()** | **Adding `requireScopes()` back to `GET /transactions/my` or `POST /transactions` breaks real user flows** — standard PingOne tokens without a custom resource server only carry `openid/profile/email`, not `banking:*` scopes. Both routes authenticate the caller but rely on row-level ownership checks, not scope gates. | `banking_api_server/routes/transactions.js` lines 60 and 208 — comments explain the trade-off. Do not add `requireScopes()` unless a custom PingOne resource server is confirmed and `ENDUSER_AUDIENCE` is set. |
| **MCP Inspector — no auth required** | **`GET /api/mcp/inspector/tools` must respond 200 + local tool catalog for unauthenticated requests** — re-adding `authenticateToken` to the inspector mount (or an `effectiveUserId` guard in `respondLocalCatalog`) breaks the unauthenticated dev inspector view. | `banking_api_server/server.js` — inspector mount has no `authenticateToken`. `banking_api_server/routes/mcpInspector.js` — `respondLocalCatalog` has no user guard. |
| **MCP first-tool Authorize gate (optional)** | **`ff_authorize_mcp_first_tool = true` blocks `POST /api/mcp/tool` until policy permits; `req.session.mcpFirstToolAuthorizeDone` carries the per-session permit once it runs** — do not clear this session key during a request flow. With PingOne unavailable and `ff_authorize_fail_open = false`, the gate returns 503 and blocks all agent actions. | `banking_api_server/services/mcpToolAuthorizationService.js` — `evaluateMcpFirstToolGate()`; `banking_api_server/server.js` — gate block in `POST /api/mcp/tool`; `banking_api_server/services/configStore.js` — `authorize_mcp_decision_endpoint_id` (env: `PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID`); `banking_api_server/routes/featureFlags.js` — `ff_authorize_mcp_first_tool`. Status at `GET /api/authorize/evaluation-status` (admin). |
| **MCP tool flow SSE (live phases)** | **Agent flow diagram loses streamed BFF milestones; orphaned SSE connections** | `banking_api_server/services/mcpFlowSseHub.js` — `publish`/`endTrace`/`handleSseGet`; `server.js` — `GET /api/mcp/tool/events`, optional `flowTraceId` on `POST /api/mcp/tool`, `res.on('finish')` must call `endTrace`. UI: `mcpFlowSseClient.js`, `bankingAgentService.callMcpTool`, `agentFlowDiagramService`, `AgentFlowDiagramPanel.js`. **Multi-instance:** SSE + POST must hit the same Node process unless events are backed by Redis pub/sub. |
| **Agent startup consent gate** | **"Grant Agent permission" modal must NEVER appear on first open; only HITL modal for write > $500** | `BankingAgent.js` — `hitlPendingIntent` only set on `consent_challenge_required` from server (write tools); `buildConsentIntent` null guard prevents modal without valid payload; `setAgentBlockedByConsentDecline(false)` called on login. Server: no `AGENT_CONSENT_REQUIRED` throw anywhere. |
| **HITL OTP email flow** | **OTP never sent; `{ otpSent: false }` with no email; transaction blocked** | `emailService.js` — must use `admin_client_id` / `admin_client_secret` (not `pingone_client_id`). `transactionConsentChallenge.js` — returns `otpCodeFallback` in response when email throws so dev flow still works. |
| **consentBlocked persists across logout** | **Agent fully disabled on fresh login after prior HITL decline** | `BankingAgent.js` — `useState` initializer always returns `false` (clears stale localStorage); `checkSelfAuth` calls `setAgentBlockedByConsentDecline(false)` on valid session. |
| **Cross-Lambda exchange audit** | **Log Viewer always empty after token exchange failure on Vercel (Lambda isolation)** | `services/exchangeAuditStore.js` — Redis-backed LPUSH/LTRIM on `banking:exchange-audit`. `routes/logs.js` `GET /api/logs/console` merges Redis events. `GET /api/logs/exchange` endpoint must exist. Both success and failure paths call `writeExchangeEvent()` fire-and-forget. |
| **Token Chain blank on login** | **Token Chain shows placeholder instead of decoded user token after sign-in** | `TokenChainDisplay.js` — mount effect calls `fetchSessionPreview()` unconditionally (no `didAuthRef` guard). Function returns early on `!res.ok` (safe when unauthenticated). |
| Split vs Classic dashboard + HITL consent | Duplicate FAB/dock with inline agent, or consent navigates away | `dashboardLayout.js`, `customerSplit3Dashboard.js`, `UserDashboard.js`, `TransactionConsentModal.js`, `App.js` |
| **Bottom dock — tile strip direction** | **Re-adding `flex-direction: row-reverse` to `.ba-embedded-bottom-dock .ba-body` puts tiles back on the right sidebar, hiding the prompt input** | `banking_api_ui/src/components/BankingAgent.css` — `.ba-body` must be `column-reverse`; `.ba-left-col` must be `flex-direction: row; overflow-x: auto; border-top` (horizontal strip). `ba-chips-footer` and nav button are `display:none` in bottom dock to prevent input cut-off. |
| **ff_inject_may_act — synthetic may_act (demo only)** | **If changed to inject unconditionally (not gated by flag) it would forge may_act on real tokens** | `banking_api_server/services/agentMcpTokenService.js` — injection only runs when `configStore.getEffective('ff_inject_may_act') === 'true'` AND `userAccessTokenClaims.may_act` is absent. Toggle only in `/demo-data` or Feature Flags (admin). Never enable in production. |
| Vercel SPA routing | All non-API routes 404 on Vercel | `vercel.json` (SPA catch-all rewrite) |
| OAuth redirect origin | Redirects go to localhost in production | `routes/oauth.js`, `routes/oauthUser.js` (`getOrigin`) |
| Vercel build | Production deployment fails | `banking_api_ui/package.json`, `vercel.json` |

---

## 2. Port Layout (Local Dev)

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

## 3. Bug Fix Log (reverse-chronological)

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

---

## 4. Pre-Deploy Checklist

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

## 5. Known Limitations (not bugs)

| Limitation | Reason | Workaround |
|---|---|---|
| LangChain Agent not on Vercel | Python/FastAPI/WebSocket can't run on Vercel | Run locally alongside the app |
| `run-bank.sh` requires `/etc/hosts` entry for `api.pingdemo.com` | DNS not registered | Script falls back to localhost automatically |
| MCP Server WebSocket closes after each tool call | By design — stateless calls | N/A |
| Unused-vars ESLint warnings in CRA build | Legacy code not yet cleaned up | `// eslint-disable-next-line` per file |

---

## 6. Environment Variable Reference

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

## 7. Quick Smoke Test (10 min)

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

## 8. UI Regression Prevention — 4 Layers of Protection

> **Goal:** No unintended UI changes land unless explicitly requested.

---

### Layer 1 — Component Snapshot Tests

> ⚠️ **NOT YET IMPLEMENTED** — none of the snapshot tests below exist yet. Add them in priority order.

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

> ⚠️ **NOT YET IMPLEMENTED** — `.git/hooks/pre-commit` does not exist. Create it to activate this layer.

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

## 9. Full Regression Pass

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
