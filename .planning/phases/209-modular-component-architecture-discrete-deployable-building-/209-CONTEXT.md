# Phase 209: Modular Component Architecture - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Decompose the integrated demo into self-contained, independently deployable building blocks. Each component — AI Agent (chatbot + token chain UI), MCP Server, Authorization Server, and OAuth/OIDC flows — must be downloadable as a standalone unit from GitHub and functional when pointed at external replacements for the other components.

The existing integrated demo (run-bank.sh / local dev) must continue to work unchanged as the default wiring. Modularity is additive, not breaking.

</domain>

<decisions>
## Implementation Decisions

### Component Packaging
- **D-01:** Each component lives in its own top-level subfolder (existing: `banking_mcp_server/`, `banking_api_server/`, `banking_api_ui/`). Add a self-contained `README.md` and `.env.example` per component that describes exactly what env vars are required, optional, and what other components it expects to communicate with.
- **D-02:** Primary startup experience per component: `cp .env.example .env` → fill values → `npm install && npm start`. No Docker required for the standalone path (Docker remains optional for prod-like deployments).
- **D-03:** Shared services (configStore, demoDataService, sessionStore, exchangeAuditStore) are extracted into a `banking-core/` npm package. Each component that needs shared logic depends on it. This makes the dependency surface explicit and versioned.
- **D-04:** The `COMPONENT.md` (or per-component README section) must document the component's dependency contract: what it calls out to (via env var / config), what it expects to receive (token format, API shape), and what it exposes (endpoints, WebSocket path, MCP tools).

### IDP Abstraction Design
- **D-05:** Keep all existing `PINGONE_*` env var names — do not rename to `OIDC_*`. Instead, introduce an `OIDCProviderAdapter` shim (one class per component, or a shared one in `banking-core/`) that reads `PINGONE_*` vars and normalizes them to a standard internal interface.
- **D-06:** `OIDCProviderAdapter` normalizes these standard OIDC discovery fields: `issuer`, `authorization_endpoint`, `token_endpoint`, `introspection_endpoint`, `userinfo_endpoint`, `jwks_uri`. Internal code calls the adapter interface — never env vars directly.
- **D-07:** Engineers using a different OIDC provider (Okta, Keycloak, PingFederate) override the adapter's resolved values via a small set of `OIDC_*` override env vars. `PINGONE_*` remain the defaults. No code change required to swap IDP.
- **D-08:** Management API features (`/pingone-test`, admin user ops, PingOne Authorize integration) remain PingOne-specific and are documented as such. The `OIDCProviderAdapter` covers core OAuth/agent flows only — Management API is explicitly out of scope for the generic abstraction.

### Authorization Adapter Interface
- **D-09:** Formalize the existing `transactionAuthorizationService.js` adapter pattern as a proper `AuthorizationAdapter` JS class interface with JSDoc-documented contract. Required methods:
  - `evaluateTransaction(context) → { decision, stepUpRequired, path, decisionId, raw }` — same shape as current simulated + PingOne Authorize responses
  - `evaluateMcpTool(toolName, context) → { allowed, reason }` — for MCP tool gate decisions
- **D-10:** Existing implementations (`SimulatedAuthorizationAdapter`, `PingOneAuthorizeAdapter`) both conform to this interface. Selection remains config-driven (feature flag `ff_authorize_simulated` or `AUTHORIZATION_ENGINE` env var).
- **D-11:** `mcpToolAuthorizationService.js` is refactored to delegate decisions through the same `AuthorizationAdapter` via the `evaluateMcpTool` method. One policy engine can control both transaction auth and MCP tool gating.
- **D-12:** The `AuthorizationAdapter` interface is documented in `COMPONENT.md` / `docs/` so engineers implementing a custom engine (e.g., OPA, Cedar, PingOne Authorize) know exactly what contract to satisfy.

### PingGateway / Transport Compatibility
- **D-13:** Add HTTP/SSE transport to `banking_mcp_server` alongside the existing WebSocket transport. MCP 2025-11-05 spec supports Streamable HTTP — implement that endpoint. WebSocket remains for our UI/demo; HTTP/SSE enables PingGateway and other HTTP-native clients.
- **D-14:** Auth model for the HTTP/SSE transport: `Authorization: Bearer <mcp-token>` header. Same MCP token produced by RFC 8693 exchange — just delivered via HTTP header instead of WebSocket handshake. The MCP server validates it identically (introspection or JWT verification).
- **D-15:** Publish an `MCP-CONTRACT.md` in `banking_mcp_server/docs/` documenting: available tools (name, input schema, output schema), required auth header format, error response shapes, and transport options (WebSocket path, HTTP/SSE path). This is the spec PingGateway admins use to configure policies.

