# Feature Inventory

Every user-visible feature in Super Banking, grouped by area.
Update this file when a feature is **added**, **removed**, or when test coverage changes.

<!-- SESSION 2026-04-21: Contextual RFC education -->

**Column guide:**
- `Status`: `active` | `experimental` | `disabled` | `removed` (include last version if removed)
- `Test file`: path relative to project root. `—` means no automated test — consider adding one.

**Path prefixes used in the Test file column:**
- `s:` = `banking_api_server/src/__tests__/`
- `u:` = `banking_api_ui/src/`

To recover a removed feature:
```bash
# Find which commit changed the file
git log --oneline <last-version-tag>..HEAD -- <key-file>

# Restore the file from the last good tag
git checkout <last-version-tag> -- <key-file>
```

---

## Authentication

| Feature | Status | Key files | Test file |
|---|---|---|---|
| Customer sign-in — Authorization Code + PKCE | active | `banking_api_server/routes/oauthUser.js` | `s:oauth-e2e-integration.test.js`, `s:oauth-login-resilience.test.js` |
| Admin sign-in — Authorization Code + PKCE (`login_hint=bankadmin`) | active | `banking_api_server/routes/oauth.js`, `banking_api_server/services/oauthService.js` | `s:oauth-e2e-integration.test.js`, `s:oauthService.test.js` |
| CIBA backchannel authentication (customer approval via mobile) | active | `banking_api_server/routes/ciba.js`, `banking_api_server/services/cibaService.js`, `banking_api_server/services/cibaEnhanced.js`, `banking_api_ui/src/components/CIBAPanel.js` | `s:ciba.test.js`, `s:cibaService.test.js` |
| PKCE state cookie fallback (resilient login on Redis failure) | active | `banking_api_server/services/pkceStateCookie.js` | `s:oauth-login-resilience.test.js` |
| Session restore from `_auth` cookie (resilient dashboard on Redis failure) | active | `banking_api_server/services/authStateCookie.js` | `s:authStateCookie.test.js` |
| Token refresh (silent re-auth) | active | `banking_api_server/routes/tokens.js`, `banking_api_server/services/tokenRefresh.js` | `s:tokenRefresh.test.js` |
| Token revocation on logout | active | `banking_api_server/services/tokenRevocation.js` | `s:tokenRevocation.test.js` |
| Token introspection debug endpoint | active | `banking_api_server/routes/tokens.js`, `banking_api_server/services/tokenValidationService.js` | `s:tokenIntrospection.test.js` |
| Unified `/api/auth/logout` (user + admin) | active | `banking_api_server/server.js`, `banking_api_server/routes/oauth.js`, `banking_api_server/routes/oauthUser.js` | `s:oauth-e2e-integration.test.js` |
| Logout — full-screen wait overlay (persists across PingOne redirect to `/logout`) | active | `banking_api_ui/src/App.js`, `banking_api_ui/src/components/shared/LoadingOverlay.js` | `u:__tests__/App.session.test.js` |
| Admin OAuth — token endpoint client authentication (`basic` or `post`, must match PingOne app) | active | `banking_api_server/config/oauth.js`, `banking_api_server/services/oauthService.js`, `banking_api_server/services/configStore.js` | `s:oauthService.test.js` |
| `POST /api/auth/clear-session` — belt-and-suspenders cookie clear after logout chain | active | `banking_api_server/server.js` | `s:oauth-e2e-integration.test.js` |
| Session debug `GET /api/auth/debug` (diagnosis hints, optional `?deep=1` Redis probe vs `req.session`) | active | `banking_api_server/server.js`, `banking_api_server/services/upstashSessionStore.js` (`getPersistenceDebug`) | `s:upstashSessionStore.test.js` |
| BFF `GET /api/auth/session` includes `sessionStoreHealthy` + `cookieOnlyBffSession` | active | `banking_api_server/server.js`, `banking_api_server/routes/auth.js` | — |
| Login — `error=session_persist_failed` when OAuth callback cannot persist session | active | `banking_api_ui/src/components/Login.js`, `banking_api_server/routes/oauthUser.js`, `banking_api_server/routes/oauth.js` | — |
| Session reliability P0–P3 — retry delays, Upstash re-fetch, reconnecting banner, role-switch endpoint, fatal session.regenerate | active | `banking_api_server/server.js`, `banking_api_server/routes/oauth.js`, `banking_api_server/routes/oauthUser.js`, `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/App.js` | — |
| `POST /api/auth/switch` — role-switch endpoint clears session + redirects to correct login URL | active | `banking_api_server/server.js` | — |
| Customer authorize — optional **`use_pi_flow=1`** on `GET /api/auth/oauth/user/login` forces **`response_type=pi.flow`** (`oauthUserService` `forcePiFlow`) for supported PingOne apps | active | `banking_api_server/services/oauthUserService.js`, `banking_api_server/routes/oauthUser.js` | `s:oauthUserService.test.js` |
| End-user OAuth callback **errors** redirect to **`postLoginReturnToPath` or `/marketing`** (not `/login`); **`App.js`** toasts via **`endUserOAuthErrorToast.js`** | active | `banking_api_server/routes/oauthUser.js`, `banking_api_ui/src/App.js`, `banking_api_ui/src/utils/endUserOAuthErrorToast.js` | — |

