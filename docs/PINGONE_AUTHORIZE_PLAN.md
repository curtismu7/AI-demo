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

- **API Access Management** (API services, operations, gateway sidecars) — aligns with `docs/MCP_GATEWAY_PLAN.md`.
- **Step-up for APIs** and **external OAuth** token sources — tie to existing OAuth/token exchange work in the **Backend-for-Frontend (BFF)** (`banking_api_server`).

---

## References

- [Authorization using PingOne Authorize — overview](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html)
- [PingOne Platform APIs — Decision Endpoints](https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints.html)
- Internal: `banking_api_server/services/pingOneAuthorizeService.js`, `docs/MCP_GATEWAY_PLAN.md` (§ fine-grained controls)
- Internal: **`ARCHITECTURE.md`** — full **RFC** list, BFF pattern, and implementation status table