### Claude's Discretion
- Exact npm package structure and versioning strategy for `banking-core/`
- Whether `OIDCProviderAdapter` lives in `banking-core/` or is duplicated per component
- Internal file layout of the HTTP/SSE transport implementation in `banking_mcp_server`
- Order of env var precedence when both `PINGONE_*` and `OIDC_*` override vars are set

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current component configs and coupling points
- `banking_api_server/env.example` — current BFF env vars (all PINGONE_* naming to preserve)
- `banking_mcp_server/src/config/environments.ts` — MCP server config classes and env var surface
- `banking_mcp_server/src/config/loader.ts` — SecureConfigurationLoader (already supports multi-source config)

### Current authorization adapter pattern
- `banking_api_server/services/transactionAuthorizationService.js` — existing adapter orchestrator to formalize
- `banking_api_server/services/simulatedAuthorizeService.js` — simulated engine (must conform to new interface)
- `banking_api_server/services/mcpToolAuthorizationService.js` — MCP tool gate to refactor under adapter

### MCP server structure
- `banking_mcp_server/src/tools/BankingToolRegistry.ts` — tool registration (contract basis for MCP-CONTRACT.md)
- `banking_mcp_server/src/auth/` — auth services that will wrap in OIDCProviderAdapter

### Project constraints
- `REGRESSION_PLAN.md` — non-negotiable behaviors to preserve; existing demo must keep working

### External standards (no file path — web references)
- MCP 2025-11-05 Streamable HTTP transport spec — defines the HTTP/SSE endpoint shape
- RFC 8693 Token Exchange — token format passed via Authorization header to HTTP/SSE transport

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `transactionAuthorizationService.js`: Already implements adapter pattern (simulated vs PingOne) — formalize, don't rewrite
- `banking_mcp_server/src/config/loader.ts`: `SecureConfigurationLoader` already supports file + env + vault sources — `OIDCProviderAdapter` can build on this
- `banking_api_server/services/configStore.js`: Runtime config with SQLite backing — candidate for `banking-core/` extraction
- `banking_api_server/services/demoDataService.js`, `demoScenarioStore.js`: Demo data layer — candidates for `banking-core/`

### Established Patterns
- BFF already uses `MCP_SERVER_URL` env var to locate MCP server — WebSocket URL coupling is already config-based
- MCP server already has `BANKING_API_BASE_URL` env var to locate BFF — this coupling is already config-based
- `simulatedAuthorizeService.js` already mimics the PingOne Authorize response shape — the duck-typed contract exists, just needs formal documentation as a class interface

### Integration Points
- `banking-core/` package: new folder at repo root; `banking_api_server` and `banking_mcp_server` declare it as a local dependency via `file:../banking-core` in package.json
- `OIDCProviderAdapter` is the single place all OAuth endpoint resolution goes through — no component should read `process.env.PINGONE_*` directly for endpoint URLs
- HTTP/SSE transport endpoint: new Express route on `banking_mcp_server` at `/mcp` (alongside existing WebSocket at `/`) — both validate the same `Authorization: Bearer` header

</code_context>

<specifics>
## Specific Ideas

- **Engineer DX goal:** An engineer should be able to clone the repo, `cd banking_mcp_server`, `cp .env.example .env`, set `BANKING_API_BASE_URL` + OIDC values, and have a working MCP server talking to any OIDC-protected banking API — without touching any other folder.
- **PingGateway goal:** A customer with PingGateway should be able to point it at `banking_mcp_server`'s HTTP/SSE endpoint and use any MCP tool. The only configuration needed is the `MCP-CONTRACT.md` and a valid Bearer token from the RFC 8693 exchange.
- **PingOne Authorize swap goal:** A customer who configures `AUTHORIZATION_ENGINE=pingone-authorize` should get PingOne Authorize-driven decisions for both transaction auth and MCP tool gating, with zero changes to the demo UI or agent code.
- **Non-goal:** This phase does NOT break the integrated demo. `run-bank.sh` and local dev keep working exactly as today. Modular paths are additive, documented alternatives.

</specifics>

<deferred>
## Deferred Ideas

- Separate GitHub repos per component — discussed but deferred; single monorepo with standalone subfolder READMEs is sufficient for v1
- mTLS for PingGateway integration — discussed; deferred to a future security hardening phase
- OAuth 2.0 client credentials service-to-service model for PingGateway — deferred; Bearer token reuse is sufficient for demo purposes
- PingOne Management API generalization (UserDirectoryAdapter) — explicitly out of scope; Management API features remain PingOne-specific

</deferred>

---

*Phase: 209-modular-component-architecture-discrete-deployable-building-*
*Context gathered: 2026-04-21*
