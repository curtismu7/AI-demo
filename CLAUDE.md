# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Canonical** agent instructions for this repo. [`AGENTS.md`](AGENTS.md) points here for tools that expect that filename.

---

## Commands

### Start all services
```bash
./run-bank.sh               # start API (3001), UI (4000), MCP (8080), LangChain agent (8888)
./run-bank.sh stop          # stop all
./run-bank.sh status        # health check
./run-bank.sh tail all      # tail all logs interleaved
```

### Fresh install / migration (one-command)

```bash
npm run setup:fresh                              # brand-new install
npm run setup:fresh -- /path/to/archive.tar.gz   # migrate from another machine
```

`setup:fresh` chains: optional `data:import` (when tar passed), then `bootstrapPingOne`. The bootstrap step pops a localhost form for PingOne worker creds (or `--no-browser` for terminal). It provisions all 7 apps, 3 resource servers, ~25 scopes, 2 demo users with passwords, and writes credentials to `banking_api_server/.env` while preserving `SESSION_SECRET` so `config.db` stays decryptable. Idempotent — re-running is safe.

Underlying scripts (still callable independently):

```bash
cd banking_api_server
npm run data:import -- archive.tar.gz   # import only, no bootstrap
npm run pingone:bootstrap               # bootstrap only, browser form
npm run pingone:bootstrap:ci            # bootstrap from PINGONE_BOOTSTRAP_* env vars
```

**One-time setup** (needed for HTTPS on `api.ping.demo`):
```bash
echo '127.0.0.1  api.ping.demo' | sudo tee -a /etc/hosts
brew install mkcert && mkcert -install
```

### Environment quirks AI assistants must know

**Node 20+ is required** (root [`package.json#engines.node`](package.json) = `">=20"`).
Node 20, 22, and 24 LTSes are all supported — pick whichever the user already has.
The repo standardizes on **nvm** for managing Node, which causes two predictable
failure modes in fresh shells:

1. **`nvm` is a shell function, not a binary on `$PATH`** — running `nvm use 20` in
   a shell whose `~/.zshrc`/`~/.bashrc` doesn't source `nvm.sh` produces
   `zsh: command not found: nvm`. Before invoking `nvm` from any non-interactive
   shell or fresh terminal, source it explicitly:
   ```bash
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   ```
   `run-bank.sh` does this itself (see `ensure_node_runtime()`) and so will
   self-recover. The migration scripts at
   [`banking_api_server/scripts/{export,import}MigrationBundle.js`](banking_api_server/scripts/)
   pre-flight `process.versions.node` and exit with the recovery snippet baked
   into their error.

2. **`./run-bank.sh` is repo-local** — it must be invoked from the repo root.
   When walking a user through setup, always include `cd /path/to/banking-demo`
   before suggesting `./run-bank.sh`. The script itself uses `BASEDIR=$(cd "$(dirname "$0")" && pwd)`
   to find its own files, so a different cwd doesn't matter once the script is
   running — but the *invocation* still needs the relative path or absolute path.

When installing Node for the user yourself, prefer `nvm install 20 && nvm use 20`
(or 22 / 24 — any modern LTS works). Don't fall back to a Homebrew `node@20`
install unless the user explicitly asks — it conflicts with nvm's `node` and
creates the same `wrong major in this shell` confusion later.

### Node services and what each needs to start

