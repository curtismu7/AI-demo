# Logging as a Teaching Surface — Design

**Date:** 2026-05-15
**Status:** Approved in principle (brainstorming); pending written-spec review
**Author:** Curtis Muir (with Claude Code)

---

## 1. Context & Problem

BX Finance is an **educational demo**. Its entire purpose is to make the
OAuth 2.0 / OIDC / RFC 8693 token-exchange / MCP delegation story
**observable so people can learn it**. The UI Token Chain panel and the SSE
token stream to the front end already exist for exactly this reason.

A full-repo logging audit (2026-05-15, 3 parallel explore agents across all
10 services) found the logging system is **structurally immature and
inconsistent**, while *also* flagging extensive "CRITICAL token/PII leakage."

**The leakage findings are rejected.** They apply a production-bank threat
model. In this app, token/claim visibility is a *deliberate teaching feature*,
not a leak. Logs themselves are a teaching surface: a learner should be able
to read `/tmp/bank-*.log` and follow one request end-to-end with tokens and
claims fully visible.

The real problems are therefore **structural and pedagogical**, not security:

1. **No shared logging standard.** 3 services have real (3 *different*)
   loggers; 6 are raw `console.*` (~2,300 call sites total across the repo).
2. **No cross-service correlation.** A single request through
   agent → BFF → gateway → MCP → HITL cannot be traced; logs fragment across
   ~12 separate `/tmp/bank-*.log` files with no shared identifier.
3. **Redaction actively fights the teaching goal.** Python's
   `SensitiveDataFilter` and the BFF `mfaLogger` mask the very tokens/claims
   the demo exists to show. Python DEBUG token f-strings are half-masked by an
   `__str__` override — a bug *for a teaching tool*.
4. **Logs are event-spam, not narration.** Even where present, logs don't
   explain *what* delegation step is happening or *why*.
5. **No level consistency / rotation.** `LOG_LEVEL` honored in ~1 service;
   `/tmp/*.log` grows unbounded (acceptable per-session, but uncontrolled).

## 2. Objective

The logs serve **two co-equal purposes**:

1. **Teaching surface** — a legible, narrated, end-to-end traceable account
   of the OAuth/MCP delegation flow, with tokens/claims fully visible.
2. **Primary debugging instrument** — the logs are the tool of record for
   root-causing. A failure should be diagnosable from the logs alone
   (correlation id + operation + cause + timing + relevant state), without a
   fresh repro. `console.*` is the *exception*, not the default mechanism.

Both *without redacting, quieting, or minimizing anything visible today*.
Success criteria:

- A learner can `grep <correlation-id> /tmp/bank-*.log` and read the entire
  OAuth/MCP delegation flow as an ordered, narrated story; the same id
  appears in the UI Token Chain panel for that tool call.
- An engineer handed only the logs for a failed request can identify the
  failing hop, the operation, and the cause without re-running anything.

### `console.*` policy

`console.*` is reserved for cases where a structured logger genuinely cannot
run: pre-logger bootstrap, hard crash / `uncaughtException` handlers, and
build/CLI scripts. Everywhere else, the structured logger is the mechanism.
This **inverts today's state** (where ~2,300 raw `console.*` sites *are* the
logging) — so migration is repo-wide, not scope-limited.

### Non-goals (explicitly out of scope)

- No redaction of tokens, claims, JWTs, or PII that has teaching value.
- No "production-safe" mode / kill switch (decided: not wanted; single mode).
- No change to *what* is displayed in the UI Token Chain or SSE stream
  (only correlation metadata added to it).
- Repo-wide `console.*` migration is **prioritized**, not optional: ordering
  is (1) auth/OAuth/token-exchange/MCP-dispatch/consent paths, (2) request
  handlers & services, (3) remaining sites. Minimal-diff per file; no
  unrelated refactor while migrating. The end state is full migration, not a
  partial one.

## 3. Constraints (REGRESSION_PLAN / repo non-negotiables)