---

## Marketing & public landing

| Feature | Status | Key files | Test file |
|---|---|---|---|
| Customer sign-in mode — **Redirect** (code + PKCE) vs **slide panel + pi.flow** (`marketing_customer_login_mode`); demo username/password hints | active | `banking_api_server/services/configStore.js`, `banking_api_ui/src/components/LandingPage.js`, `LandingPage.css`, `Config.js`, `DemoDataPage.js`, `banking_api_ui/src/services/configService.js` | `u:components/__tests__/DemoDataPage.test.js` (config load/save surface) |
| BankingAgent on marketing — customer login respects marketing mode (`use_pi_flow` when slide) + `return_to=/marketing` for agent-driven OAuth | active | `banking_api_ui/src/components/BankingAgent.js` | `s:bankingAgentNl.test.js`, `u:utils/__tests__/embeddedAgentFabVisibility.test.js` |
| Landing page — condensed hero and section spacing | active | `banking_api_ui/src/components/LandingPage.css`, `LandingPage.js` | — |
| Unified Token Flow Inspector — Merged Agent Request Flow + OAuth Token Inspector | active | `banking_api_ui/src/components/UnifiedTokenFlowInspector.jsx`, `UnifiedTokenFlowInspector.css`, `banking_api_ui/src/App.js` (route `/agent-flow-inspector`) | — |

---

## Banking — Customer

| Feature | Status | Key files | Test file |
|---|---|---|---|
| Account overview (`/my` — scope-free BFF dashboard) | active | `banking_api_server/routes/accounts.js`, `banking_api_ui/src/components/Accounts.js` | `s:integration/completeFlow.test.js` |
| Transaction history (`GET /my` — requires `banking:transactions:read` or `banking:read`) | active | `banking_api_server/routes/transactions.js`, `banking_api_ui/src/components/Transactions.js` | `s:transaction-flows.test.js`, `s:scope-integration.test.js`, `s:oauth-scope-integration.test.js` |
| Customer dashboard page (Banking Agent **`banking-agent-result`** refresh; 401 retry + soft session warning; **`dashboardToast`** dedupe) | active | `banking_api_ui/src/components/UserDashboard.js`, `banking_api_ui/src/services/accountsHydration.js`, `banking_api_ui/src/utils/dashboardToast.js` | `accountsHydration.test.js` |
| Step-up authentication gate (high-value transactions) | active | `banking_api_server/middleware/authorizeGate.js`, `banking_api_server/middleware/stepUpGate.js` | `s:step-up-gate.test.js`, `s:authorize-gate.test.js` |
| PingOne Authorize — Decision Endpoints evaluation (Phase 2) | active | `banking_api_server/services/pingOneAuthorizeService.js`, `banking_api_server/routes/transactions.js` | — |
| PingOne Authorize — Recent Decisions API (Phase 3) | active | `banking_api_server/routes/authorize.js` | — |
| Transaction consent challenge (high-value transfers — PingOne-style consent) | active | `banking_api_server/services/transactionConsentChallenge.js`, `banking_api_server/routes/transactions.js`, `banking_api_ui/src/components/TransactionConsentPage.js` | `s:transaction-consent-challenge.test.js` |
| OTP email verification for high-value transactions (after consent) | active | `banking_api_server/services/emailService.js` (`sendOtpEmail`), `banking_api_server/services/transactionConsentChallenge.js` (`verifyOtp`), `banking_api_server/routes/transactions.js`, `banking_api_ui/src/components/TransactionConsentModal.js` | `s:transaction-consent-challenge.test.js` |
| Agent blocked after consent decline (until re-auth) | active | `banking_api_ui/src/services/agentAccessConsent.js`, `banking_api_ui/src/components/BankingAgent.js` | — |
| Delegated Access — grant family member access to 1+ accounts; RFC 8693 Act-as explainer | active | `banking_api_ui/src/components/DelegatedAccessPage.js`, `banking_api_ui/src/components/DelegatedAccessPage.css` | `u:components/__tests__/DelegatedAccessPage.test.js` |
| Token Exchange Simulator — live 2-col Act-as inspector: token chain left, JWT claims + API call right; fires real POST /api/mcp/tool | active | `banking_api_ui/src/components/DelegatedAccessPage.js` (`TokenExchangeSimulator`, `SimEventRow`, `SimEventDetail`) | `u:components/__tests__/DelegatedAccessPage.test.js` |