There are **eight** Node services (`banking_mortgage_service` became a live
backend in Phase 267, wired behind the MCP Gateway's api_key disposition). The
naive "run `npm install` in three of them" approach (which the README used to
recommend) leaves the rest with missing `node_modules` or missing `dist/`,
producing cryptic `MODULE_NOT_FOUND` and
`Cannot find module '.../dist/index.js'` errors at startup. `run-bank.sh` now
auto-installs and auto-builds all eight via the `SVC_LIST` / `SVC_BUILD` /
`SVC_INSTALL_FLAGS` parallel arrays in its dependency-check loop — keep that
table in sync when adding a service.

| Service | Port | Type | Install needs | Build needs (`tsc`) |
|---|---|---|---|---|
| `banking_api_server`   | 3001 | Plain JS    | `npm install` | — |
| `banking_mcp_server`   | 8080 | TypeScript  | `npm install` | `npm run build` → `dist/index.js` |
| `banking_api_ui`       | 4000 | React (CRA) | `npm install --legacy-peer-deps` | — (CRA dev server) |
| `banking_mcp_gateway`  | 3005 | TypeScript  | `npm install` | `npm run build` → `dist/index.js` |
| `banking_hitl_service` | 3009 | Plain JS    | `npm install` | — |
| `banking_agent_service`| 3006 | TypeScript  | `npm install` | `npm run build` → `dist/index.js` |
| `banking_mcp_invest`   | 8081 | TypeScript  | `npm install` | `npm run build` → `dist/index.js` |
| `banking_mortgage_service` | 8082 | Plain JS | `npm install` | — |
| `langchain_agent`      | 8888 (uvicorn) + 8889 (chat WS) + 8890 (health/inspector) | Python | `pip install -r requirements.txt` (separate concern) | — |

Two recurring failure modes to watch for when adding or modifying service launches in `run-bank.sh`:

- **Don't guard launches with `[[ -f dist/index.js ]]`** — if dist is missing the
  service silently never starts and the user has no idea why. Let the dependency
  loop build it (or fail loudly), then launch unconditionally.
- **Don't `|| true` away build errors** in the launch block. The dep loop already
  builds; if a launch block re-runs build with errors swallowed, MODULE_NOT_FOUND
  is the result and the failure is invisible until the user opens the log.

### Build
```bash
cd banking_api_ui && npm run build        # required after any UI change — exit must be 0
cd banking_mcp_server && npm run build    # tsc compile; required after any MCP server change
```

### Tests
```bash
# From repo root:
npm test                                   # all suites
npm run test:api-server                    # BFF tests only
npm run test:mcp-server                    # MCP unit tests
npm run test:ui                            # React component tests (CI mode)

# Inside banking_api_server/ — useful for targeted runs:
npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration
npx jest --testPathPattern='step-up-gate|authorize-gate'
npm run test:session

# E2E (from banking_api_ui/):
npm run test:e2e:ui:smoke     # fast smoke — customer dashboard + landing
npm run test:e2e:admin
```

---

## Repository map

| Path | Role |
|------|------|
| `banking_api_ui/` | React SPA (CRA); BFF calls via proxy to API |
| `banking_api_server/` | Express BFF — PingOne OAuth, sessions, banking APIs |
| `banking_mcp_server/` | MCP tool server (WebSocket); not deployed on Vercel |
| `langchain_agent/` | Optional LangChain agent |
| `REGRESSION_PLAN.md` | **Authoritative** do-not-break list + bug fix log |
| `.cursor/rules/regression-guard.mdc` | Cursor rule mirroring regression checks |
| `.claude/skills/` | Domain skills (OAuth, MCP, Vercel, PingOne API, TypeScript) |

**Ports** (authoritative — see `REGRESSION_PLAN.md` §3 and `run-bank.sh`):
- **External (`api.ping.demo` HTTPS):** BFF `:3001`, UI `:4000`
- **Loopback only:** MCP `:8080`, MCP Invest `:8081`, Mortgage `:8082`, LangChain `:8888` (+ `:8889` chat WS + `:8890` health/inspector), MCP Gateway `:3005`, Agent `:3006`, HITL `:3009`
- `banking_api_ui/.env` `REACT_APP_API_PORT=3001` must match the BFF port.

---

## Architecture

### Token custody rule
Tokens are **never exposed to the browser**. The BFF (`banking_api_server`) is the sole token custodian. The React SPA holds only an httpOnly session cookie (`connect.sid`). Every BFF call uses `bffAxios` (cookie-based, no `Authorization` header from the browser).

### Request flow: MCP tool call
```text
Browser → (cookie) → BFF (agentMcpTokenService.js)
  → RFC 8693 Token Exchange with PingOne
  → WebSocket ws:// → banking_mcp_server
      → BankingToolProvider.executeTool()
      → BankingAPIClient → banking_api_server /api/...
```

### Key service files
| File | Role |
|------|------|
| `banking_api_server/services/configStore.js` | Singleton runtime config — `getEffective(key)` resolves env → KV/SQLite. Never read env vars directly in route handlers. |
| `banking_api_server/middleware/auth.js` | JWT/session token validation; sets `req.user`. |
| `banking_api_server/services/agentMcpTokenService.js` | Resolves MCP access token via RFC 8693 exchange; attaches `tokenEvents` for UI Token Chain. |
| `banking_api_server/services/mcpWebSocketClient.js` | BFF ↔ MCP WebSocket connection. |
| `banking_mcp_server/src/tools/BankingToolRegistry.ts` | Static map of all tool names → definitions (schema, scopes, handler). Add tools here. |
| `banking_mcp_server/src/tools/BankingToolProvider.ts` | Executes tools: validates params, checks scopes, calls `BankingAPIClient`. |
| `banking_api_ui/src/services/bffAxios.js` | Axios instance for BFF calls — import this instead of plain `axios`. |
| `banking_api_server/data/store.js` | In-memory banking data store (users, accounts, transactions). |

### Module system by package
- `banking_api_server/`: CommonJS (`require`/`module.exports`)
- `banking_api_ui/src/`: ES modules + JSX in `.js` files (CRA)
- `banking_mcp_server/src/`: TypeScript 5 strict, compiled to `dist/`

### Vercel deployment
- `api/handler.js` — one-liner that re-exports `banking_api_server/server.js`; all `/api/*` routes rewrite here via `vercel.json`
- React build served from `banking_api_ui/build/` as static; SPA fallback to `index.html`
- `banking_mcp_server` is **not** on Vercel — runs separately (Docker/Railway)
- Session store: Upstash REST KV on Vercel; TCP Redis locally; SQLite fallback

---

## Non-negotiables (every change)

1. **Read** [REGRESSION_PLAN.md](REGRESSION_PLAN.md) §0–1 before editing listed files. State what you will **not** break.
2. **Minimal diff** — name the component/element; do not refactor unrelated code.
3. **After any `banking_api_ui` UI edit:** run `npm run build` in `banking_api_ui/`; exit code must be **0**.
4. **Emoji rule.** Banking apps are professional. The **only** emojis permitted anywhere — UI text, docs, skills, code, comments — are `⚠️` (warning), `✅` (green check), `❌` (red X). Remove any other emoji you encounter in button labels, status text, headers, and descriptions. CSS icons / semantic HTML only for everything else. See [REGRESSION_PLAN.md §0](REGRESSION_PLAN.md#0-ui-style-guidelines).
5. **Default host:** `api.ping.demo` is the canonical local host (BFF `https://api.ping.demo:3001`, UI `https://api.ping.demo:4000`, HTTPS via `mkcert`). Use it in all skills, docs, examples, and PingOne app Redirect URIs. Users can override via the `/setup` page (writes configStore) or `.env` (`PUBLIC_APP_URL`, `REACT_APP_CLIENT_URL`, `CORS_ORIGIN`). Code **must not** hardcode `localhost:3001` / `localhost:4000` in `routes/oauth*.js` — read the configured host (REGRESSION_PLAN §1 "OAuth redirect origin").
6. **Bug fixes:** add an entry to `REGRESSION_PLAN.md` §4 (Bug Fix Log) per the template in the regression-guard rule.
7. **Do not** edit marketing-only pages unless the task explicitly says so (user preference: `/marketing` stability).

---

## Agent behavior (always active)

These four rules apply to every task — trivial or complex, planning or execution:

1. **Don't assume. Surface confusion.** If requirements are unclear, a tradeoff exists, or you're unsure whether something is in scope — say so before acting. Never silently pick one path when two are plausible.
2. **Minimum code that solves the problem.** Nothing speculative, no "while I'm here" additions, no future-proofing. If it isn't required by the task, it doesn't exist.
3. **Touch only what you must. Clean up only your own mess.** Leave unrelated code exactly as you found it. Fix pre-existing issues only if they're in a file you already had to change and the fix is small and scoped.
4. **Define success criteria. Loop until verified.** Before starting non-trivial work, state what "done" looks like. Don't mark work complete without evidence that the criteria are met.

---

## Workflow orchestration

### 1. Plan mode default

- Use **plan mode** (or an explicit written plan) for non-trivial work: **3+ steps**, cross-cutting changes, OAuth/session/MCP/auth, or anything touching `REGRESSION_PLAN.md` §1 files.
- If assumptions fail or errors pile up: **stop**, re-plan, then continue — avoid grinding the same wrong approach.
- Use planning for **verification** (what to test, what could regress), not only for implementation.

### 2. Subagent / parallel exploration

- Offload **broad codebase search**, multi-directory audits, and independent research to subagents or parallel tool use when it keeps the main thread focused.
- Prefer **one focused task per delegated exploration** so results are easy to merge.

### 3. Learning from corrections

- After a **user correction** or a **production/regression** miss: capture the pattern so it does not repeat.
- **Primary (this repo):** extend `REGRESSION_PLAN.md` §4 and, if needed, a short note in §1 table.
- **Optional:** if the team adds `tasks/lessons.md`, log recurring “don’t do X” patterns there; otherwise the bug log is the source of truth.

### 4. Verification before “done”

- Do not mark work complete without **evidence**: `npm run build` (UI), targeted `npm test` when you touched logic/tests, and a quick sanity check against the regression-guard **pre-deploy checklist** when relevant.
- Ask: *Would a staff engineer be comfortable shipping this without more manual QA?*
- Fix **failing CI/tests** you introduce; fix obvious **pre-existing failures** in files you already had to touch if the fix is small and scoped.

### 5. Demand elegance (balanced)

- For non-trivial fixes: pause once — *is there a simpler or more consistent approach with the existing patterns?*
- If a fix feels brittle (timing hacks, duplicate state): prefer aligning with an existing service/hook pattern (e.g. shared stores, BFF routes).
- Skip deep redesign for **obvious one-line** fixes.

### 6. Autonomous bug fixing

- On a **bug report** with logs, stack traces, or failing tests: reproduce, fix, verify — avoid asking the user to run commands you can run locally.
- Prefer **root cause** over symptoms (especially OAuth, session, proxy, and `aud` / token paths).

---

## Task management

1. **Plan first** — For large features, a short checklist in chat or a branch doc is fine; optional `tasks/todo.md` if the team adopts it.
2. **Align with regression workflow** — Shipping-affecting fixes belong in `REGRESSION_PLAN.md` §4.
3. **Track progress** — Update todos/checklists as you complete steps.
4. **Summarize** — End with what changed, files touched, and how to verify.
5. **Document results** — Bug fixes → §4 entry; new critical areas → §1 table update when appropriate.

---

## Core principles

- **Simplicity first** — Smallest change that solves the problem; fewer moving parts.
- **No laziness** — Find root causes; avoid “temporary” hacks on auth, sessions, or tokens.
- **Minimal impact** — Touch only what the task requires; preserve behavior in adjacent code.
- **BFF + security** — Tokens stay server-side; respect RFC 8693 / agent `on_behalf` patterns documented in the repo and skills.
- **Vercel / serverless** — Session store and cold-start behavior matter; see `REGRESSION_PLAN.md` (Upstash, OAuth origin, SPA rewrites).

---

## PingOne OAuth Configuration

### Automatic Endpoint Resolution
OAuth endpoints are **automatically computed** from `PINGONE_ENVIRONMENT_ID` + `PINGONE_REGION`:
- **Token endpoint:** `https://auth.pingone.${region}/${envId}/as/token`
- **Authorization endpoint:** `https://auth.pingone.${region}/${envId}/as/authorize`
- **JWKS URI:** `https://auth.pingone.${region}/${envId}/as/jwks`
- **OIDC Discovery:** `https://auth.pingone.${region}/${envId}/as/.well-known/openid-configuration`

**No need to set `PINGONE_TOKEN_ENDPOINT` manually** — it's derived at runtime via `oauthEndpointResolver.js`. Optional: set `OAUTH_TOKEN_ENDPOINT` explicitly to override (useful for non-PingOne IDPs).

### RFC 8693 Token Exchange (MCP Agent)
The BFF performs RFC 8693 token exchange for MCP tools using:
- **User token** (subject): `urn:ietf:params:oauth:token-type:access_token` (PingOne-issued)
- **Actor token** (optional): Client-credentials token for `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`
- **Resource indicator** (`aud`): `PINGONE_RESOURCE_MCP_SERVER_URI` (narrowed scope)

**Key environment variables** (all required for delegated agent):
```
PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID=<uuid>
PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET="<secret>"  # Quote secrets with special chars (~, -, .)
PINGONE_MCP_TOKEN_EXCHANGER_CC_AUTH_METHOD=post       # PingOne AI_AGENT apps use 'post'
PINGONE_RESOURCE_MCP_SERVER_URI=https://mcp-server.pingdemo.com
MCP_TOKEN_EXCHANGE_SCOPES=banking:read banking:write banking:mcp:invoke
```

**Why `act` claim might be absent:**
Even when all code and configuration above is correct, the returned MCP token may not include an `act` claim if:
- PingOne resource token policy doesn't emit `act` claims
- MCP resource delegation policy isn't configured in PingOne
- Token policy doesn't include delegation-aware claim mappings
- **SPEL expression syntax limitations** — PingOne token policy SPEL may not support complex token property access for RFC 8693 exchanges

**To configure `act` claim emission:**
1. Check PingOne Console → Environments → Resources → [MCP Server Resource] → Token Policy
2. Try adding an Attribute Mapping for `act` claim with SPEL that matches `may_act.sub` to actor `client_id`
3. **Note:** If SPEL doesn't support token property access, you may need to:
   - Use a **DaVinci flow** instead of inline SPEL
   - OR verify if PingOne automatically emits `act` when `may_act.sub` matches the requesting client's `client_id`

**Debugging token exchange failures:**
- Check `/tmp/demo-api.log` for `[McpExchangerToken]` log entries
- If `act absent` appears in Token Chain UI → PingOne policy may not emit `act` claims (expected behavior)
- Verify PingOne app is type `AI_AGENT` and has correct scopes + authentication method
- Verify actor token is obtained: log should show `[McpExchangerToken] ✅ Token obtained`

---

## When to read which skill

| Topic | Skill (under `.claude/skills/`) |
|--------|----------------------------------|
| PingOne OAuth, PKCE, tokens | `oauth-pingone` |
| MCP server, tools, WebSocket | `mcp-server` |
| PingOne Management API from BFF | `pingone-api-calls` |
| BFF sessions, cookies, token custody, prod hardening | `bff-sessions` |
| HITL consent, 428 enforcement, Phase 170 | `hitl-consent` |
| Pre-edit discipline, §1/§4, pre-deploy checklist | `regression-guard` |
| TS/JS style in this monorepo | `typescript-banking` |

---

## Environment Variable Best Practices

1. **Quote all secrets** in `.env` to prevent shell parsing of special characters:
   ```
   ❌ PINGONE_ADMIN_CLIENT_SECRET=x6Ee...8u0_w8F9a.qA9-j47z  # ~ and . may break parsing
   ✅ PINGONE_ADMIN_CLIENT_SECRET="x6Ee...8u0_w8F9a.qA9-j47z"
   ```

2. **Credentials priority** (highest to lowest):
   - Runtime configStore (set via `/config` UI, persisted in runtimeData.json)
   - `PINGONE_*` explicit env vars (e.g. `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`)
   - Fallback env vars (e.g. `AGENT_OAUTH_CLIENT_ID` → `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`)

3. **Never** commit real secrets; use `.env.example` + team vault

---

## Quick verification checklist (UI + API)

- `cd banking_api_ui && npm run build` → **0**
- No new unhandled rejections / noisy `console.error` in flows you changed
- If OAuth touched: admin login → `/admin`; user login → `/dashboard`; callbacks resolve to `https://api.ping.demo:4000` (the configured default) — never a hardcoded `localhost`
- If agent/MCP touched:
  - FAB visibility and agent sidebar in `/dashboard`
  - Click a banking tool (e.g., "🏦 My Accounts") → Token Chain panel shows token exchange events
  - Verify `act` claim is present: Token Chain shows `✅ act valid` (not `⚠️ act absent`)
  - Check `/tmp/demo-api.log` for `[McpExchangerToken] ✅ Token obtained` (not ❌ Failed)
  - **MCP results tracking:** Query `/api/app-events?category=mcp` to see tool calls, completions, AND results logged
  - If token is expired in Token Chain: MCP call fails before reaching server (fix: logout/login to get fresh token)
  - If HITL enabled: consent dialog appears before tool execution per `REGRESSION_PLAN.md`

---

## Test patterns: Regression vs. Integration

Critical HTTP routes (OAuth, HITL, transactions) use a **two-tier test pattern** to balance isolation and realism:

### Regression tests (unit-style)
**File pattern:** `*.regression.test.js`
- Mock everything including `configStore` (use `TEST_CONFIG` constants)
- Focus: logic correctness in isolation
- Speed: fast execution, no external dependencies
- Example: `oauthStatus.regression.test.js`, `hitlRoute.regression.test.js`

**Setup pattern:**
```javascript
jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn((key) => {
    const defaults = {
      'ff_hitl_enabled': 'true',
      'confirm_threshold_usd': '500',
    };
    return defaults[key] || null;
  }),
}));
```

### Integration tests (real config)
**File pattern:** `*.integration.test.js`
- Use **real `configStore`** from `.env` (calls actual `getEffective`)
- Mock only data dependencies (store, external services) to avoid side effects
- Focus: route + service interaction with real environment config
- Speed: slightly slower, but verifies with .env values
- Example: `oauthStatus.integration.test.js`, `hitlRoute.integration.test.js`

**Setup pattern:**
```javascript
// configStore NOT mocked — uses real .env
jest.mock('../../middleware/auth', () => ({ /* ... */ }));
jest.mock('../../data/store', () => ({ /* ... */ }));
jest.mock('../../services/transactionConsentChallenge', () => ({ /* ... */ }));
// No mock on configStore — it reads real .env values
```

### When to add a new test pair
1. **Critical security/session/HITL flows** that touch `REGRESSION_PLAN.md` §1 files
2. Routes that depend on feature flags from `.env` (e.g., `ff_hitl_enabled`, `ff_authorize_fail_open`)
3. Session validation or token expiry logic
4. Phase 170+ critical rules (e.g., transfer consent requirements)

### Running the critical test suite
```bash
npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration
# Output: 43 tests, all passing
```

---

*Keep this file accurate when onboarding or workflow expectations change.*
