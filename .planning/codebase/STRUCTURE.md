# Structure — BX Finance Banking Demo

*Last updated: April 2026 (Phase 140)*

---

## Top-Level Directory

```
Banking/
├── banking_api_server/        # Node.js BFF + API
├── banking_api_ui/            # React SPA
├── banking_mcp_server/        # MCP WebSocket server (TypeScript)
├── langchain_agent/           # Python LangChain agent (optional/reference)
├── vercel.json                # Deployment config
├── run-bank.sh                # Local dev startup script (ports 4000/3002)
├── .planning/                 # GSD planning artifacts
│   ├── PROJECT.md
│   ├── ROADMAP.md
│   ├── STATE.md
│   ├── REQUIREMENTS.md
│   ├── codebase/              # This codebase map
│   └── phases/                # Phase plan + summary files
└── docs/                      # Documentation
```

---

## `banking_api_server/` — BFF

```
banking_api_server/
├── server.js                  # Entry point — Express app setup, route mounting
├── api/
│   └── handler.js             # Vercel serverless entry wrapper
├── config/
│   ├── oauthAdmin.js          # Admin OAuth client config
│   ├── oauthUser.js           # User OAuth client config + scopes
│   └── ...
├── data/
│   └── store.js               # In-memory data store (accounts, transactions demo data)
├── middleware/
│   ├── auth.js                # authenticateToken, requireSession
│   ├── actClaimValidator.js   # RFC 8693 act/may_act validation
│   ├── agentSessionMiddleware.js
│   ├── delegationAuditMiddleware.js
│   └── ...
├── routes/                    # 47 route files
│   ├── oauth.js               # Admin PKCE flow
│   ├── oauthUser.js           # User PKCE flow (return_to, step-up)
│   ├── oauthToken.js          # Token operations endpoint
│   ├── auth.js                # Session status, logout
│   ├── ciba.js                # CIBA backchannel
│   ├── mfa.js                 # MFA routes
│   ├── mfaTest.js             # MFA test page backend
│   ├── pingoneTestRoutes.js   # PingOne test page backend (tokens, exchanges, assets)
│   ├── bankingAgentRoutes.js  # Banking agent (tool calls)
│   ├── bankingAgentNlRoutes.js  # NL query entry
│   ├── langchainConfig.js     # Agent model config
│   ├── accounts.js            # Banking accounts
│   ├── transactions.js        # Banking transactions
│   ├── admin.js               # Admin operations
│   ├── adminManagement.js     # PingOne management API proxy
│   ├── users.js               # User management
│   ├── tokens.js              # Token operations
│   ├── introspect.js          # RFC 7662 introspection
│   ├── authorize.js           # Authorization endpoint
│   ├── apiCallTracker.js      # API call tracker (per session)
│   ├── mcpExchangeMode.js     # MCP token exchange + WS proxy
│   ├── mcpInspector.js        # MCP debug inspector
│   ├── protectedResourceMetadata.js  # RFC 9728 / .well-known
│   ├── health.js              # Health check + session debug
│   ├── logs.js                # OAuth debug logs
│   ├── scopeAudit.js          # Scope analysis
│   ├── clientRegistration.js  # Dynamic client registration
│   └── ...
├── services/                  # 81 service files
│   ├── configStore.js         # Runtime config (SQLite + env merge)
│   ├── oauthUserService.js    # OAuth PKCE, token exchange
│   ├── bankingAgentLangChainService.js  # LangGraph agent executor
│   ├── pingoneManagementService.js      # PingOne Management API
│   ├── pingOneUserService.js           # User CRUD on PingOne
│   ├── upstashSessionStore.js          # Upstash REST session store
│   ├── sqliteSessionStore.js           # SQLite session store
│   ├── apiCallTrackerService.js        # In-memory per-session API log
│   ├── agentMcpTokenService.js         # MCP token exchange + HITL consent
│   ├── bffSessionGating.js            # Guards against _cookie_session stub
│   ├── authStateCookie.js             # _auth cookie set/read/clear
│   ├── pkceStateCookie.js             # PKCE cookie for Vercel cold-start
│   ├── oauthRedirectUris.js           # Redirect URI derivation
│   ├── tokenIntrospectionService.js   # RFC 7662
│   ├── delegationChainValidationService.js  # RFC 8693 act chain
│   ├── auditLogger.js                 # Structured audit log
│   └── ...
├── scripts/
│   ├── check-env.js           # Required env var validator (run at startup)
│   └── ...
├── __tests__/                 # Single test file (tokenIntrospection)
└── src/
    └── __tests__/             # ~79 test files (unit + integration)
```

---

## `banking_api_ui/` — React SPA

