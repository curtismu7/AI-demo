# Phase 20: Postman Collections — Fix 1-Exchange Utilities and Build Industry-Standard 2-Exchange Collection - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a complete, tested, industry-standard set of Postman collections and one shared environment file covering the 1-exchange and 2-exchange RFC 8693 delegated token chain flows. This phase is about the **docs/ Postman artifacts only** — no code changes to the app.

**Final collection inventory (after this phase):**

| File | Purpose | Audience |
|------|---------|----------|
| `BX-Finance-1-Exchange-Step-by-Step.postman_collection.json` | Step-by-step 1-exchange (was MayAct-Chain) | Learners, workshops |
| `BX Finance — 1-Exchange Delegated Chain — pi.flow.postman_collection.json` | Full-flow 1-exchange | Demo runners, customers |
| `BX Finance — 2-Exchange Delegated Chain — pi.flow.postman_collection.json` | Full-flow 2-exchange | Demo runners, customers |
| `BX-Finance-Advanced-Utilities.postman_collection.json` | PAZ policy decision + Token Revocation | Advanced / engineering |
| `BX-Finance-Shared.postman_environment.json` | One env file for all collections | All |
| `docs/POSTMAN-GUIDE.md` | Role-based quick-start guide | GitHub readers |

**Retired (delete):**
- `BX Finance — 1-Exchange Delegated Chain (sub-steps).postman_collection.json` — superseded by Step-by-Step
- `BX-Finance-MayAct-Chain.postman_collection.json` — renamed to Step-by-Step
- `BX-Finance-MayAct-Chain.postman_environment.json` — replaced by shared env
- `BX Finance — 2-Exchange Delegated Chain.postman_environment.json` — replaced by shared env

</domain>

<decisions>
## Implementation Decisions

### A — Collection Consolidation

- **D-01:** `BX-Finance-MayAct-Chain` is the canonical step-by-step collection — it has the superior scripts (staleness check on `flow_id`, better error path handling in Step 1b). Rename it to `BX-Finance-1-Exchange-Step-by-Step.postman_collection.json`.
- **D-02:** `BX Finance — 1-Exchange Delegated Chain (sub-steps)` is retired and deleted. It is structurally identical to MayAct-Chain with inferior scripts in Steps 1a and 1b.
- **D-03:** Both the step-by-step AND the pi.flow 1-exchange collection are kept — they serve different audiences (learners vs. demo runners).

### B — Environment File Strategy

- **D-04:** Unified naming to **UPPERCASE** matching `banking_api_server/.env.example`. One shared env file (`BX-Finance-Shared.postman_environment.json`) works across all four collections.
- **D-05:** Rename lowercase pi.flow vars to UPPERCASE per this exact mapping:

  | pi.flow var | → UPPERCASE |
  |-------------|-------------|
  | `env_id` | `PINGONE_ENVIRONMENT_ID` |
  | `base_url` | `PINGONE_BASE_URL` |
  | `client_id` | `PINGONE_CORE_USER_CLIENT_ID` |
  | `client_secret` | `PINGONE_CORE_USER_CLIENT_SECRET` |
  | `ai_agent_client_id` | `PINGONE_CORE_CLIENT_ID` |
  | `ai_agent_client_secret` | `PINGONE_CORE_CLIENT_SECRET` |
  | `mcp_client_id` | `MCP_CLIENT_ID` (already matches) |
  | `mcp_client_secret` | `MCP_CLIENT_SECRET` (already matches) |
  | `username` | `TEST_USERNAME` |
  | `password` | `TEST_PASSWORD` |
  | `redirect_uri` | `PINGONE_CORE_USER_REDIRECT_URI` |

- **D-06:** The note in `.env.example` (line 14) clarifies: `PINGONE_CORE_CLIENT_ID` = staff/BFF/worker client = the actor in delegation chains. `ai_agent_client_id` in the old Webinar collection maps to the same PingOne client.

### C — AI-IAM-CORE Webinar Collection

- **D-07:** Clean up and promote `AI-IAM-CORE Webinar.postman_collection.json` from root to `docs/BX-Finance-Advanced-Utilities.postman_collection.json`.
- **D-08:** Rename all requests to clear, descriptive names (strip "Copy 3", "Copy 2" etc.). Only keep requests with unique value — two are unique: **PAZ Policy Decision** and **Token Revocation**. The rest are duplicates of pi.flow-2x.
- **D-09:** PAZ request has a hardcoded decision endpoint UUID (`cc26aaa9-9b27-4409-bc60-f8a5f98d6296`) — extract to `{{PAZ_DECISION_ENDPOINT_ID}}` variable so it's portable across environments.
- **D-10:** Swap all Webinar vars (`envID`, `APIPath`, `authPath`, `actor_token_from_ai_agent`, etc.) to UPPERCASE convention.
- **D-11:** Webinar collection stays in root as a raw dev artifact (not moved, not touched) — only the cleaned version goes to `docs/`.

### D — Documentation Format

- **D-12:** Both in-collection descriptions AND a `docs/POSTMAN-GUIDE.md` README.
- **D-13:** In-collection: each request has a description covering what it does, which variables must be set, and what the response saves. Collection-level description covers setup and pairing with the shared env file.
- **D-14:** `docs/POSTMAN-GUIDE.md` has role-based quick-start guides:
  - "If you're a **learner** (want to understand each OAuth step): use `BX-Finance-1-Exchange-Step-by-Step` + shared env."
  - "If you're a **demo runner** (want to run the full flow quickly): use `1-Exchange pi.flow` or `2-Exchange pi.flow` + shared env."
  - "If you're an **engineer** (want PAZ policy decisions or token revocation): use `BX-Finance-Advanced-Utilities` + shared env."
  - Covers common errors: stale `flow_id` (120s window), variable not set, env not selected in Postman.

