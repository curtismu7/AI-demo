# Development MCP Servers — Plan

**Status:** Plan only — no code yet
**Date:** 2026-05-14
**Author:** Curtis + Claude

These MCP servers exist **only for development of this repo**. They are not part of
the demo, not shipped to Vercel, and not consumed by `langchain_agent` or
`banking_agent_service`. They live in a separate folder so they cannot be
confused with the demo's customer-facing MCP servers (`banking_mcp_server`,
`banking_mcp_invest`, `banking_mcp_gateway`, `banking_mcp_cards`).

---

## Naming and location

| Demo MCP servers (existing, shipped)       | Dev MCP servers (new, repo-local)        |
|--------------------------------------------|------------------------------------------|
| `banking_mcp_server/` (port 8080)          | `dev_mcp/pingone/` (stdio)               |
| `banking_mcp_invest/` (port 8081)          | `dev_mcp/logs/` (stdio)                  |
| `banking_mcp_gateway/` (port 3005)         | `dev_mcp/state/` (stdio)                 |
| (Phase 272) `banking_mcp_cards/`           | `dev_mcp/tokenchain/` (stdio)            |

All four dev servers are **stdio transport** (not HTTP/WS). They run on demand
via `npx`-style entries in `.mcp.json` (or a new section in it). Stdio means
they cost nothing when idle and never bind a port.

Why a `dev_mcp/` top-level folder and not `.claude/mcp/`?
- Cursor + Claude Code + Codex all read the same code; keeping them in-repo
  means everyone gets them without a per-tool installation step.
- They are TypeScript packages with their own `package.json` so they can be
  versioned and tested like the rest of the monorepo.

---

## Pain points → which server addresses each

| Pain point                       | Server               | Why a tool, not a script |
|----------------------------------|----------------------|--------------------------|
| PingOne API friction             | `dev_mcp/pingone`    | I want the agent to read/edit envs/users in the same turn it reasons about a bug — copy/paste from cURL is the slow part. |
| Log triage across 13 log files   | `dev_mcp/logs`       | The X-Request-ID correlation across BFF → Gateway → MCP → HITL is the value. A shell pipeline misses 90% of it. |
| SQLite + JSON state poking       | `dev_mcp/state`      | sessions.db, config.db, runtimeData.json, store.js — current debugging makes me eyeball the files. |
| Token Chain inspection           | `dev_mcp/tokenchain` | The `act` claim / `aud` mismatch debugging loop is exactly what an MCP server is best at — decode + diff + correlate. |

---

## 1) `dev_mcp/pingone` — PingOne Management API wrapper

**Stdio MCP server. Wraps `banking_api_server/services/pingoneManagementService.js`
patterns directly so the auth + retry + worker-token logic isn't duplicated.**

### Tools

```ts
pingone_list_users({ envId?, filter?, limit? = 50 })
  → returns [{ id, username, email, enabled, mfaEnrolled }]

pingone_get_user({ envId?, userId })
  → returns full user record incl. mayAct custom attribute

pingone_update_user_attribute({ envId?, userId, attribute, value })
  → patches custom attributes (mayAct, etc.)

pingone_list_apps({ envId? })
  → returns [{ id, name, type, clientId, scopes[] }]

pingone_get_app({ envId?, appId })
  → full app + grants

pingone_list_resources({ envId? })
  → resource servers + their scopes

pingone_describe_token({ token })
  → POST /introspect against the configured introspect endpoint;
    returns active, sub, aud[], scope, act, may_act, exp, iat
```

### Hard rules

- **Read-only by default.** `pingone_update_user_attribute` requires
  `DEV_MCP_PINGONE_WRITE=1` in env before the tool registers, otherwise it
  doesn't appear in tools/list. No accidental writes from a misclicked agent.
- **Never accepts tokens in arguments other than `describe_token`.** All other
  tools resolve a worker token from `.env` or refuse.
- **Logs every call to `/tmp/dev-mcp-pingone.log`** with the timestamp +
  toolName + args (with secrets scrubbed). Audit trail for "did I actually
  change that?"

### Wiring

`.mcp.json` entry:
```json
"dev-pingone": {
  "command": "node",
  "args": ["dev_mcp/pingone/dist/index.js"]
}
```
Build: `cd dev_mcp/pingone && npm install && npm run build` (typical TS pattern,
parallels `banking_mcp_server`).

---

## 2) `dev_mcp/logs` — log triage with request-id correlation

The 13 log files in `/tmp/bank-*.log` are noisy individually but
correlate perfectly via `X-Request-ID` headers and the `[McpExchangerToken]`
tag prefixes.

