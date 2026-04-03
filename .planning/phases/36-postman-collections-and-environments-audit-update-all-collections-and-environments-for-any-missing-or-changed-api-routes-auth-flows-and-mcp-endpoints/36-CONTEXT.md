# Phase 36: Postman Collections & Environments Audit — Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Full audit and update of all Postman collections and environment files in this repo:
- Review every existing request in every BX Finance collection for staleness (broken URLs, outdated variable refs, wrong auth methods)
- Add Postman coverage for all BFF routes and MCP endpoints added since collections were last maintained (phases 29–34)
- Correct the 2-exchange delegated chain based on the AI-IAM-CORE Webinar collection
- Organize new requests into the right collections (expand Advanced Utilities + new dedicated MCP and BFF collections)
- Add missing environment variables to the shared env
- Move stray root-level Postman files into `docs/`
- Mark the Webinar collection todo as resolved

This phase is docs/tooling only — no application code changes.
</domain>

<decisions>
## Implementation Decisions

### D-01: Audit scope — Full
Review ALL existing requests across all BX Finance collections for staleness (outdated URLs, variable references, auth methods, deprecated routes) in addition to adding new coverage. Full sweep, not just additive.

### D-02: New routes to cover
Add Postman requests for every BFF route added in phases 29–34 that lacks coverage:
- `GET /api/mcp/audit` (BFF audit proxy — pass `agentId`, `operation`, `eventType`, `outcome`, `limit` as query params)
- `GET /.well-known/mcp-server` (direct to MCP server — port 8080 or Railway URL)
- `GET /api/mcp/audit` on MCP server directly (`MCP_SERVER_URL/audit`)
- `GET /api/mcp/exchange-mode` and `POST /api/mcp/exchange-mode`
- `POST /api/mcp/inspector/invoke` (invoke a tool via MCP inspector)
- `GET /api/rfc9728` (RFC 9728 protected resource metadata)
- `banking:sensitive:read` scoped tool call (Phase 29 flow — `get_sensitive_account_details`)

### D-03: Collection organization — All three tiers
- **Expand `BX-Finance-Advanced-Utilities`** — add BFF utility calls that don't fit a dedicated flow (audit proxy get, exchange-mode get/set, rfc9728 metadata)
- **Create `BX-Finance-MCP-Tools.postman_collection.json`** — dedicated collection for MCP-server-direct requests (`.well-known/mcp-server`, `/audit` on MCP server, any MCP WebSocket-adjacent HTTP calls)
- **Create `BX-Finance-BFF-API.postman_collection.json`** — BFF-direct API calls (authenticated banking API routes for testing sensitive data scope, MCP inspector invoke)

### D-04: Environment variables — Add all 3
Add to `BX-Finance-Shared.postman_environment.json`:
- `BANKING_API_BASE_URL` — BFF base URL (e.g., `http://localhost:3001` or Vercel URL)
- `MCP_SERVER_URL` — MCP server base URL (e.g., `http://localhost:8080` or Railway URL)
- `BANKING_SENSITIVE_SCOPE` — value: `banking:sensitive:read` (for Phase 29 sensitive data flow)

### D-05: Root-level stray files — Move both to `docs/`
- `AI-IAM-CORE Webinar.postman_collection.json` → `docs/AI-IAM-CORE Webinar.postman_collection.json`
- `PingOne Authentication v4 - MFA included.postman_collection.json` → already exists in `docs/`; delete the root duplicate

### D-06: 2-Exchange chain correction — Study webinar collection AND fix
Study `AI-IAM-CORE Webinar.postman_collection.json` (pending todo), compare its 2-token exchange flow against `BX Finance — 2-Exchange Delegated Chain — pi.flow.postman_collection.json`, and update the BX Finance collection if the steps or request bodies are wrong. This closes the todo: **"Study AI-IAM-CORE Webinar Postman collection to fix 2-token exchange path."**

### Agent's Discretion
- Request ordering and naming style within new collections (follow existing BX Finance style: numbered steps, clear naming)
- Whether to add pre-request scripts or test scripts to new requests (follow existing collection patterns)
- Folder grouping within new collections

