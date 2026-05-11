# Phase 267: Mortgage backend service — wire Path A end-to-end through MCP Gateway

**Gathered:** 2026-05-10
**Status:** Documenting interim work + scope decisions; awaiting Phase 266 Plan 01 execution before full planning.
**Source:** In-session user clarification (2026-05-10) after Phase 266 plans landed

---

<domain>
## Phase Boundary

Phase 266 originally documented Path A (api_key disposition) as Gateway-terminating with NO real backend call — the gateway swapped the user's OAuth bearer for a service API key and returned a marker. After execution-time review the user clarified: the api_key path needs to call a REAL backend so the demo is honest. Phase 267 closes that gap.

**Scope:**
- A new standalone Node service `banking_mortgage_service` on port 8082, gated by `X-API-Key`, returning a dummy mortgage record.
- The MCP gateway's api_key disposition (introduced by Phase 266 Plan 01) now dispatches to this service via HTTP GET with `X-API-Key`.
- A new OAuth scope `banking:mortgage:read` that the gateway requires on the user's MCP-side bearer before performing the swap.
- BankingAgent's `mortgage_demo` action calls the gateway tool `show_mortgage` and navigates to `/path/mortgage` with the result.

**Pre-built (interim, before Phase 267 formally executes):**
- `banking_mortgage_service/` directory with `server.js`, `package.json`, `.env.example`, and `__tests__/server.test.js` (6 tests passing). Single route `GET /mortgage` gated by constant-time-compare X-API-Key middleware.
- `run-bank.sh` wired: `LOG_MORTGAGE`, `PID_MORTGAGE`, port 8082 in sweep loops, status-line entry, SVC_LIST entry, `wait_for_port 8082`, launch block after MCP Invest.
- `banking_api_server/config/scopes.js` — `COMPOUND_SCOPES.MORTGAGE_READ = 'banking:mortgage:read'`; added to `customer` and `ai_agent` allowed-scope lists.
- `banking_api_server/services/nlIntentParser.js` — regex recognizes "show mortgage data", "show my mortgage", "mortgage", "home loan" → `action: 'mortgage_demo'`.
- `banking_api_ui/src/components/MortgagePathPage.jsx` + CSS — amber Path A page reading `location.state.mortgagePayload`; renders empty-state if state missing.
- `banking_api_ui/src/components/BankingAgent.js` — `case "mortgage_demo"` navigates to `/path/mortgage` (will be upgraded to `callMcpTool('show_mortgage')` once Phase 266 Plan 01 ships the gateway routing).
- `banking_api_ui/src/components/Phase266ArchitecturePage.jsx` — diagram shows `banking_mortgage_service :8082` as a live node behind the gateway via X-API-Key edge.

**What Phase 267 STILL NEEDS TO BUILD (planning + execution required):**
1. Gateway routing — extend `banking_mcp_gateway/src/router.ts` so `show_mortgage` tool → `apikey` target → `backendHttpUrl` returns `http://localhost:8082/mortgage`. Depends on Phase 266 Plan 01 introducing the 3-disposition router shape.
2. Gateway dispatch — extend `banking_mcp_gateway/src/index.ts` api_key branch to actually `axios.get(url, { headers: { 'X-API-Key': config.demoApiKeyServiceKey } })` and return the upstream payload as `result.content` + `_meta.tokenEvents`. Depends on Phase 266 Plan 01's selectCredentialForBackend + dispatch skeleton.
3. Scope enforcement — gateway's `guardToolCall` must verify the user's MCP-side bearer carries `banking:mortgage:read` before calling `selectCredentialForBackend` on the api_key path; otherwise return JSON-RPC `-32403 insufficient_scope`.
4. PingOne configuration — `banking:mortgage:read` added as a custom resource scope on the banking-api resource; granted to the AI_AGENT app and to the customer user profile.
5. BankingAgent dispatch upgrade — `case "mortgage_demo"` calls `callMcpTool('show_mortgage')` and navigates with `state.mortgagePayload = response.result`. Currently just navigates to the empty state.
6. ArchitectureFlowPage.js — flip the existing aspirational `api-key-backend` node to `aspirational: false` + relabel to `banking_mortgage_service`.
7. Tests — gateway `dispatch.test.ts` covering `show_mortgage` → axios.get to 8082 with X-API-Key; scope-guard regression test (no `banking:mortgage:read` → 403); end-to-end smoke confirming the SPA renders the mortgage card after the prompt.

</domain>

<decisions>
## Implementation Decisions

### Service shape
- `banking_mortgage_service` is a plain CJS Node service (no TypeScript, no MCP/WebSocket complexity). Mirrors the minimal-Express style of `banking_hitl_service`. Single route. Constant-time-compare X-API-Key middleware to avoid trivial timing attacks (cheap to do; not strictly required for a demo).
- Port 8082 (sibling to invest 8081). Configured via `MORTGAGE_SERVICE_PORT` env var.
- API key configured via `MORTGAGE_SERVICE_API_KEY` env var (default `demo-mortgage-key-0000`). Must match `config.demoApiKeyServiceKey` on the gateway side.

