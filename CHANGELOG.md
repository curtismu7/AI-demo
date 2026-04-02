# Changelog

All notable changes to BX Finance are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions use calendar dates: `YYYY.MM.DD`.

**On every change:**
1. Add one line under `[Unreleased]` in the right category below.
2. If a feature was added or removed, update `FEATURES.md` (including the `Test file` column).
3. If fixing a bug, add a test and an entry to `REGRESSION_LOG.md`.
4. Commit with a conventional prefix: `feat:`, `fix:`, or `chore:`.

**On every production deploy:** run `npm run release` — it versions the `[Unreleased]` section and creates a git tag.

---

## [Unreleased]

### Added
- **Agentic Maturity Model education panel** — `AgenticMaturityPanel.js`; 4 tabs: The Model (diagram + level explanations), Why It Matters (identity questions + risk table), Standards Mapping (RFC 8693, RFC 8707, RAR, CIBA, PingOne Authorize per level), In This Demo; registered as `EDU.AGENTIC_MATURITY` / Learn → "⭐ Agentic Maturity Model"
- **MCP Compliance Diagram split into 5 tabs** — `docs/MCP_COMPLIANCE_DIAGRAM.drawio`: single unreadable 2400×1800 page replaced by Architecture Overview, BFF Compliance Detail, MCP Server Compliance Detail, and Compliance Summary tabs (Compliance Map unchanged)
- **Marketing customer sign-in (demo/config)** — `configStore` keys `marketing_customer_login_mode` (`redirect` | `slide_pi_flow`), `marketing_demo_username_hint`, `marketing_demo_password_hint` (public; empty allowed to clear); editable in **Demo config** and **Application setup**; `LandingPage` slide-over panel with hints + **Continue to PingOne** using `use_pi_flow=1`; `BankingAgent` customer login on marketing paths appends `use_pi_flow=1` when mode is slide; `GET /api/auth/oauth/user/login?use_pi_flow=1` forces pi.flow via `oauthUserService.generateAuthorizationUrl` `forcePiFlow`; `s:oauthUserService.test.js`
- **Compact marketing landing page** — reduced hero min-height / section padding / typography so the home page scrolls less (`LandingPage.css`, `LandingPage.js`)
- MCP first-tool PingOne Authorize gate: `ff_authorize_mcp_first_tool` flag, `mcpToolAuthorizationService.js`, `authorize_mcp_decision_endpoint_id` config key; `POST /api/mcp/tool` evaluates once per session before the WebSocket call
- `GET /api/authorize/evaluation-status` includes `mcpFirstTool*` fields; PingOneAuthorizePanel shows MCP gate status
- AGENTS.md and CLAUDE.md agent instruction files; architecture PNGs
- REGRESSION_PLAN: Section 1 critical area for MCP gate, Section 7 new env vars, Section 8 smoke-test step
- Feature Flags system: `GET/PATCH /api/admin/feature-flags`, FLAG_REGISTRY with 5 flags
- `FeatureFlagsPage` admin UI (`/feature-flags`) — toggle switches per flag, grouped by category, live save, warning badges for security-sensitive flags
- "Feature Flags" accent button in admin Dashboard toolbar
- New configStore fields: `ff_authorize_fail_open` (fail-open on Authorize errors, default ON), `ff_authorize_deposits` (apply Authorize to deposits, default OFF), `ff_hitl_enabled` (HITL agent consent gate, default ON)
- `transactions.js`: `ff_authorize_fail_open` controls fail-open vs fail-closed behaviour; `ff_authorize_deposits` adds deposits to the Authorize evaluation scope