</decisions>

<specifics>
## Specific Ideas

- The 2-exchange correction may require updating `PINGONE_CORE_CLIENT_ID` usage and token exchange request body params (`actor_token`, `actor_token_type`, `subject_token_type`) — check the webinar collection carefully
- New environment variables should have empty default values (same as existing vars) — users fill in their own
- `MCP_SERVER_URL` default value: `http://localhost:8080` (dev default from `banking_mcp_server/.env`)
- `BANKING_API_BASE_URL` default value: `http://localhost:3001` (dev default from `banking_api_server` config)
- When moving files to `docs/`, check if the root-level `PingOne Authentication v4 - MFA included.postman_collection.json` is identical to the `docs/` version before deleting
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Postman collections (in `docs/`)
- `docs/BX-Finance-Shared.postman_environment.json` — shared environment; 16 existing vars
- `docs/BX-Finance-1-Exchange-Step-by-Step.postman_collection.json` — 9 requests; audit for staleness
- `docs/BX Finance — 1-Exchange Delegated Chain — pi.flow.postman_collection.json` — 9 requests; audit for staleness
- `docs/BX Finance — 2-Exchange Delegated Chain — pi.flow.postman_collection.json` — 12 requests; primary target for 2-exchange correction
- `docs/BX-Finance-Advanced-Utilities.postman_collection.json` — 2 requests; expand with new utility calls
- `docs/PingOne Authentication v4 - MFA included.postman_collection.json` — reference; check vs root duplicate

### Stray root-level files to move
- `AI-IAM-CORE Webinar.postman_collection.json` — move to `docs/`; study for 2-exchange correction
- `PingOne Authentication v4 - MFA included.postman_collection.json` — check vs `docs/` version; delete root copy

### BFF routes with no Postman coverage
- `banking_api_server/routes/mcpAudit.js` — `GET /api/mcp/audit`
- `banking_api_server/routes/mcpExchangeMode.js` — `GET/POST /api/mcp/exchange-mode`
- `banking_api_server/routes/mcpInspector.js` — `POST /api/mcp/inspector/invoke`
- `banking_api_server/server.js` — `GET /api/rfc9728` (RFC 9728 protected resource metadata)
- `banking_mcp_server/src/server/HttpMCPTransport.ts` — `GET /.well-known/mcp-server`, `GET /audit` on MCP server directly

### Sensitive data scope (Phase 29)
- `banking_mcp_server/src/tools/BankingToolRegistry.ts` — `get_sensitive_account_details` tool requiring `banking:sensitive:read`

No external specs beyond what's in the Postman collections themselves and the route files above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable patterns
- All existing BX Finance collections use `{{VARIABLE_NAME}}` syntax from the shared environment — new requests must follow the same pattern
- Existing collections use numbered step naming: `1. Initiate Authorization`, `2. Submit Username + Password`, etc. — new collections should follow same convention
- Auth flows use `{{PINGONE_BASE_URL}}/{{PINGONE_ENVIRONMENT_ID}}/as/...` URL pattern — verify this throughout during audit

### Known issues to fix (from scout)
- `BX-Finance-Advanced-Utilities` PAZ decision endpoint uses `/v1/environments/{{PINGONE_ENVIRONMENT_ID}}/decisionEndpoint` — verify this is the correct path against current PingOne docs
- `PINGONE_BASE_URL` in env is `https://auth.pingone.com` (without region path) — but some collection requests concatenate `/{{PINGONE_ENVIRONMENT_ID}}/as/...` which requires the region-less base — check for inconsistency
- Root `AI-IAM-CORE Webinar.postman_collection.json` exists at root (not `docs/`) — move before audit starts to avoid confusion

</code_context>

<deferred>
## Deferred Ideas

- Adding Postman tests/assertions (test scripts on individual requests) — valuable but out of scope for this audit phase; could be Phase 37+
- Newman CI integration (running Postman collections in CI) — separate initiative
- Admin-scoped BFF routes (users, accounts, transactions admin endpoints) — out of scope for this phase; too many to cover meaningfully without a dedicated BFF API coverage phase

</deferred>