### Folded Todos

- **`study-ai-iam-core-webinar-postman-collection`** (from backlog): This phase now handles the Webinar collection analysis and cleanup (area C decision). The unique value identified was PAZ policy decision + Token Revocation — both are being promoted to `BX-Finance-Advanced-Utilities`. Marked resolved by this phase.
- **`phase-20-postman-keep-both-collections-fix-sub-steps-utilities`** (decision todo): GA1 decision was updated during discussion — sub-steps is being retired (not fixed) in favour of MayAct-Chain rename. Marked resolved by this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Token Claims and Exchange Shapes
- `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` — authoritative claim shapes for `act`, `may_act`, `sub`, `aud`, `iss`, `scope` before and after each exchange step. Required reading for validating that collection request bodies and test assertions match real RFC 8693 payloads.

### Server-Side Variable Names (canonical)
- `banking_api_server/.env.example` — lines 14–34 define canonical var names (`PINGONE_CORE_CLIENT_ID`, `PINGONE_CORE_USER_CLIENT_ID`, `ENDUSER_AUDIENCE`, `MCP_RESOURCE_URI`, etc.). All Postman variable names must match these exactly after the rename in D-04/D-05.

### Existing Collections to Modify
- `docs/BX-Finance-MayAct-Chain.postman_collection.json` — rename + keep as canonical step-by-step (D-01)
- `docs/BX Finance — 1-Exchange Delegated Chain — pi.flow.postman_collection.json` — rename vars to UPPERCASE (D-05)
- `docs/BX Finance — 2-Exchange Delegated Chain — pi.flow.postman_collection.json` — rename vars to UPPERCASE, add Utility C (Revocation), add Utility D (PAZ) if PAZ_DECISION_ENDPOINT_ID is set (D-05, D-08)
- `AI-IAM-CORE Webinar.postman_collection.json` — source for PAZ and Revocation request extraction only (D-11, stays in root untouched)

### Collections to Delete
- `docs/BX Finance — 1-Exchange Delegated Chain (sub-steps).postman_collection.json`
- `docs/BX-Finance-MayAct-Chain.postman_environment.json`
- `docs/BX Finance — 2-Exchange Delegated Chain.postman_environment.json`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BX-Finance-MayAct-Chain` Steps 1a–1d pre-request + test scripts: best-in-class PKCE step-through with `flow_id` staleness check (120s window) and clean error paths — copy these patterns to any new requests that need PKCE.
- `BX Finance — 2-Exchange Delegated Chain — pi.flow` Utility A (Introspect) and Utility B (Set mayAct): gold standard for Utility request pattern — pre-request guard checks token is set, test script parses and logs response clearly.

### Established Patterns
- **Pre-request guards**: Every non-utility step in the 2-exchange pi.flow checks required vars at the top: `const x = pm.environment.get('X') || pm.collectionVariables.get('X'); if (!x) throw new Error('[Step N] X not set — run Step M first.')` — apply to all requests in all collections after rename.
- **Token auto-save**: Test scripts use `pm.environment.set(key, val); pm.collectionVariables.set(key, val)` — both environment and collection variables set for maximum compatibility.
- **Error guidance in pre-request**: 2-exchange collection includes inline comments explaining what each error means and how to fix it (e.g., "NOT_FOUND means flow_id is stale").

### Integration Points
- All collections share the new `BX-Finance-Shared.postman_environment.json` — only static config vars go in the env file; token runtime vars (`subject_token`, `mcp_token`, `auth_code`, etc.) are saved to collection variables by test scripts.

</code_context>

<specifics>
## Specific Ideas

- Step-by-step renamed file: `BX-Finance-1-Exchange-Step-by-Step.postman_collection.json` — name conveys what it is without needing "(sub-steps)" parenthetical.
- Advanced utilities collection: `BX-Finance-Advanced-Utilities.postman_collection.json` — PAZ request should include a description noting the hardcoded endpoint UUID pattern and pointing to how to find it in PingOne Admin.
- POSTMAN-GUIDE.md: keep it short — 3 audience sections, a prerequisites checklist (PingOne app registered, env vars, shared env file imported), and a "Common errors" table. Not a tutorial; tutorials live in the app's education panels.

</specifics>

<deferred>
## Deferred Ideas

- **PINGONE-GUIDE.md** (app setup walkthrough) — scope creep for this phase; belongs in Phase docs once all collections are stable. Noted for PROJECT.md `DOC-01` requirement.
- **Postman Team workspace / public workspace** — publishing collections to Postman's public workspace for one-click import. Out of scope for v1; log for backlog.

### Reviewed Todos (not folded)
- `include-pingone-may-act-docs-in-phase-5-user-documentation` — about embedding docs in Phase 5 user guide, not about Postman collections. Deferred to documentation phase.
- `read-pdf-oauth-2-0-token-exchange-info` — informational research todo; already resolved via `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md`.

</deferred>

---

*Phase: 20-postman-collections-fix-1-exchange-utilities-and-build-industry-standard-2-exchange-collection*
*Context gathered: 2026-04-02*
