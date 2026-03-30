# PingOne Authorize — implementation plan (banking demo)

This document aligns the BX Finance banking demo with **PingOne Authorize** as documented by Ping Identity. It supersedes ad-hoc notes and should be updated when we change integration points.

---

## Backend-for-Frontend (BFF)

**BFF** stands for **Backend-for-Frontend**: a backend owned by the same product team as the web UI, placed **between the browser and upstream services** (identity provider, authorization services, MCP servers, APIs).

In BX Finance, the BFF is the **Node/Express application** in **`banking_api_server/`**. It:

- Completes **OAuth 2.0 / OpenID Connect** with **PingOne** for the React app (e.g. authorization code flow with **PKCE**), then stores tokens in a **server-side session** (typically an **httpOnly** cookie to the browser) so **OAuth access tokens are not exposed to browser JavaScript**.
- Calls PingOne’s **token endpoint** for **RFC 8693 token exchange** to obtain **MCP-scoped** access tokens and uses those toward **MCP** / tool calls.
- When **transaction authorization** is enabled, calls **PingOne Authorize** from the server (using the **worker** client and decision endpoint / PDP configuration) inside **`routes/transactions.js`** — the SPA does not call Authorize directly.
- Exposes **`/api/*`** routes consumed by **`banking_api_ui`**.

Elsewhere in this repo, **“the BFF”** means **`banking_api_server`**, not the MCP server (`banking_mcp_server`) and not the static React bundle alone. Deeper token and standards detail: **`ARCHITECTURE.md`**.

---

## RFCs and specifications we use

Summary of **RFCs** and related specs that show up in OAuth, JWT, MCP, and session design for this demo. Implementation status (✅ vs gaps) lives in **`ARCHITECTURE.md`** §1 and §1a.

| ID / spec | Title or source | Role in this demo |
|-----------|-----------------|-------------------|
| **RFC 6749** | OAuth 2.0 Authorization Framework | Grants, token endpoint, scopes |
| **RFC 6750** | OAuth 2.0 Bearer Token Usage | `Authorization: Bearer` on API and MCP-related calls |
| **RFC 7009** | OAuth 2.0 Token Revocation | Target for logout / invalidation (not fully wired everywhere) |
| **RFC 7517** | JSON Web Key (JWK) | JWKS-based JWT signature verification |
| **RFC 7519** | JSON Web Token (JWT) | Access and ID tokens; optional delegation claims |
| **RFC 7591** | OAuth 2.0 Dynamic Client Registration | Optional client registration flows |
| **RFC 7636** | Proof Key for Code Exchange (PKCE) | Auth code flow from SPA via BFF |
| **RFC 7662** | OAuth 2.0 Token Introspection | MCP server validating tokens with PingOne |
| **RFC 8693** | OAuth 2.0 Token Exchange | Delegated **MCP access token** from user access token; **`may_act` / `act`** (see §4.1) |
| **RFC 9068** | JWT Profile for OAuth 2.0 Access Tokens | JWT access token conventions (with RFC 7519) |
| **OpenID Connect Core 1.0** | OIDF | ID Token, UserInfo, `openid` scope |
| **OpenID Connect CIBA** | OIDF CIBA Core 1.0 | Back-channel authentication where configured |
| **JSON-RPC 2.0** | jsonrpc.org | MCP request/response framing |
| **MCP protocol** | Anthropic MCP `2024-11-05` | Tools over WebSocket in this repo |

**Patterns (not a single RFC):** **Backend-for-Frontend (BFF)** session pattern; **OWASP** session fixation mitigation (`session.regenerate()` after login) as implemented in the BFF.

---

## Official documentation (source of truth)

| Topic | URL | Use in this demo |
|--------|-----|------------------|
| **Authorization using PingOne Authorize (overview)** | [PingOne docs — Authorization using PingOne Authorize](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html) | Product scope: centralized policies for **applications and APIs**, Trust Framework, policies, **decision endpoints**, API Access Management, gateway integrations, tutorials. |
| **Decision Endpoints (Platform API)** | [PingOne Platform APIs — Decision Endpoints](https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints.html) | **Policy decision service** resources: create/read/update/delete **decision endpoints**, query **recent decisions**, and **evaluate decision requests**. Includes the decision endpoint **data model** (e.g. `policyId`, `authorizationVersion`, `recordRecentRequests`, `recentDecisions`). |