- **KV cross-instance SSE bridge** — `mcpFlowSseHub.js` now publishes each SSE event to an Upstash KV list (`banking:sse:events:{traceId}`) via `@vercel/kv` so agent flow diagram panels work on Vercel multi-instance deployments; `handleSseGet` starts a 500ms KV poller with `ev.t` dedup (STAB-01)
- **Phase 6 plans** — `06-01-PLAN.md` (TOKEN-FIX-01: 2-exchange auth method fix + unit tests for all 5 BFF token methods) and `06-02-PLAN.md` (TOKEN-FIX-02: 1-exchange & 2-exchange delegation tests + security property assertions + live integration scaffold)
- **Phase 6 roadmap: token-exchange-fix** — added Phase 6 plan to address RFC 8693 token exchange "Unsupported authentication method" error from PingOne; requirements TOKEN-FIX-01, TOKEN-FIX-02

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column
- - **2-exchange token auth method fix** — `getClientCredentialsTokenAs` and `performTokenExchangeAs` previously hardcoded `client_secret_post`, causing "Unsupported authentication method" on the AI-Agent→MCP 2-exchange delegation path; both methods now route through `applyTokenEndpointAuth` with `method='basic'` default matching PingOne app configuration; `_performTwoExchangeDelegation` reads `AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD` / `MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD` env vars and passes them to all 4 call sites; 14 new auth-method unit tests added covering all 5 BFF token methods
- **RFC 8693 token exchange auth method** — `performTokenExchange` and `performTokenExchangeWithActor` now use `CLIENT_SECRET_BASIC` (Authorization header) matching the PingOne app configuration, fixing "Unsupported authentication method" error; `getAgentClientCredentialsToken` same fix via `AGENT_TOKEN_ENDPOINT_AUTH_METHOD` env (default `basic`)
- **PINGONE_MAY_ACT_SETUP.md** — added Part 6 Postman Testing section: links to collection and environment files, import instructions, 7-variable setup table, one-time Redirect URI note, step-by-step run order, utility request guide; renumbered Verification as Part 7
- **docs/BX-Finance-MayAct-Chain.postman_collection.json** — new Postman collection for the full 3-token chain: Step 1 Subject Token (ROPC), Step 2 Token Exchange #1 (MCP Token), Step 3 Client Credentials (PingOne API Token), Step 4 user lookup; test scripts auto-save tokens and user_sub, validate aud/act/may_act claims at each step; utility requests for introspection and setting mayAct via PATCH
- **PINGONE_MAY_ACT_SETUP.md** — restored 3-token chain: Token 3 is PingOne API Token via Client Credentials (not Worker role-based); renamed app to `BX Finance MCP Service`; app type is non-Worker (Native/Web App) to allow resource scope assignment; restored `PINGONE_API_AUDIENCE` env var; updated flow diagram, Part 5, Part 6, troubleshooting table throughout
- **PINGONE_MAY_ACT_SETUP.md** — corrected Worker app (Step 2c): Token Exchange grant cannot be enabled on Worker apps; access is role-based (Identity Data Read Only + Identity Data Provisioner); removed Token Exchange #2 from flow diagram, Part 5, Part 6, and troubleshooting; updated title from "3-Leg" to "2-Leg" (1 exchange, not 2); removed PINGONE_API_AUDIENCE env var note
- **PINGONE_MAY_ACT_SETUP.md** — fixed Step 2b Resources tab: removed incorrect BX Finance Agent Gateway requirement (Banking App authenticates via client_id/secret, no audience token needed); added explanatory note
- **PINGONE_MAY_ACT_SETUP.md** — added Build and Test Expression instructions with example JSON for both Step 1b attributes (`sub` and `act`); `act` test includes mismatch guard verification step
- **PINGONE_MAY_ACT_SETUP.md** — corrected stale `https://agent-gateway.pingdemo.com` URLs in 2a test data to `<PINGONE_CORE_CLIENT_ID>` UUID placeholders; fixed Part 5 API reference to compare `actor_token.client_id` (not `aud[0]`); fixed `act.sub` value in MCP Token example; corrected Step 1d description (may_act.sub must match client ID UUID, not audience URI); fixed 2a app description "BFF Admin" → "Banking App"
- **End-user OAuth failures no longer send users to `/login`** — PingOne callback errors (`oauth_provider`), invalid state, missing code, nonce mismatch, session persist/regenerate failures, and token `callback_failed` now redirect to `session.postLoginReturnToPath` or **`/marketing`** so **`/` / `/marketing` still mount BankingAgent FAB + dock**; **`App.js`** + **`endUserOAuthErrorToast.js`** show a toast (pi.flow troubleshooting hint when relevant) and strip error query params (commits `3a762ae`, `b166f47`)
- Pre-existing `no-unused-vars` lint errors in `DemoDataPage.js` and `UserDashboard.js` (suppressed with eslint-disable-next-line)
- **OTP email verification for high-value transactions** — after the user checks the consent checkbox and clicks "Agree & send code", a 6-digit OTP is generated (HMAC-SHA256/per-challenge salt, timing-safe compare) and sent via PingOne email; the transaction only executes once the correct code is verified; challenge state machine: `pending → otp_pending → confirmed → consumed`; max 3 attempts, 5-minute TTL; new route `POST /consent-challenge/:id/verify-otp`; dev fallback when email unconfigured; 7 unit tests added
- **Exchange Audit Log** (`services/exchangeAuditStore.js`) — Redis-backed (Upstash KV) audit log for RFC 8693 token-exchange events; `writeExchangeEvent()` LPUSH+LTRIM to `banking:exchange-audit` (max 200 entries), `readExchangeEvents()` LRANGE; graceful no-op when KV env vars are absent
- **`GET /api/logs/exchange`** — dedicated endpoint returning Redis exchange audit events in standard `{logs,total}` shape; LogViewer "Exchange Audit" dropdown option + included in "all sources" fetch
- `TOKEN_EXCHANGE` category added to `LOG_CATEGORIES` in `utils/logger.js`

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column
- **Agent consent gate UX** — clicking a tool chip or typing a query before accepting consent now opens `AgentConsentModal` with a friendly message instead of showing `❌ Agent consent required...` error in chat (commit `32e1667`)
- **Token exchange: full PingOne error now visible** — `oauthService.performTokenExchange`, `performTokenExchangeWithActor`, and `getAgentClientCredentialsToken` now attach `httpStatus`, `pingoneError`, `pingoneErrorDescription`, `pingoneErrorDetail`, `requestContext` as named properties on the thrown Error; `console.error` logs the full structured object; exchange-failed tokenEvent description shows HTTP status + PingOne error code + detail (commit `b4272ee`)
- **Log viewer empty after cross-Lambda exchange failure** — Vercel serverless: the Lambda that ran the exchange and the Lambda serving `GET /api/logs/console` are separate processes with isolated `recentLogs[]` memory; `GET /api/logs/console` is now async and merges Redis exchange audit events, deduplicating messages already present from the same Lambda (commit `b4272ee`)


