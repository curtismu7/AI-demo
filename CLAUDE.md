# CLAUDE.md — Agent guide (Super Banking Banking Demo)

**Canonical** agent instructions for this repo. [`AGENTS.md`](AGENTS.md) points here for tools that expect that filename.

Instructions for Claude Code, Cursor agents, and other AI assistants working in this repository.

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

**Ports:** See `REGRESSION_PLAN.md` §3. Default UI/API: 3000/3001; `run-bank.sh` uses 4000/3002 — keep `banking_api_ui/.env` (`REACT_APP_API_PORT`) in sync.

---

## Non-negotiables (every change)

1. **Read** [REGRESSION_PLAN.md](REGRESSION_PLAN.md) §1 before editing listed files. State what you will **not** break.
2. **Minimal diff** — name the component/element; do not refactor unrelated code.
3. **After any `banking_api_ui` UI edit:** run `npm run build` in `banking_api_ui/`; exit code must be **0**.
4. **Bug fixes:** add an entry to `REGRESSION_PLAN.md` §4 (Bug Fix Log) per the template in the regression-guard rule.
5. **Do not** edit marketing-only pages unless the task explicitly says so (user preference: `/marketing` stability).

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

## When to read which skill

| Topic | Skill (under `.claude/skills/`) |
|--------|----------------------------------|
| PingOne OAuth, PKCE, tokens | `oauth-pingone` |
| MCP server, tools, WebSocket | `mcp-server` |
| PingOne Management API from BFF | `pingone-api-calls` |
| Vercel, `vercel.json`, serverless sessions | `vercel-banking` |
| TS/JS style in this monorepo | `typescript-banking` |

---

## Quick verification checklist (UI + API)

- `cd banking_api_ui && npm run build` → **0**
- No new unhandled rejections / noisy `console.error` in flows you changed
- If OAuth touched: admin login → `/admin`; user login → `/dashboard`; callbacks use real host not localhost
- If agent touched: FAB visibility, MCP tool path, consent/HITL behavior per `REGRESSION_PLAN.md`

---

*Keep this file accurate when onboarding or workflow expectations change.*
