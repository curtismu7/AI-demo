# Phase 267: Mortgage backend service — wire Path A end-to-end through MCP Gateway

**Gathered:** 2026-05-10 (initial), 2026-05-11 (revised after Phase 266 shipped)
**Status:** Ready for planning. Phase 266 complete; gray areas resolved.
**Source:** Two discuss-phase passes — initial scoping (2026-05-10) + post-266 reconciliation (2026-05-11)

---

<domain>
## Phase Boundary

Phase 266 originally documented Path A (api_key disposition) as Gateway-terminating with NO real backend call. The user clarified Phase 267 closes that gap by adding a real backend service called via X-API-Key.

**Important:** Phase 266 actually shipped the `apikey` target as Gateway-only with two static-marker tools (`special_offers`, `user_profile_card`). Phase 267 EXTENDS that target with HTTP dispatch capability — it does NOT replace it. Other apikey tools remain Gateway-only markers; `show_mortgage` becomes the first one that actually calls a backend.

**Scope:**
- A new standalone Node service `banking_mortgage_service` on port 8082, gated by `X-API-Key`, returning a dummy mortgage record.
- The MCP gateway's apikey disposition (introduced by Phase 266 Plan 01) is extended to support HTTP dispatch when `router.backendHttpUrl()` returns a non-empty URL for the tool. show_mortgage routes via HTTP; existing apikey tools continue to return the Gateway-only marker.
- A new OAuth scope `banking:mortgage:read` that the gateway requires on the user's MCP-side bearer before performing the swap.
- BankingAgent's `mortgage_demo` action calls the gateway tool `show_mortgage` and navigates to `/path/mortgage` with the result.

**Pre-built (interim, before Phase 267 formally executes):**
- `banking_mortgage_service/` directory with `server.js`, `package.json`, `.env.example`, and `__tests__/server.test.js` (6 tests passing). Single route `GET /mortgage` gated by constant-time-compare X-API-Key middleware.
- `run-bank.sh` wired: `LOG_MORTGAGE`, `PID_MORTGAGE`, port 8082 in sweep loops, status-line entry, SVC_LIST entry, `wait_for_port 8082`, launch block after MCP Invest.
- `banking_api_server/config/scopes.js` — `COMPOUND_SCOPES.MORTGAGE_READ = 'banking:mortgage:read'`; added to `customer` and `ai_agent` allowed-scope lists.
- `banking_api_server/services/nlIntentParser.js` — regex recognizes "show mortgage data", "show my mortgage", "mortgage", "home loan" → `action: 'mortgage_demo'`.
- `banking_api_ui/src/components/MortgagePathPage.jsx` + CSS — amber Path A page reading `location.state.mortgagePayload`; renders empty-state if state missing.
- `banking_api_ui/src/components/BankingAgent.js` — `case "mortgage_demo"` navigates to `/path/mortgage` (will be upgraded to `callMcpTool('show_mortgage')` once Phase 267 ships the gateway dispatch).
- `banking_api_ui/src/components/Phase266ArchitecturePage.jsx` — diagram shows `banking_mortgage_service :8082` as a live node behind the gateway via X-API-Key edge.

**What Phase 267 STILL NEEDS TO BUILD (planning + execution required):**