Additional entry points from the overview (for later phases):

- **Policy decision service API Reference** — linked from the same PingOne Authorize doc tree under *Developer resources* on [the overview page](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html).
- **Tutorials:** *Build dynamic authorization policies*, *Manage API access*, *Publishing a policy and configuring an endpoint* — listed under *Tutorials* / *Use PingOne Authorize* in that section.

---

## What PingOne Authorize provides (from the overview)

Per [the overview](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html):

- **Cloud-based authorization** controlling what users can see and do in **applications and APIs**.
- **Centralized** policies from simple rules to **fine-grained**, real-time policies; collaboration for IAM teams.
- Capabilities called out in *What’s new* include: external OAuth servers for API access control, **Authorize gateway**, integrations (e.g. **Amazon CloudFront**, API gateways), **step-up authentication for APIs**, custom OAuth parameters in HTTP service requests, **role-based permissions** in access tokens.

**Implication for our demo:** transaction and agent flows should be describable as **authorization decisions** (permit / deny / obligations such as step-up), with optional **recent decisions** for audit and education.

---

## Decision Endpoints API (from the Platform API doc)

Per [Decision Endpoints](https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints.html):

- The **policy decision service** exposes operations to **create, read, update, and delete** decision policy resources in PingOne (decision **endpoints**).
- The documented **data model** includes fields such as: `id`, `name`, `description`, `policyId`, `authorizationVersion` (with `id` / `href` / `title` / `type`), `alternateId`, `owned`, `recordRecentRequests`, and `recentDecisions` (links for querying history).
- **Management operations** (worker / admin tokens as required by each operation): create endpoint, read all / one, read recent decisions, read policy decision service configuration, update, delete.
- **Decision evaluation:** **POST** *Evaluate a Decision Request* (see the same doc hierarchy under *Decision Evaluation*).

**Implication for our demo:** production-style integration should target a **decision endpoint** (and evaluation API) as the stable contract, rather than ad-hoc URLs. Our code must stay aligned with the **current** PingOne API paths and request/response shapes in the API reference.

---

## Current implementation in this repo

| Area | Location | Behavior |
|------|-----------|----------|
| **Unified gate** | `banking_api_server/services/transactionAuthorizationService.js` | Single entry `evaluateTransactionPolicy` used by `routes/transactions.js`: picks **simulated** vs **PingOne** from flags + config; returns permit / block / errors consistently. `getAuthorizationStatusSummary()` exposes **activeEngine** (`off` \| `simulated` \| `pingone` \| `pending_config`) for admin UIs (no secrets). |
| Server integration | `banking_api_server/services/pingOneAuthorizeService.js` | Worker token (client credentials), then **POST** decision endpoint (preferred) or legacy PDP **evaluate**. Trust Framework **parameters**: `Amount`, `TransactionType`, `UserId`, `Acr`, `Timestamp`. |
| **Simulated (education)** | `banking_api_server/services/simulatedAuthorizeService.js` | Same parameter shape and response fields as Phase 2; **`raw.requestShape: 'decision-endpoint'`**, **`engine: 'simulated'`**. Ring buffer (**50**) for **`GET /api/authorize/simulated-recent-decisions`**. |
| Admin API | `banking_api_server/routes/authorize.js` | **`GET /api/authorize/recent-decisions`**, **`GET /api/authorize/decision-endpoints`** (PingOne); **`GET /api/authorize/simulated-recent-decisions`**, **`GET /api/authorize/evaluation-status`** (education / parity). |
| Transaction response | `banking_api_server/routes/transactions.js` | On **201** success, JSON may include **`authorizeEvaluation`** when the gate ran (audit / demos). |
| Config | `configStore` / env | Worker + `authorize_decision_endpoint_id` / `authorize_policy_id`. Feature flags: **`ff_authorize_simulated`**, **`ff_authorize_fail_open`**, etc. |
| UI / education | `banking_api_ui/src/components/education/PingOneAuthorizePanel.js` | Recent Decisions tab: **Refresh status** (evaluation summary), **PingOne recent** vs **Simulated recent** fetchers. |
| **Educational agent + sign-in** | `banking_api_ui/src/components/DemoDataPage.js` (`/demo-data`) | Lesson-style choices for presenters: **OAuth + PKCE**, **marketing page + `pi.flow`** (hosted Ping login, not password-grant demos), **Bearer token** lab. Complements Authorize/MCP teaching; does not replace PingOne Authorize decision APIs. |