---

## Banking — Admin

| Feature | Status | Key files | Test file |
|---|---|---|---|
| Admin dashboard / stats | active | `banking_api_server/routes/admin.js`, `banking_api_ui/src/components/Dashboard.js` | — |
| Banking admin — account lookup, seed fake charges, delete account/tx | active | `banking_api_server/routes/admin.js` (`/banking/lookup`, `/banking/accounts/:id/seed-charges`), `banking_api_ui/src/components/BankingAdminOps.js` | — |
| PingOne scope configuration — auto-create/update scopes, grant to applications, remove deprecated scopes | active | `banking_api_server/routes/admin.js` (`POST /api/admin/pingone/update-scopes`), `banking_api_server/services/pingoneScopeUpdateService.js`, `banking_api_ui/src/components/BankingAdminOps.js` | — |
| User management (list, create, update, delete) | active | `banking_api_server/routes/users.js`, `banking_api_ui/src/components/Users.js` | `s:auth.test.js` |
| Activity log viewer | active | `banking_api_server/routes/admin.js`, `banking_api_ui/src/components/ActivityLogs.js`, `banking_api_ui/src/components/LogViewerPage.js` | `s:logs.test.js`, `u:components/__tests__/LogViewer.test.js` |
| OAuth verbose debug log | active | `banking_api_server/routes/admin.js`, `banking_api_server/services/oauthVerboseLogStore.js`, `banking_api_ui/src/components/OAuthDebugLogViewer.js` | — |
| Runtime settings (env config override via UI) | active | `banking_api_server/routes/adminConfig.js`, `banking_api_ui/src/components/Config.js` | `s:runtime-settings-api.test.js` |
| Bootstrap export (export demo data as JSON) | active | `banking_api_server/routes/admin.js` | — |
| Account collection endpoint (admin, scoped) | active | `banking_api_server/routes/accounts.js` | `s:scope-integration.test.js`, `s:oauth-scope-integration.test.js` |
| Transaction collection endpoint (admin, scoped) | active | `banking_api_server/routes/transactions.js` | `s:scope-integration.test.js`, `s:oauth-e2e-integration.test.js` |
| Demo data reset | active | `banking_api_server/routes/accounts.js`, `banking_api_ui/src/components/DemoDataPage.js` | `s:demoMode.test.js`, `u:components/__tests__/DemoDataPage.test.js` |
| Client (OAuth app) registration | active | `banking_api_server/routes/clientRegistration.js`, `banking_api_ui/src/components/ClientRegistrationPage.js` | `s:clientRegistration.test.js` |
| MCP audit trail admin UI — floating/popout table of MCP tool-call events; columns: Time, Event Type, Agent ID, User ID, Tool/Operation, Outcome, Duration; filter by Agent ID, tool/operation, event type, outcome; expandable detail shows scope, tokenType, requestSummary | active | `banking_api_ui/src/components/AuditPage.js`, `banking_api_ui/src/components/AuditPage.css` | — |

