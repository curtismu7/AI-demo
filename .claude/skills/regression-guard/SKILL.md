---
name: regression-guard
description: 'Pre-edit and post-edit discipline for Super Banking — the do-not-break contract. USE FOR: about to edit a file in REGRESSION_PLAN §1 protected list, what to state before editing, the §4 Bug Fix Log entry template after fixing a bug, the pre-deploy checklist, the UI build gate (cd banking_api_ui && npm run build = 0), the no-emojis §0 hard rule, minimal-diff discipline, "what could regress if I change X", verifying I am not silently reverting a load-bearing check. Mirrors .cursor/rules/regression-guard.mdc. DO NOT USE FOR: specific domain how-tos (use oauth-pingone / mcp-server / bff-sessions / hitl-consent); writing new features without an existing regression entry; trivial typo fixes.'
argument-hint: 'Name the file(s) you are about to edit, or the bug you are about to log'
---

# Regression Guard — Super Banking demo

> **Emoji rule (project-wide):** the only emojis allowed in skills, commands, code, and UI text are `⚠️` (warning), `✅` (green check), and `❌` (red X). Everything else is plain text or CSS icons. REGRESSION_PLAN §0 enforces this for UI; this skill enforces it everywhere else.
>
> **Default-host rule (project-wide):** `api.ping.demo` is the canonical local host (HTTPS via `mkcert`). Use it in skills, docs, examples, and PingOne app Redirect URIs. Users can change the host in the `/setup` page (writes to configStore) or via `.env` overrides. Code **must not** hardcode `localhost:3001` / `localhost:4000` in `routes/oauth*.js` callbacks — read the configured host (REGRESSION_PLAN §1 "OAuth redirect origin"). **Port assignments** (authoritative from `run-bank.sh`):
>
> | Port | Service | Scheme |
> |---|---|---|
> | `3001` | Banking API Server (BFF) | `https://api.ping.demo:3001` |
> | `4000` | Banking UI (React, CRA) — **public origin, OAuth callbacks land here** | `https://api.ping.demo:4000` |
> | `3005` | MCP Gateway | `https://api.ping.demo:3005` |
> | `3006` | Agent Service | `http://localhost:3006` |
> | `3009` | HITL Service | `http://localhost:3009` |
> | `8080` | Banking MCP Server | `ws://localhost:8080` |
> | `8081` | MCP Invest Server | `ws://localhost:8081` |
> | `8082` | Mortgage Service (Phase 266 Path A) | `http://localhost:8082` |
> | `8888` | LangChain Agent (uvicorn main) | `http://localhost:8888` |
> | `8889` | LangChain Agent (chat WS) — `WEBSOCKET_PORT` | `ws://localhost:8889` |
> | `8890` | LangChain Agent (health + `/inspector/mcp-host`) — `HEALTH_HTTP_PORT` | `http://localhost:8890` |
>
> Sibling services on `localhost:80xx`/`30xx`/`88xx` are loopback-only and don't use the `api.ping.demo` cert. Only the BFF and UI are externally addressable as `api.ping.demo`.

This skill is the discipline layer. The canonical sources at the repo root are:

- **`REGRESSION_PLAN.md`** — §0 UI style rules, §1 protected-files table, §3 ports, §4 Bug Fix Log. Authoritative; when this skill disagrees with it, REGRESSION_PLAN.md wins.
- **`REGRESSION_LOG.md`** — per-bug root-cause/test records (complementary to §4 — root-cause depth + the regression test that prevents recurrence).

This skill summarizes how to use both before/after every change.

> Mirrors `.cursor/rules/regression-guard.mdc`. Keep them in sync if you edit one.

---

## Before any change — the 4-step gate

1. **Open `REGRESSION_PLAN.md` and scan §0 + §1.** If the file you're about to edit appears in the §1 "Critical Do-Not-Break Areas" table, **state in your response what you will NOT break**. Do this before running Edit/Write. It's a forcing function — saying it out loud catches the 90% case.

2. **Minimal diff.** Name the component, name the element, change only that. Adjacent code is off-limits unless the task explicitly covers it. No "while I'm here" cleanup.

3. **Emoji rule** (§0 hard rule + project-wide). Banking apps are professional. The **only** emojis permitted anywhere — UI text, docs, skills, code comments — are `⚠️` (warning), `✅` (green check), `❌` (red X). Remove any other emoji you encounter in button labels, status text, headers, descriptions in `banking_api_ui/`. CSS icons / semantic HTML only for everything else.

4. **UI build gate.** After any `banking_api_ui/` change:
   ```bash
   cd banking_api_ui && npm run build
   ```
   Exit code **must** be 0 before you mark work complete. Non-negotiable (CLAUDE.md §3).

---

## §1 — Critical Do-Not-Break quick reference

If you're editing any of these, read the corresponding row in REGRESSION_PLAN.md §1 in full **first**:

