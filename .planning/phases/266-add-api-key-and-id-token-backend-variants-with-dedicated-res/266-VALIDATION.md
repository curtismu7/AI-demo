---
phase: 266
slug: add-api-key-and-id-token-backend-variants-with-dedicated-res
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
revised: 2026-05-10
---

# Phase 266 — Validation Strategy (R2)

> Per-phase validation contract. Updated for R2 pivot: `banking_resource_server` = extended `routes/resourceServer.js`; new SQLite `banking-resource-server.db`; Paths B and C both gated by existing `authenticateToken` middleware.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 (banking_api_server, banking_mcp_gateway, banking_mcp_server); React Testing Library for UI components |
| **Config file** | `banking_api_server/jest.config.js`; each TS service has its own `package.json` `"test"` script; root `npm test` orchestrates all |
| **Quick run command** | `cd <service> && npx jest --bail` |
| **Full suite command** | `npm test` (from repo root) |
| **Estimated runtime** | ~5–15s per service quick run; full suite ~60–120s |

---

## Sampling Rate

- **After every task commit:** `cd <touched_service> && npx jest --bail` (~5–15s)
- **After every plan wave:** `cd banking_api_server && npm test` AND `cd banking_api_ui && npm run build` (must exit 0)
- **Before `/gsd-verify-work`:** Full `npm test` from repo root green + `./run-bank.sh status` shows all 7 existing services up + manual three-prompt screenshot (blue/amber/teal)
- **Max feedback latency:** 15 seconds per task commit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 266-01-01 | 01 | 1 | 266-R1, 266-R2 | T-CRED-SEL | `selectCredentialForBackend(target)` returns the correct descriptor for `oauth_bearer` / `api_key` / `dual_token`; `backendHttpUrl` returns the right `/api/resource-server/{identity,accounts,transactions}` URL per target | unit | `cd banking_mcp_gateway && npx jest credentialSwap.test` | ❌ W0 | ⬜ pending |
| 266-01-02 | 01 | 1 | 266-R1, 266-R2, 266-R4 | T-CHAIN-AUTHOR, T-AUD-BINDING | Gateway dispatch handler: api_key returns marker (no backend call); dual_token PERFORMS RFC 8693 token exchange with audience=config.bankingResourceServerResourceUri (R3 — SPEC-CRITICAL), THEN POSTs JSON-RPC envelope to `/api/resource-server/identity` (EXCHANGED bearer in Auth header, id_token in body params.idToken); oauth_bearer ALSO exchanges before GETting `/accounts` or `/transactions`. Inbound user MCP-side bearer is NEVER forwarded unchanged on dual_token or bankingdata paths. Response includes `_meta.credentialPath` and `_meta.tokenEvents` (≥6 segments for dual_token: inbound + idtoken-fetch + EXCHANGE + forward + bearer-validated + idtoken-decoded, each tagged with `specRef`; ≥2 for api_key; ≥1 for oauth_bearer). | unit | `cd banking_mcp_gateway && npx jest dispatch` | ❌ W0 | ⬜ pending |
| 266-01-03 | 01 | 1 | 266-R2 | T-INTERNAL-AUTHZ | BFF `/internal/id-token`: 401 if BFF_INTERNAL_SECRET missing/wrong; 503 if sessionStore not registered (`req.app.get('sessionStore')` returns undefined); 200 with id_token from session when registered and secret valid; works for memory + sqlite session stores | regression + integration | `cd banking_api_server && npx jest agentIdToken.regression agentIdToken.integration` | ❌ W0 | ⬜ pending |
| 266-02-01 | 02 | 2 | 266-R2 | T-DB-INIT, T-RS-ACCOUNTS | `services/bankingDb.js`: `initBankingDb()` creates schema + seeds from `data/store.js` when banking-resource-server.db missing; idempotent (second call leaves row count unchanged via `fs.existsSync` gate); parameterized queries (no string concat in WHERE clauses) | regression + integration | `cd banking_api_server && npx jest bankingDb.regression bankingDb.integration` | ❌ W0 | ⬜ pending |
| 266-02-02a | 02 | 2 | 266-R2 | T-RS-IDENTITY, T-RS-IDENTITY-INTEGRITY, T-AUD-BINDING, T-ACT-AUDIT | `/identity` (GET + POST shared handler): 401 on missing/invalid bearer (proves authenticateToken gating from `server.js:846`); **401 on wrong aud — bearer with aud≠BANKING_API_RESOURCE_URI rejected (RFC 6750 §3.1 + RFC 8707 + MCP 2025-11-25)**; 412 when body AND session both lack id_token; 412 when body id_token's sub ≠ bearer's sub (integrity check); 200 prefers body id_token over session; 200 returns `{ accessTokenClaims, idTokenClaims, idTokenSource:'wire'\|'session' }` with NO JWT-shaped string in body (scrubRawJwts walker); **on every 200, appEventService.logEvent('INTROSPECTION', 'identity_call', {sub, aud, act, may_act, idTokenSource}) is called (act-chain audit trail per draft-ietf-oauth-identity-chaining)**; with `ff_introspection_required==='true'` an additional RFC 7662 introspection call MUST be made and a 401 returned on `{active:false}` | regression + integration | `cd banking_api_server && npx jest resourceServerIdentity.regression resourceServerIdentity.integration` | ❌ W0 | ⬜ pending |
| 266-02-02b | 02 | 2 | 266-R2 | T-RS-ACCOUNTS | `GET /api/resource-server/accounts`: 401 on missing/invalid bearer; 200 reads `getAccountsByUserId(req.user.sub)` from banking-resource-server.db; existing `/summary` route still returns 200 (preserved untouched) | regression | `cd banking_api_server && npx jest resourceServerAccounts.regression` | ❌ W0 | ⬜ pending |
| 266-02-02c | 02 | 2 | 266-R2 | T-RS-TRANSACTIONS | `GET /api/resource-server/transactions`: 401 on missing/invalid bearer; respects `?limit=N` query (cap 200, default 50); parseInt with NaN→default fallback | regression | `cd banking_api_server && npx jest resourceServerTransactions.regression` | ❌ W0 | ⬜ pending |
| 266-02-03 | 02 | 2 | 266-R1 | T-APIKEY-MASK | BFF `GET /api/path/apikey-info` returns masked api-key (last4 only). `/dualtoken-info` route is REMOVED (R2: SPA hits `/api/resource-server/identity` directly). | regression | `cd banking_api_server && npx jest pathInfo` | ❌ W0 | ⬜ pending |
| 266-02-04 | 02 | 2 | 266-R1, 266-R2 | — | `nlIntentParser` routes "show special offers" → `api_key_demo`; "show my profile card" → `dual_token_demo`; "show my accounts" → existing oauth_bearer banking-data action | unit | `cd banking_api_server && npx jest nlIntentParser` | ✅ (extends existing) | ⬜ pending |
| 266-03-01 | 03 | 2 | 266-R3, 266-R4 | T-CHAIN-MERGE | `bankingAgentService` MERGES gateway-synthesized `result._meta.tokenEvents` into the local chain; TokenChainDisplay renders distinct colours (blue/amber/teal) keyed by `credentialPath` | component + unit | `cd banking_api_ui && npx jest TokenChainDisplay TokenChainContext bankingAgentService` | ❌ W0 | ⬜ pending |
| 266-03-02 | 03 | 2 | 266-R3, 266-R4 | — | ActivityLogs renders new `GATEWAY_PATH` category with 3 sub-labels (api_key / dual_token / oauth_bearer); appEventService exports `EVENT_CATEGORIES.GATEWAY_PATH` | component | `cd banking_api_ui && npx jest ActivityLogs appEventService` | ❌ W0 | ⬜ pending |
| 266-04-01 | 04 | 3 | 266-R3 | T-PAGE-AUTH | `ApiKeyPathPage`: amber styling, plain-text "API-KEY PATH" badge, masked-key display, "Back to Dashboard" button targeting `/dashboard`. No emoji glyphs in source (REGRESSION_PLAN §0). | component + static | `cd banking_api_ui && npx jest ApiKeyPathPage` + `grep -P '[\x{1F300}-\x{1F6FF}\x{1F900}-\x{1F9FF}]' banking_api_ui/src/components/ApiKeyPathPage.jsx` returns nothing | ❌ W0 | ⬜ pending |
| 266-04-02 | 04 | 3 | 266-R2, 266-R3 | T-PAGE-AUTH | `AccessIdTokenPathPage`: teal styling, plain-text "ACCESS + ID-TOKEN PATH" badge; fetches `/api/resource-server/identity` via `bffAxios` (NOT `/api/path/dualtoken-info`); handles 401 / 412 / generic error states with user-facing messaging; "Back to Dashboard" button. No emoji glyphs. | component + static | `cd banking_api_ui && npx jest AccessIdTokenPathPage` + `grep "/api/path/dualtoken-info" banking_api_ui/src/components/AccessIdTokenPathPage.jsx` returns nothing + `grep "/api/resource-server/identity" banking_api_ui/src/components/AccessIdTokenPathPage.jsx` returns 1 | ❌ W0 | ⬜ pending |
| 266-04-03 | 04 | 3 | 266-R3 | — | `ResourceServerPage.jsx` gets plain-text "OAUTH BEARER PATH" badge in the header. Page continues to call `/api/resource-server/summary` (R2 defers migration). Existing flow unbroken. | component | `cd banking_api_ui && npx jest ResourceServerPage` | ❌ W0 | ⬜ pending |
| 266-05-01 | 05 | 4 | 266-R4 | T-DIAG-CONSISTENCY | `ArchitectureFlowPage.js` adds `banking-resource-server` node (live) AND `sqlite-banking-db` cylinder node; 3 edges (gw→identity, gw→bankingdata, rs→sqlite); 3 simulation scenarios cover all 3 paths | static + component | `grep "banking-resource-server\|sqlite-banking-db" banking_api_ui/src/components/ArchitectureFlowPage.js` returns ≥ 2 lines | ❌ W0 | ⬜ pending |
| 266-05-02 | 05 | 4 | 266-R4 | — | `SequenceDiagramPage.js` + `ArchitectureTokenFlowPage.js` + `TokenExchangeFlowDiagram.jsx` include the R2 route names | static | `grep "/api/resource-server/identity\|/api/resource-server/accounts" <files>` returns ≥ 3 lines total | ❌ W0 | ⬜ pending |
| 266-05-03 | 05 | 4 | 266-R4 | — | `NarrativePanel`, `AgentFlowDiagramPanel`, `UnifiedTokenFlowInspector`, `OidcFlowTimeline` updated per their respective tasks; OidcFlowTimeline meets Case-1/Case-2 JSDoc rule | static | grep checks per file | ❌ W0 | ⬜ pending |
| 266-05-04 | 05 | 4 | 266-R4 | — | All 4 .mmd files at repo root (architecture.mmd, architecture-simple.mmd, i4ai-ref-arch.mmd, mcp-security-gateway.mmd) reviewed; each updated OR contains Phase-266-audit comment with banking_resource_server + SQLite references; `npm run build:diagrams` exit 0 OR documented manual_fallback_ok skip | static + smoke | grep per file + `npm run build:diagrams` (manual_fallback_ok) | ✅ (.mmd) / ⚠️ (build) | ⬜ pending |
| 266-ALL | * | * | all | — | `npm run build` exits 0 from banking_api_ui after every UI commit | smoke | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 266-ALL | * | * | all | — | All 7 services start cleanly via `./run-bank.sh status` (no new services in R2) | manual smoke | `./run-bank.sh && ./run-bank.sh status` | ✅ | ⬜ pending |
| 266-ALL | * | * | all | — | Three demo prompts produce visibly distinct result surfaces (blue OAuth bearer / amber API-key / teal Access+ID-token) | manual smoke | screenshot of 3 result surfaces side-by-side | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `banking_mcp_gateway/src/__tests__/credentialSwap.test.ts` — credentialSwap + backendHttpUrl matrix
- [ ] `banking_mcp_gateway/src/__tests__/dispatch.test.ts` — index.ts disposition handler tests (api_key marker, dual_token forwards to /identity, oauth_bearer forwards to /accounts)
- [ ] `banking_api_server/routes/__tests__/agentIdToken.regression.test.js` — internal-secret + sessionStore-503 cases
- [ ] `banking_api_server/routes/__tests__/agentIdToken.integration.test.js` — real env-var read
- [ ] `banking_api_server/services/__tests__/bankingDb.regression.test.js` — mocked-better-sqlite3 schema + seed + idempotency
- [ ] `banking_api_server/services/__tests__/bankingDb.integration.test.js` — real tmp-DB; second init() leaves row count unchanged
- [ ] `banking_api_server/routes/__tests__/resourceServerIdentity.regression.test.js` — 401 / 412 / no-JWT-in-body
- [ ] `banking_api_server/routes/__tests__/resourceServerIdentity.integration.test.js` — REAL authenticateToken middleware proves mount-inherited gating
- [ ] `banking_api_server/routes/__tests__/resourceServerAccounts.regression.test.js` — 401 + read from banking-resource-server.db
- [ ] `banking_api_server/routes/__tests__/resourceServerTransactions.regression.test.js` — 401 + limit handling
- [ ] `banking_api_server/routes/__tests__/pathInfo.test.js` — apikey-info masked output; dualtoken-info absent (R2)
- [ ] `banking_api_server/services/__tests__/nlIntentParser.test.js` — extend existing with `api_key_demo` + `dual_token_demo` actions
- [ ] `banking_api_ui/src/components/__tests__/ApiKeyPathPage.test.jsx`
- [ ] `banking_api_ui/src/components/__tests__/AccessIdTokenPathPage.test.jsx` — asserts fetch URL is `/api/resource-server/identity`
- [ ] `banking_api_ui/src/components/__tests__/TokenChainDisplay.test.js` — credentialPath colour-coding
- [ ] `banking_api_ui/src/components/__tests__/ActivityLogs.test.js` — GATEWAY_PATH category labels