- Shared `draggablePanel.css` with `.drp-backdrop` (dim overlay) and `.drp-resize-grip` (SE corner)
- `AgentConsentModal` — now draggable and resizable (portal, grab-handle header, resize grip)
- `AddDelegateModal` — now draggable and resizable (portal, grab-handle header, resize grip)
- `TokenExchangeSimulator` — now draggable and resizable (portal, starts viewport-filling, drag/resize freely)

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column
- **Investment (and extra) accounts lost on cold-start** — `dataStore` is in-memory only; `provisionDemoAccounts` deleted all accounts and re-created only checking+savings whenever the in-memory store was empty (every Vercel cold-start). Fix: `demoScenario PUT` now saves an `accountSnapshot` array to `demoScenarioStore` (Redis/KV) after every save; `GET /api/accounts/my` and `GET /api/demo-data` both try to restore from that snapshot before falling back to provisioning; `POST /accounts/reset-demo` updates the snapshot to the freshly provisioned 2-account state so future cold-starts restore the reset (commit `1a93c77`)
- **Bottom dock + admin middle agent restored** — `EmbeddedAgentDock.js` had an `isBankingAgentDashboardRoute` guard that returned null for ALL dashboard routes, preventing both the App-level and UserDashboard-level dock renders; removed the guard; added `onUserDashboardRoute` in `App.js` to skip the App-level dock on `/dashboard`/`/` (UserDashboard handles those) and to scope middle-mode float suppression only to UserDashboard routes so the admin Dashboard.js still gets the float agent in middle mode (commit `db73404`)
- **`DemoDataPage` build error** — `handleResetDefaults` called `setAccounts` (removed in type-slot refactor); replaced with `setTypeSlots` callback updating `checking`/`savings` slots from `defaults.checkingName/Balance` and `defaults.savingsName/Balance` — blocked every Vercel deploy (commit `0058450`)
- **Button routing audit** — `LandingPage` Logs quick-link was calling `handleOAuthLogin('admin')` instead of opening `/logs`; `OAuthDebugLogViewer` "← Dashboard" always linked to `/` instead of role-aware `/admin` / `/dashboard`; 7 Dashboard Quick Action buttons used `window.location.href` (full-page reload) instead of React Router `<Link>` — 3 bugs fixed, 41 routing tests added (commit `b21dcf7`)
- **`get_account_balance` type-name IDs** — tool returned `❌ Account checking not found` because it called `getAccountById` directly; now loads accounts via `ensureAccounts` and resolves via `resolveAccountId` (same as deposit/withdraw/transfer) (commit `3aaeee4`)
- **`may_act absent` wording** — Token Chain panel and agent chat said "exchange **will** fail" as a hard guarantee; changed to "may fail" / "exchange will be attempted" in `TokenChainDisplay.js` (header, body, legend) and `agentMcpTokenService.js` `describeMayAct` (commit `f48120d`)
- `DemoDataPage.js` JSX syntax error in template literal (invalid `${...}` interpolation)