---

## Architecture-diagram PAZ vs this demo

Some architecture diagrams show a **PAZ** (policy authorization) step that explicitly chains checks such as:

- **Introspect** the MCP-exchanged access token (e.g. against the IdP `/token` or introspection endpoint).
- Assert **SUB** exists in the IdP directory (e.g. PingOne user store).
- Assert **AUD** matches the resource server.
- Assert **`act.sub`** matches the MCP server identity.
- Assert **`act.act.sub`** matches the primary / upstream agent identity (nested delegation).

**What we implement today:** **PingOne Authorize** is wired as **transaction policy** in `routes/transactions.js` (evaluate permit / deny / step-up hints via `pingOneAuthorizeService.js`). Feature flags (`authorize_enabled`, `ff_authorize_fail_open`, `ff_authorize_deposits`, etc.) control when evaluation runs and how errors behave.

**What we do *not* mirror line-for-line:** that diagram’s full matrix of **token introspection + nested `act` / `act.act` assertions** inside the Authorize call. Token shape and delegation (`may_act` / `act`, RFC 8693 exchange for MCP) are handled in the **Backend-for-Frontend (BFF) + MCP** path; Authorize in this repo focuses on **business transaction context** (amount, type, user, ACR), not re-implementing every checklist item from a generic IAM architecture diagram.

If product or field teams require **Authorize policies** that consume introspection results or nested actor claims, that is an **additional policy design + Trust Framework** task on top of the current transaction evaluation, not a change implied by the existing integration alone.

---

## Plan: PAZ parity with the AI Agent / MCP reference architecture

This section is the actionable plan to move **closer to architecture diagrams** (e.g. **PAZ** after MCP token exchange) where policy evaluation is explicitly tied to **introspection-backed identity**, **audience**, and **delegation chain** (`act` / nested `act`), not only to **transaction** attributes (amount, type).

### 1. Target behavior (what “the same as PAZ” means)

From the reference model, **PAZ** should effectively enforce:

| Check | Intent |
|--------|--------|
| **Token validity** | Access token is **active** (e.g. via **RFC 7662 introspection** or equivalent JWT validation with JWKS). |
| **Subject / identity** | **`sub`** represents an end user that **exists and is eligible** in the IdP directory (policy may use directory / attribute services PingOne exposes). |
| **Audience** | **`aud`** matches the **resource** this access is for (in our demo: **MCP resource URI** / downstream **Banking API** audience, depending on policy scope). |
| **Chain of custody** | **`act`** (and if issued, **nested `act`**) match **allowed actors** — e.g. MCP layer vs agent/BFF — so delegation is not arbitrary. |

**Important:** PingOne Authorize **decision APIs** in this repo are invoked with **Trust Framework parameters** (JSON), not by “uploading” a raw Bearer token into PAZ. The plan therefore assumes we **derive parameters from introspection/JWT claims** (same facts PAZ would use after introspection in the diagram) and send them to a **decision endpoint** whose **policy** implements the checks above.

### 2. Where we are today (matrix)

| Capability | Reference diagram | BX Finance today | Gap |
|------------|-------------------|------------------|-----|
| Introspection | Before / as input to PAZ | **`banking_mcp_server`** `TokenIntrospector` calls PingOne **`/as/introspect`**; validates **`active`**, **`aud`** vs `MCP_SERVER_RESOURCE_URI`, optional **`may_act`** vs `BFF_CLIENT_ID` | Strong for **MCP**; **not** wired through **Authorize**. |
| SUB / user | PAZ + directory | Introspection returns **`sub`**; MCP uses it in session; **transaction** Authorize passes **`UserId`** | **MCP path** does not call **Authorize** to assert “user allowed for this tool/resource”. |
| AUD | PAZ policy | Enforced in **MCP** introspection path | Not duplicated in **Authorize** for MCP. |
| `act` / nested `act` | Explicit policy steps | **`act.client_id`** logged; **`may_act`** optional; **no** enforcement of **nested `act`** chain like `act.act.sub` in reference | **Policy + code** gap vs multi-hop diagram. |
| PAZ diamond | Single policy point for resource access | **PAZ** used only for **`routes/transactions.js`** (**Amount**, **TransactionType**, **UserId**, **Acr**, …) | **Second decision path** needed for “**MCP / tool / delegation**” if we want diagram-level PAZ. |

