# Codebase Concerns

**Analysis Date:** 2026-03-31

---

## Tech Debt

**Monolithic `server.js` (1,293 lines):**
- Issue: Single file owns session bootstrap (3 store strategies), CORS/helmet setup, all OAuth route mounts, rate limiting, MCP proxy, SSE endpoint, SPA catch-all, and multi-step cold-start session restore middleware.
- Files: `banking_api_server/server.js`
- Impact: Changes to one concern risk breaking unrelated concerns. Hard to test in isolation.
- Fix approach: Extract session-store bootstrap, cold-start middleware, and MCP proxy block into separate modules.

**`agentMcpTokenService.js` (1,019 lines) — dual-path complexity:**
- Issue: `ff_two_exchange_delegation` flag forks into two very different 4-step token chain paths within the same file. The 1-exchange path (legacy) and 2-exchange path (new) share the function but branch at multiple points.
- Files: `banking_api_server/services/agentMcpTokenService.js`
- Impact: A change to shared helper logic (e.g., how `may_act` is injected) could silently break one path while leaving the other working. Cross-path regression is hard to catch without testing both flag states.
- Fix approach: Split `_performOnExchangeDelegation` and `_performTwoExchangeDelegation` into separate service modules; keep `agentMcpTokenService.js` as a thin dispatcher.

**`auth.js` (945 lines) — mixed concerns:**
- Issue: Combines token validation, audience checking, scope enforcement, debug logging utilities, and a large inline `debugTokenInfo` pretty-printer block (lines 370–460) that only runs when `DEBUG_TOKENS=true`.
- Files: `banking_api_server/middleware/auth.js`
- Impact: Any change to token validation logic requires navigating past unrelated debug utilities. Scope logic and audience logic are interleaved.
- Fix approach: Extract `debugTokenInfo` and scope-check helpers into `utils/tokenDebug.js` / `utils/scopeCheck.js`.

**Multiple `eslint-disable react-hooks/exhaustive-deps` in UI components:**
- Issue: `BankingAgent.js` has 8 suppression comments; `UserDashboard.js` has 5. Most are intentional (mount-only effects, interval callbacks) but the volume makes it hard to distinguish intentional from accidental stale closures.
- Files: `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/UserDashboard.js`
- Impact: Stale closure bugs are common in large React components; suppressed warnings prevent ESLint from surfacing new regressions.
- Fix approach: Use `useCallback`/`useRef` patterns to satisfy the linter where possible; document intentional suppression cases explicitly.

**`validation.ts` overuse of `any`:**
- Issue: All 15+ public `validate*` functions in `banking_mcp_server/src/types/validation.ts` accept `any` as their parameter type; `BankingToolValidator.ts` uses `as any` casts for schema property dispatch.
- Files: `banking_mcp_server/src/types/validation.ts`, `banking_mcp_server/src/tools/BankingToolValidator.ts`
- Impact: TypeScript safety is bypassed at the validation boundary — the one place where unknown external data enters the system.
- Fix approach: Use `unknown` for boundary inputs and narrow inside the validators.

**`langchain_agent/` — Python package not wired into CI:**
- Issue: `langchain_agent/` is a Python package (Pipfile, Dockerfile) with no package.json and no test runner hooked into the monorepo CI or pre-commit hook.
- Files: `langchain_agent/`
- Impact: Changes to the BFF MCP API surface could silently break the LangChain agent without any automated signal.
- Fix approach: Add a minimal `pytest` run to CI or document the agent as out-of-scope / deprecated.

---

## Known Bugs & Fragile Patterns