- **In-app Agent Consent** (`AgentConsentModal.js` / `AgentConsentModal.css`) — replaced PingOne ACR-gate consent with a fully self-contained in-app modal; `POST /api/auth/oauth/user/consent` records consent in session; `DELETE /consent` revokes for demo reset; `SKIP_AGENT_CONSENT=true` env var disables gate; no PingOne agreement or auth policy needed
- **3-column Split Dashboard layout** — Token Chain (slim `220px`) | AI Agent (`1fr`) | Customer Accounts (`1fr`); all three columns same height, same row; action/suggestion chips now render as horizontal pill strip below the chat prompt instead of side column; responsive collapse at ≤1024px

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column

- **`/consent-url` missing PKCE** — `GET /api/auth/oauth/user/consent-url` was building the authorization URL manually, omitting `code_challenge` and `code_challenge_method`; PingOne would have rejected the token exchange at callback; now uses `oauthService.generateAuthorizationUrl()` (same builder as login) and adds `setPkceCookie` for Vercel cold-start recovery
- **`/consent-url` missing redirect-URI validation** — added `validateRedirectUriOrigin` guard mirroring the login route
- **Split dashboard column heights** — columns were different heights due to `overflow: visible` and content-driven sizing; fixed with `overflow: hidden`, explicit `height: min(calc(100vh - 130px), 900px)` on the grid and `height: 100%` on all three cells
- **Agent panel didn't fill column** — `embedded-banking-agent` had fixed `min(70vh, 360px)` height; `ud-dashboard-inline-agent` now overrides to `height: 100%` to fill the grid cell

### Changed

- `agentMcpTokenService.js` consent gate now checks `req.session.agentConsentGiven === true` (in-app flag) instead of `acr === AGENT_CONSENT_ACR` env var; `AGENT_CONSENT_ACR` env var is no longer used
- `GET /api/auth/oauth/user/status` returns `consentGiven` (boolean) and `consentedAt` (ISO string) instead of `consentAcr`
- Token Chain Display consent pills updated to show in-app consent status instead of ACR value
- `ba-split-column` action strip now shows all action chips (session, actions, suggestions) as horizontal pills — previously hid all except suggestions
 — `pingOneAuthorizeService.js` now targets `POST /decisionEndpoints/{endpointId}` (preferred) with automatic fallback to legacy PDP path; new `authorize_decision_endpoint_id` config field + `PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID` env alias; Config UI "Decision Endpoint ID" field; `transactions.js` logs `path` + `decisionId`
- **PingOne Authorize — Phase 3 Recent Decisions** — `GET /api/authorize/recent-decisions` + `GET /api/authorize/decision-endpoints` admin routes; `PingOneAuthorizePanel.js` rewritten with 5 rich tabs including live "🔍 Recent Decisions" viewer with PERMIT/DENY badges and expandable JSON
- **SPIFFE implementation plan** — `docs/SPIFFE_PLAN.md` defines 4 integration points (JWT-SVID as RFC 8693 actor_token, mTLS BFF↔MCP, agent workload identity, PingGateway SPIFFE bridging) and 4 phased delivery phases; workload identity map and environment variable spec included
- **Landing page quick-links** — hero section now shows shortcut buttons matching the edu-bar: CIBA guide, CIMD Simulator, Home, Dashboard, API, Logs, Demo config
- **`mcp_resource_uri` Config UI field** — RFC 8693 MCP audience URI can now be set from Admin → Config without a redeploy; previously env-var only (`MCP_SERVER_RESOURCE_URI`)
- **Best Practices education panel** — new `BestPracticesPanel.js` with 6-tab Education Drawer covering all five Ping Identity AI Agent best practices: Know Your Agents, Detect Agents, Use Delegation Not Impersonation, Enforce Least Privilege, Human in the Loop; each tab shows plain-English explanation + BX Finance implementation status + linked deep-dives; accessible from hamburger menu (⭐ AI Agent Best Practices, featured blue button)

- **Delegated Access page** (`/delegated-access`) — family-member account delegation with "Access I've granted" / "Granted to me" tabs; account-level multi-select; **RFC 8693 Token Exchange** explainer panel showing `may_act` / `act` claims; "Act as" demo simulation; quick-action button on UserDashboard
- **Token Exchange Simulator** (`DelegatedAccessPage.js`) — replaces static Act-as explainer with a live 2-column inspector: left = token chain (user-token → exchange-required → agent-actor-token → exchanged-token with status badges), right = selected event detail showing `POST /as/token` API call body, JWT claims with `may_act`/`act` colour-coding, explanation, and full JWT toggle; fires real `POST /api/mcp/tool` on open; retry button + spinner + error state
- **Token Inspector panel** — floating, draggable, resizable, collapsible detail panel for each token chain event; launched via hover-reveal inspect icon per row; rendered via `ReactDOM.createPortal` for off-screen capability
- **Agent UI placement** — new **Middle / Bottom / Float + FAB** toggle replaces Floating/Embedded/Both; `AgentUiModeContext` stores `{ placement, fab }` under `banking_agent_ui_v2`; Middle+Bottom together not permitted
- **Bottom dock integration** — resize handle is now the visual seam between page content and dock (no gap); collapsed state keeps rounded-pill corners; dark-theme overrides updated
- **Slim token-chain column** in split3 view (`160–200px`) so agent and banking columns have more space

