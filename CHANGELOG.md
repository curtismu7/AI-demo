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

- Logout full-screen wait overlay (`LoadingOverlay` + `sessionStorage` `banking_logout_pending`) so sign-off stays visible through `/api/auth/logout` → PingOne → `/logout` reload
- Admin OAuth: configurable token endpoint client authentication (`basic` default, `post` via `PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH` / `admin_token_endpoint_auth_method`) to match PingOne “Client Secret Post” / “Client Secret Basic”
- Transaction consent challenge (high-value transfers) — API `transactionConsentChallenge.js`, routes on `transactions.js`, UI `TransactionConsentPage.js`, and tests `transaction-consent-challenge.test.js`
- Human-in-the-loop (HITL) education panel and MCP local HITL tests (`HumanInLoopPanel.js`, `mcp-local-hitl.test.js`)
- `banking_api_ui` helpers: `resolveApiBaseUrl.js` (CRA proxy–friendly API base URL), `agentAccessConsent.js`, `constants/transactionThresholds.js`
- `banking_mcp_server/tests/helpers/integrationAxiosMock.ts` — shared axios mock for integration tests

### Fixed

- **Logout**: Defer removing `userLoggedOut` until `POST /api/auth/clear-session` completes; treat `/logout` as post-logout landing — fixes needing to click Log out twice
- **Admin OAuth token exchange**: `exchangeCodeForToken` now applies the same basic/post client auth as `refreshAccessToken` (previously always sent `Authorization: Basic` even when PingOne expected `client_secret` in body)
- **Vercel UI build (ESLint)**: `App.js` `import/first` — `axios.defaults.withCredentials` moved below all imports; `ApiTrafficPage.js` removed unused `subscribe` import (CI treats warnings as errors)
- **BFF / Vercel**: Global rate limiter excluded dashboard hot paths (`/api/demo-scenario`, `/api/tokens`, `/api/auth/session`, OAuth `/status` endpoints) so shared IPs no longer hit 429 during normal hydration
- **OAuth session drift**: `refreshIfExpiring` runs on `/api/auth/oauth` so access tokens refresh before OAuth status handlers; reduces 401 on `/api/accounts/my` when status still showed authenticated
- **SPA**: `axios.defaults.withCredentials`; `bffAxios` / `apiClient` use `resolveApiBaseUrl()` for same-host dev proxy; `fetchDemoScenario` coalesces concurrent GETs; `UserDashboard` disables auto-refresh and skips pending refetch on 401
- **MCP server**: `BankingAPIClient` detects axios-shaped errors when Jest mocks omit `axios.isAxiosError`; integration tests aligned with tool output and axios mocks

### Changed

- Admin OAuth `/authorize` `login_hint` set to `bankadmin` (was `admin`) for PingOne username hint
- Logout: delay before navigating to `/api/auth/logout` increased to 420ms so the wait overlay can paint; `LoadingOverlay` also shown during the initial `loading` gate when logout is in progress
- Banking agent UI/CSS, education bar and panels (Step-up, RFC index, commands, `EducationPanelsHost`), NL intent parser/sanitize and Gemini wiring, MCP local tools registry
- `apiClient.session.test.js` — assert OAuth request interceptor at correct `interceptors.request.use` index

### Removed

---

## [2026.03.26-V3]

### Added

### Fixed

### Changed

### Removed

---

## [2026.03.26.v2]

### Added
- `scripts/setup-vercel-env.js` — interactive Vercel environment wizard: detects conflicts, validates Upstash connectivity, generates SESSION_SECRET, and optionally pushes to Vercel CLI
- `npm run setup:vercel` and `npm run setup:vercel:check` scripts
- README.md Vercel Deployment section covering setup wizard, required vars, common issues, and post-deploy verification checklist

### Fixed
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