```
banking_api_ui/
├── src/
│   ├── App.js                 # Root: BrowserRouter, route definitions, session check
│   ├── App.css
│   ├── index.js               # ReactDOM.render
│   ├── components/            # 145 files — all page/feature components
│   │   ├── Dashboard.js       # Admin dashboard
│   │   ├── UserDashboard.js   # Customer dashboard
│   │   ├── LandingPage.js     # /marketing — unauthenticated landing
│   │   ├── PingOneTestPage.jsx  # /pingone-test — comprehensive OAuth/token test page
│   │   ├── MFATestPage.jsx     # /mfa-test — comprehensive MFA test page
│   │   ├── BankingAgent.js    # AI agent main component (FAB + chat)
│   │   ├── SideAgentDock.js   # Embedded agent dock
│   │   ├── ChaseTopNav.js     # Chase.com-style top navigation
│   │   ├── ApiCallDisplay.jsx # API call tracker display (polls /api/api-calls)
│   │   ├── DecodedTokenPanel.jsx  # JWT claims display with glossary tooltips
│   │   ├── TokenDisplay.jsx   # Token visualization
│   │   ├── Configuration/
│   │   │   └── UnifiedConfigurationPage.tsx
│   │   ├── agent/             # Agent-specific subcomponents
│   │   ├── dashboard/         # Dashboard subcomponents
│   │   ├── education/         # Educational panels
│   │   ├── oauth/             # OAuth UI components
│   │   ├── shared/            # Shared UI primitives
│   │   └── tour/              # Guided tour components
│   ├── services/
│   │   ├── apiClient.js       # Axios singleton (traffic store, spinner, withCredentials)
│   │   ├── apiTrafficStore.js # Interceptor-based traffic log
│   │   └── spinnerService.js
│   ├── hooks/
│   │   ├── useChatWidget.js
│   │   ├── useCurrentUserTokenEvent.js
│   │   ├── useDemoMode.js
│   │   ├── useDraggablePanel.js
│   │   └── useResourceIndicators.js
│   ├── context/
│   │   ├── AgentUiModeContext.js
│   │   ├── ExchangeModeContext.js
│   │   ├── ThemeContext.js
│   │   ├── TokenChainContext.js
│   │   ├── VerticalContext.js
│   │   └── ...
│   ├── utils/
│   │   ├── appToast.js        # Toast wrapper (react-toastify)
│   │   ├── endUserOAuthErrorToast.js  # Post-OAuth error URL param handling
│   │   ├── authUi.js          # Login redirect helpers
│   │   └── ...
│   ├── pages/                 # Page-level components (thin wrappers)
│   ├── constants/             # Shared constants
│   ├── styles/                # Global CSS
│   └── theme/                 # Theme tokens
├── tests/
│   ├── e2e/                   # Playwright E2E tests
│   └── integration/
└── build/                     # CRA production output (served by BFF)
```

---

## SPA Route Map

| Path | Component | Auth |
|------|-----------|------|
| `/` | `Dashboard` (admin) or `LandingPage` (user) | — |
| `/marketing` | `LandingPage` | none |
| `/admin` | `Dashboard` | admin |
| `/dashboard` | `UserDashboard` | user |
| `/config` → `/configure?tab=pingone-config` | redirect | — |
| `/configure` | `UnifiedConfigurationPage` | none |
| `/pingone-test` | `PingOneTestPage` | user |
| `/mfa-test` | `MFATestPage` | user |
| `/agent` | `BankingAgent` | none |
| `/langchain` | `LangChainPage` | none |
| `/logs` | `LogViewerPage` | user |
| `/api-traffic` | `ApiTrafficPage` | user |
| `/audit` | `AuditPage` | admin |
| `/users` | `Users` | admin |
| `/accounts` | `Accounts` | admin |
| `/transactions` | `Transactions` | admin |
| `/admin/banking` | `BankingAdminOps` | admin |
| `/activity` | `ActivityLogs` | admin |
| `/settings` | `SecuritySettings` | admin |
| `/mcp-inspector` | `McpInspector` | admin |
| `/oauth-debug-logs` | `OAuthDebugLogViewer` | admin |
| `/scope-audit` | `ScopeAuditPage` | admin |
| `/client-registration` | `ClientRegistrationPage` | admin |
| `/delegation` | `DelegationPage` | user |
| `/delegated-access` | `DelegatedAccessPage` | user |
| `/transaction-consent` | `TransactionConsentPage` | user |
| `/profile` | `Profile` | user |
| `/security` | `SecurityCenter` | user |
| `/accounts` (user) | `UserAccounts` | user |
| `/transactions` (user) | `UserTransactions` | user |
| `/postman` | `PostmanCollectionsPage` | none |
| `/setup` | `SetupPage` | none |
| `/demo-data` | `DemoDataPage` | none |
| `/self-service` | `SelfServicePage` | none |
| `/onboarding` | `OnboardingPage` | none |
| `/logout` | `LogoutPage` | none |

---

## Naming Conventions

### Server
- Route files: `camelCase.js` (e.g., `oauthUser.js`, `pingoneTestRoutes.js`)
- Service files: `camelCaseService.js` or `camelCaseStore.js`
- Middleware files: `camelCase.js`
- Test files: `*.test.js` under `src/__tests__/`

### Frontend
- React components: `PascalCase.js` or `PascalCase.jsx` (some `.tsx`)
- CSS modules: `ComponentName.css` colocated with component
- Hooks: `useHookName.js`
- Contexts: `ContextName.js` or `ContextNameContext.js`
- Utils: `camelCase.js`

### CSS Architecture
- Per-component CSS files (`Component.css`) colocated — no shared styles library
- Chase.com-like color scheme: deep navy + gold accent (see `banking_api_ui/src/styles/`)
- Dark mode: `ThemeContext` toggles `data-theme` attribute on `<body>`