*No framework install needed — Jest already present in every target service.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3 result surfaces visually distinct in screenshots | 266-R3 | Visual distinctness is judged by humans | Run `./run-bank.sh`, open `/agent`, send three prompts: "show my accounts" (blue OAuth resource-server), "show special offers" (amber API-key info page), "show my profile card" (teal access+id-token page). Confirm visually distinct headers/badges/colours. Capture screenshot. |
| Architecture/flow simulation walks through 3 paths | 266-R4 | Animation timing and step text correctness reviewed visually | Open `/architecture/flow`, run each of the 3 simulation scenarios. Confirm `banking-resource-server` and `sqlite-banking-db` nodes appear; api-key scenario terminates at Gateway; dual-token scenario shows `/identity` route; oauth-bearer scenario shows `/accounts` route + SQLite read. |
| Sequence diagram shows R2 routes | 266-R4 | Diagram layout is hand-arranged | Open `/sequence-diagram`; confirm `/api/resource-server/identity`, `/api/resource-server/accounts`, `/api/resource-server/transactions` appear as request labels on the divergent branches. |
| SQLite seed survives restart | 266-R2 | Persistence behavior across process restarts | Stop BFF, delete `banking_api_server/data/persistent/banking-resource-server.db`, restart BFF, confirm seed runs once (single startup log line); restart again, confirm seed does NOT re-run; query `/api/resource-server/accounts` after each restart confirms data persists. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] Token-gating verified on every new resource-server route (`401` on missing bearer)
- [ ] SQLite idempotency proven (second `initBankingDb()` is a no-op)
- [ ] No raw JWT-shaped string in any new BFF response body (scrubRawJwts assertion)

**Approval:** pending