- **Customer split dashboard** (token \| inline agent \| banking) with **Split view** / **Classic** toggle (`dashboardLayout.js`); **Agent UI** modes **Floating** / **Embedded** / **Both** with split-aware FAB/dock suppression (`customerSplit3Dashboard.js`)
- **TransactionConsentModal** — high-value HITL as an on-dashboard popup (checkbox authorizing the assistant); **`/transaction-consent?challenge=…`** still works as a deep link
- **Industry branding** (`IndustryBrandingContext`, presets, `BrandLogo`, Config) and **agent MCP scope policy** (server + UI config)
- **GET `/api/transactions/consent-challenge/:challengeId`** — snapshot for consent UI (registered before **`GET /:id`**); routes **`/admin/banking`**, **`/transaction-consent`**; **SessionReauthBanner** for **`SESSION_REAUTH_EVENT`**
- **Floating Banking Agent** only on signed-in dashboard homes **`/`**, **`/admin`**, **`/dashboard`** (Router wraps **`AppWithAuth`**); larger default/expanded panel sizing — see **`REGRESSION_LOG.md`** (2026-03-27)
- **appToast** (`banking_api_ui/src/utils/appToast.js`): shared **`notifySuccess` / `notifyError` / `notifyWarning` / `notifyInfo`** for react-toastify; **UserDashboard** step-up MFA (428) uses a persistent warning toast with verify actions; **`dashboardToast`** remains for session errors with **Sign in** — see `REGRESSION_LOG.md`, `docs/runbooks/regression/post-deploy.md`
- **Embedded agent dock** (`EmbeddedAgentDock.js`, **`useDemoMode`**) and related demo-scenario / FAB visibility updates — see `docs/runbooks/regression/ui-browser.md` where touched
- **Session regression tooling**: `npm run test:session` from repo root or `banking_api_server` (focused Jest subset); `npm run test:e2e:session` in `banking_api_ui` (Playwright `request` smoke only); `GET /api/auth/session` contract tests for `sessionStoreHealthy` / `sessionStoreError` with production-shaped middleware; Playwright API smoke `session-regression.spec.js`; runbook `docs/runbooks/session-regression.md`
- **Session debugging**: expanded `GET /api/auth/debug` (`oauthTokenSummary`, `diagnosisHints`, optional `?deep=1` Redis vs `req.session`, `sessionInMemoryCache`); `GET /api/auth/session` includes `sessionStoreHealthy`; Banking Agent session-fix copy + deep debug link — see `REGRESSION_LOG.md`, `FEATURES.md`
- Left-side rail: **HOME** (`/`) and role-based **Admin** (`/admin`) / **Dashboard** (`/dashboard`) links (signed-in dashboard button); stack positions use `App--has-nav-dash` when both rows show
- **Banking admin** page (`/admin/banking`): account lookup by number fragment (default `123`), latest activity, seed fake charges, delete account/transaction; API `GET/POST /api/admin/banking/*`
- Admin dashboard: retry `/api/admin/stats` up to 3× on transient 401 with “Reconnecting to admin API…”
- Logout full-screen wait overlay (`LoadingOverlay` + `sessionStorage` `banking_logout_pending`) so sign-off stays visible through `/api/auth/logout` → PingOne → `/logout` reload
- Admin OAuth: configurable token endpoint client authentication (`basic` default, `post` via `PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH` / `admin_token_endpoint_auth_method`) to match PingOne “Client Secret Post” / “Client Secret Basic”
- Transaction consent challenge (high-value transfers) — API `transactionConsentChallenge.js`, routes on `transactions.js`, UI `TransactionConsentPage.js`, and tests `transaction-consent-challenge.test.js`
- Human-in-the-loop (HITL) education panel and MCP local HITL tests (`HumanInLoopPanel.js`, `mcp-local-hitl.test.js`)
- `banking_api_ui` helpers: `resolveApiBaseUrl.js` (CRA proxy–friendly API base URL), `agentAccessConsent.js`, `constants/transactionThresholds.js`
- `banking_mcp_server/tests/helpers/integrationAxiosMock.ts` — shared axios mock for integration tests

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column