### 3. Design choices (pick one primary pattern)

**Recommended (keeps worker secrets on the BFF):**

1. **`banking_api_server`** exposes an internal or session-authenticated route, e.g. **`POST /api/authorize/mcp-delegation`** (name TBD), callable **only** from trusted paths (same-origin MCP proxy flow, or server-to-server from MCP with a shared secret / mTLS if MCP is not co-located).
2. Handler **introspects** the presented **MCP access token** (or validates JWT + uses claims) and maps to Trust Framework parameters, e.g. **`SubjectId`**, **`TokenAudience`**, **`ActClientId`**, **`NestedActClientId`** (if present), **`McpResourceUri`**, **`ToolName`** (optional).
3. Calls **`pingOneAuthorizeService`** with a **dedicated `authorize_mcp_decision_endpoint_id`** (or reuses endpoint if PingOne policy branches on a **DecisionType** parameter).
4. **PERMIT / DENY / obligations** returned to caller; **MCP** or **BFF** blocks the tool call accordingly.

**Alternative (MCP holds Authorize worker credentials):** MCP calls decision endpoint directly after introspection. **Not recommended** for this demo: duplicates **worker client secret**, widens blast radius, complicates rotation.

### 4. Phased implementation

| Phase | Scope | Deliverables |
|-------|--------|--------------|
| **4a — PingOne policy & Trust Framework** | No app code yet | New **decision endpoint** (or policy branch) in PingOne Authorize with attributes matching §3. Document attribute names **identical** to what the BFF will send. Optionally model **directory / user-exists** and **actor allow-lists** in policy (PingOne UI / Trust Framework docs). |
| **4b — BFF service API** | `banking_api_server` | ✅ **`pingOneAuthorizeService.evaluateMcpToolDelegation`** posts **`DecisionContext: McpFirstTool`** plus **`UserId`**, **`ToolName`**, **`TokenAudience`**, **`ActClientId`**, **`NestedActClientId`**, **`McpResourceUri`**, optional **`Acr`**. Config: **`authorize_mcp_decision_endpoint_id`** / **`PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID`**. **`simulatedAuthorizeService.evaluateMcpFirstTool`** for education; optional **`SIMULATED_MCP_DENY_TOOLS`** (comma-separated tool names) for forced DENY. |
| **4c — Call site** | Wire the gate | ✅ **`POST /api/mcp/tool`** (BankingAgent → BFF): after MCP access token resolution, **`mcpToolAuthorizationService.evaluateMcpFirstToolGate`** runs once per session (**`req.session.mcpFirstToolAuthorizeDone`**). Feature flag **`ff_authorize_mcp_first_tool`**; reuses **`ff_authorize_fail_open`** for live PingOne errors. Skips admins and paths without a bearer MCP token (local fallback). Success JSON may include **`mcpAuthorizeEvaluation`** when the gate ran this request. **`GET /api/authorize/evaluation-status`** merges **`getMcpFirstToolGateStatus()`**. |
| **4d — MCP hardening (parallel)** | `banking_mcp_server` | If PingOne can issue **nested `act`**, extend **`TokenIntrospector`** (and tests) to **enforce** `act` / nested actor IDs against env allow-lists — **defense in depth** even when PAZ also evaluates. |
| **4e — Observability & education** | Admin + docs | ✅ **`mcpAuthorizeEvaluation`** on first gated **`POST /api/mcp/tool`**; **PingOneAuthorizePanel** + **`GET /api/authorize/evaluation-status`** include **`mcpFirstTool*`**; **`BX_Finance_AI_Agent_Tokens.drawio`** shows **BFF → Authorize** for optional first MCP tool vs **transactions** path and **MCP → Banking API** indirect Authorize on writes. |

### 5. Out of scope / explicit non-goals (unless product asks)