### Tools

```ts
logs_tail({ service, lines = 100 })
  → returns last N lines from /tmp/bank-{service}.log
    service ∈ { api-server, mcp-server, mcp-gateway, hitl-service,
                mortgage-service, mcp-invest, agent-service, langchain-agent,
                authorize-server, helix, ui, mcp-traffic }

logs_grep({ pattern, services? = all, since? = "5m" })
  → returns matching lines from all (or selected) services, in time order

logs_correlate({ request_id, services? = all })
  → returns every line containing the request_id across all services,
    chronological — this is the killer feature for OAuth/MCP debugging

logs_errors({ since? = "10m" })
  → returns lines tagged ERROR/Failed/❌/aud mismatch/SyntaxError across
    all log files, deduped by stack signature

logs_oauth_flow({ since? = "10m", grant? = "all" })
  → curated view: [McpExchangerToken], [pkceState], OAuth callbacks,
    introspection results — same view as the Token Chain UI but as text
```

### Hard rules

- **Read-only.** No `logs_clear` or `logs_truncate` — those are footguns.
- **No follow/tail mode.** MCP stdio doesn't stream well; agent calls a tool,
  gets a result. If I want a live tail I use `./run-bank.sh tail`.
- **Bounded output.** Each call caps at 4 KB return; if a `logs_correlate`
  call hits a chatty request, return a "truncated, repeat with a tighter
  time window" hint.

---

## 3) `dev_mcp/state` — local data store inspection

Banking demo state lives in three places:
- `banking_api_server/data/sessions.db` (SQLite, express-session store)
- `banking_api_server/data/runtimeData.json` (configStore)
- `banking_api_server/data/sampleData.js` + `store.js` (in-memory but
  initialised from these files)
- `banking_api_server/data/bootstrapData.json` (bootstrap snapshot)

### Tools

```ts
sessions_list({ activeOnly? = true, limit? = 20 })
  → reads sessions.db, returns [{ sid, sub, scope, exp, createdAt }]
    — token *values* redacted; only metadata

sessions_get({ sid })
  → full session record, tokens redacted (length + last 4 chars only)

config_get({ key })
  → reads runtimeData.json — same surface as configStore.getEffective()
    but without booting the BFF

config_list_keys({ filter? })
  → enumerate every key present in runtimeData.json

sample_data_summary()
  → counts: users, accounts, transactions, transfers; lists test user
    usernames so the agent doesn't have to grep sampleData.js

backup_list()
  → list contents of data/backups/ with timestamps and sizes
```

### Hard rules

- **Read-only across the board.** Touching runtimeData.json from a tool while
  the BFF is also writing it is a race — never worth it. If I need to edit
  config, I use the `/config` UI or `configStore.set()` in a Node REPL.
- **Token redaction is mandatory.** sessions.db contains access tokens. The
  server must redact `accessToken`, `idToken`, `refreshToken`, and anything
  matching the JWT regex (`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[...]+`)
  before returning. Show length + last 4 chars only.
- **No exec of store.js.** It runs server-side code; reading it as text is
  fine, but never require/eval it from the MCP server.

---

## 4) `dev_mcp/tokenchain` — OAuth flow inspection

The Token Chain feature already exposes a structured event log via
`banking_api_server/services/appEventService.js` (SSE ring buffer). This
server reads from the same source but is callable as a tool.

### Tools

```ts
tokenchain_recent({ limit? = 20, category? })
  → reads the appEvents ring (via internal endpoint or direct require)
    returns recent events tagged with token-exchange category

tokenchain_decode({ jwt })
  → decodes header + payload (no signature validation — that's a
    different debugging axis); flags missing fields the demo cares
    about: aud, scope, act, may_act, acr, sub

tokenchain_diff({ jwt_a, jwt_b })
  → side-by-side diff of two decoded JWTs, highlighting:
    - aud mismatch
    - scope drift (added/removed)
    - act presence/absence
    - exp delta

tokenchain_introspect({ token })
  → calls PingOne /introspect via the configured worker token; returns
    active + claims. Same contract as the BFF's tokenIntrospectionService
    but standalone

tokenchain_explain({ token })
  → composite: decode + introspect + check against demo rules
    (does aud match PINGONE_RESOURCE_MCP_SERVER_URI? does it have
    banking:mcp:invoke? does act match the MCP exchanger client?).
    Returns a short verdict + which rule failed.
```

### Hard rules

- **Read-only.** No "mint me a token" tool — that path goes through the BFF
  proper, with session + CSRF + cookie protection.