- **Transactions admin page** / **OAuth debug log** / **BankingAdminOps**: removed invalid **`setError`** calls and **`toast.error`** without import; errors use **`notifyError`** / **`toastAdminSessionError`**
- **McpInspector** / **EmbeddedAgentDock**: ESLint JSX spacing and **`no-useless-computed-key`** for CSS variables (CI **`CI=true` build**)
- **Playwright Banking Agent E2E** (`banking-agent.spec.js`): collapse locator scoped to header tools; MCP actions scoped to `.ba-action-item` (avoids suggestion-chip collisions); forms assert **Account** selects and `#field-*` ids — see `REGRESSION_LOG.md`, `npm run test:e2e:agent`
- **HITL transaction consent (API)**: Wire **`POST /api/transactions/consent-challenge`** and **`POST /api/transactions/consent-challenge/:id/confirm`**, and enforce session-bound consent on **`POST /api/transactions`** for non-admin high-value writes (**> $500**) — `REGRESSION_LOG.md`, `transactionConsentChallenge.js`, `routes/transactions.js`
- **Customer dashboard blank / no user data**: **`/api/accounts/my`** and **`/api/transactions/my`** are fetched **separately** (transactions require scopes — **403** no longer fails the whole load); **normalize** API rows (`balance`, **`createdAt`/`created_at`**); **sample demo data** when the API returns no accounts, when transactions are **403**, on **401** soft-fail, on session-missing path, or generic errors; **empty transactions** row when accounts loaded but history is empty
- **False “session expired” (customer dashboard)**: **`GET /api/accounts/my`** / **`/api/transactions/my`** now **retry on 401** (session/JWT lag); if the BFF still reports a user via **`resolveSessionUser`**, show a **single** soft warning toast (stable **`toastId`**) instead of “session expired”; **hard** expiry uses **`toastCustomerError`** with **`toastId: customer-auth-required`** so duplicate Sign-in toasts do not stack; agent-driven refresh uses **one** delayed fetch instead of two
- **Banking Agent → customer dashboard**: **`UserDashboard`** listens for **`banking-agent-result`** and refreshes accounts/transactions; **`BankingAgent`** always dispatches that event (not only “full page” mode), infers **transfer/deposit/withdraw** MCP payloads, and after writes calls **`get_my_transactions`** so the results panel and main page both show up-to-date activity
- **RFC 8693 MCP token exchange**: **no** forwarding the user access token to MCP when `mcp_resource_uri` is unset — **503** `mcp_resource_uri_required`; **≥5** distinct OAuth scopes on the user JWT (configurable `MIN_USER_SCOPES_FOR_MCP_EXCHANGE`) before exchange — **403**; admin + end-user **authorize** scopes now include **PingOne banking scopes** from `getScopesForUserType` so tokens can be narrowed for MCP
- **NL `get_account_balance` “Account optional not found”**: LLM prompts no longer use **`accountId":"optional"`**; **`nlIntentSanitize`** strips placeholder **`optional`**; **`mcpLocalTools.get_account_balance`** treats it as missing account id
- **Floating Banking Agent**: **scroll** chat / left rail (flex **`min-height: 0`**, **`touch-action: pan-y`**); **expand (⊞)** results panel **repositioned** beside the centered expanded agent (`useMemo` + `calc(50vw)`)
- **HOME rail**: signed-in users go to **`/welcome`** (marketing **LandingPage**); **Admin** / **Dashboard** FABs still open app dashboards
- **Demo config save / `invalid_token` toast**: when the OAuth access token stored in the BFF session is expired or fails JWKS validation but the session cookie and `session.user` are still valid, **`authenticateToken`** now falls back to **`session.user`** (same trust model as `_cookie_session`) instead of returning **401 `invalid_token`**
- **API Traffic viewer**: 🌐 **API** FAB and education bar open `/api-traffic` in a **new browser window** (same pattern as Logs) so the tracker can be moved to another monitor; removed the in-page overlay that was stuck to the main window
- **HOME rail button**: navigates to role home (`/admin` or `/dashboard` when signed in) and scrolls to top so “home” matches the main dashboard and the first screen is visible
- **Code quality (API server)**: removed dead `OAuthUserService.validateToken` (broken `jwt` reference); `GET /api/tokens/:tokenId` now returns the matching chain entry from shared `buildTokenChain` (with `knownIds` on 404); cleaned unused imports/vars across `auth.js`, `users.js`, `demoScenario`, `activityLogger`, `sampleData`, `upstashSessionStore`, `adminConfig`, `oauthService`, `pingOneAgentUserService`, `test-admin-scopes`, `server.js`, `oauthErrorHandler`
- **BankingAgent / Api Traffic**: stopped infinite `userAuthenticated` ↔ `checkSelfAuth` loop that hammered `/api/auth/oauth/*` and `/api/auth/session` (see `REGRESSION_LOG.md`)
- **Transfers**: removed the extra **$50 minimum** on `POST /api/transactions` (and consent-challenge validation, MCP/local inspector tools) so savings and other accounts can send **any amount ≥ $0.01** up to balance — the old rule blocked a second transfer when savings fell below $50 or small amounts from savings
- **Transfer / deposit / withdraw**: refresh accounts + transactions without full-page loading; do not clear transaction list on malformed API payload; `provisionDemoAccounts` no longer deletes all user transactions when no accounts were removed (prevents wiped history on edge-case provision)
- **Customer dashboard**: resilient `GET /api/accounts/my` via `fetchMyAccountsWithResilience` (401 / 5xx+503 / empty-list retries) and empty-state **Retry loading accounts**; `accountsHydration.test.js`
- **Logout**: Defer removing `userLoggedOut` until `POST /api/auth/clear-session` completes; treat `/logout` as post-logout landing — fixes needing to click Log out twice
- **Admin OAuth token exchange**: `exchangeCodeForToken` now applies the same basic/post client auth as `refreshAccessToken` (previously always sent `Authorization: Basic` even when PingOne expected `client_secret` in body)
- **Vercel UI build (ESLint)**: `App.js` `import/first` — `axios.defaults.withCredentials` moved below all imports; `ApiTrafficPage.js` removed unused `subscribe` import (CI treats warnings as errors)
- **BFF / Vercel**: Global rate limiter excluded dashboard hot paths (`/api/demo-scenario`, `/api/tokens`, `/api/auth/session`, OAuth `/status` endpoints) so shared IPs no longer hit 429 during normal hydration
- **OAuth session drift**: `refreshIfExpiring` runs on `/api/auth/oauth` so access tokens refresh before OAuth status handlers; reduces 401 on `/api/accounts/my` when status still showed authenticated
- **SPA**: `axios.defaults.withCredentials`; `bffAxios` / `apiClient` use `resolveApiBaseUrl()` for same-host dev proxy; `fetchDemoScenario` coalesces concurrent GETs; `UserDashboard` disables auto-refresh and skips pending refetch on 401
- **MCP server**: `BankingAPIClient` detects axios-shaped errors when Jest mocks omit `axios.isAxiosError`; integration tests aligned with tool output and axios mocks
- **Floating BankingAgent**: panel no longer collapses immediately after opening — auth/`user`/`userAuthenticated` handlers stopped resetting `isOpen`; default open/closed follows **route** only (`bankingAgentFloatingDefaultOpen.js`, `REGRESSION_LOG.md`)
- **OAuth callbacks**: if `req.session.save()` fails after token exchange, destroy session, clear `_auth`, redirect to `/login?error=session_persist_failed` instead of `?oauth=success` (`oauthUser.js`, `oauth.js`, `Login.js`, `REGRESSION_LOG.md`)

