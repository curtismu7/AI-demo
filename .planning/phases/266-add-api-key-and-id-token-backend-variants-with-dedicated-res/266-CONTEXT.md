# Phase 266: Add API-key and ID-token backend variants with dedicated result pages — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning (REVISION 2 — user added banking_resource_server + SQLite decisions)
**Source:** Roadmap section + in-session user clarifications (2026-05-10)

**Revision history:**
- 2026-05-10 R1: Pivot from "two new backend services" to "three gateway dispositions; only existing OAuth resource server returns data"
- 2026-05-10 R2: Added banking_resource_server naming; Path B and Path C both served by extended `banking_api_server/routes/resourceServer.js`; SQLite-backed bank data in new `banking_api_server/data/persistent/banking-resource-server.db`; both paths require valid access token (existing `authenticateToken` middleware); banking-resource-server.db seeded on first BFF boot, idempotent; Path B returns decoded claims ONLY

---

<domain>
## Phase Boundary

This phase demonstrates THREE distinct credential paths from the Gateway, each terminating in a visibly-distinct surface in the SPA so a viewer can tell at a glance which credential mechanism was used.

Paths B and C are both served by a single logical resource server we are naming **`banking_resource_server`**, which is implemented as an extension of the existing `banking_api_server/routes/resourceServer.js` route module (no new Node service — same port 3001, same process). The `authenticateToken` middleware already mounted at `/api/resource-server/*` (see `server.js:846`) validates the PingOne access token (signature, exp, aud) on every request, so both data-returning paths are gated by the same OAuth check. **Without a valid access token, paths B and C return nothing.**

Path A is the only path that does not reach a backend — it terminates inside the Gateway.

The three paths terminate as follows:

1. **Path A — API-Key path (Gateway-only, no backend call):**
   - Gateway swaps the user's OAuth token for a configured service API key.
   - Gateway records the swap in Token Chain (`_meta.tokenEvents`) and returns a marker response.
   - **No backend call is made.** The flow stops at the Gateway.
   - SPA routes the response to a new info page with amber visual identity, "API-KEY PATH" badge, masked API-key string (last 4 chars), explanation text, and a "Back to Dashboard" button.