---

## AI Banking Agent

| Feature | Status | Key files | Test file |
|---|---|---|---|
| Agent UI placement — Middle / Bottom / Float + optional FAB | active | `banking_api_ui/src/context/AgentUiModeContext.js`, `banking_api_ui/src/components/AgentUiModeToggle.js` | `u:context/__tests__/AgentUiModeContext.test.js`, `u:utils/__tests__/embeddedAgentFabVisibility.test.js` |
| Floating agent FAB (Float placement) | active | `banking_api_ui/src/components/BankingAgent.js` | `u:utils/__tests__/embeddedAgentFabVisibility.test.js` |
| Bottom embedded dock — integrated, drag-to-resize, flush to content | active | `banking_api_ui/src/components/EmbeddedAgentDock.js` | `u:context/__tests__/AgentUiModeContext.test.js` |
| Middle split-column agent — slim token rail, 3-column grid | active | `banking_api_ui/src/components/UserDashboard.js`, `banking_api_ui/src/components/UserDashboard.css` | — |
| Agent ↔ customer dashboard sync (`banking-agent-result`; post-write **`get_my_transactions`**) | active | `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/UserDashboard.js` | — |
| Agent layout preference persisted to server | active | `banking_api_ui/src/services/demoScenarioService.js`, `banking_api_server/routes/demoScenario.js` | `s:demo-scenario-api.test.js` |
| Agent chip groups — collapsible sections with count badges, collapse-all toolbar, "⊞ All actions" discovery popout with live search (Phase 231) | active | `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/BankingAgent.css` | `u:components/__tests__/BankingAgent.chips.test.js` |
| Natural-language banking intents (NL → API) | active | `banking_api_server/routes/bankingAgentNl.js`, `banking_api_server/services/nlIntentParser.js`, `banking_api_ui/src/services/bankingAgentNlService.js` | `s:bankingAgentNl.test.js`, `s:nlIntentParser.test.js` |
| NL intent sanitization | active | `banking_api_server/services/nlIntentSanitize.js` | `s:nlIntentSanitize.test.js` |
| Gemini NL backend | active | `banking_api_server/services/geminiNlIntent.js` | `s:nlIntentParser.test.js` |
| Groq NL backend | active | `banking_api_server/services/groqNlIntent.js` | `s:nlIntentParser.test.js` |
| Agent identity / impersonation (act-as) | active | `banking_api_server/routes/agentIdentity.js`, `banking_api_server/services/agentIdentityStore.js` | — |
| Agent delegation endpoint (Option D) — external platforms pre-fetch delegated token via `POST /api/agent/delegate` | active | `banking_api_server/routes/agentDelegation.js` | — |
| Cookie-only / stub-token session messaging + deep session debug link (`/api/auth/debug?deep=1`) | active | `banking_api_ui/src/components/BankingAgent.js` | — |
| Session reconnecting banner — polls `/api/auth/session` every 2s while `cookieOnlyBffSession:true` | active | `banking_api_ui/src/components/BankingAgent.js` | — |
| Always on-behalf-of — RFC 8693 actor_token always used when `AGENT_OAUTH_CLIENT_ID` set; `on-behalf-of-warning` Token Chain event when unset | active | `banking_api_server/services/agentMcpTokenService.js` | `s:agentMcpTokenService.test.js` |
| Left-dock layout — collapsible left sidebar, width-resizable | active | `banking_api_ui/src/context/AgentUiModeContext.js`, `banking_api_ui/src/components/SideAgentDock.js`, `banking_api_ui/src/components/SideAgentDock.css` | `u:context/__tests__/AgentUiModeContext.test.js` |
| Right-dock layout — collapsible right sidebar, width-resizable | active | `banking_api_ui/src/context/AgentUiModeContext.js`, `banking_api_ui/src/components/SideAgentDock.js`, `banking_api_ui/src/components/SideAgentDock.css` | `u:context/__tests__/AgentUiModeContext.test.js` |
| Sensitive data consent banner — in-UI prompt before `get_sensitive_account_details` releases full account/routing numbers; user must approve before agent receives the data | active | `banking_api_ui/src/components/SensitiveConsentBanner.js`, `banking_api_ui/src/components/BankingAgent.js` | — |
| Token chain history persistence — `localStorage` write-through (debounced 300ms); hydrated on mount; cleared on logout; survives page refresh | active | `banking_api_ui/src/context/TokenChainContext.js` | — |