- **Token-custody transport rule still holds.** BFF remains sole token
  custodian; the browser never receives an `Authorization` header. The SSE /
  Token Chain stream is the *sanctioned* display path and is
  **regression-protected** — improve correlation into it, never break it.
- REGRESSION_PLAN §1 files in scope (`banking_api_server/middleware/auth.js`,
  `server.js`, `middleware/correlationId.js`, `banking_mcp_server`
  `TokenIntrospector.ts`): minimal diff; state what will not break before
  editing; §4 Bug Fix Log entry for the Python DEBUG f-string fix.
- Emoji rule: only `⚠️ ✅ ❌` anywhere, including log strings.
- UI build (`cd banking_api_ui && npm run build`) must exit 0 after any
  `banking_api_ui` edit.
- No emoji/marketing-page edits; minimal-diff discipline throughout.

## 4. Architecture

### 4.1 Logger standard

**Node/TS (9 services): pino as core engine only, wrapped in a
teaching-narration API.**

- pino provides levels, transport, and bounded rotation **only**.
- A thin canonical wrapper module (`teachLogger`) is copied per service
  (repo's existing "each service self-contained" style — no new workspace
  tooling). The wrapper exposes both a narration API (teaching) and a
  structured-diagnostic API (debugging), e.g.:
  - `log.step(n, total, '[TEACH] RFC 8693 exchange requested', { ... })`
    — teaching narration
  - `log.info` / `log.warn` / `log.error` — structured; `error` MUST capture
    the error cause/stack, the `operation`, and relevant state, never just a
    message string
  - Every line auto-carries `correlation_id`, `service`, `operation` so a
    failure is diagnosable from logs alone
  - **No redaction config.** Custom serializers *expand* token/claim and
    error objects rather than censor or truncate them.
- Field/event names mirror the Python `SecureLogger` contract
  (`correlation_id`, `session_id`, `user_id`, `operation`, `trace_id`) so
  cross-service and cross-language traces line up.
- `LOG_LEVEL` env honored everywhere; teaching-friendly default (`debug` in
  dev profile, `info` otherwise) — verbose in service of clarity.
- pino-pretty for human-readable dev output; consistent `[Service]` prefixes.

**Python (`langchain_agent`): keep `SecureLogger`, disable
`SensitiveDataFilter`.**

- Retain its structure (JSON, `trace_id`/`span_id`, event taxonomy) — it is
  the reference design.
- Turn **off** `SensitiveDataFilter` so tokens/claims/emails render fully,
  consistent with every Node service.
- Fix `mcp_tool_provider.py:613,614,620,982`: the DEBUG token f-strings are
  half-masked by the `AccessToken.__str__` override. For a teaching tool the
  correct behavior is to print the **real** token clearly. (§4 Bug Fix Log
  entry — this is a teaching-correctness bug fix.)
- Align its correlation field name to the shared `correlation_id` contract so
  one id spans Python + Node.

### 4.2 Cross-service correlation (headline feature)

- A single `X-Correlation-ID` is minted at the first hop (UI→BFF, or agent
  entry for agent-initiated flows) and propagated through **every** service
  and into RFC 8693 token-exchange call logs.
- BFF already has `middleware/correlationId.js` — **extend, don't replace**.
  Thread the id into `teachLogger` via async-local-storage so every line in a
  request carries it automatically.
- Gateway's `GwAuditTrail` (currently emitted only as the `X-Gw-Audit-Trail`
  response header) is **also written to the gateway log** under the same id.
- The same id is injected into the **SSE token-chain events** sent to the UI,
  so the on-screen Token Chain panel and the server logs share one trace
  identifier — UI and logs tell the *same* story for a given tool call.

### 4.3 Narration layer

At each teaching-critical moment, emit a consistent, greppable narrated
marker describing *what* and *why*, ordered as steps:

- `[TEACH] step 1/N: user token received (sub=…, scope=…)`
- `[TEACH] step k/N: RFC 8693 exchange → resource=…, actor=…`
- `[TEACH] step k/N: act claim evaluated → ✅ present | ⚠️ absent (why)`
- `[TEACH] step k/N: scope check → granted|denied`
- `[TEACH] step k/N: consent gate hit (HITL) → challengeId=…`

