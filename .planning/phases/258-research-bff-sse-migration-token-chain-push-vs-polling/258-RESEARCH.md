---
phase: 258
title: "Research BFF SSE migration — token chain push vs polling"
type: research
status: complete
date: 2026-05-01
---

# Research: BFF SSE Migration — Token Chain Push vs Polling

## Question

Should all BFF data delivery (token events, app events, session preview) move from
polling to Server-Sent Events (SSE), and what are the security and compatibility
implications?

---

## Current State Audit

### Polling surfaces (client polls BFF)

| Endpoint | Consumer | Interval | What it delivers |
|---|---|---|---|
| `GET /api/tokens/session-preview` | `UnifiedTokenFlowInspector`, `ExchangeModeToggle`, `SessionExpiryTimer`, `OAuthTokenDisplayPage` | 10 s (inspector), 30 s (timer), on-demand | User token claims, exchange mode, session expiry |
| `GET /api/app-events` | `ArchitectureOverviewPage`, `spinnerActivityService` | 10 s, during active tool calls | MCP tool call log, activity events |
| `GET /api/mcp/traffic` | `McpTrafficPage` | configurable `API_POLL_MS` | Raw MCP WebSocket frames |
| `GET /api/oauth-debug-log` | `OAuthDebugLogViewer` | 5 s | OAuth debug log tail |
| `GET /api/tokens/session-preview` (server check) | `DemoServerCheckModal` | configurable | Server health |
| `TokenChainContext.fetchMCPToolCalls` | `TokenChainContext` | 15 s | Aggregated token chain calls |

**Token events specifically** are NOT polled — they are embedded in the POST
`/api/mcp/tool` JSON response as `tokenEvents[]` and picked up synchronously by
`BankingAgent.js → appendTokenEvents()`. This is the most critical flow.

### Existing SSE surfaces (BFF pushes to client)

| Endpoint | Consumer | Hub service | What it delivers |
|---|---|---|---|
| `GET /api/pingone-test/events` | `PingOneTestPage` | `pingoneTestSseHub.js` | Token + exchange events for the test wizard |
| `GET /api/mcp/tool/events?trace=<uuid>` | `WebMcpPanel.js` | `mcpFlowSseHub.js` | Live pipeline phase events during a single MCP tool call |

Two fully working SSE hubs already exist on the BFF.

---

## Security Analysis

### Why SSE is more secure than polling

| Concern | Polling | SSE |
|---|---|---|
| **Idle requests expose session cookie** | Yes — every interval fires an authenticated request even when nothing changed | No — one long-lived connection; cookie presented once at handshake |
| **CSRF surface** | Each GET request is a potential CSRF target (mitigated by SameSite=Lax, but not eliminated) | One connection at mount — standard SameSite cookie protections apply equally |
| **Token in URL** | None — BFF uses session cookies | None — same |
| **Rate-limit amplification** | N connections × N poll intervals = many requests under load | 1 connection per client; events sent on change only |
| **Server resource (keep-alive connections)** | Low per-request cost, but repeated auth middleware on every poll | Higher per-connection resource (held socket), but fewer requests |

**Verdict:** SSE is **modestly more secure** — fewer repeated authenticated requests reduces the
attack surface, but the difference is small for a demo app on SameSite=Lax session cookies.
The main security wins are: reduced CSRF exposure and no interval amplification under load.

### What SSE does NOT fix