### Scope decision (user-confirmed 2026-05-10)
- **New scope: `banking:mortgage:read`** (NOT reusing `banking:read`).
- Rationale: domain-specific scope = least-privilege story. The demo can show "the AI agent needs separate consent to access mortgage data, distinct from accounts/transactions" — a teachable moment that reusing `banking:read` would erase.
- Added to `COMPOUND_SCOPES.MORTGAGE_READ` in `banking_api_server/config/scopes.js` (existing pattern alongside `banking:accounts:read` and `banking:transactions:read`).
- Customer + ai_agent user-type lists granted this scope. Admin gets it transitively via `BANKING_SCOPES.ADMIN`.
- PingOne setup required: add the scope to the banking-api resource server's allowed scope list AND to the AI_AGENT app's requested scopes. This is a PingOne console task, not code.

### Gateway routing (user-confirmed 2026-05-10)
- The MCP Gateway is the SOLE caller of `banking_mortgage_service`. The SPA and BFF never call port 8082 directly.
- The previously-attempted BFF shortcut (`/api/path/mortgage` route in `banking_api_server`) was REMOVED — it short-circuited the gateway and broke the "gateway is traffic cop" framing.
- This means: until Phase 267's gateway dispatch wiring ships, the demo path doesn't WORK end-to-end. The SPA empty state acknowledges this honestly.
- Acceptable tradeoff: the interim state delivers the service + scope + UI + diagram pieces while the gateway routing waits on Phase 266 Plan 01 execution.

### Auth on the wire (user-confirmed 2026-05-10)
- Service-to-service: `X-API-Key` header ONLY. No OAuth bearer reaches the mortgage service.
- Gateway holds the API key in `config.demoApiKeyServiceKey` (Phase 266 Plan 01 introduces this config field).
- The mortgage service does NOT verify any user identity. It trusts the gateway. The gateway holds the user-scope check before performing the swap.
- This is the simplest possible demo of the X-API-Key pattern. A production version might add HMAC request signing or mTLS; out of scope here.

### Data shape (user-confirmed 2026-05-10)
- Single mortgage record (not a list). Fields: id, propertyAddress, loanAmount, currentBalance, interestRate, monthlyPayment, nextPaymentDate, term, originationDate, currency.
- Static — does NOT need SQLite. Inline in the route handler. The demo's point is "show the credential mechanism worked," not "explore mortgage records."

### Result page (user-confirmed 2026-05-10)
- Amber theme + "API-KEY PATH" badge + "Back to Dashboard" button — same Path A presentation as the rest of Phase 266.
- Mortgage data card with all the fields above; current-balance row highlighted (amber accent).
- Credential-swap explanation card with the masked API key (last 4 chars) prominently displayed — teaches "the gateway used THIS key to fetch THIS data."

</decisions>

<canonical_refs>
## Canonical References

- `banking_mortgage_service/server.js` — interim service implementation
- `banking_mortgage_service/__tests__/server.test.js` — 6 passing tests
- `banking_api_server/config/scopes.js` lines 44-58 — COMPOUND_SCOPES.MORTGAGE_READ + customer/ai_agent allowed lists
- `banking_api_server/services/nlIntentParser.js` — mortgage_demo action pattern
- `banking_api_ui/src/components/MortgagePathPage.jsx` — Path A SPA page
- `banking_api_ui/src/components/Phase266ArchitecturePage.jsx` — architecture diagram showing the live mortgage service
- `run-bank.sh` — service lifecycle (LOG_MORTGAGE, PID_MORTGAGE, ports 8082)
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-CONTEXT.md` — Phase 266 context; Phase 267 extends Path A from "Gateway-terminating marker" to "real backend with X-API-Key"
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-SPECS.md` — IETF/MCP spec catalogue; Phase 267 adds no new specs (X-API-Key is not a standardized OAuth flow — it's a demo pattern)
- `CLAUDE.md` §Node services table — must be updated when Phase 267 ships to include `banking_mortgage_service` as the 8th service

</canonical_refs>

<deferred>
## Deferred Ideas

- Replace X-API-Key with mTLS or HMAC request signing — production-grade service-to-service auth. Out of scope for a demo.
- Persist mortgage data in SQLite alongside `banking-resource-server.db` — currently static inline.
- Multi-mortgage user accounts — currently every user sees the same single mortgage record.
- Mortgage write operations (payment, refinance) — currently read-only.
- ID-token forwarding to the mortgage service for user-personalization — currently the service doesn't know who the user is; the gateway is the user-identity authority for Path A. A future phase could pass user `sub` via a signed header or upgrade Path A to dual_token shape.
- Hooks for the existing Token Chain UI to show the X-API-Key swap visually — depends on Phase 266 Plan 03 execution.

</deferred>

---

*Phase: 267-mortgage-backend-wire-path-a-through-mcp-gateway*
*Context recorded: 2026-05-10 — interim work captured for future planning*
*Plans not yet generated — run `/gsd-plan-phase 267` after Phase 266 Plan 01 is on main*
