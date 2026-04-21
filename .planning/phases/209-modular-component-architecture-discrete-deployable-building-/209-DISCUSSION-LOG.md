# Phase 209: Modular Component Architecture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 209-modular-component-architecture-discrete-deployable-building-
**Areas discussed:** Component packaging, IDP abstraction design, Authorization adapter interface, PingGateway / transport compatibility

---

## Component Packaging

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone subfolder + README | Each component in its own top-level folder with self-contained README, .env.example, and startup script | ✓ |
| Separate GitHub repos | Each component gets its own repo with independent versioning | |
| GitHub template repos + Docker Compose recipes | Template repos plus a separate wiring repo with Docker Compose recipes | |

**User's choice:** Standalone subfolder + README
**Notes:** Matches current monorepo structure; no repo management overhead

---

| Option | Description | Selected |
|--------|-------------|----------|
| README + .env.example + npm start | Standard Node.js pattern; COMPONENT.md documents env var contract | ✓ |
| README + Docker only | Docker as primary run path; heavier for dev iteration | |
| README + run script + Docker optional | run-component.sh as primary; Docker as optional alternative | |

**User's choice:** README + .env.example + npm start

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep shared services embedded in BFF | configStore, demoDataService, etc. stay in banking_api_server; document the surface | |
| Extract shared services into a separate 'core' package | Pull into banking-core/ npm package; explicit dependency versioning | ✓ |
| Each component gets its own copy | No shared package; risk of divergence | |

**User's choice:** Extract shared services into a separate 'core' package

---

## IDP Abstraction Design

| Option | Description | Selected |
|--------|-------------|----------|
| Generic OIDC env vars + PingOne preset file | Rename to OIDC_ISSUER, OIDC_CLIENT_ID, etc.; ship presets/pingone.env | |
| Keep PINGONE_* vars + OIDCProviderAdapter shim | Preserve all existing var names; add adapter class that normalizes to standard OIDC interface | ✓ |
| Provider config file (provider.json) | Replace env vars with a structured JSON config file | |

**User's choice:** Keep PINGONE_* vars + OIDCProviderAdapter shim
**Notes:** No migration cost; existing .env files keep working

---

| Option | Description | Selected |
|--------|-------------|----------|
| Standard OIDC discovery endpoints only | issuer, authorization_endpoint, token_endpoint, introspection_endpoint, userinfo_endpoint, jwks_uri | ✓ |
| OIDC endpoints + PingOne Management API shim | Also abstract user directory and app listing behind a generic adapter | |
| OIDC endpoints only — Management API stays PingOne-specific | Same as option 1 with explicit documentation that Management API requires PingOne | |

**User's choice:** Standard OIDC discovery endpoints only

---

## Authorization Adapter Interface

| Option | Description | Selected |
|--------|-------------|----------|
| Formalize as JS class interface with documented contract | AuthorizationAdapter base class with evaluateTransaction() and evaluateMcpTool() methods | ✓ |
| Keep as-is — document duck-typed contract | Write doc explaining expected shape without changing code | |
| Plugin registry with env var selection | Register adapters by name; select via AUTHORIZATION_ENGINE env var | |

**User's choice:** Formalize as JS class interface
**Notes:** Builds on existing transactionAuthorizationService.js adapter pattern

---

| Option | Description | Selected |
|--------|-------------|----------|
| Same adapter, different method | evaluateMcpTool(toolName, context) → {allowed, reason} on same AuthorizationAdapter | ✓ |
| Separate adapters for transaction vs MCP tool | TransactionAuthorizationAdapter and McpToolAuthorizationAdapter are distinct | |
| MCP tool gate stays hardcoded | Tool gating stays embedded in MCP server as fixed implementation | |

**User's choice:** Same adapter, different method
**Notes:** One policy engine controls both transaction auth and MCP tool gating

---

## PingGateway / Transport Compatibility

| Option | Description | Selected |
|--------|-------------|----------|
| Document MCP contract; PingGateway adapter is customer's job | Define CONTRACTS.md; customer writes PingGateway policy to implement it | |
| Add HTTP/SSE transport alongside WebSocket | Dual transport in banking_mcp_server; WebSocket for demo, HTTP/SSE for PingGateway | ✓ |
| PingGateway bridge adapter | Thin bridge service translating HTTP/SSE ↔ WebSocket | |

**User's choice:** Add HTTP/SSE transport alongside WebSocket in our MCP server

---

| Option | Description | Selected |
|--------|-------------|----------|
| Bearer token in Authorization header | Same MCP token via RFC 8693 exchange, delivered as HTTP header | ✓ |
| Mutual TLS for PingGateway integration | mTLS + token; adds certificate management | |
| OAuth 2.0 client credentials (service-to-service) | Gateway uses its own service account token; different trust model | |

**User's choice:** Bearer token in Authorization header

---

## Claude's Discretion

- Exact npm package structure and versioning for banking-core/
- Whether OIDCProviderAdapter lives in banking-core/ or is duplicated per component
- Internal file layout of HTTP/SSE transport in banking_mcp_server
- Env var precedence when both PINGONE_* and OIDC_* override vars are set

## Deferred Ideas

- Separate GitHub repos per component
- mTLS for PingGateway
- OAuth 2.0 client credentials for PingGateway service-to-service
- PingOne Management API generalization (UserDirectoryAdapter)