### Changed

- **`FEATURES.md`**: Agent MCP token service row now documents **RFC 8693** requirements (`mcp_resource_uri`, min user scopes, no user-token passthrough)
- **Embedded Banking Agent**: dock is **in the page layout** at the bottom of `<main>` (scrollable dashboard above, assistant strip below) instead of `position: fixed` over the viewport; full-width bar, no floating card inset; default chat area height **280px** (resizable)
- **Floating BankingAgent**: default panel **260×210** (~half prior 520×420); left column **112px**; results panel **220px** wide; expanded mode **320×260**; resize clamps **180×140–450×310**
- Admin OAuth `/authorize` `login_hint` set to `bankadmin` (was `admin`) for PingOne username hint
- Logout: delay before navigating to `/api/auth/logout` increased to 420ms so the wait overlay can paint; `LoadingOverlay` also shown during the initial `loading` gate when logout is in progress
- Banking agent UI/CSS, education bar and panels (Step-up, RFC index, commands, `EducationPanelsHost`), NL intent parser/sanitize and Gemini wiring, MCP local tools registry
- `apiClient.session.test.js` — assert OAuth request interceptor at correct `interceptors.request.use` index

### Removed

---

## [2026.03.26-V3]

### Added

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column

### Changed

### Removed

---

## [2026.03.26.v2]