---

## MCP Server Integration

| Feature | Status | Key files | Test file |
|---|---|---|---|
| MCP server WebSocket client | active | `banking_api_server/services/mcpWebSocketClient.js` | — |
| MCP local tools (fallback when external MCP unavailable) | active | `banking_api_server/services/mcpLocalTools.js` | `s:mcp-local-hitl.test.js` |
| MCP inspector UI (test MCP tools in-browser) | active | `banking_api_server/routes/mcpInspector.js`, `banking_api_ui/src/components/McpInspector.js`, `banking_api_ui/src/components/McpInspectorSetupWizard.js` | `s:mcp-inspector.test.js` |
| Agent MCP token service (RFC 8693 — requires `mcp_resource_uri`, min user scopes; no user-token passthrough) | active | `banking_api_server/services/agentMcpTokenService.js` | `s:agentMcpTokenService.test.js` |
| BFF session gating (MCP no-bearer response) | active | `banking_api_server/services/bffSessionGating.js` | `s:bffSessionGating.test.js` |
| CIMD simulator panel | active | `banking_api_ui/src/components/CimdSimPanel.js` | `u:components/__tests__/CimdSimPanel.test.js` |
| `GET /.well-known/mcp-server` — public MCP server discovery manifest (capabilities, tools list, OAuth metadata location); consumed by agents during handshake | active | `banking_mcp_server/src/server/HttpMCPTransport.ts` | — |
| `sequential_think` MCP tool — step-by-step chain-of-thought reasoning for complex banking decisions (transfer eligibility, loan assessment); returns titled reasoning steps + conclusion | active | `banking_mcp_server/src/tools/BankingToolRegistry.ts`, `banking_mcp_server/src/tools/BankingToolProvider.ts` | — |
| `get_sensitive_account_details` MCP tool — full account and routing numbers; requires `banking:sensitive:read` scope and explicit user consent via `SensitiveConsentBanner` before data is released | active | `banking_mcp_server/src/tools/BankingToolRegistry.ts`, `banking_mcp_server/src/tools/BankingToolProvider.ts` | — |
| MCP audit trail — `GET /audit` on MCP server returns recent tool-call audit events; supports `agentId`, `operation`, `outcome`, `eventType` filters | active | `banking_mcp_server/src/server/HttpMCPTransport.ts`, `banking_mcp_server/src/utils/AuditLogger.ts` | — |
| MCP AuditLogger — Redis-backed (Upstash) persistence for every MCP tool-call audit event; LPUSH + LTRIM (500 max); 7-day TTL; records `agentId`, `scope`, `tokenType`, `requestSummary`, `responseSummary`; fire-and-forget (non-fatal on Redis failure) | active | `banking_mcp_server/src/utils/AuditLogger.ts` | — |
| BFF audit proxy `GET /api/mcp/audit` — proxies to MCP server `/audit`; passes `agentId`, `operation`, `eventType`, `outcome`, `limit` filters; returns empty fallback when MCP unreachable | active | `banking_api_server/routes/mcpAudit.js` | — |

---

## Education / Demo Guides

