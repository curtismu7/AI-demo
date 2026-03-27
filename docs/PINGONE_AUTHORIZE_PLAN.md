# PingOne Authorize — implementation plan (banking demo)

This document aligns the BX Finance banking demo with **PingOne Authorize** as documented by Ping Identity. It supersedes ad-hoc notes and should be updated when we change integration points.

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
| Server integration | `banking_api_server/services/pingOneAuthorizeService.js` | Worker token (client credentials), then **POST** to `.../governance/policyDecisionPoints/{policyId}/evaluate` with a structured **context** (user, transaction, optional `acr`). Parses **PERMIT** / **DENY** / **INDETERMINATE** and **step-up** hints from obligations/advice. |
| Config | `configStore` / env | `authorize_worker_client_id`, `authorize_worker_client_secret`, `authorize_policy_id`, plus existing PingOne `environment_id` / region. |
| UI / education | `banking_api_ui/src/components/education/PingOneAuthorizePanel.js` | Short copy only; no deep links to Ping docs yet. |

---

## Gap analysis (plan vs product docs)

1. **API surface:** The service uses **Policy Decision Points — evaluate** under the governance path. The **Decision Endpoints** doc describes the **decision endpoint** resource and **evaluate decision request** as the product’s policy decision service. **Action:** Confirm in the latest [PingOne Authorize API reference](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html) (Developer resources) whether banking should call **decision endpoint ID** + *Evaluate a Decision Request* as the primary path, and whether the current PDP `evaluate` URL remains supported or is legacy. Update `pingOneAuthorizeService.js` to match **one** supported contract.

2. **Identifiers:** We store a single **`authorize_policy_id`**. Decision endpoints bind **`policyId`** (root policy) to an endpoint resource. **Action:** Add config for **decision endpoint ID** (and optional `alternateId`) if evaluation is keyed by endpoint, not raw PDP id alone.

3. **Observability:** `recordRecentRequests` and **recent decisions** APIs support troubleshooting and demos. **Action:** Optional admin or education panel: “last decision” read-only using **GET** *Read Recent Decisions* (with appropriate scopes).

4. **Overview alignment:** Trust Framework (attributes, services, conditions), **API Access Management** (API services / operations / gateways), and **external OAuth** tokens — **not** all required for MVP. **Action:** Phase 2+ for “API protection” story; Phase 1 stays **transaction evaluation + step-up** consistent with [overview](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html).

---

## Phased implementation plan

### Phase 1 — Documentation and config clarity (no breaking change)

- Keep current `evaluateTransaction` behavior; document the exact request/response in this file once validated against Ping’s OpenAPI/spec.
- Add **Ping Identity doc links** to `PingOneAuthorizePanel.js`: overview + decision endpoints (and API reference when we pick the evaluate URL).
- Update `FEATURES.md` / `REGRESSION_LOG.md` when behavior changes.

### Phase 2 — Align with Decision Endpoints evaluation

- Register or read a **decision endpoint** in PingOne Admin (per [overview tutorials](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html) — *Publishing a policy and configuring an endpoint*).
- Implement **POST** *Evaluate a Decision Request* per [Decision Endpoints / Decision Evaluation](https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints.html) (exact path from current Platform API spec).
- Map response to existing `{ decision, stepUpRequired, raw }` so `routes/transactions.js` and tests change minimally.
- Deprecate or gate the old `policyDecisionPoints/.../evaluate` path behind a config flag if both exist during migration.

### Phase 3 — Recent decisions and UX

- If `recordRecentRequests` is enabled on the endpoint, use **GET** *Read Recent Decisions* for support/education screens (admin-only).
- Optional: correlate high-value **HITL** consent in the app with **decision id** logged from Authorize for audit narrative.

### Phase 4 — Broader Authorize features (optional)

- **API Access Management** (API services, operations, gateway sidecars) — aligns with `docs/MCP_GATEWAY_PLAN.md` fine-grained controls.
- **Step-up for APIs** and **external OAuth** token sources — tie to existing OAuth/token exchange work in the BFF.

---

## References

- [Authorization using PingOne Authorize — overview](https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html)
- [PingOne Platform APIs — Decision Endpoints](https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints.html)
- Internal: `banking_api_server/services/pingOneAuthorizeService.js`, `docs/MCP_GATEWAY_PLAN.md` (§ fine-grained controls)