**Cold-start `_cookie_session` stub — 3-layer restore complexity:**
- Symptoms: `GET /api/status` returns `authenticated: true` but subsequent API calls return `401 "stub token"`. Dashboard shows "Session expired" banner on Vercel.
- Files: `banking_api_server/server.js` (lines 401–430 — `restoreFromCookie` + `upstashRefetchMiddleware`), `banking_api_server/services/upstashSessionStore.js`
- Trigger: POST (OAuth callback) and GET (status poll) land on different Vercel Lambdas. Lambda B has `_cookie_session` stub from the signed `_auth` cookie; Lambda A wrote the real tokens to Upstash. The Upstash re-fetch middleware closes the gap, but only if KV vars are set and the Upstash write has committed before the GET arrives.
- Workaround: Always set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` on Vercel. Use `update-upstash.sh` to rotate credentials.

**Extra accounts (investment, custom) lost on cold-start:**
- Symptoms: Only checking and savings accounts appear after Vercel cold-start.
- Files: `banking_api_server/routes/demoScenario.js` (`saveAccountSnapshot`, `restoreAccountsFromSnapshot`), `banking_api_server/routes/accounts.js`, `banking_api_server/services/demoScenarioStore.js`
- Trigger: `demoScenario PUT` must call `saveAccountSnapshot(userId)` and both `GET /accounts/my` and `GET /demo-data` must call `restoreAccountsFromSnapshot` BEFORE `provisionDemoAccounts`. If `demoScenarioStore` has no KV backing, custom accounts are not persisted.
- Workaround: `demoScenarioStore` requires KV configured to persist snapshots.

**MCP flow SSE — Lambda isolation breaks flow diagram panels:**
- Symptoms: Agent flow diagram panel shows no streamed milestones in Vercel multi-instance deployment. Orphaned SSE connections on server restart.
- Files: `banking_api_server/services/mcpFlowSseHub.js` (self-documenting comment on line 11), `banking_api_server/server.js` (SSE mount)
- Trigger: `GET /api/mcp/tool/events` and the `POST /api/mcp/tool` that emits events must be served by the same Node process. On Vercel serverless they land on different Lambdas.
- Workaround: Redis pub/sub backing is the correct fix; not yet implemented. SSE works in local single-process dev.

**REAUTH_KEY infinite redirect guard — fragile `oauth=success` coupling:**
- Symptoms: Infinite PingOne redirect loop if guard is broken.
- Files: `banking_api_ui/src/components/UserDashboard.js` (`fetchUserData`, lines 293–321)
- Trigger: `REAUTH_KEY` in `sessionStorage` must be cleared ONLY on the 401 success recovery path. It must NOT be cleared when `oauth=success` URL param is present — that param already means PingOne redirected back, so clearing the key here would allow an immediate re-redirect loop.
- Safe modification: Any change to the 401 handler must preserve the `oauth=success` exclusion.

**Admin role detection — 4-signal order matters:**
- Symptoms: Admin users downgraded to customer role on login.
- Files: `banking_api_server/routes/oauthUser.js`
- Trigger: Detection runs 4 checks in order — username allowlist → population ID → custom claim → existing record. All 4 must be present in config. Config fields: `admin_username`, `admin_population_id`, `admin_role_claim` in `configStore.js`.
- Safe modification: Never remove a signal from the priority chain; add new signals at the end.

**`consentBlocked` persists across logout via stale `useState`:**
- Symptoms: Agent fully disabled on fresh login after a prior HITL consent decline.
- Files: `banking_api_ui/src/components/BankingAgent.js`
- Workaround: `useState` initializer always returns `false` (prevents localStorage stale value). `checkSelfAuth` calls `setAgentBlockedByConsentDecline(false)` on valid session. Do not add localStorage persistence for this flag.

**Token expiry not checked on status endpoint → dashboard loop:**
- Symptoms: `GET /api/status` returns `authenticated: true` for expired tokens → dashboard polls indefinitely.
- Files: `banking_api_server/routes/oauthUser.js`, `banking_api_server/routes/oauth.js`
- Safe modification: Both routes check `expiresAt` before responding `authenticated: true`. Do not remove that check.

---

## Security Considerations

**`SKIP_TOKEN_SIGNATURE_VALIDATION` dev bypass:**
- Risk: If set to `true` in any environment, JWT signature validation is skipped entirely — any token would be accepted.
- Files: `banking_api_server/middleware/auth.js` (line 21), `banking_api_server/server.js` (line 39–43)
- Current mitigation: `server.js` has a startup fatal guard — `SKIP_TOKEN_SIGNATURE_VALIDATION=true` + `NODE_ENV=production` logs `[FATAL]` and the process should be stopped. Guard is a `console.error`, NOT a `process.exit()` — if something swallows stderr, the process could continue.
- Recommendation: Replace the `console.error` guard with `process.exit(1)` or throw at startup so the guard is truly hard.

**Demo-only feature flags that weaken token security:**
- Risk: Three flags modify the token exchange path in ways that are unsafe in production:
  - `ff_inject_may_act` — BFF synthesises `may_act` claim without PingOne issuing it.
  - `ff_inject_audience` — BFF adds `mcp_resource_uri` to `aud` claim snapshot without PingOne issuing it.
  - `ff_skip_token_exchange` — passes raw user access token directly to MCP server (no RFC 8693 exchange).
- Files: `banking_api_server/services/agentMcpTokenService.js` (lines 309–370, 469–490), `banking_api_server/services/configStore.js`
- Current mitigation: All three default to `'false'`; injection only occurs when flag is explicitly set. Regression plan §1 documents `ff_inject_may_act` as demo-only.
- Recommendation: Add a production startup check (similar to `SKIP_TOKEN_SIGNATURE_VALIDATION`) that logs `[FATAL]` if any demo injection flag is `true` when `NODE_ENV=production`.

**Transaction routes missing `requireScopes()` — intentional but must stay documented:**
- Risk: `GET /transactions/my` (line 60) and `POST /transactions` (line 208) have no scope gate after `authenticateToken`. Ownership checks are row-level only.
- Files: `banking_api_server/routes/transactions.js`
- Current mitigation: Explicit code comments and REGRESSION_PLAN §1 entry document this as intentional. `authenticateToken` still validates the bearer token.
- Recommendation: If `ENDUSER_AUDIENCE` is ever deployed to a custom PingOne resource server that issues `banking:*` scopes, restore `requireScopes()` on these two routes.

**MCP Inspector — unauthenticated tool catalog endpoint:**
- Risk: `GET /api/mcp/inspector/tools` responds 200 with the full local tool catalog and context (including protocol version, config hints) without requiring authentication.
- Files: `banking_api_server/routes/mcpInspector.js`, `banking_api_server/server.js` (inspector mount has no `authenticateToken`)
- Current mitigation: Intentional design for unauthenticated dev inspector use; documented in REGRESSION_PLAN §1.
- Recommendation: In a production deployment that should not expose tool metadata publicly, add a `NODE_ENV !== 'development'` guard to the inspector mount.

**`MCP_SERVER_RESOURCE_URI` unset = no `aud` claim validation on MCP server:**
- Risk: If `MCP_SERVER_RESOURCE_URI` is not set, `TokenIntrospector.ts` skips the RFC 8707 `aud` check entirely — any valid PingOne token accepted regardless of audience.
- Files: `banking_mcp_server/src/auth/TokenIntrospector.ts` (lines 89–104), `banking_mcp_server/.env.example` (line 27)
- Current mitigation: Default `.env.example` sets it commented out; demo environments documented as acceptable without it.
- Recommendation: Set this in all non-demo deployments. Value should match the MCP Resource Server URI registered in PingOne.

**`SESSION_SECRET` insecure default in dev:**
- Risk: Dev environments use `'dev-session-secret-change-in-production'` if `SESSION_SECRET` is unset. If accidentally deployed to production without setting this env var, session cookies are predictable.
- Files: `banking_api_server/server.js` (lines 357–366)
- Current mitigation: `console.error('[FATAL]')` log if default is detected AND `isProduction`; `console.warn` in dev. Not a `process.exit()`.
- Recommendation: Harden to `process.exit(1)` in production.

**OAuth credentials logged at startup (masked):**
- Risk: `[oauth-config]` startup log emits masked client IDs and secrets (`admin_client_id`, `admin_secret`, partial values). Log aggregation tools may capture and store these.
- Files: `banking_api_server/server.js` (lines 33–37)
- Current mitigation: Values are masked (only first `N` chars shown). Still a partial information disclosure.
- Recommendation: Remove the startup credential dump or move it behind `DEBUG_OAUTH=true`.

**`DEBUG_TOKENS=true`, `DEBUG_OAUTH=true`, `DEBUG_SCOPES=true` enabled in committed `.env`:**
- Risk: The local `banking_api_server/.env` file has all three debug flags turned on. The `.env` file is committed to the repo (not in `.gitignore`). In environments that import `.env` directly, these debug modes log decoded JWT payloads and credentials to stdout.
- Files: `banking_api_server/.env` (lines 60–62)
- Current mitigation: Token detail logging is gated on `DEBUG_TOKENS === 'true'` checks throughout `auth.js`. Production deployments should use `env.example` not `.env`.
- Recommendation: Set all three to `false` in the committed `.env`, or add `.env` to `.gitignore` for the server package.

---

## Performance Bottlenecks

**`data/store.js` — in-memory only, reloads from JSON on every cold start:**
- Problem: All users, accounts, and transactions live exclusively in `Map` objects in `DataStore`. `persistAllData()` is a no-op stub by design.
- Files: `banking_api_server/data/store.js` (lines 109–114)
- Cause: Intentional design choice for a demo. When a Vercel Lambda cold-starts, the entire dataset is re-read from `bootstrapData.json`; any runtime writes (new transactions, demo updates) made in other Lambdas are lost.
- Improvement path: Account snapshots are partially mitigated via `demoScenarioStore` Redis persistence. For a richer demo, replace `data/store.js` with a Redis-backed or SQLite persistent store.

**MCP SSE hub in-process fan-out — no Redis pub/sub:**
- Problem: `mcpFlowSseHub` holds SSE subscriber maps in memory. `POST /api/mcp/tool` emits events to the same in-process map. On Vercel multi-instance, these are different processes.
- Files: `banking_api_server/services/mcpFlowSseHub.js`
- Cause: No Redis pub/sub backing implemented.
- Improvement path: Publish events to a Redis channel (same KV used by Upstash store); `handleSseGet` subscribes via `kv.subscribe()` or a polling approach.

**Exchange audit store creates a new KV client per write:**
- Problem: `writeExchangeEvent()` in `exchangeAuditStore.js` calls `_createKv()` on every invocation, instantiating a new `@vercel/kv` HTTP client per audit event instead of reusing one.
- Files: `banking_api_server/services/exchangeAuditStore.js`
- Cause: Module-level client was avoided to prevent startup failures when KV is unconfigured.
- Improvement path: Lazily initialise a module-level client after first successful `USE_KV` check.

---

## Fragile Areas

**Three CRA proxy env vars must stay in sync:**
- Files: `banking_api_ui/src/setupProxy.js`, `banking_api_ui/.env`, `run-bank.sh`
- Why fragile: `REACT_APP_API_PORT` in `banking_api_ui/.env` sets the proxy target. `run-bank.sh` starts the API on port 3002 and the UI on port 4000. The default layout uses 3001/3000. Changing `run-bank.sh` port without updating `.env` breaks all `/api/*` calls silently with a proxy 500.
- Safe modification: Always update `banking_api_ui/.env` (`REACT_APP_API_PORT`) when changing the API port in `run-bank.sh`. REGRESSION_PLAN §3 is the canonical port reference.

**configStore dual-backend (SQLite ↔ Vercel KV) loaded at module init:**
- Files: `banking_api_server/services/configStore.js`
- Why fragile: Backend selection happens synchronously at `require()` time based on `KV_REST_API_URL` presence. In tests that set env vars after `require`, the backend selection is already baked in. Several integration tests must set vars before any `require()` to avoid a stale SQLite backend.
- Safe modification: Set all KV env vars before the first `require('../services/configStore')` in test setup files.

**`BankingAgent.js` — large component with multiple layout modes:**
- Files: `banking_api_ui/src/components/BankingAgent.js`
- Why fragile: The component renders in 3 layouts (float panel, embedded dock, bottom dock) controlled by `agentPlacement` prop + internal state. 8 `eslint-disable-next-line react-hooks/exhaustive-deps` comments indicate intentional stale-closure patterns. Adding new `useEffect` dependencies can trigger double-initialization or layout-flip bugs.
- Safe modification: Consult REGRESSION_PLAN §1 entries for `Middle layout start state`, `Bottom dock direction`, and `Bottom dock on dashboard routes` before modifying placement logic.

**`UserDashboard.js` fetchUserData — multiple call sites with silent deduplication:**
- Files: `banking_api_ui/src/components/UserDashboard.js`
- Why fragile: `fetchUserData` is called at mount, on event bus events, on a 5-minute polling interval, and directly from 3 data mutation handlers (lines 572, 629, 688). Adding a new call site risks triggering the 401→reauth flow redundantly. `eslint-disable` on the interval effect hides a potential `fetchUserData` closure staleness issue.
- Safe modification: Use the `silent = true` parameter for background refreshes; never call `fetchUserData()` from within the REAUTH_KEY handling block.

**Token exchange feature flag interaction matrix:**
- Files: `banking_api_server/services/agentMcpTokenService.js`, `banking_api_server/services/configStore.js`
- Why fragile: Six flags interact: `ff_inject_may_act`, `ff_inject_audience`, `ff_skip_token_exchange`, `ff_two_exchange_delegation`, `ff_oidc_only_authorize`, `ff_authorize_mcp_first_tool`. Some combinations are tested; many are not. `ff_skip_token_exchange=true` + `ff_two_exchange_delegation=true` is an undefined state.
- Safe modification: Treat the 1-exchange path (`ff_two_exchange_delegation=false`) as the regression baseline. Do not enable multiple deviation flags simultaneously.

**13 active Claude worktrees, main branch is `fix/dashboard-fab-positioning`:**
- Files: `.claude/worktrees/` (13 directories), `git worktree list`
- Why fragile: Six worktrees (`compassionate-easley`, `compassionate-zhukovsky`, `elegant-chaum`, `flamboyant-taussig`, `happy-rhodes`, `infallible-tesla`) are all at the same commit `b19254e`, suggesting they were created from the same base and may be stale. The primary checkout is on `fix/dashboard-fab-positioning`, not `main`. A merge to main or reset could affect active worktree branches.
- Safe modification: Run `git worktree prune` after confirming stale branches are no longer needed. Confirm primary branch state before running `npm run build` CI checks.

---

## Scaling Limits

**In-memory banking data store — Vercel Lambda per-instance isolation:**
- Current capacity: One Lambda instance, one bootstrap load. Data writes survive the Lambda's lifetime only.
- Limit: Any data written (transactions, account balance changes) in one Lambda is invisible to requests served by any other Lambda instance.
- Scaling path: Replace `data/store.js` Map-based storage with KV/Redis-backed store, or use `demoScenarioStore` snapshot pattern consistently for all mutable state.

**Upstash `banking:config` hash — single key holds all configStore values:**
- Current capacity: All 50+ config keys in a single Redis hash.
- Limit: No per-key TTL; no audit trail for config changes. If the Upstash key is deleted or corrupted, all runtime config is lost.
- Scaling path: Add a config change log (LPUSH/LTRIM pattern similar to `exchangeAuditStore`).

---

## Dependencies at Risk

**`langchain_agent/` — Python; not part of TypeScript CI:**
- Risk: LangChain Python API changes silently break the agent with no CI signal.
- Impact: The agent cannot invoke MCP tools if the BFF API surface diverges.
- Migration plan: Either wire `pytest` into CI (requires Python environment in pipeline) or explicitly mark `langchain_agent` as unmaintained demo scaffold.

**`express-session` + `connect-redis` — wire protocol Redis:**
- Risk: `connect-redis` requires a live TCP Redis server. On Vercel, TCP Redis connections are unreliable at cold start (pool timeout, reconnect overhead).
- Impact: Session store falls back to in-memory on TCP error, causing the Lambda isolation 401 problem.
- Migration plan: Upstash REST store (`upstashSessionStore.js`) is the correct Vercel path and is already Priority 1. Wire protocol path should be treated as local-dev-only fallback.

---

## Test Coverage Gaps

**No automated E2E test for the full OAuth → Dashboard flow:**
- What's not tested: PKCE login → callback → session → `/dashboard` render → `/api/status` returning `authenticated: true`.
- Files: `banking_api_ui/src/` — all test files are unit/component tests using Jest + Testing Library.
- Risk: OAuth callback bugs (state mismatch, `invalid_scope`, redirect origin) are only caught manually.
- Priority: High — this is the most common regression source per REGRESSION_PLAN §4.

**`ff_two_exchange_delegation=true` path has no test coverage:**
- What's not tested: The entire `_performTwoExchangeDelegation()` 4-step flow in `agentMcpTokenService.js`.
- Files: `banking_api_server/services/agentMcpTokenService.js` (lines 200–450 approx.)
- Risk: Regressions in the 2-exchange path (missinng vars, wrong actor token passed) go undetected.
- Priority: High — this is a recently shipped feature.

**`mcpFlowSseHub.js` — no unit tests for SSE connection lifecycle:**
- What's not tested: SSE stream attach, event publish, orphaned connection cleanup, and multi-subscriber fan-out.
- Files: `banking_api_server/services/mcpFlowSseHub.js`
- Risk: SSE connection leaks or missed `endTrace()` calls are hard to detect without load testing.
- Priority: Medium.

**`demoScenario.js` — no tests for account snapshot save/restore:**
- What's not tested: `saveAccountSnapshot`, `restoreAccountsFromSnapshot`, cold-start ordering (restore before provision).
- Files: `banking_api_server/routes/demoScenario.js`
- Risk: Changes to the provisioning order silently reintroduce the "investment accounts lost on cold start" regression.
- Priority: Medium.

**Snapshot tests cover only 3 UI components:**
- What's not tested: `BankingAgent.js`, `UserDashboard.js`, `TokenChainDisplay.js`, `DemoDataPage.js`, `TransactionConsentModal.js` — all have complex state-driven rendering not covered by snapshots.
- Files: `banking_api_ui/src/components/__tests__/` (only `Header`, `Footer`, `SideNav` have snapshots)
- Risk: Structural UI regressions in high-value components are caught only through manual QA.
- Priority: Medium.

---

*Concerns audit: 2026-03-31*