| Feature | Status | Key files | Test file |
|---|---|---|---|
| AI Primer enablement guide | active | `banking_api_ui/src/components/education/AiPrimerPanel.js` | — |
| Education bar (persistent guide launcher) | active | `banking_api_ui/src/components/EducationBar.js` | — |
| Education drawer / modal shell | active | `banking_api_ui/src/components/shared/EducationDrawer.js`, `banking_api_ui/src/components/shared/EducationModal.js` | `u:components/shared/__tests__/EducationDrawer.test.js` |
| Login flow guide | active | `banking_api_ui/src/components/education/LoginFlowPanel.js` | — |
| Token chain display + guide | active | `banking_api_ui/src/components/TokenChainDisplay.js`, `banking_api_ui/src/components/education/TokenChainPanel.js` | — |
| Token Inspector panel — floating draggable/resizable/collapsible detail popup per token event | active | `banking_api_ui/src/components/TokenChainDisplay.js`, `banking_api_ui/src/components/TokenChainDisplay.css` | — |
| Token introspection guide | active | `banking_api_ui/src/components/education/IntrospectionPanel.js` | — |
| Token exchange guide | active | `banking_api_ui/src/components/education/TokenExchangePanel.js` | — |
| Step-up auth guide | active | `banking_api_ui/src/components/education/StepUpPanel.js` | — |
| CIBA / CIMD guide | active | `banking_api_ui/src/components/education/CimdPanel.js` | — |
| Agent gateway guide | active | `banking_api_ui/src/components/education/AgentGatewayPanel.js` | — |
| MCP protocol guide | active | `banking_api_ui/src/components/education/McpProtocolPanel.js` | — |
| may_act / act claims guide | active | `banking_api_ui/src/components/education/MayActPanel.js` | — |
| PingOne Authorize guide | active | `banking_api_ui/src/components/education/PingOneAuthorizePanel.js` | — |
| RFC index guide | active | `banking_api_ui/src/components/education/RFCIndexPanel.js` | — |
| Human-in-the-loop (HITL) / consent education | active | `banking_api_ui/src/components/education/HumanInLoopPanel.js` | — |
| AI Agent Best Practices guide (PingOne 5 practices) | active | `banking_api_ui/src/components/education/BestPracticesPanel.js` | — |
| SPIFFE implementation plan | plan | `docs/SPIFFE_PLAN.md` | — |
| Sensitive data access guide — explains `banking:sensitive:read` scope, why explicit consent is required, and the PingOne Authorize + scope enforcement model | active | `banking_api_ui/src/components/education/SensitiveDataPanel.js` | — |

---

## Developer Test Pages

| Feature | Status | Key files | Test file |
|---|---|---|---|
| PingOne Test Page — worker token acquire + verify assets | active | `banking_api_server/routes/pingoneTestRoutes.js`, `banking_api_ui/src/components/PingOneTestPage.jsx` | — |
| PingOne Test Page — AssetTable 6-tab entity explorer (Apps/Resources/Scopes/Users/SPEL/Grants) | active | `banking_api_ui/src/components/PingOneTestPage.jsx` (`AssetTable`), `banking_api_server/routes/pingoneTestRoutes.js` (`verify-assets`) | — |
| PingOne Test Page — token policies (SPEL) + per-app grant matrix in verify-assets | active | `banking_api_server/services/pingoneManagementService.js` (`getTokenPolicies`, `getApplicationGrants`), `banking_api_server/routes/pingoneTestRoutes.js` | — |
| PingOne Test Page — WhatIsHappening edu panels (Token Acquisition, Token Exchange) | active | `banking_api_ui/src/components/PingOneTestPage.jsx` (`WhatIsHappening`), `banking_api_ui/src/components/PingOneTestPage.css` | — |
| PingOne Test Page — RFC 8693 Token Exchange tests (1-hop, 2-hop act-as, 3-hop chain) | active | `banking_api_server/routes/pingoneTestRoutes.js`, `banking_api_ui/src/components/PingOneTestPage.jsx` | — |
| MFA Test Page — SMS OTP + Email OTP challenge/verify flows | active | `banking_api_server/routes/mfaTest.js`, `banking_api_ui/src/components/MFATestPage.jsx` | — |
| MFA Test Page — FIDO2 WebAuthn verify (navigator.credentials.get + assertion POST) | active | `banking_api_server/routes/mfaTest.js`, `banking_api_ui/src/components/MFATestPage.jsx` (`testFidoVerify`) | — |
| MFA Test Page — FIDO2 WebAuthn enrollment complete (navigator.credentials.create + attestation POST) | active | `banking_api_server/routes/mfaTest.js`, `banking_api_ui/src/components/MFATestPage.jsx` (`testFidoEnrollComplete`) | — |
| MFA Test Page — DaResponseCard (DA ID + status + method display) | active | `banking_api_ui/src/components/MFATestPage.jsx` (`DaResponseCard`) | — |
| MFA Test Page — WhatIsHappening edu panels (SMS, Email, FIDO2) | active | `banking_api_ui/src/components/MFATestPage.jsx` (`WhatIsHappening`) | — |
| DecodedTokenPanel — JWT claim glossary hover tooltips | active | `banking_api_ui/src/components/DecodedTokenPanel.jsx` (`CLAIM_GLOSSARY`) | — |
| PingOne Test Page — TokenLineageDiff claim diff for exchange cards | active | `banking_api_ui/src/components/PingOneTestPage.jsx` (`TokenLineageDiff`), `banking_api_ui/src/components/PingOneTestPage.css` | — |
| PingOne Authorize Test Page — PERMIT/STEP UP/DENY live policy evaluation | active | `banking_api_ui/src/components/AuthzTestPage.jsx`, `banking_api_ui/src/components/AuthzTestPage.css`, `banking_api_server/routes/authorize.js` (`test-status`, `test-evaluate`) | — |
| Monitoring pages — Token Chain, Token Diff, Flow Inspector, MCP Traffic, API Explorer (visible to admin + customer) | active | `banking_api_ui/src/App.js`, `banking_api_ui/src/components/AdminSideNav.jsx` | — |