### Added
- `scripts/setup-vercel-env.js` — interactive Vercel environment wizard: detects conflicts, validates Upstash connectivity, generates SESSION_SECRET, and optionally pushes to Vercel CLI
- `npm run setup:vercel` and `npm run setup:vercel:check` scripts
- README.md Vercel Deployment section covering setup wizard, required vars, common issues, and post-deploy verification checklist

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column
- Session store switched from `@upstash/redis` to `@vercel/kv` (confirmed direct dep); resolves `sessionStoreHealthy: false` caused by version mismatch
- `ping()` now returns `{ healthy, error }` — actual error message visible in `/api/auth/debug` as `sessionStoreError`
- Pre-existing `useEffect` missing-dependency lint error in `UserDashboard.js` (blocked Vercel build)
- `SESSION_NOT_HYDRATED_CHAT` UI message updated to point at `sessionStoreError` for diagnosis

### Changed

### Removed

---

## [2026.03.26]

### Added

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column

### Changed

### Removed

---

## [2026.03.25]

### Added
- `services/faultTolerantStore.js` — extracted Redis store wrapper into a testable module
- `services/redisWireUrl.js` — resolves Redis wire-protocol URLs from multiple env var formats
- `services/bffSessionGating.js` — detects cookie-only BFF sessions and shapes MCP no-bearer responses
- `src/__tests__/session-store-resilience.test.js` — 18 tests covering Redis fault-tolerance and `awaitSessionRedisReady`
- `src/__tests__/oauth-login-resilience.test.js` — 3 tests covering non-fatal `session.save()` on login
- `src/__tests__/redisWireUrl.test.js` — unit tests for Redis URL resolution helper
- `src/__tests__/bffSessionGating.test.js` — unit tests for BFF session gating helpers
- `.github/workflows/test.yml` — GitHub Actions CI runs API server and UI tests on every push/PR
- `REGRESSION_LOG.md` — running record of production bugs and the tests that prevent recurrence
- `CHANGELOG.md` (this file)
- `FEATURES.md` — living inventory of all user-visible features with key file references
- `scripts/release.js` — automates changelog versioning and git tagging on each deploy

### Fixed
- **Marketing page dock background** — replaced near-black dock chrome (#08142a / #0d1f3a / #1f2937) with light slate tones (#f1f5f9 / #e2e8f0 / #e8edf3); borders #000000 u2192 #cbd5e1; text and icon colors updated for contrast on light background; box-shadow softened; FAB and inner chat panel dark theme unchanged
- **ExchangeModeToggle card** — replaced dark-theme palette (#1e293b bg, #334155 borders, #94a3b8 text) with light-theme equivalents (#f8fafc, #e2e8f0, #475569); hover/active pill states updated from light-blue-on-dark to dark-blue-on-light; card now matches the white TokenChainDisplay card in the token rail column
- Redis cold-start 500 on `/api/accounts/my`: `RedisStore.get()` error now returns empty session (→ 401) instead of propagating as a 500. See `REGRESSION_LOG.md`.
- `?error=session_error` redirect before PingOne login: `session.save()` failure is now a warning; redirect to PingOne proceeds. See `REGRESSION_LOG.md`.
- Eager Redis connect race condition: `redisClient.connect()` now called at module load time so the TLS handshake overlaps with cold-start overhead. See `REGRESSION_LOG.md`.
- `userEmail: null` in session debug: ID token claims are now merged into userinfo before `createUserFromOAuth`; `email_address` used as fallback claim. See `REGRESSION_LOG.md`.
- Two E2E scope tests incorrectly expected 403 on scope-free `/my` dashboard routes — updated to assert 200 and test scope enforcement on collection endpoints instead.

### Changed
- CIBA guide FAB: width now capped via CSS custom properties (`--stack-fab-used-width`) to prevent overflow on small viewports
- Agent layout preference (`handleModeChange`) is now `async` and awaits server persistence before navigating — prevents embedded mode reverting to floating on refresh
- `persistBankingAgentUiMode` returns `Promise<boolean>` (was `Promise<void>`); callers show `toast.warn` on failure
- `server.js` Redis store wrappers replaced by `createFaultTolerantStore` from the new extracted module

---

## [2026.03.01] — baseline

Initial working demo deployed to Vercel with:
- Customer and admin OAuth login via PingOne (Authorization Code + PKCE)
- Banking dashboard: accounts, transactions
- Admin panel: user management, activity logs, stats
- CIBA backchannel authentication flow
- Banking AI agent (floating and embedded modes)
- MCP server integration
- Upstash Redis session store