- SSE does not add token-in-header authentication (the BFF uses session cookies;
  that doesn't change with SSE).
- SSE on HTTP/1.1 is limited to 6 connections per origin per browser tab (shared with
  existing XHR). The app currently has several polling intervals; converting them all
  to SSE could hit browser connection limits without HTTP/2.
- Vercel serverless functions have a **response timeout** (default 10 s, max 60 s on Pro).
  Long-lived SSE streams are **not compatible with serverless**. The BFF runs on Node.js
  (Railway/Render in production), so this is fine — but it rules out Vercel edge/serverless
  for SSE endpoints. `REGRESSION_PLAN.md §3` notes the Vercel deployment constraint.

---

## Compatibility Analysis — Will migration break anything?

### Token events (the main Token Chain flow)

**Current:** `POST /api/mcp/tool` → synchronous JSON response with `tokenEvents[]` embedded.
BankingAgent picks up tokenEvents in the `.then()` of each tool call.

**SSE approach:** Open an SSE stream before calling `POST /api/mcp/tool`, listen for
token events on the stream, close it when the response arrives.
`WebMcpPanel.js` already does exactly this pattern (opens `GET /api/mcp/tool/events?trace=uuid`
before posting, closes on result).

**Data loss risk:** None, if implemented correctly. The SSE hub buffers events until the
GET listener is attached (mcpFlowSseHub pattern). However:
- Every `appendTokenEvents()` call site in `BankingAgent.js` (6 locations) must be
  updated to read from the SSE stream instead of the response body.
- Token events from error paths also return `tokenEvents` — these must still be
  captured on SSE stream disconnect.

**Verdict:** Migration is feasible but **non-trivial** — requires coordinating 6+
`appendTokenEvents` call sites and handling the error/abort cases.

### Session preview polling

**Current:** 10–30 s polling → low urgency, no real-time requirement.

**SSE approach:** BFF emits an event when the session changes (login, token refresh,
exchange mode toggle). Client updates on push.

**Data loss risk:** Low. Session data changes infrequently. SSE here is a genuine
simplification — one connection instead of a timer in every component.

**Verdict:** Good candidate for SSE, **medium effort**.

### App-events polling

**Current:** `GET /api/app-events` polled every 10 s and on tool-call completion.

**SSE approach:** `appEventService.js` emits events to an SSE hub on every `logEvent()` call.

**Data loss risk:** None if hub is in the same process. In multi-process/cluster
deployments, a pub-sub layer (Redis pub-sub) would be needed to fan out.

**Verdict:** Good candidate for SSE, **low–medium effort**.

### MCP traffic polling

**Current:** Polling raw WebSocket frames.

**SSE approach:** MCP gateway already emits frames through the BFF — wire those to an SSE hub.

**Verdict:** Good candidate, **medium effort**.

---

## Migration Options

### Option A — Full SSE migration

Convert all polling to SSE. Introduce a unified `bffEventHub.js` service that all
BFF services publish to. Single `GET /api/events` endpoint with `type` filtering.

**Pros:** Consistent, no polling noise, lower request volume, educational (shows SSE in action).
**Cons:** Highest implementation effort; must handle reconnect logic on client; connection-limit
risk without HTTP/2; requires careful coordination with Vercel deploy if that path is used.
**Effort estimate:** 5–7 plans.

### Option B — SSE for token chain only (recommended for demo value)

Extend `mcpFlowSseHub` to cover all token events in the main agent flow.
`BankingAgent.js` opens `GET /api/mcp/tool/events?trace=<uuid>` before each tool call
(already done in `WebMcpPanel.js`), closes on response. Token events stream live as they
are emitted by the BFF instead of waiting for the full response.

**Pros:** Highest educational value (token events visible in real time as each OAuth step
completes, not in a batch at the end); WebMcpPanel pattern already proven; limited scope.
**Cons:** Other polling surfaces remain; 6+ appendTokenEvents call sites to update.
**Effort estimate:** 2–3 plans.

### Option C — Keep polling, improve consistency (no migration)

Add a note in education panels that the token chain uses pull-based delivery.
Convert `session-preview` to SSE only (trivial, low risk). Leave tool-call token events
as response-body because synchronous delivery is simpler and sufficient.

**Pros:** No regression risk; lowest effort.
**Cons:** Inconsistency remains; polling noise in server logs; minor security gap.
**Effort estimate:** 0–1 plans.

---

## Recommendation

**Option B** — SSE for token chain events only.

Rationale:
1. The `mcpFlowSseHub` pattern is **already working** in `WebMcpPanel.js`. This is not a
   new capability — it's extending an existing proven pattern to `BankingAgent.js`.
2. Live token events (streaming as OAuth steps complete) dramatically improve the
   **educational value** of the Token Chain panel — the user watches each step appear in
   real time rather than seeing a batch dump after the tool finishes.
3. Minimal regression risk: the SSE hub already buffers; error-path events can remain
   in the response body as a fallback if the SSE connection dropped.
4. Does **not** require converting the simpler polling surfaces (session preview, app events),
   which can remain as-is or be a follow-on phase.

### What to NOT break during migration

- `appendTokenEvents()` must still be called — just from SSE events, not response body.
- The `tokenEvents[]` field in POST `/api/mcp/tool` response should remain (backward
  compat with any non-SSE consumers or tests) but can be `[]` when SSE is active.
- `exchanged-token-verified`, `user-token-introspection`, and all new JWKS verify event
  IDs added in the Phase 235 work must flow through SSE correctly.

---

## Files That Would Change

### BFF (banking_api_server/)
| File | Change |
|---|---|
| `services/mcpFlowSseHub.js` | Extend to publish all `buildTokenEvent` calls from the tool-call path |
| `server.js` `/api/mcp/tool` handler | Publish tokenEvents to mcpFlowSseHub during execution; keep `tokenEvents` in response as `[]` or fallback |
| `services/agentMcpTokenService.js` | Call `mcpFlowSseHub.publish()` at each `pushJwksVerifyEvent` and introspection point |

### UI (banking_api_ui/src/)
| File | Change |
|---|---|
| `components/BankingAgent.js` | Open SSE before each tool call (reuse `openMcpToolStream` from `services/bankingAgentService.js`); remove 6× `appendTokenEvents(response.tokenEvents)` calls; push events from SSE listener instead |
| `services/bankingAgentService.js` | Expose `openMcpToolStream` for use by BankingAgent (it may already be there) |
| `components/UnifiedTokenFlowInspector.jsx` | Token chain will update via SSE events via `appendTokenEvents` → no polling change needed; existing 10 s poll can remain as fallback |

### No change needed
- `components/TokenChainDisplay.js` — event rendering unchanged
- `services/apiTrafficStore.js` — `appendTokenEvents` API unchanged
- All education panels

---

## Conclusion

SSE migration is **safe and beneficial** for token chain events. It does **not** limit
data — it delivers the same events faster (streaming vs batch). The main risk is the
6 `appendTokenEvents` call sites in `BankingAgent.js`, which is manageable.
The `mcpFlowSseHub` infrastructure already exists and works. Plan B can be
implemented in 2–3 targeted plans with no regression to existing token validation
or JWKS/introspection flows.