1. **Gateway routing** — extend `banking_mcp_gateway/src/router.ts` so `show_mortgage` is registered in `APIKEY_TOOLS`, and `backendHttpUrl(target, toolName)` returns `http://localhost:8082/mortgage` when target=apikey AND toolName=show_mortgage. Other apikey tools continue to return empty string (Gateway-only marker).
2. **Gateway dispatch** — extend `banking_mcp_gateway/src/index.ts` apikey branch: BEFORE returning the static marker, check `router.backendHttpUrl(target, toolName)`. If non-empty, dispatch via `axios.get(url, { headers: { 'X-API-Key': config.demoApiKeyServiceKey, 'X-User-Sub': sub } })` and merge upstream payload into `result.content`. Add `_meta.maskedApiKey: 'xxxx0000'` (last-4) and `_meta.tokenEvents`. If empty, keep existing Gateway-only marker behavior.
3. **Scope enforcement** — `show_mortgage` tool definition gets `requiredScopes: ['banking:mortgage:read']`. Gateway's existing `guardToolCall` (Phase 266) verifies scope presence on the user's MCP-side bearer BEFORE `selectCredentialForBackend()`; absent → JSON-RPC `-32403 insufficient_scope`.
4. **`special_offers` removal** — Phase 266's `special_offers` apikey tool is replaced by `show_mortgage`. Update APIKEY_TOOLS set, gateway dispatch, and any test files referencing special_offers.
5. **PingOne configuration documentation** — phase ships a console task checklist (add `banking:mortgage:read` to banking-api resource server's allowed scopes + grant to AI_AGENT app) plus a small verify check that confirms the scope appears in the user's token after re-login (e.g., a temporary `/api/admin/scope-check` route or an existing endpoint that surfaces the user's granted scopes).
6. **BankingAgent dispatch upgrade** — `case "mortgage_demo"` calls `callMcpTool('show_mortgage')` and navigates with `state.mortgagePayload = response.result`. Currently just navigates to the empty state.
7. **ArchitectureFlowPage.js + mermaid sources** — flip the existing aspirational `api-key-backend` node to `aspirational: false` + relabel to `banking_mortgage_service`. Update `architecture.mmd`, `architecture-simple.mmd`, `i4ai-ref-arch.mmd`, `mcp-security-gateway.mmd` to show the X-API-Key edge with the X-User-Sub annotation.
8. **Tests** — gateway `dispatch.test.ts` covering (1) show_mortgage → axios.get to 8082 with X-API-Key + X-User-Sub, (2) scope-guard regression (no banking:mortgage:read → -32403), (3) maskedApiKey appears in `_meta`. Plus one integration test spinning up `banking_mortgage_service` on a random port and confirming end-to-end. UI smoke test confirming MortgagePathPage renders the mortgage card after dispatch.

</domain>

<decisions>
## Implementation Decisions

### Architecture choice (user-confirmed 2026-05-11)
- **Extend the existing `apikey` target with conditional HTTP dispatch** — do NOT introduce a 4th `apikey_backend` target. The router's `backendHttpUrl(target, toolName)` returns non-empty when dispatch is needed, empty otherwise. Same target, two behaviors gated by lookup. Minimal blast radius; preserves Phase 266 semantics for `user_profile_card`; replaces `special_offers` with `show_mortgage`.

### Tool naming (user-confirmed 2026-05-11)
- **Replace `special_offers` with `show_mortgage`** in APIKEY_TOOLS. Phase 266's `special_offers` was a stub with no real backend; repurpose its slot rather than accumulate dead tool names. `user_profile_card` stays.

### Request shape on the wire (user-confirmed 2026-05-11)
- **`X-API-Key` + `X-User-Sub` (plain, unsigned)** — gateway sends both headers. Service trusts the headers because possession of the correct API key IS the trust boundary. No HMAC, no JWT, no mTLS. Mortgage service can log/echo the sub but performs no identity verification of its own. Matches Phase 266/267's demo-grade auth posture.

### Scope check location (user-confirmed 2026-05-11)
- **In gateway's `guardToolCall()` before `selectCredentialForBackend()`** — single chokepoint. show_mortgage tool definition gets `requiredScopes: ['banking:mortgage:read']`. guardToolCall returns JSON-RPC `-32403 insufficient_scope` if absent. Consistent with how other tools enforce scopes.

### API key masking (user-confirmed 2026-05-11)
- **Gateway echoes `_meta.maskedApiKey: 'xxxx<last4>'` in the tool result.** SPA reads from `result._meta.maskedApiKey`. No new BFF route. Matches the `_meta.tokenEvents` pattern Phase 266 established. Phase 267 CONTEXT line 57 explicitly removed the BFF `/api/path/mortgage` shortcut for the same "gateway is traffic cop" reason.

### Testing strategy (user-confirmed 2026-05-11)
- **Two-tier: mocked-axios regression + integration smoke.** Regression tests mock `axios.get` to verify URL, headers, scope-guard behavior, and maskedApiKey injection. One integration test spawns `banking_mortgage_service` on a random port for true end-to-end confidence. Same pattern as Phase 266's tests (regression + integration).

### PingOne setup (user-confirmed 2026-05-11)
- **Include console task list + verify endpoint.** SUMMARY.md will document the manual PingOne steps (add scope to banking-api resource server's allowed scopes, grant to AI_AGENT app). Plus a small verify check (or surfacing of granted scopes in an existing endpoint) so a fresh install can confirm the scope landed before running the demo.

### Diagram updates (user-confirmed 2026-05-11)
- **Flip aspirational api-key-backend node to live + update all 4 mermaid sources.** Diagrams reflect that the mortgage service is real and called via X-API-Key + X-User-Sub. PNGs regenerated as in Phase 266 Plan 05.

### Service shape (user-confirmed 2026-05-10)
- `banking_mortgage_service` is a plain CJS Node service (no TypeScript). Mirrors `banking_hitl_service`. Single route. Constant-time-compare X-API-Key middleware.
- Port 8082 (sibling to invest 8081). Configured via `MORTGAGE_SERVICE_PORT`.
- API key via `MORTGAGE_SERVICE_API_KEY` env var (default `demo-mortgage-key-0000`). Must match `config.demoApiKeyServiceKey` on the gateway side.
- Phase 267 adds X-User-Sub reading: service should accept it (even if it only logs / echoes it back in the response payload for the demo's pedagogical value).

### Scope decision (user-confirmed 2026-05-10)
- **New scope: `banking:mortgage:read`** (NOT reusing `banking:read`).
- Rationale: domain-specific scope = least-privilege story. The demo can show "the AI agent needs separate consent to access mortgage data, distinct from accounts/transactions" — a teachable moment that reusing `banking:read` would erase.
- Added to `COMPOUND_SCOPES.MORTGAGE_READ` in `banking_api_server/config/scopes.js`.
- Customer + ai_agent user-type lists granted this scope. Admin gets it transitively via `BANKING_SCOPES.ADMIN`.

### Gateway-is-traffic-cop framing (user-confirmed 2026-05-10)
- The MCP Gateway is the SOLE caller of `banking_mortgage_service`. The SPA and BFF never call port 8082 directly.
- The previously-attempted BFF shortcut (`/api/path/mortgage` route in `banking_api_server`) was REMOVED — it short-circuited the gateway and broke the framing.
- Until Phase 267's gateway dispatch wiring ships, the demo path doesn't WORK end-to-end. The SPA empty state acknowledges this honestly.

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
- `banking_api_server/config/scopes.js` — COMPOUND_SCOPES.MORTGAGE_READ + customer/ai_agent allowed lists
- `banking_api_server/services/nlIntentParser.js` — `mortgage_demo` action pattern
- `banking_api_ui/src/components/MortgagePathPage.jsx` — Path A SPA page
- `banking_api_ui/src/components/Phase266ArchitecturePage.jsx` — architecture diagram showing the live mortgage service
- `run-bank.sh` — service lifecycle (LOG_MORTGAGE, PID_MORTGAGE, port 8082)
- `banking_mcp_gateway/src/router.ts` — Phase 266 BackendTarget type + routeTool + backendHttpUrl
- `banking_mcp_gateway/src/index.ts` line ~359-420 — Phase 266 apikey dispatch branch (currently Gateway-only marker)
- `banking_mcp_gateway/src/credentialSwap.ts` — Phase 266 disposition selector
- `banking_mcp_gateway/src/pingAuthorizeGuard.ts` (or wherever guardToolCall lives) — scope-check chokepoint
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-01-SUMMARY.md` — Phase 266 Plan 01 outputs (credentialSwap, router targets, BFF /internal/id-token)
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-CONTEXT.md` — Phase 266 context; Phase 267 extends Path A from "Gateway-terminating marker" to "real backend with X-API-Key"
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-SPECS.md` — IETF/MCP spec catalogue; Phase 267 adds no new specs (X-API-Key is not a standardized OAuth flow — it's a demo pattern)
- `CLAUDE.md` §Node services table — must be updated when Phase 267 ships to include `banking_mortgage_service` as the 8th service

</canonical_refs>

<deferred>
## Deferred Ideas

- Replace X-API-Key with mTLS or HMAC request signing — production-grade service-to-service auth. Out of scope for a demo.
- HMAC-sign the X-User-Sub header so the mortgage service can verify it came from the gateway and not a malicious caller spoofing the API key. Adds complexity not needed when API key itself is the trust boundary.
- JWT-format X-User-Sub (gateway issues short-lived JWT). Heavier still; introduces JWT signing keys.
- Persist mortgage data in SQLite alongside `banking-resource-server.db` — currently static inline.
- Multi-mortgage user accounts — currently every user sees the same single mortgage record.
- Mortgage write operations (payment, refinance) — currently read-only.
- ID-token forwarding to the mortgage service for user-personalization — currently the service doesn't know who the user is beyond the sub claim. A future phase could upgrade Path A to dual_token shape.
- Hooks for the existing Token Chain UI to show the X-API-Key swap visually — depends on the path-badge plumbing Phase 266 Plan 03 already shipped.

</deferred>

---

*Phase: 267-mortgage-backend-wire-path-a-through-mcp-gateway*
*Context recorded: 2026-05-10 (initial) + 2026-05-11 (revised post-Phase 266)*
*Ready to plan — run `/gsd-plan-phase 267`*
