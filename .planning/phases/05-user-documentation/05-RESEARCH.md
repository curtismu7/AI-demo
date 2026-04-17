# Phase 05: user-documentation — Research

**Researched:** 2026-04-17
**Domain:** Developer-facing documentation (setup guide, architecture walkthrough, draw.io diagrams)
**Confidence:** HIGH

## Summary

Phase 05 creates two new documentation files (`docs/SETUP.md` and `docs/ARCHITECTURE_WALKTHROUGH.md`) and three draw.io sequence diagrams for the 3 auth flows. **Critical finding: all six deliverables already exist in the repo** from a previous implementation pass — they are substantive and mostly complete. The plans are being replanned from scratch, so research must clarify what exists, what's missing, and what the planner should rewrite vs. preserve.

The existing `docs/SETUP.md` (320 lines) covers prerequisites, PingOne app config, env vars, local run, verify, Vercel pointer, and troubleshooting — all 7 sections from D-04. The existing `docs/ARCHITECTURE_WALKTHROUGH.md` (275 lines) covers the component map, BFF token custodian pattern, all 3 flows with token state tables and RFC markers — matching D-05. The 3 draw.io files (AuthCode-PKCE, CIBA, TokenExchange) exist at the exact paths specified in D-03. The README (286 lines) already has the pointer to `docs/SETUP.md` replacing Quick Start, matching D-01.