---

## Infrastructure / Platform

| Feature | Status | Key files | Test file |
|---|---|---|---|
| Upstash Redis session store with eager connect | active | `banking_api_server/server.js`, `banking_api_server/services/redisWireUrl.js`, `banking_api_server/services/faultTolerantStore.js` | `s:session-store-resilience.test.js`, `s:redisWireUrl.test.js` |
| Vercel serverless deployment | active | `api/handler.js`, `vercel.json` | — |
| Global rate limit — BFF dashboard paths excluded (demo-scenario, tokens, OAuth status, session) | active | `banking_api_server/server.js` (`shouldSkipGlobalRateLimit`) | — |
| Demo scenario / user preference store (Redis-backed) | active | `banking_api_server/services/demoScenarioStore.js`, `banking_api_server/routes/demoScenario.js` | `s:demo-scenario-api.test.js` |
| Runtime config store (PingOne env vars overrideable at runtime) | active | `banking_api_server/services/configStore.js` | `s:configStore-saas.test.js` |
| Audit logger | active | `banking_api_server/services/auditLogger.js` | `s:auditLogger.test.js` |
| Health check endpoint | active | `banking_api_server/routes/health.js` | `s:health.test.js` |
| Onboarding wizard | active | `banking_api_ui/src/components/Onboarding.js` | — |
| Security settings page | active | `banking_api_ui/src/components/SecuritySettings.js` | — |
| GitHub Actions CI | active | `.github/workflows/test.yml` | — |
| Session regression — `npm run test:session` (API Jest subset) | active | root `package.json`, `banking_api_server/package.json` | `authSession.test.js` (+ pattern in `test:session` script) |
| Session API smoke (Playwright `request`) — `npm run test:e2e:session` | active | `banking_api_ui/tests/e2e/session-regression.spec.js`, `banking_api_ui/package.json` | `session-regression.spec.js` |
| UI browser E2E smoke (Playwright Chromium; mocked API) — `npm run test:e2e:ui:smoke` | active | `banking_api_ui/tests/e2e/customer-dashboard.spec.js`, `landing-marketing.spec.js`, `playwright.config.js` | `customer-dashboard.spec.js`, `landing-marketing.spec.js` |
| Banking Agent FAB E2E — `npm run test:e2e:agent` | active | `banking_api_ui/src/components/BankingAgent.js`, `playwright.config.js` | `banking-agent.spec.js` |
| Configuration page scope management tab — link to admin scope update tool | active | `banking_api_ui/src/components/Config.js` (new Scope Management tab), `banking_api_ui/src/styles/appShellPages.css` (word-break fixes) | — |