- Replacing **JWT validation** on **`/api/*`** with Authorize on every read — different product story (**API Access Management** / gateway).
- Storing **Authorize worker** credentials in **`banking_mcp_server`** without a security review.

### 6. Success criteria

- A **policy decision** in PingOne Authorize can **DENY** an MCP access scenario based on **aud**, **actor chain**, or **user eligibility**, with **recent decisions** visible for demos.
- **Transaction** Authorize path remains unchanged unless intentionally consolidated into one endpoint with a **DecisionType** parameter.

### 7. Call-site decision — **first MCP tool use** (Option B)

**What we chose:** Run the **MCP / delegation** Authorize evaluation when the user (or agent) is about to execute **MCP tooling** for the first time in a flow — e.g. first **`tools/call`** after a valid MCP session/token, not immediately after the BFF finishes **RFC 8693** token exchange.

**Product impact:**

- **Latency:** Users pay the Authorize round-trip on the **first** tool invocation (or first per session), not on every page load or exchange.
- **PingOne load:** Fewer evaluations than **per tool** or **post-exchange** if sessions run multiple tools.
- **Policy semantics:** PingOne sees a decision **in the context of “someone is actually using MCP tools”**, which matches demos where PAZ sits **before** tools/resources.

**Security nuance:** The **MCP access token** is still **validated at the MCP server** (introspection / JWT, **`aud`**, scopes, optional **`may_act`**) **before** any tool runs. Adding Authorize on **first tool use** does not remove that; it **adds** a **central policy** layer. The short window between “token minted” and “first tool” is only material if something could use the token **without** going through MCP tool execution — in our architecture, **MCP is the consumer** of that token, so **first tool use** is a practical gate.

**Follow-up choice:** **Once per MCP session** vs **once per tool** — per-tool gives finer policy (e.g. deny specific tools) at higher cost; per-session matches “first MCP use” with lower latency.

### 8. Security comparison, MCP spec, and best use of PAZ

**Is our current approach better, worse, or the same for security?**

It is **not** strictly “worse” or “better” in isolation — it is **different**:

| Aspect | **Today (MCP introspection + scopes + optional `may_act`, transactions → PAZ)** | **After adding PAZ on first MCP tool use** |
|--------|----------------------------------------------------------------------------------|--------------------------------------------|
| **Token authenticity** | MCP proves token **active**, **`aud`**, expiry, scopes | **Unchanged** — still required; PAZ does not replace introspection. |
| **Delegation / actor** | **`act`** logged; **`may_act`** optional; limited **nested `act`** enforcement | PAZ policy can **codify** allow-lists and **audit** delegation decisions in **recent decisions**. |
| **Central governance** | Policy changes often need **code/config** on MCP (scopes, env) | IAM can tune **PingOne Authorize** policies **without** redeploying MCP (subject to Trust Framework attributes you pass). |
| **Risk if misconfigured** | Weak scopes / disabled checks | **Fail-open** on Authorize errors would be **weaker** than fail-closed; must align with risk appetite. |

**Summary:** For **pure cryptographic / OAuth correctness**, a **well-locked-down** MCP server alone can be **sufficient**. Adding PAZ is **better for organizational security** when you need **one policy engine**, **auditable decisions**, and **dynamic rules** (risk, geography, step-up obligations). It is **worse** only if implemented **sloppily** (e.g. fail-open in production, wrong parameters, or exposing **worker** credentials broadly).

**Proper MCP use (spec / practice)**

- The **MCP protocol** specifies **how** clients and servers talk (capabilities, tools, transports). It does **not** mandate PingOne Authorize.
- **Best practice** is still: **authenticate** the session (e.g. **Bearer** token), **validate** it on the server, **least-privilege** tool scopes, **TLS**, and **no** long-lived secrets in the browser for MCP-bound tokens when using a BFF.
- **PAZ is an add-on** to MCP: it satisfies **enterprise IAM** needs; it is not required to claim “spec-compliant MCP.”

**How to best use PAZ (in this demo and similar apps)**

1. **High-impact actions** — Already: **money movement** (**transactions**) → strong fit for PERMIT / DENY / step-up.
2. **Sensitive delegation** — **Next:** **first MCP tool use** (this plan) when IAM should own **who may act through MCP** and **under what conditions**.
3. **Avoid** calling PAZ on **every read** of static data unless product requires it — cost, latency, and **API Access Management** / gateway patterns may fit better at scale.
4. **Keep worker credentials** on the **BFF** (or a dedicated policy service), **not** in the browser and ideally **not** duplicated on MCP without review.