- **Never logs full JWTs.** Same redaction rule as `dev_mcp/state` —
  length + last 4 chars in any internal log line.
- **`tokenchain_introspect` requires `DEV_MCP_INTROSPECT=1`** env, because it
  burns PingOne worker-token quota. Default off; flip on when needed.

---

## Cross-cutting design choices

These apply to all four:

1. **TypeScript, strict mode, ESM** — same compiler settings as
   `banking_mcp_server`. Lets us share the JWT decode / introspect helpers.
2. **Single shared package for utilities** at `dev_mcp/_shared/` (redaction,
   log glob, env loader). Avoids re-implementing the JWT regex four times.
3. **No `npm install` chain reaction** — each server has its own `package.json`,
   `npm install` runs locally. Adding them to `run-bank.sh`'s `SVC_LIST` is
   **not** appropriate because they aren't long-running services.
4. **One log file each** at `/tmp/dev-mcp-{name}.log` so they don't pollute the
   demo log files (`/tmp/bank-*.log`). `logs_tail` deliberately does not list
   the dev_mcp logs as a `service` option — keeps the dev tooling invisible
   to its own surface.
5. **No `.env` writes.** Several pain points (especially PingOne) could be
   "fixed" by editing `.env` from a tool, but that conflicts with the user's
   memory: secrets are quoted, written via the `/config` UI or `setup:fresh`,
   not via agent edits.
6. **Audit `.mcp.json` first.** Before adding four entries, prune anything
   in there we haven't used in 30 days. Currently configured: memory,
   playwright, context7, github, filesystem, sequential-thinking. Likely
   keepers: github, context7, filesystem. Probable candidates for removal:
   memory (overlaps with auto-memory in `~/.claude/projects/.../memory/`),
   sequential-thinking (rarely produces a different answer than just
   thinking).

---

## What this plan deliberately does NOT include

- **A "tools UI" MCP server** for the React SPA. The React app's debugging
  story is browser devtools + Playwright; an MCP server adds nothing.
- **A Vercel / deployment MCP server.** The `vercel` CLI is already
  scriptable; an MCP wrapper would just be a thinner cURL.
- **An npm/test-runner MCP server.** `npm test` from Bash is fine; an MCP
  wrapper costs more than it saves and CI is the source of truth anyway.
- **A "do PingOne setup" MCP server.** `setup:fresh` exists and is
  idempotent — wrapping it as a tool risks accidental re-bootstrapping.

These omissions are intentional. The four servers above each solve a
recurring, in-loop debugging task. Anything that's already a single CLI
command isn't a candidate.

---

## Sequencing if we do build them

If/when you green-light building these, order matters because they share
the `_shared` utilities:

1. `dev_mcp/_shared/` — JWT decode, redaction, env loader, log glob (1 day)
2. `dev_mcp/logs` — easiest, no external network, immediate ROI (1 day)
3. `dev_mcp/tokenchain` — depends on `_shared` JWT decode (1 day)
4. `dev_mcp/state` — depends on `_shared` redaction (1 day)
5. `dev_mcp/pingone` — most surface, needs worker token plumbing (2 days)

Total rough estimate: **5–6 dev days** to ship all four, ~1 day per server
plus shared utilities. Each lands as its own PR with its own tests.

---

## Open questions worth grilling before building

1. **Are these worth their context-window cost?** Every MCP server adds its
   tool list to every agent session. Four servers × ~5 tools each = 20 extra
   tool descriptions in every chat. Is the debugging speedup worth the
   prompt bloat? Maybe two of the four cover 80% of the value.
2. **Should `dev_mcp/pingone` be allowed to write at all?** Even gated behind
   an env var, "update PingOne user attribute from chat" is the kind of tool
   that goes wrong silently. Consider: read-only forever, never the write
   tool.
3. **Where do new dev_mcp servers live in the `regression-guard` model?** They
   aren't shipped, so REGRESSION_PLAN §1 doesn't apply — but a tool that
   reads sessions.db is still security-sensitive. Probably needs a short
   §1 row stating "dev_mcp/* must remain read-only / token-redacting."
4. **Should the four servers be one server with four tool namespaces?**
   `dev_mcp/all` with `pingone_*`, `logs_*`, `state_*`, `tokenchain_*` tools.
   Saves four stdio startups, one package, one `.mcp.json` entry. Costs:
   harder to disable one independently; failure in one tool can take down
   the whole server. **Default recommendation: one combined server**, called
   `dev_mcp/banking-dev`, unless you have a reason to keep them split.