These augment, never replace, existing logs.

## 5. Data Flow (correlation, including SSE)

```
UI (cookie) ──▶ BFF: mint/echo X-Correlation-ID
  └─ teachLogger {correlation_id} via ALS
  └─ agentMcpTokenService RFC 8693 exchange → log {correlation_id}
  └─ SSE token-chain event → carries correlation_id  ──▶ UI Token Chain panel
  └─ WS ──▶ gateway: read header
        └─ teachLogger {correlation_id} + GwAuditTrail written to log
        └─ ──▶ mcp-server: read header → Logger/AuditLogger {correlation_id}
        └─ ──▶ hitl-service: read header → teachLogger {correlation_id}
Agent-initiated path: langchain_agent trace_id == correlation_id
                      (shared header contract, filter disabled)
```

Result: `grep <id> /tmp/bank-*.log` → ordered narrated story across all
services; same `<id>` visible in the UI Token Chain panel.

## 6. Error Handling

- Correlation middleware must **fail open**: a missing/malformed
  `X-Correlation-ID` generates a fresh one; it never blocks a request.
- `teachLogger` must never throw into request flow; logging failure degrades
  to `console.*` fallback (preserves current behavior on transport error).
- Disabling Python `SensitiveDataFilter` must not change log *structure*
  (event taxonomy, JSON shape) — only unmask values.
- Bounded rotation must preserve the **current session's** history (size cap
  large enough to keep a full demo run; no aggressive retention that deletes
  learnable history mid-session).

## 7. Testing

- **Visibility regression (inverse of normal):** assert tokens/claims/JWTs
  **still appear** in formatted log output after the refactor. This is the
  primary safety net — the risk here is *accidental redaction*, not leakage.
- **Correlation E2E:** one tool call → assert the same `correlation_id`
  string appears in BFF, gateway, mcp-server, hitl logs **and** in an SSE
  token-chain event captured by a UI test.
- **BFF two-tier pattern** (per CLAUDE.md) for any `correlationId.js` /
  `auth.js` change: regression (mocked configStore) + integration (real .env).
- **Level toggle:** `LOG_LEVEL` env verified to change verbosity per service.
- **Debuggability check:** for a representative induced failure (e.g. token
  exchange rejected), assert the logs alone contain failing hop, operation,
  correlation id, and error cause/stack — no repro needed to diagnose.
- **`console.*` policy check:** a lint/grep gate enumerates remaining
  `console.*` sites; each must fall in an allowed category (bootstrap, crash
  handler, build/CLI script) or be migrated.
- **UI build exit 0** after any `banking_api_ui` edit; targeted `npm test`
  for touched BFF logic.

## 8. Phasing (security-first ordering preserved, redefined as
correctness-first)

- **Phase 1 — Standardize & un-redact.** Introduce `teachLogger` (pino core,
  structured-diagnostic + narration API) per Node/TS service, migrating the
  priority-1 paths (auth/OAuth/token-exchange/MCP-dispatch/consent) off
  `console.*`; disable Python `SensitiveDataFilter`; fix Python DEBUG
  f-string masking bug (§4 entry). No correlation yet. Visibility +
  debuggability regression tests added.
- **Phase 2 — Correlation (headline).** `X-Correlation-ID` minted +
  propagated all hops + into RFC 8693 logs + into SSE token-chain events;
  gateway `GwAuditTrail` written to log. Correlation E2E test.
- **Phase 3 — Full migration + narration.** Complete priority-2/3
  `console.*` migration repo-wide (only allowed-category sites remain); add
  `[TEACH] step k/N` markers at the delegation teaching moments; enable the
  `console.*` policy lint/grep gate.

Each phase independently shippable and verifiable.

## 9. Open Questions

None blocking. (Logger choice, Python filter handling, redaction policy, SSE
scope, and plan ambition all resolved during brainstorming.)