---

## Gap analysis (plan vs product docs)

1. **API surface:** The service uses **Policy Decision Points — evaluate** under the governance path. The **Decision Endpoints** doc describes the **decision endpoint** resource and **evaluate decision request** as the product’s policy decision service. **Action:** Confirm in the latest [PingOne Authorize API reference](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html) (Developer resources) whether banking should call **decision endpoint ID** + *Evaluate a Decision Request* as the primary path, and whether the current PDP `evaluate` URL remains supported or is legacy. Update `pingOneAuthorizeService.js` to match **one** supported contract.

2. **Identifiers:** We store a single **`authorize_policy_id`**. Decision endpoints bind **`policyId`** (root policy) to an endpoint resource. **Action:** Add config for **decision endpoint ID** (and optional `alternateId`) if evaluation is keyed by endpoint, not raw PDP id alone.

3. **Observability:** `recordRecentRequests` and **recent decisions** APIs support troubleshooting and demos. **Status:** Admin routes + education panel cover PingOne recent decisions, simulated ring buffer, evaluation status, and optional **`authorizeEvaluation`** on successful transaction responses.

4. **Overview alignment:** Trust Framework (attributes, services, conditions), **API Access Management** (API services / operations / gateways), and **external OAuth** tokens — **not** all required for MVP. **Action:** Phase 2+ for “API protection” story; Phase 1 stays **transaction evaluation + step-up** consistent with [overview](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html).

---

## Phased implementation plan

### Phase 1 — Documentation and config clarity ✅ COMPLETE

- `PingOneAuthorizePanel.js` fully rewritten with 5 rich tabs + official Ping doc links.

### Phase 2 — Align with Decision Endpoints evaluation ✅ COMPLETE (2026-03-27)

- `pingOneAuthorizeService.js` — dual-path: `POST /decisionEndpoints/{endpointId}` (preferred) + legacy PDP fallback.
- New config field: `authorize_decision_endpoint_id` (configStore + `PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID` env alias).
- Config UI: Decision Endpoint ID field in Admin → Config → PingOne Authorize.
- `routes/transactions.js` passes `decisionEndpointId`; response includes `path` + `decisionId`.
- Trust Framework parameters: `Amount`, `TransactionType`, `UserId`, `Acr`, `Timestamp`.
- Old PDP path kept as fallback — no breaking change for existing deployments.

### Phase 3 — Recent decisions and UX ✅ COMPLETE (2026-03-27, extended 2026-03-29)

- `getRecentDecisions()` + `getDecisionEndpoints()` added to service.
- Admin routes: `GET /api/authorize/recent-decisions`, `GET /api/authorize/decision-endpoints`, **`GET /api/authorize/simulated-recent-decisions`**, **`GET /api/authorize/evaluation-status`**.
- Education panel: Recent Decisions tab — engine status, PingOne vs simulated recent lists, PERMIT/DENY badges, expandable JSON.
- Successful **`POST /api/transactions`** may include **`authorizeEvaluation`** when authorization ran.

### Phase 4 — Broader Authorize features (optional / future)

- **PAZ / MCP / delegation alignment** — see **§ Plan: PAZ parity with the AI Agent / MCP reference architecture** above (Trust Framework parameters from introspection claims, second decision endpoint, BFF-mediated evaluation).
- **API Access Management** (API services, operations, gateway sidecars) — aligns with `docs/MCP_GATEWAY_PLAN.md`.
- **Step-up for APIs** and **external OAuth** token sources — tie to existing OAuth/token exchange work in the **Backend-for-Frontend (BFF)** (`banking_api_server`).

---

## References

- [Authorization using PingOne Authorize — overview](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html)
- [PingOne Platform APIs — Decision Endpoints](https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints.html)
- Internal: `banking_api_server/services/pingOneAuthorizeService.js`, `docs/MCP_GATEWAY_PLAN.md` (§ fine-grained controls)
- Internal: **`ARCHITECTURE.md`** — full **RFC** list, BFF pattern, and implementation status table