2. **Path B — Access-Token + ID-Token path (banking_resource_server, identity route — accepts BOTH HTTP verbs):**
   - The `/api/resource-server/identity` endpoint accepts BOTH `POST` (used by the gateway with wire-forwarded id_token) AND `GET` (used by the SPA's `AccessIdTokenPathPage` direct fetch). Both verbs bind to the same handler.
   - **Gateway path (POST):** Gateway POSTs a JSON-RPC envelope `{ jsonrpc:'2.0', method:'identity.show', params:{ idToken }, id }` to the backend route. Bearer in Authorization header; id_token in `params.idToken` (body). JSON-RPC is a POST protocol; bodies are unambiguous on POST. The earlier B1 hesitation about "GET-with-body unreliability" was misplaced — using POST resolves both the protocol-correctness issue and the Upstash header-size concern in one move. Real-world correct: if `banking_resource_server` is split into a separate process later (no shared session), the gateway-forward IS the source of truth for the id_token.
   - **SPA path (GET):** AccessIdTokenPathPage calls `bffAxios.get('/api/resource-server/identity')` when the user arrives at the route after BankingAgent dispatched them there. The SPA does NOT have the raw id_token (token custody — id_token lives only on the BFF), so it can't supply one in the body. The route reads `req.session.oauthTokens.idToken` for SPA callers. This is fine because the SPA's bffAxios call carries the session cookie, and the BFF middleware binds session ↔ bearer ↔ user.
   - Both verbs inherit the existing `authenticateToken` middleware (mounted at server.js:846) — the access token is validated (signature/exp/aud) before the handler runs, regardless of verb.
   - id_token resolution: `req.body.params.idToken` (primary, gateway POST) → `req.session.oauthTokens.idToken` (fallback, SPA GET or shared-process scenarios). Both paths decode server-side, return CLAIMS ONLY, with `scrubRawJwts` walker as defense-in-depth. Response includes `idTokenSource: 'wire' | 'session'` so the SPA can show which path was taken.
   - Integrity check: when a body id_token IS supplied (gateway POST), its `sub` MUST match `req.user.sub`; mismatch returns 412 `id_token_subject_mismatch`. (The check is moot for session-sourced id_tokens — the session already binds them to the bearer's user.)
   - On invalid/missing access token: 401, no data returned.
   - On missing id_token in BOTH body AND session: 412 with `error: 'id_token_missing'`.
   - SPA routes the response to a new info page with teal visual identity, "ACCESS + ID-TOKEN PATH" badge, decoded access-token claims AND decoded id-token claims rendered side-by-side, and a "Back to Dashboard" button. **No banking data is shown on this page** — identity only.

3. **Path C — Bearer / OAuth resource-server path (banking_resource_server, banking-data route):**
   - Gateway forwards the standard OAuth bearer (no id_token attached).
   - Request reaches a new SQLite-backed route on `banking_resource_server`: `GET /api/resource-server/accounts` and/or `GET /api/resource-server/transactions` (split from the current monolithic `/summary` route).
   - The route is protected by the existing `authenticateToken` middleware — the access token is validated.
   - On valid access token: the route reads the requesting user's accounts/transactions from a new SQLite file `banking_api_server/data/persistent/banking-resource-server.db` and returns them.
   - On invalid/missing access token: 401, no data returned.
   - SPA renders the result on the existing `ResourceServerPage` with the existing blue/OAuth styling. The only visual change is adding a plain-text "OAUTH BEARER PATH" badge to the page header.

The existing `/api/resource-server/summary` route currently returns a mixed payload (accounts + transactions + access claims + id claims in one response). It is **deprecated by this phase**: the route stays available for backwards compatibility (the existing `ResourceServerPage` continues to use it for now), but plans should add the three new routes (`/identity`, `/accounts`, `/transactions`) alongside it. A follow-up phase can migrate `ResourceServerPage` off `/summary` if desired — that migration is out of scope here.

**Out of scope:** new Node services, new ports, modifications to the existing OAuth login flow, migration of existing UI components off `/summary`.

</domain>

<decisions>
## Implementation Decisions

### Architecture
- **No new Node services / no new ports.** Reject any plan that scaffolds `banking_demo_apikey_backend/`, `banking_demo_userinfo_backend/`, or any new directory with its own `package.json`/`server.js`. The original planner draft did this; it is wrong.
- **Logical resource server name:** `banking_resource_server`. Implementation: extension of `banking_api_server/routes/resourceServer.js` (same Node process, same port 3001, same `authenticateToken` middleware mounted at `/api/resource-server/*` in `server.js:846`).
- **Three terminating paths:**
  - Path A — Gateway-only (no backend call)
  - Path B — banking_resource_server identity route (`GET /api/resource-server/identity`)
  - Path C — banking_resource_server banking-data routes (`GET /api/resource-server/accounts`, `GET /api/resource-server/transactions`)
- **Paths B and C are token-gated.** The existing `authenticateToken` middleware validates the PingOne access token (signature, exp, aud) on every request. Without a valid access token, the route returns 401 and no data.
- **Bank data is SQLite-backed.** New file `banking_api_server/data/persistent/banking-resource-server.db` (better-sqlite3 — already a dependency for `config.db`). On first BFF boot, idempotent seed: if the file is missing, create schema (`accounts`, `transactions`) and seed from `banking_api_server/data/store.js`. Subsequent boots use the persisted file. Survives restarts. Path C routes read from this DB.
- **Existing `/api/resource-server/summary` route is preserved untouched** — it currently powers `ResourceServerPage.jsx` and is not migrated in this phase. New routes (`/identity`, `/accounts`, `/transactions`) are added alongside it. A future phase can deprecate `/summary` if desired.
- **Gateway changes:** extend the router to support three credential dispositions:
  1. `oauth_bearer` — forward the bearer to `banking_resource_server` accounts/transactions routes
  2. `api_key` — swap the bearer for a configured service API key; record the swap in Token Chain; STOP at the Gateway with a marker response (no backend call); route the response to the API-Key info page in the SPA
  3. `dual_token` — forward the bearer AND attach the `id_token` (from BFF session, fetched via a server-to-server BFF endpoint) to the `banking_resource_server` identity route; record both in Token Chain
- **Gateway is the source of truth for which path was taken** — it labels the response with a `credentialPath` field so the SPA can route the result card to the correct page.

### Spec compliance for token flow (R3 — MANDATORY)

This phase implements a multi-hop OAuth flow that MUST follow established specs. Plans MUST cite and enforce these:

| Hop | Spec | What's enforced |
|---|---|---|
| User → BFF (login) | OIDC Core 1.0 §3.1.3.7 | id_token is issued, validated, persisted in BFF session at `oauthUser.js:471` |
| User token shape | RFC 9068 (JWT profile for OAuth access tokens) + RFC 7519 | `typ: at+jwt`, claims `iss/sub/aud/exp/iat/scope/may_act` |
| Gateway exchanges user bearer for backend-scoped token | **RFC 8693** (Token Exchange) | `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `subject_token`=user bearer, gateway client creds = actor (Basic auth on the exchange call), `audience`=banking_resource_server resource URI. This is THE spec-critical step for dual_token + oauth_bearer dispositions. Already implemented in `banking_mcp_gateway/src/tokenExchange.ts`. |
| Identity-chain audit trail | **draft-ietf-oauth-identity-chaining** (a.k.a. "JAG") + RFC 8693 §4.1 | Resulting exchanged token carries `act: { sub: <gateway-client>, client_id: <gateway-client> }` proving "the gateway, acting as an agent, exchanged on behalf of the user." `may_act` on the user's token MUST permit the gateway-client as an actor. |
| Audience binding | **RFC 8707** + **MCP 2025-11-25 §Authorization** | The exchanged token's `aud` MUST match the downstream RS's resource identifier. banking_resource_server publishes its identifier via `BANKING_API_RESOURCE_URI` env var and (in prod) via `/.well-known/oauth-protected-resource` (RFC 9728). The gateway MUST request this audience; the RS MUST reject any token without it. |
| RS validates the incoming bearer | RFC 7515 (JWS) + RFC 7517 (JWKS) + RFC 8414 (AS metadata discovery) | banking_api_server's existing `authenticateToken` middleware (server.js:846) does this: verifies signature against PingOne's JWKS, verifies `iss`, `exp`, `aud`. Local validation — no round-trip to AS per request. |
| Optional RS introspection layer | **RFC 7662** | When `configStore.getEffective('ff_introspection_required')==='true'` (existing Phase 235 flag), the middleware ALSO calls PingOne's `/as/introspect` endpoint via the existing `tokenIntrospectionService.js`. The RS sends `token` + its own client credentials and gets `{active, scope, sub, aud, exp, client_id, ...}` back. Gives real-time revocation. Configurable defense-in-depth; not required for the demo flow but available. |
| Identity claims surfacing | OIDC Core 1.0 §5 | banking_resource_server's `/identity` route decodes the id_token's CLAIMS only and returns them; raw JWT never crosses the boundary (CLAUDE.md token-custody rule + `scrubRawJwts` walker). |

**Phase 266's responsibility:** ensure every hop in the chain follows the right spec. Specifically:
- Plan 01 MUST call `exchangeTokenForBackend(..., bankingResourceServerResourceUri, ...)` on the dual_token path before forwarding — the inbound user bearer (aud=AI-agent-resource) is REJECTED at the backend per RFC 6750/8707.
- Plan 01 MUST surface the act-chain in `_meta.tokenEvents` so Token Chain UI shows the audit trail.
- Plan 02's `/identity` route MUST log the act chain via `appEventService.logEvent('INTROSPECTION', ...)` (Phase 235 wiring) so compliance review sees `{sub, aud, act, may_act}` per request.
- Plan 02 MUST support optional RFC 7662 introspection when the existing feature flag is enabled.

### Path A — API-Key page (Gateway-only)
- Gateway-terminating; no backend call.
- New result surface (routed React page) with amber/yellow visual identity and a plain-text "API-KEY PATH" badge in the header (no emoji glyphs per REGRESSION_PLAN §0).
- Page content: "This request was sent through the Gateway's API-key path. The Gateway exchanged your OAuth token for a service API key. No banking data is returned on this path — it demonstrates the credential-swap pattern."
- Show the masked API-key string (last 4 chars) so the user can see the swap happened.
- Show the Token Chain segment for this path: original bearer → exchanged-for → service API key.
- Prominent "Back to Dashboard" button.

### Path B — Access+ID-Token page (banking_resource_server `/identity` route)
- New route `GET /api/resource-server/identity` on `banking_resource_server`, mounted under the existing `authenticateToken` middleware. Access-token validation is mandatory — no valid bearer → 401 → page shows an error state, no claims rendered.
- Route logic: decode access token AND id_token server-side (both already available — access token from `req.session.oauthTokens.accessToken`, id_token from `req.session.oauthTokens.idToken` set at `oauthUser.js:471`). Return CLAIMS ONLY using the existing `sanitizeClaims` helper from `agentMcpTokenService`.
- `scrubRawJwts` walker on the response body before send — defense-in-depth that asserts no JWT-shaped string (`/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/`) appears in the JSON payload.
- New result surface (routed React page) with teal/green visual identity and a plain-text "ACCESS + ID-TOKEN PATH" badge.
- Page content: decoded access-token claims (sub, aud, scope, exp, act if present) AND decoded id-token claims (name, email, sub, picture if PingOne emits it) rendered side-by-side. **No banking data on this page — identity only.**
- Show the Token Chain segment: original bearer (validated) + id_token (forwarded from session, decoded server-side).
- Prominent "Back to Dashboard" button.

### Path C — banking_resource_server `/accounts` + `/transactions` routes (SQLite-backed)
- New routes `GET /api/resource-server/accounts` and `GET /api/resource-server/transactions` on `banking_resource_server`, mounted under the existing `authenticateToken` middleware. Access-token validation is mandatory — no valid bearer → 401 → no data.
- Route logic: extract user id from validated `req.user` / session; query SQLite `banking-resource-server.db` for the user's accounts and transactions; return the SAME response shape currently used by `/summary` for the `accounts` and `transactions` fields (so a future migration is drop-in).
- SQLite seeding (idempotent, on first BFF boot): if `banking_api_server/data/persistent/banking-resource-server.db` does not exist, create schema (`accounts(id, userId, accountType, name, balance, currency, status, accountNumber)`, `transactions(id, userId, accountId, type, amount, description, createdAt)`), then insert all rows from `data/store.js`'s in-memory store. Wrap in a single transaction. Subsequent boots use the persisted file.
- The seed runs once at BFF startup (in `server.js` or a small `services/bankingDbInit.js` helper called from `server.js`). Idempotency check: `if (!fs.existsSync(banking-resource-server.db.path))` then seed.
- SPA renders the result on the EXISTING `ResourceServerPage.jsx` for now (it still uses `/summary`). The only visual change to that page is adding a plain-text "OAUTH BEARER PATH" badge to the page header. Phase 266 does NOT migrate the page off `/summary` — that's a follow-up.
- **W1 routing note (gateway):** the existing OLB tools (`get_my_accounts`, `get_account_balance`, `get_my_transactions`, etc.) continue to route via the gateway's existing `'olb'` target (WebSocket → `banking_mcp_server` on port 8080). Phase 266 ADDS a sibling `'bankingdata'` target that maps to the new HTTP routes; only NEW Phase-266 tool names (`demo_show_accounts`, `demo_show_transactions`) route through `'bankingdata'`. The existing chat prompt "show my accounts" therefore continues to flow through OLB end-to-end — its dashboard surface (`ResourceServerPage` via `/summary`) is what shows up. The new SQLite-backed HTTP routes are exercised by tests + manual curl + (optionally) a separate demo prompt that dispatches the new tool names. **Implication for the demo narrative:** Path C in this phase is "the gateway CAN reach the new SQLite-backed routes" (proven by Plan 02's integration tests), not "Path C's user-visible chat flow goes through them." Updating BankingAgent's NL parser to route "show my accounts" to `demo_show_accounts` is out of scope for this phase — that's a separate cutover.

### Database seeding & data layer
- New file `banking_api_server/services/bankingDb.js` — thin better-sqlite3 wrapper exporting `getAccountsByUserId(userId)`, `getTransactionsByUserId(userId, limit?)`, and `initBankingDb()` (the boot-time seeder). Mirrors `data/store.js` API so swap is transparent.
- Seed source: `banking_api_server/data/store.js`. Plans must NOT delete or modify `store.js` — `/summary` still reads from it.
- Schema migrations: out of scope for this phase. The initial schema is created by `initBankingDb()` on first boot only.

### Chat prompt routing
- Three NL prompts trigger the three paths:
  - "Show my accounts" / "Show my balance" → Path C (existing)
  - "Show special offers" / "Use the API-key path" → Path A (new — informational page)
  - "Show my profile card" / "Use the access-and-id-token path" → Path B (new — informational page)
- Extend `banking_api_server/services/nlIntentParser.js` (or wherever the heuristic NL routing lives) with TWO new actions (`api_key_demo`, `dual_token_demo`) that the gateway interprets as routing dispositions.

### Token Chain UI
- `TokenChainDisplay` MUST visibly differentiate the three paths.
- The Token Chain Context (`banking_api_ui/src/context/TokenChainContext.js`) must accept and pass through a `credentialPath: 'oauth_bearer' | 'api_key' | 'dual_token'` field per chain segment.
- Each path's chain segment renders with the matching path colour (blue/amber/teal) so the user sees three visually distinct token chains as they exercise the three demo prompts.

### Diagrams (MANDATORY)
- `/architecture/flow` (`ArchitectureFlowPage.js`) — KEEP `api-key-backend` as `aspirational: true` (Path A is Gateway-terminating in this phase; no real 3rd-party API service is wired — see W4 in §Deferred Ideas). Replace the previously-aspirational `id-token-backend` node with a LIVE `banking-resource-server` node (handles Path B `/identity` AND Path C `/accounts`/`/transactions`) plus a sibling `sqlite-banking-db` cylinder node. Add simulation scenarios for all three paths.
- `/sequence-diagram` (`SequenceDiagramPage.js`) — add divergent steps for each of the three paths, clearly labelled.
- `/architecture` page — review for any tracker/step diagrams that reference the OAuth path; add the new paths.
- `ArchitectureTokenFlowPage.js` — add the new path branches.
- Any `.mmd` mermaid source files under `public/architecture/` — update and regenerate PNGs (existing script `npm run build:diagrams` per recent commit `3d3f0f75`).
- Confirm the existing `npm run build:diagrams` pipeline regenerates all needed assets.

### Visual identity (for 266-R3)
- Path C (existing OAuth bearer): blue (existing — do not change)
- Path A (API-key): amber, badge string `API-KEY PATH`
- Path B (Access+ID-token): teal, badge string `ACCESS + ID-TOKEN PATH`
- Plain text only, no emoji glyphs (REGRESSION_PLAN §0)

### Token custody (CLAUDE.md non-negotiable)
- Raw id_token NEVER appears in any browser-facing response body. BFF decodes server-side and returns the claims object only.
- BFF route for the dual-token info page must include a `scrubRawJwts` guard at the response boundary as defense-in-depth.
- API key string is returned MASKED to the SPA (last 4 chars visible). The full key never reaches the browser.
- All BFF calls from the SPA continue to use `bffAxios` (cookie-based).

### Claude's Discretion
- Exact React component organization (single component file per page vs. shared base + variants). Researcher recommended separate `ApiKeyResultPage.jsx` and `UserInfoResultPage.jsx` (now better named `AccessIdTokenResultPage.jsx`). Use whichever clean naming aligns with existing `ResourceServerPage.jsx`.
- Exact API key storage: configStore vs. env var fallback. Default to configStore with env fallback per existing pattern in `configStore.getEffective`.
- Whether the two info pages are routed via React Router paths or rendered as result cards inside the agent chat. Recommend ROUTED pages so the "Back to Dashboard" button has somewhere meaningful to go. The agent chat result card links to the route.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & tokens
- `CLAUDE.md` — Token custody rule, BFF architecture, module systems per package, regression non-negotiables
- `REGRESSION_PLAN.md` §0 (UI style guidelines — no emojis), §1 (critical files)
- `banking_api_server/routes/resourceServer.js` — EXTEND with three new routes (`GET /identity`, `GET /accounts`, `GET /transactions`); preserve existing `/summary` untouched. Existing imports of `decodeJwtClaims` + `sanitizeClaims` are the template for the `/identity` route.
- `banking_api_server/server.js:846` — Where `authenticateToken` middleware is mounted on `/api/resource-server/*`. New routes inherit this guard automatically.
- `banking_api_server/middleware/auth.js` — PingOne access-token validator (signature, exp, aud). Reused as-is for the new routes.
- `banking_api_server/services/tokenValidationService.js` — Backing JWKS validation (PingOne). Already wired through middleware/auth.
- `banking_api_server/data/store.js` — Existing in-memory store. The SEED SOURCE for `banking-resource-server.db` on first boot; not modified.
- `banking_api_server/data/persistent/banking-resource-server.db` — NEW SQLite file. Created and seeded idempotently on first BFF boot.
- `banking_api_server/services/bankingDb.js` — NEW thin better-sqlite3 wrapper (created by Plan 02 or similar). Exports `getAccountsByUserId`, `getTransactionsByUserId`, `initBankingDb`.
- `banking_api_server/services/configStore.js` — Existing better-sqlite3 user (template for `bankingDb.js` to mirror).
- `banking_api_server/routes/oauthUser.js:471` — Where `req.session.oauthTokens.idToken` is set. ID token is already persisted; planners must not introduce schema changes here.
- `banking_api_server/services/agentMcpTokenService.js` — Source of `decodeJwtClaims` + `sanitizeClaims` helpers used by `/identity`. Also the RFC 8693 token exchange pattern (template for "exchange bearer for API key").
- `banking_mcp_gateway/src/` — Existing gateway. Extend router with credential dispositions.
- `banking_api_ui/src/context/TokenChainContext.js` — Token Chain context; add `credentialPath` field
- `banking_api_ui/src/components/TokenChainDisplay.js` — Token Chain UI; add visual differentiation per path
- `banking_api_ui/src/components/ResourceServerPage.jsx` — Existing Path C result page; minimal touch to add the "OAUTH BEARER PATH" badge. Continues using `/api/resource-server/summary` in this phase.
- `banking_api_ui/src/components/ArchitectureFlowPage.js:150` — Where the aspirational `api-key-backend` node lives. Per W4 (see §Deferred Ideas) this node STAYS `aspirational: true`. Add a NEW live `banking-resource-server` node + `sqlite-banking-db` cylinder node alongside it, with edges representing Paths B (`/identity`) and C (`/accounts`+`/transactions`).
- `banking_api_ui/src/components/SequenceDiagramPage.js` — Sequence diagram source; add the three-path branches
- `banking_api_ui/src/components/ArchitectureTokenFlowPage.js` — Token-flow diagram; add the three paths

### Research and validation
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-RESEARCH.md` — Full technical research. **NOTE:** §Recommended PLAN.md Split proposed new backend services — that recommendation is SUPERSEDED by this CONTEXT.md. The other research findings (file paths, line refs, REGRESSION traps, id_token persistence location, token chain integration points, diagram regeneration pipeline) remain valid.
- `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-VALIDATION.md` — Per-task verification map. Will need revision to drop the new-backend-service test stubs (266-01-01 through 266-02-02 as originally written) and replace with info-page + gateway-routing tests.

### Skills
- `.claude/skills/oauth-pingone/` — OAuth/PingOne grant types, token exchange
- `.claude/skills/mcp-server/` — MCP tool registration patterns
- `.claude/skills/typescript-banking/` — TS style rules for banking_mcp_gateway

</canonical_refs>

<specifics>
## Specific Ideas

- The phase aims to be a **clear visual demonstration** for conference walkthroughs. The three paths are equally valuable as **visible distinctions** showing "the same Gateway can route to three different credential mechanisms, two of which reach the same OAuth-protected resource server using different credentials."
- Paths B and C both terminate at `banking_resource_server` (extended `banking_api_server/routes/resourceServer.js`) and both are gated by the same `authenticateToken` middleware. The same OAuth check protects identity and banking data — the only difference is which route is hit and which credentials the Gateway attaches.
- Path A is purely Gateway plumbing — no backend involvement. This makes it the most "different" of the three and visually justifies its standalone info page.
- "Back to Dashboard" button on Paths A and B is critical UX — the user must always have a clear way out of the informational pages. Path C continues to render in the existing dashboard surfaces via `ResourceServerPage`.
- Token Chain visualization across three paths is a primary deliverable — when a presenter clicks all three demo prompts in sequence, the Token Chain panel should show three visibly different chains (api_key swap, dual_token attach, oauth_bearer forward).
- Why SQLite: the demo narrative claims a "real" resource server. In-memory `data/store.js` resets on every restart and can't credibly play that role. `banking-resource-server.db` is persisted, seeded from the existing store on first boot, and read by the new `/accounts` + `/transactions` routes — same response shape as today's `/summary`, just sourced differently.

</specifics>

<deferred>
## Deferred Ideas

- Actual API-key-gated standalone Node backend service — could become a future phase if the demo needs to show a separate process accepting `X-API-Key`. For Phase 266, Path A is Gateway-only.
- **W4 deviation from roadmap:** the roadmap section for Phase 266 (point 4 under Requirements / Scope) says "Add the new backend nodes (currently aspirational/dashed) as live nodes when these variants land." R2 deviates from this on the API-key node specifically — `api-key-backend` in `ArchitectureFlowPage.js` REMAINS `aspirational: true` because Path A is Gateway-terminating in this phase (no real 3rd-party API-key-gated backend is wired). The `id-token-backend` node is REPLACED by the live `banking-resource-server` node (which handles both Path B `/identity` and Path C `/accounts`/`/transactions`). Flipping `api-key-backend` to live is deferred to a future phase that builds an actual API-key-gated backend service. This deviation is intentional — recorded here so a future roadmap audit doesn't flag it as a missed requirement.
- Actual dual-token-gated standalone Node backend service — same reasoning. Path B reaches `banking_resource_server`'s `/identity` route in the same process.
- Migrating `ResourceServerPage.jsx` off `/api/resource-server/summary` onto the new `/accounts` + `/transactions` routes — deferred follow-up. The new routes exist in this phase but the existing UI continues to use `/summary` for backwards compatibility.
- Schema migrations for `banking-resource-server.db` — the schema is created once on first boot. A migration strategy can be added in a later phase if the schema needs to evolve.
- **H3 known limitation — write-drift between in-memory store and SQLite:** the new `/api/resource-server/accounts` and `/api/resource-server/transactions` routes (Path C) read from `banking-resource-server.db`. The existing write paths (`accounts.js`, `transactions.js`, `oauthUser.js`, `transactionConsentChallenge.js`, `demoScenario.js`, etc.) continue to write to the in-memory `data/store.js` — those writes do NOT propagate to `banking-resource-server.db`. Result: the new routes return a frozen first-boot snapshot. The existing `/summary` route still reads from `data/store.js`, so `ResourceServerPage.jsx` (which uses `/summary`) sees live writes; only the NEW routes see stale data. **For the Phase 266 demo this is acceptable** — the demo narrative is "show that the gateway CAN reach SQLite-backed routes," not "Path C is the canonical data path." If a future phase migrates writes through `bankingDb.js`, both routes will see live data and `/summary` can be deprecated. Out of scope for this phase. **Recovery if drift becomes confusing during demo:** delete `banking_api_server/data/persistent/banking-resource-server.db` and restart BFF — the idempotent seed reseeds from current `data/store.js` state.
- LangChain agent (port 8888) integration — heuristic-only NL routing for Phase 266; LangChain deferred.
- Token introspection via PingOne `/as/introspect` — out of scope. `authenticateToken` does JWKS-based local validation, which is what the rest of the BFF uses.

</deferred>

---

*Phase: 266-add-api-key-and-id-token-backend-variants-with-dedicated-res*
*Context gathered: 2026-05-10 via roadmap + in-session user pivot*
*R1 pivot recorded: 2026-05-10 — original planner draft built two new backend services; user clarified Path A terminates at the Gateway info page and only Path C reaches a real backend.*
*R2 pivot recorded: 2026-05-10 — user named the unified backend `banking_resource_server` (extension of existing `banking_api_server/routes/resourceServer.js`, NOT a new service); Paths B and C are BOTH served by it with three new routes (`/identity`, `/accounts`, `/transactions`) gated by the existing `authenticateToken` middleware; bank data moves to a new SQLite file `banking_api_server/data/persistent/banking-resource-server.db` seeded from `data/store.js` on first BFF boot.*