**Primary recommendation:** The planner should treat this as a **quality audit + gap-fill** rather than greenfield authoring. Each plan should diff the existing content against the CONTEXT.md requirements and fix gaps, not regenerate from scratch.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Setup guide at `docs/SETUP.md`, README pointer replaces Quick Start
- D-02: Architecture walkthrough at `docs/ARCHITECTURE_WALKTHROUGH.md` (don't modify existing `ARCHITECTURE.md`)
- D-03: 3 new `.drawio` files for auth flows (AuthCode PKCE, CIBA, Token Exchange) — MUST be draw.io XML format
- D-04: Setup guide must be comprehensive (prerequisites, PingOne config, env vars, local run, verify, troubleshoot)
- D-05: Architecture walkthrough annotated with RFC markers, per-flow token state tables

### Claude's Discretion
- Exact wording and tone of the docs (technical but approachable)
- Whether to include a "demo walkthrough" section in ARCHITECTURE_WALKTHROUGH.md
- Specific formatting (headers, callout boxes, code blocks)
- Whether docs/SETUP.md links to the in-app /onboarding page as a complement

### Deferred Ideas (OUT OF SCOPE)
- Interactive OpenAPI docs / Swagger UI
- Video walkthrough / screencasts
- Automated doc generation from code comments

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOC-01 | User-facing setup guide — end-to-end: PingOne app config → environment variables → `npm run` locally → verify each auth flow | Existing `docs/SETUP.md` (320 lines) covers all 7 D-04 sections. README already points to it. Plans should audit completeness against current env vars and app config. |
| DOC-02 | Architecture walkthrough — annotated sequence diagrams (draw.io) for each auth flow; "what token is where at each step" narrative | Existing `docs/ARCHITECTURE_WALKTHROUGH.md` (275 lines) with 3 flow walkthroughs + token state tables. 3 draw.io files exist. Plans should verify RFC annotations and token state accuracy. |

</phase_requirements>

## Current State of Deliverables

### docs/SETUP.md — EXISTS (320 lines)

| D-04 Required Section | Present? | Notes |
|-----------------------|----------|-------|
| § 1 Prerequisites | ✅ | Node 18/20+, npm 9+, Git, PingOne trial, optional Groq key |
| § 2 PingOne App Configuration | ✅ | 5 subsections: Banking API Resource, Admin OIDC, User OIDC, Worker, Test Users |
| § 3 Environment Variables | ✅ | Table with 14 vars, `.env.example` copy instructions, Config UI alternative |
| § 4 Local Run | ✅ | Option A (`run-bank.sh`) and Option B (individual terminals) |
| § 5 Verify the Setup | ✅ | 4 flows: Admin login, Customer login, AI agent, CIBA step-up |
| § 6 Vercel Deployment | ✅ | Pointer to `docs/VERCEL_SETUP.md` |
| § 7 Troubleshooting | ✅ | 6 failure modes with diagnostic + fix |

**Gaps to audit:**
- Env var table has 14 entries but `.env.example` has ~50+ variables — the table covers "required" only, which is correct per D-04, but planner should verify no critical vars are missing
- MCP Token Exchanger app (5th PingOne app) not mentioned in §2 — only 4 apps documented
- `run-bank.sh` uses ports 4000/3002 with HTTPS (`api.pingdemo.com`), but SETUP.md §4 says "typically 4000/3002" without full instructions for the mkcert/hosts setup
- Scope names in §2 may be stale (SETUP.md uses both `banking:general:read` and `banking:read` in different places — need to check which is current)

### docs/ARCHITECTURE_WALKTHROUGH.md — EXISTS (275 lines)

| D-05 Required Section | Present? | Notes |
|-----------------------|----------|-------|
| Component map | ✅ | 3-layer table + external systems + OAuth clients |
| Why BFF holds tokens | ✅ | Token Custodian Pattern, security rationale table |
| Flow 1: AuthCode+PKCE | ✅ | Step table, token state table, PKCE explanation |
| Flow 2: CIBA | ✅ | 9-step table, token state, env vars |
| Flow 3: Token Exchange | ✅ | 1-exchange and 2-exchange paths, RFC 8693 §4.1 `act` claim, feature flags |
| RFC markers | ✅ | Each flow section cites specific RFCs |
| Diagram references | ✅ | Links to all 3 `.drawio` files |

**Gaps to audit:**
- Token state tables use `banking:read banking:write` scope names — may need updating to `banking:general:read` etc.
- The "three OAuth clients" table lists `PINGONE_AI_CORE_CLIENT_ID` and `PINGONE_AI_CORE_USER_CLIENT_ID` but `.env.example` uses `PINGONE_ADMIN_CLIENT_ID` and `PINGONE_USER_CLIENT_ID` — naming mismatch
- No mention of the MCP Token Exchanger or AI Agent apps in the OAuth clients table

### README.md — Already Updated (286 lines)

- Quick Start section already replaced with pointer: `See **[docs/SETUP.md](docs/SETUP.md)**`
- Configuration section also points to SETUP.md
- Features pointer to `docs/FEATURES.md` and `docs/RFC-STANDARDS.md`
- D-01 is **already satisfied** — planner should verify, not rewrite

### Draw.io Files — All 3 Exist

| File | Size | Path |
|------|------|------|
| `Super-Banking-AuthCode-PKCE-Flow.drawio` | 11.8 KB | `docs/` |
| `Super-Banking-CIBA-Flow.drawio` | 10.1 KB | `docs/` |
| `Super-Banking-TokenExchange-Flow.drawio` | 14.5 KB | `docs/` |

Note: filenames use `Super-Banking-` prefix, not `BX-Finance-` as CONTEXT.md D-03 specifies. The CONTEXT.md names (`BX-Finance-AuthCode-PKCE-Flow.drawio` etc.) were the original plan but implementation used the `Super-Banking-` naming convention matching the rest of the `docs/` directory. **Planner should use the existing filenames**, not create duplicates.

Additional existing drawio files in `docs/` that may overlap:
- `Super-Banking-1-Exchange-Delegated-Chain.drawio` — detailed 1-exchange sub-steps
- `Super-Banking-Token-Exchange-Customer.drawio` — customer perspective
- `Super-Banking-Token-Anatomy.drawio` — JWT structure
- `Super-Banking-Architecture-Overview.drawio` — high-level architecture

## Environment Variables — Source of Truth

### banking_api_server/.env.example (authoritative, ~250 lines)

Categories and key vars:

| Category | Key Variables | Notes |
|----------|--------------|-------|
| **MCP Server** | `PINGONE_MCP_SERVER_URL` | WebSocket URL, default `ws://localhost:8080` |
| **PingOne Core** | `PINGONE_ENVIRONMENT_ID`, `PINGONE_REGION` | Required — environment UUID + region TLD |
| **Admin OAuth** | `PINGONE_ADMIN_CLIENT_ID`, `PINGONE_ADMIN_CLIENT_SECRET`, `PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH` | Staff login + token exchange |
| **User OAuth** | `PINGONE_USER_CLIENT_ID`, `PINGONE_USER_CLIENT_SECRET` | Customer login |
| **Session** | `PINGONE_SESSION_SECRET` | Express session signing |
| **Server** | `PORT` (3001), `NODE_ENV` | |
| **Frontend URLs** | `REACT_APP_CLIENT_URL`, `FRONTEND_ADMIN_URL`, `FRONTEND_DASHBOARD_URL` | |
| **Public URL** | `PINGONE_PUBLIC_APP_URL` | Drives all OAuth redirect URIs |
| **Roles** | `PINGONE_ADMIN_ROLE`, `PINGONE_USER_ROLE`, `PINGONE_DEFAULT_USER_TYPE` | |
| **Audiences** | `PINGONE_AUDIENCE_ENDUSER`, `PINGONE_AUDIENCE_AI_AGENT` | JWT `aud` validation |
| **Agent Client** | `PINGONE_AGENT_CLIENT_ID/SECRET`, `PINGONE_AI_AGENT_CLIENT_ID/SECRET` | RFC 8693 actor token |
| **Worker Token** | `PINGONE_WORKER_TOKEN_CLIENT_ID/SECRET` | PingOne Management API |
| **Management API** | `PINGONE_MANAGEMENT_CLIENT_ID/SECRET` | MFA, user management |
| **MFA** | `PINGONE_MFA_POLICY_ID`, `PINGONE_MFA_ACR_VALUE` | |
| **MCP Exchanger** | `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID/SECRET/SCOPES/AUTH_METHOD` | AI_AGENT type app |
| **Token Exchange Resources** | `PINGONE_RESOURCE_MCP_SERVER_URI`, `PINGONE_RESOURCE_TWO_EXCHANGE_URI`, `PINGONE_RESOURCE_AGENT_GATEWAY_URI`, `PINGONE_RESOURCE_MCP_GATEWAY_URI` | |
| **Redis/Upstash** | `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `REDIS_URL` | Vercel session store |
| **Debug** | `PINGONE_DEBUG_OAUTH`, `DEBUG_TOKENS`, `DEBUG_SCOPES`, `SKIP_TOKEN_SIGNATURE_VALIDATION` | |
| **Step-Up MFA** | `STEP_UP_AMOUNT_THRESHOLD`, `STEP_UP_ACR_VALUE` | |
| **AI/LLM** | `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | NL intent parsing |
| **CIBA** | `CIBA_ENABLED`, `CIBA_TOKEN_DELIVERY_MODE`, `CIBA_BINDING_MESSAGE`, `CIBA_POLL_INTERVAL_MS`, `CIBA_AUTH_REQUEST_EXPIRY` | |
| **PingOne Authorize** | `PINGONE_AUTHORIZE_WORKER_CLIENT_ID/SECRET/POLICY_ID` | Optional policy-based authz |

**Key finding:** `.env.example` uses `PINGONE_ADMIN_CLIENT_ID` but some docs reference `PINGONE_AI_CORE_CLIENT_ID`. The `configStore.js` supports both via fallback chains. SETUP.md should use the `.env.example` names as canonical.

## PingOne Application Configuration — 5 Apps Required

From `docs/PINGONE_APP_SCOPE_MATRIX.md` and `docs/PINGONE_APP_CONFIG.md`:

| # | App Name | Type | Grant Types | Purpose | Config Key |
|---|----------|------|-------------|---------|-----------|
| 1 | Admin OIDC App | WEB_APP | Authorization Code + PKCE | Staff login, token exchange | `PINGONE_ADMIN_CLIENT_ID` |
| 2 | User OIDC App | WEB_APP | Authorization Code + PKCE | Customer login | `PINGONE_USER_CLIENT_ID` |
| 3 | Worker App | WORKER | Client Credentials | PingOne Management API | `PINGONE_WORKER_TOKEN_CLIENT_ID` |
| 4 | MCP Token Exchanger | AI_AGENT | Client Credentials + Token Exchange | RFC 8693 exchange | `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` |
| 5 | AI Agent App (optional) | AI_AGENT | Client Credentials | 2-exchange actor token | `PINGONE_AI_AGENT_CLIENT_ID` |

Plus a **Custom Resource** for banking scopes with audience matching `PINGONE_AUDIENCE_ENDUSER`.

**Consolidated scopes (6 custom):** `banking:general:read`, `banking:general:write`, `banking:admin`, `banking:sensitive`, `banking:ai:agent` (plus standard OIDC: `openid profile email offline_access`).

**Critical PingOne config:** Each OIDC app needs a `may_act` attribute mapping (`${user.mayAct}`) for token exchange delegation to work.

## The 3 Auth Flows — Token Paths

### Flow 1: Authorization Code + PKCE (Login)
- **RFC:** 6749, 7636, 9700
- **Trigger:** User clicks Login → BFF redirects to PingOne `/authorize`
- **Token path:** PingOne → BFF session (access_token, id_token, refresh_token) → browser gets session cookie only
- **Result:** User authenticated, tokens server-side in BFF session

### Flow 2: CIBA (Backchannel Auth)
- **RFC:** OpenID CIBA Core 1.0
- **Trigger:** AI agent attempts high-value operation (≥ `STEP_UP_AMOUNT_THRESHOLD`)
- **Token path:** BFF → PingOne `bc-authorize` → push/email to user → user approves → elevated access_token in BFF session
- **Result:** Step-up auth without browser redirect

### Flow 3: RFC 8693 Token Exchange (MCP Delegation)
- **RFC:** 8693
- **Path A (1-exchange):** User session token → PingOne exchange → MCP-audience token (no `act` claim)
- **Path B (2-exchange):** Agent CC grant → actor token; then user token + actor token → MCP token with `act` claim
- **Result:** Narrow-scoped MCP token for AI agent tool calls

## Local Development — Two Startup Scripts

### `run-bank.sh` (recommended, full-featured)
- Ports: UI=4000, API=3002, MCP=8080, Agent=8888
- HTTPS via mkcert (`api.pingdemo.com`)
- Requires `/etc/hosts` entry for `api.pingdemo.com`
- Commands: `start`, `stop`, `restart`, `status`, `tail`, `test`, `help`
- PID files in `/tmp/bank-*.pid`, logs in `/tmp/bank-*.log`
- Pre-flight checks (Node version, npm, .env existence, port conflicts)

### `start.sh` (simple)
- Ports: UI=3000, API=3001, MCP=8080, Agent=8888
- HTTP only (localhost)
- Auto-installs `node_modules` if missing
- No health checks, no stop command (use `./stop.sh`)

### Option C: Manual individual terminals
- 3 terminals: `cd banking_api_server && node server.js`, `cd banking_api_ui && npm start`, `cd banking_mcp_server && npm start`

## Existing Reference Docs in `docs/`

| File | Content | Useful for Phase 05? |
|------|---------|---------------------|
| `PINGONE_APP_CONFIG.md` | Exact PingOne app settings, redirect URIs, attribute mappings | ✅ Source for SETUP.md §2 |
| `PINGONE_APP_SCOPE_MATRIX.md` | Scope matrix per app | ✅ Source for SETUP.md §2 |
| `PINGONE_RESOURCES_AND_SCOPES_MATRIX.md` | Complete resource server + scope table | ✅ Source for SETUP.md §2 |
| `VERCEL_SETUP.md` | Vercel deployment guide | ✅ Link target from SETUP.md §6 |
| `PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md` | 1-exchange PingOne setup | ✅ Reference from ARCHITECTURE_WALKTHROUGH |
| `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` | 2-exchange PingOne setup | ✅ Reference from ARCHITECTURE_WALKTHROUGH |
| `SETUP_AUTOMATION_PLAN.md` | Automation plan for PingOne config | ℹ️ Context only |
| `FEATURES.md` | Feature matrix | ℹ️ README points here |
| `RFC-STANDARDS.md` | RFC compliance table | ℹ️ README points here |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Draw.io XML generation | Template strings building XML | Copy/adapt existing `.drawio` files in `docs/` | draw.io XML is complex with `mxGraphModel` structure; existing files are the pattern |
| Env var documentation | Manual list from memory | Parse `banking_api_server/.env.example` | `.env.example` is the authoritative ~250-line catalog |
| PingOne app config docs | Write from scratch | Consult `docs/PINGONE_APP_CONFIG.md` + `PINGONE_APP_SCOPE_MATRIX.md` | Existing docs have exact settings, redirect URIs, attribute mappings |

## Common Pitfalls

### Pitfall 1: Scope name inconsistency
**What goes wrong:** Documentation uses different scope names in different places (`banking:read` vs `banking:general:read`)
**Why it happens:** Scopes were consolidated from 14 to 6 in a later phase; not all docs were updated
**How to avoid:** Use `.env.example` and `docs/PINGONE_APP_SCOPE_MATRIX.md` as source of truth; grep for old scope names
**Warning signs:** `invalid_scope` errors in PingOne when following the guide

### Pitfall 2: Client ID naming mismatch
**What goes wrong:** Docs reference `PINGONE_AI_CORE_CLIENT_ID` but `.env.example` uses `PINGONE_ADMIN_CLIENT_ID`
**Why it happens:** Variable names were refactored; `configStore.js` has fallback chains supporting both
**How to avoid:** Use `.env.example` variable names as canonical in SETUP.md; mention aliases only as a note
**Warning signs:** Copy-paste from SETUP.md into `.env` doesn't match the variable names

### Pitfall 3: Port confusion between startup methods
**What goes wrong:** Developer follows SETUP.md with `run-bank.sh` but env vars are set for `start.sh` ports
**Why it happens:** `run-bank.sh` uses 4000/3002, `start.sh` uses 3000/3001
**How to avoid:** SETUP.md should clearly state which ports each method uses and which env vars to adjust
**Warning signs:** CORS errors, redirect URI mismatches after login

### Pitfall 4: Generating draw.io XML from scratch
**What goes wrong:** Agent generates invalid draw.io XML that won't open
**Why it happens:** draw.io's `mxGraphModel` XML format is complex with specific geometry, styling, and cell relationships
**How to avoid:** Always copy and modify an existing `.drawio` file; never write XML from scratch
**Warning signs:** File won't open in draw.io or VS Code extension

### Pitfall 5: Documenting the 5th PingOne app
**What goes wrong:** SETUP.md only documents 3–4 apps; developer can't run token exchange
**Why it happens:** The MCP Token Exchanger app was added in a later phase
**How to avoid:** Document all 5 apps in the PingOne config section, clearly mark optional ones
**Warning signs:** Token exchange returns "unsupported authentication method" or 401

## Project Constraints (from CLAUDE.md)

- **Minimal diff** — name the component/element; do not refactor unrelated code
- **After any UI edit:** `npm run build` in `banking_api_ui/` must exit 0
- **Bug fixes** go to `REGRESSION_PLAN.md` §4
- **Do not edit marketing-only pages** unless task explicitly says so
- **Draw.io format only** for all diagrams (user preference in memory)
- **ARCHITECTURE.md** must NOT be modified (D-02 — preserved as standards reference)
- **Existing drawio files** must NOT be modified (D-03 — existing files show sub-step details)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | All 6 deliverables exist and are substantive | Current State | If any are stubs, plans need full authoring instead of audit |
| A2 | `Super-Banking-` prefix is correct (not `BX-Finance-`) | Draw.io Files | If user wants `BX-Finance-` naming, files need renaming |
| A3 | Scope consolidation to 6 scopes is the current state | Env Vars | If scopes changed again, all docs need updating |

## Open Questions

1. **Scope naming — which is current?**
   - SETUP.md §2.1 uses `banking:general:read`, `banking:general:write` (consolidated)
   - ARCHITECTURE_WALKTHROUGH uses `banking:read`, `banking:write` (old names)
   - Recommendation: Grep codebase for authoritative current names; update docs to match

2. **Should the 5th app (MCP Token Exchanger) be in SETUP.md?**
   - It's required for token exchange but optional for basic login flows
   - Recommendation: Include it as §2.5 marked "Optional — required for AI agent delegation"

3. **Draw.io file quality — are existing diagrams accurate?**
   - Files exist and are non-trivial (10-14 KB each)
   - Recommendation: Open each in draw.io and verify against ARCHITECTURE_WALKTHROUGH flow descriptions

## Sources

### Primary (HIGH confidence)
- `docs/SETUP.md` — read in full (320 lines) [VERIFIED: codebase]
- `docs/ARCHITECTURE_WALKTHROUGH.md` — read in full (275 lines) [VERIFIED: codebase]
- `banking_api_server/.env.example` — read in full (~250 lines) [VERIFIED: codebase]
- `docs/PINGONE_APP_CONFIG.md` — read first 100 lines [VERIFIED: codebase]
- `docs/PINGONE_APP_SCOPE_MATRIX.md` — read first 80 lines [VERIFIED: codebase]
- `README.md` — read first 100 lines [VERIFIED: codebase]
- `run-bank.sh` — read first 200 lines [VERIFIED: codebase]
- `start.sh` — read in full (65 lines) [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- `configStore.js` grep results for env var fallback chains [VERIFIED: codebase grep]
- Draw.io file existence and sizes [VERIFIED: filesystem ls]

## Metadata

**Confidence breakdown:**
- Current state of deliverables: HIGH — all files read and analyzed
- Env var catalog: HIGH — `.env.example` is authoritative
- Auth flow accuracy: HIGH — ARCHITECTURE_WALKTHROUGH.md is detailed and consistent with oauth skill
- Pitfalls: HIGH — based on observed inconsistencies in the codebase
- Draw.io content quality: MEDIUM — files exist but not opened/rendered to verify visual accuracy

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable — documentation phase, not fast-moving dependencies)