| Area | Files |
|---|---|
| OAuth admin login | `routes/oauth.js`, `config/oauth.js`, `banking_api_server/.env` |
| OAuth user login | `routes/oauthUser.js`, `config/oauthUser.js` |
| PingOne authorize `resource` + mixed scopes | `utils/oauthAuthorizeResource.js`, `routes/oauthUser.js`, `routes/oauth.js` |
| CRA proxy setup | `banking_api_ui/src/setupProxy.js`, `banking_api_ui/.env` |
| Session persistence | `server.js`, `routes/oauth.js` (`req.session.save()`) |
| Session store callback discipline | `services/sqliteSessionStore.js` — must call `cb(err)` on every store op |
| Token audience check | `middleware/auth.js` — never hardcode `aud` defaults |
| Status endpoint token expiry | `routes/oauthUser.js`, `routes/oauth.js` — check `expiresAt` |
| REAUTH_KEY re-auth guard | `UserDashboard.js` — clear key only on success |
| Agent form account IDs | `BankingAgent.js` `liveAccounts` state |
| Transfer HITL enforcement | `services/transactionConsentChallenge.js` (transfer always requires consent), `routes/transactions.js` (428 enforcement) |
| Demo accounts on cold-start | `accounts.js`, `demoScenario.js` — save/restore snapshot order |
| Middle layout start state | `UserDashboard.js` `middleAgentOpen` init |
| Bottom dock on dashboard routes | `App.js`, `EmbeddedAgentDock.js` |
| Admin role detection | `routes/oauthUser.js` 4-signal check |
| configStore / Config UI | `services/configStore.js`, `routes/adminConfig.js` |
| Demo Controls diagnose | `ThresholdControls.js` — `data.checks?.userAttribute?.pass` shape |
| BankingAgent FAB | `components/BankingAgent.js`, `App.js` |
| Float panel resize | `BankingAgent.css` (no max-width/height), `BankingAgent.js` (90% caps) |
| OAuth redirect origin | `routes/oauth*.js` — no `localhost` hardcodes |

This is **not** the canonical list — REGRESSION_PLAN.md §1 has more (and the full details). Use this as triage before opening the file.

---

## The "state what you will not break" pattern

Instead of:
> "I'll fix the 401 in UserDashboard."

Say:
> "Editing `UserDashboard.js` `fetchUserData`. REGRESSION_PLAN §1 entry: REAUTH_KEY must be cleared **only** on the success path, never on the `oauth=success` URL param. I will not change that branch."

The second form forces you to read the §1 row before editing. It's how the project avoids re-introducing fixed bugs.

---

## After fixing a bug — the §4 Bug Fix Log entry

Every shipping-affecting fix gets a §4 entry. The template the recent entries use:

```markdown
### YYYY-MM-DD — Short description

**Files changed:**
- `path/to/file.js` — what changed and why
- `path/to/other.js` — what changed and why

**What was broken:** 1–3 sentences describing the user-visible symptom AND the root cause (not just the symptom).

**What was fixed:** 1–3 sentences describing the change.

**Verify:** Concrete steps a reviewer can run — usually a UI action + an expected outcome, or a `npx jest ...` command.
```

A few entries also add **Security note:** or **Do not break:** sections — use those when the fix introduces a new invariant that future edits could trample.

Order is reverse-chronological — newest at the top of §4. Today's date in ISO format (`2026-05-11`).

---

## Pre-deploy checklist (before pushing or restarting prod)

From REGRESSION_PLAN + `.cursor/rules/regression-guard.mdc`:

- [ ] `cd banking_api_ui && npm run build` exits **0**
- [ ] No new `console.error` or unhandled rejections in the browser console for flows you changed
- [ ] Admin login → callback → `/admin` dashboard works (callback redirects to `https://api.ping.demo:4000`, not a stale localhost hardcode in `routes/oauth*.js`)
- [ ] User login → callback → `/dashboard` works
- [ ] BankingAgent FAB visible on login page (unauthenticated state)
- [ ] BankingAgent shows banking actions after login
- [ ] Direct navigation to `/config`, `/dashboard`, `/admin` returns the SPA (not 404 — SPA fallback wired up)
- [ ] MCP tool calls succeed (Accounts, Transactions, Balance) and Token Chain panel shows token exchange events
- [ ] If HITL touched: consent dialog appears before transfer/high-value transaction; 428 returned when `consentChallengeId` missing
- [ ] Critical test suite green:
  ```bash
  npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration
  ```

---

## When to NOT add a §4 entry

The bug log is for shipping-affecting fixes. Skip the entry for:
- Typos in comments or docs.
- Renaming variables without behavior change.
- Pure test-only changes (adding a test for behavior that wasn't broken).
- Refactors that intentionally preserve behavior end-to-end.

If you're unsure, add the entry. False positives in the log are cheap; false negatives mean the same bug returns six months later.

---

## "Demand elegance" pause — when to take it

For non-trivial fixes only, pause once before committing and ask: *is there a simpler or more consistent approach with existing patterns?*

Signals to actually slow down and rethink:
- The fix involves a `setTimeout` / `setInterval` to "wait for" something.
- You're duplicating state across two places to keep them in sync.
- You're adding a new feature flag that overlaps with an existing one.
- You're catching an error and swallowing it without a logged reason.

If you're doing a one-line fix to a typo or a missing null check, **skip** the pause — over-thinking is its own bug.

---

## When to read which skill instead of this one

This skill is the *discipline layer*. For domain-specific how-tos:

- PingOne OAuth, PKCE, token exchange → `oauth-pingone`
- MCP server, tools, scope checks → `mcp-server`
- PingOne Management API → `pingone-api-calls`
- Session middleware, cookies, BFF custody, prod hardening → `bff-sessions`
- HITL consent, 428 enforcement, OTP flow → `hitl-consent`
- TS/JS style → `typescript-banking`

Read the domain skill **plus** this one when touching protected files.
