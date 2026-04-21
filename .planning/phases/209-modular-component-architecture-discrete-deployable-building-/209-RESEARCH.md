# Phase 209: Modular Component Architecture — Research

**Researched:** 2026-04-21
**Domain:** Component decomposition, local npm packaging, adapter pattern formalization, MCP HTTP/SSE transport
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Each component lives in its own top-level subfolder (existing). Add a self-contained `README.md` and `.env.example` per component describing env vars and inter-component dependencies.
- **D-02:** Primary startup experience: `cp .env.example .env` → fill values → `npm install && npm start`. No Docker required for standalone path.
- **D-03:** Shared services (configStore, demoDataService, sessionStore, exchangeAuditStore) extracted into `banking-core/` npm package. Each component that needs shared logic depends on it.
- **D-04:** Each component's README/COMPONENT.md must document its dependency contract: what it calls out to, what it expects to receive, what it exposes.
- **D-05:** Keep all existing `PINGONE_*` env var names. Introduce `OIDCProviderAdapter` shim that reads `PINGONE_*` vars and normalizes to standard internal interface.
- **D-06:** `OIDCProviderAdapter` normalizes: `issuer`, `authorization_endpoint`, `token_endpoint`, `introspection_endpoint`, `userinfo_endpoint`, `jwks_uri`. Internal code calls adapter — never env vars directly.
- **D-07:** Engineers using a different OIDC provider override via `OIDC_*` vars. `PINGONE_*` remain defaults. No code change required to swap IDP.
- **D-08:** Management API features remain PingOne-specific. `OIDCProviderAdapter` covers core OAuth/agent flows only.
- **D-09:** Formalize `transactionAuthorizationService.js` adapter pattern as `AuthorizationAdapter` JS class interface with JSDoc contract. Required methods: `evaluateTransaction(context)` and `evaluateMcpTool(toolName, context)`.
- **D-10:** `SimulatedAuthorizationAdapter` and `PingOneAuthorizeAdapter` both conform to the interface. Selection config-driven via `ff_authorize_simulated` or `AUTHORIZATION_ENGINE` env var.
- **D-11:** `mcpToolAuthorizationService.js` refactored to delegate through same `AuthorizationAdapter` via `evaluateMcpTool`.
- **D-12:** `AuthorizationAdapter` interface documented in `COMPONENT.md` / `docs/`.
- **D-13:** Add HTTP/SSE transport to `banking_mcp_server` alongside existing WebSocket. Implement MCP 2025-11-05 Streamable HTTP endpoint. WebSocket remains for UI/demo.
- **D-14:** Auth model for HTTP/SSE: `Authorization: Bearer <mcp-token>`. Same token as WebSocket path. MCP server validates identically.
- **D-15:** Publish `MCP-CONTRACT.md` in `banking_mcp_server/docs/` documenting tools, auth format, error shapes, and transport options.

### Claude's Discretion

- Exact npm package structure and versioning strategy for `banking-core/`
- Whether `OIDCProviderAdapter` lives in `banking-core/` or is duplicated per component
- Internal file layout of the HTTP/SSE transport implementation in `banking_mcp_server`
- Order of env var precedence when both `PINGONE_*` and `OIDC_*` override vars are set

### Deferred Ideas (OUT OF SCOPE)

- Separate GitHub repos per component
- mTLS for PingGateway integration
- OAuth 2.0 client credentials service-to-service model for PingGateway
- PingOne Management API generalization (UserDirectoryAdapter)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-1 | Engineers need downloadable, independently runnable components | D-01/D-02: standalone folder + README + .env.example + npm start; Section: Component Packaging |
| REQ-2 | Plug-and-play adapter interface for Authorization Server | D-09–D-12: AuthorizationAdapter class interface; Section: AuthorizationAdapter Design |
| REQ-3 | Plug-and-play adapter interface for MCP Server IDP | D-05–D-08: OIDCProviderAdapter shim; Section: OIDCProviderAdapter Design |
| REQ-4 | Default wiring must continue to work unchanged | REGRESSION_PLAN §1 non-negotiables; Section: Integration Preservation |
</phase_requirements>

---

## Summary

Phase 209 decomposes a tightly integrated demo into self-contained deployable units without breaking the existing integrated demo path. The approach is additive: existing `banking_api_server/`, `banking_mcp_server/`, and `banking_api_ui/` are enhanced with standalone startup documentation and adapter interfaces; a new `banking-core/` local npm package captures truly shared logic.

The coupling audit reveals that **the MCP server and API server do not share any source-level imports today** — they communicate exclusively over HTTP (`BANKING_API_BASE_URL`) and WebSocket (`MCP_SERVER_URL`). The "shared services" listed in D-03 (configStore, demoDataService, exchangeAuditStore, demoScenarioStore) are all located in `banking_api_server/services/` and are NOT currently imported by `banking_mcp_server`. This is a critical finding: `banking-core/` extraction is needed only if we want a single canonical version of these services across future components, not because they are currently shared.

The `AuthorizationAdapter` formalization is the highest-complexity task: the existing duck-typed pattern in `transactionAuthorizationService.js` and `mcpToolAuthorizationService.js` must be unified into a single class interface without changing the response shapes that callers depend on. The HTTP/SSE transport is already scaffolded in `banking_mcp_server/src/server/HttpMCPTransport.ts` — the work is configuration, documentation, and Bearer token auth alignment.

**Primary recommendation:** Execute in four sequential waves: (1) banking-core/ package extraction, (2) OIDCProviderAdapter per-component shim, (3) AuthorizationAdapter class interface formalization, (4) MCP-CONTRACT.md + component README/env.example documentation.

---

## Current Coupling Audit

### What is ACTUALLY shared today

**[VERIFIED: codebase grep]** The MCP server (`banking_mcp_server/`) does NOT import any service from `banking_api_server/services/`. Cross-component communication is entirely over HTTP/WebSocket:

| Link | Mechanism | Config variable |
|------|-----------|-----------------|
| API server → MCP server | WebSocket client (`mcpWebSocketClient.js`) | `MCP_SERVER_URL` |
| MCP server → API server | HTTP (`BankingAPIClient`) | `BANKING_API_BASE_URL` |

**[VERIFIED: codebase read]** The "shared services" candidates all live exclusively in `banking_api_server/services/`:

| Service | Lines | Express deps? | SQLite deps? | Notes |
|---------|-------|---------------|--------------|-------|
| `configStore.js` | ~950 | No | Yes (better-sqlite3) | Heavy; exposes singleton + FIELD_DEFS + 6 utility exports |
| `demoDataService.js` | ~400+ | No | Yes (better-sqlite3) | Imports configStore |
| `exchangeAuditStore.js` | ~40 | No | No (in-memory ring buffer) | Pure utility — trivial to extract |
| `demoScenarioStore.js` | ~200+ | No | No (Redis/KV backed) | Imports configStore indirectly |

**[VERIFIED: codebase read]** `demoDataService.js` imports `configStore`. `exchangeAuditStore.js` is self-contained. Neither has Express or session dependencies.

### What configStore imports from banking_api_server

**[VERIFIED: codebase read]** `configStore.js` imports:
- `require('better-sqlite3')` — direct SQLite dependency
- `require('../config/pingoneBackendDefaults')` — optional committed defaults file
- `require('../utils/logger')` — inside `validateTwoExchangeConfig()` only

For `banking-core/` extraction, `configStore.js` needs `better-sqlite3` as a runtime dependency and the logger dependency must be injected or removed.

### HTTP/SSE transport current state

**[VERIFIED: codebase read — `banking_mcp_server/src/server/HttpMCPTransport.ts`]** The HTTP/SSE transport is already implemented and enabled by default (`HTTP_MCP_TRANSPORT_ENABLED` defaults to `true`). It exposes:

- `POST /mcp` — Streamable HTTP MCP endpoint (JSON-RPC, session lifecycle)
- `GET /.well-known/oauth-protected-resource` — RFC 9728 metadata
- `DELETE /mcp` — client-initiated session termination
- `GET /mcp` — returns 405 (SSE streaming not wired)

Bearer token auth is extracted from `Authorization: Bearer <token>` header and passed to `BankingAuthenticationManager` for validation (same path as WebSocket). The transport is wired in `BankingMCPServer.ts` constructor.

**Key gap identified:** The transport exists in code but is not documented in `MCP-CONTRACT.md` (which doesn't exist yet) and the `banking_mcp_server/.env.example` does not clearly explain the `HTTP_MCP_TRANSPORT_ENABLED`, `MCP_RESOURCE_URL`, and `MCP_ALLOWED_ORIGINS` variables in a standalone-component context.

---

## Standard Stack

### Core (all pre-existing in repo)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `better-sqlite3` | already in banking_api_server | SQLite backing for configStore, demoDataService | Stays in banking_api_server; if extracted to banking-core, becomes peer dep |
| `@modelcontextprotocol/sdk` | already in banking_mcp_server | MCP protocol types | Already used |
| `ws` | already in banking_mcp_server | WebSocket transport | Already used |

### Local Package Setup

**[ASSUMED]** Standard pattern for local npm packages in a monorepo is `file:` reference in package.json. No workspace tooling (Nx, Turborepo) is required.

```json
// banking_api_server/package.json
{
  "dependencies": {
    "banking-core": "file:../banking-core"
  }
}
```

```json
// banking-core/package.json
{
  "name": "banking-core",
  "version": "0.1.0",
  "main": "index.js",
  "dependencies": {
    "better-sqlite3": "^9.x"
  }
}
```

After adding the `file:` reference: `npm install` in the consumer package creates a symlink in `node_modules/banking-core` pointing to the local folder. Changes to `banking-core/` are immediately available without re-install.

**Installation:**
```bash
# From repo root after creating banking-core/package.json:
cd banking_api_server && npm install
```

---

## Architecture Patterns

### Recommended Project Structure

```
banking-core/
├── index.js                 # re-exports all public APIs
├── package.json             # name: "banking-core", main: index.js
├── configStore.js           # extracted from banking_api_server/services/
├── demoDataService.js       # extracted (depends on configStore)
├── exchangeAuditStore.js    # extracted (self-contained)
└── demoScenarioStore.js     # extracted (if needed by MCP server in future)

banking_api_server/
├── services/
│   ├── configStore.js       # becomes re-export: module.exports = require('banking-core/configStore')
│   ├── authorization/
│   │   ├── AuthorizationAdapter.js    # JSDoc interface definition + factory
│   │   ├── SimulatedAuthorizationAdapter.js  # wraps simulatedAuthorizeService
│   │   └── PingOneAuthorizeAdapter.js  # wraps pingOneAuthorizeService
│   └── oidc/
│       └── OIDCProviderAdapter.js     # PINGONE_* → standard interface
└── README.md                          # standalone component doc

banking_mcp_server/
├── src/
│   ├── auth/
│   │   └── OIDCProviderAdapter.ts     # per-component shim (or from banking-core)
│   └── server/
│       └── HttpMCPTransport.ts        # already exists
├── docs/
│   └── MCP-CONTRACT.md                # NEW: tool catalog + auth + transport
├── .env.example                       # already exists; needs standalone section
└── README.md                          # NEW: standalone component guide
```

### Pattern 1: AuthorizationAdapter Interface

**What:** A JSDoc-documented class interface that both `SimulatedAuthorizationAdapter` and `PingOneAuthorizeAdapter` conform to. The existing `transactionAuthorizationService.js` becomes a factory that returns the correct implementation based on config. `mcpToolAuthorizationService.js` delegates to the same adapter via `evaluateMcpTool`.

**Current response shapes (both already match this contract):**

From `simulatedAuthorizeService.evaluateTransaction()`:
```javascript
// { decision, stepUpRequired, hitlRequired, path, decisionId, raw }
```

From `pingOneAuthorizeService.evaluateTransaction()`:
```javascript
// { decision, stepUpRequired, path, decisionId, raw }  (no hitlRequired — add default false)
```

**Formalized interface (AuthorizationAdapter.js):**
```javascript
// Source: verified from transactionAuthorizationService.js + mcpToolAuthorizationService.js

/**
 * @interface AuthorizationAdapter
 */
class AuthorizationAdapter {
  /**
   * Evaluate a banking transaction.
   * @param {object} context
   * @param {string} context.userId
   * @param {number} context.amount
   * @param {string} context.type - 'transfer' | 'withdrawal' | 'deposit'
   * @param {string} [context.acr]
   * @returns {Promise<{
   *   decision: 'PERMIT' | 'DENY' | 'INDETERMINATE',
   *   stepUpRequired: boolean,
   *   hitlRequired: boolean,
   *   path: string,
   *   decisionId: string,
   *   raw: object
   * }>}
   */
  async evaluateTransaction(context) {
    throw new Error('AuthorizationAdapter.evaluateTransaction() not implemented');
  }

  /**
   * Evaluate whether an MCP tool call is permitted.
   * @param {string} toolName
   * @param {object} context
   * @param {string} context.userId
   * @param {string} [context.tokenAudience]
   * @param {string} [context.actClientId]
   * @param {string} [context.nestedActClientId]
   * @param {string} [context.mcpResourceUri]
   * @param {string} [context.acr]
   * @returns {Promise<{
   *   allowed: boolean,
   *   reason: string,
   *   decision: 'PERMIT' | 'DENY' | 'INDETERMINATE',
   *   hitlRequired: boolean,
   *   stepUpRequired: boolean,
   *   decisionId: string,
   *   raw: object
   * }>}
   */
  async evaluateMcpTool(toolName, context) {
    throw new Error('AuthorizationAdapter.evaluateMcpTool() not implemented');
  }
}
```

**Factory pattern (replaces current if/else in transactionAuthorizationService.js):**
```javascript
// Source: verified pattern from transactionAuthorizationService.js lines 98-186
function getAdapter(configStore) {
  const useSimulated = simulatedAuthorizeService.isSimulatedModeEnabled(configStore);
  const engineOverride = process.env.AUTHORIZATION_ENGINE;
  if (engineOverride === 'pingone-authorize' || (!useSimulated && engineOverride !== 'simulated')) {
    return new PingOneAuthorizeAdapter(configStore);
  }
  return new SimulatedAuthorizationAdapter(configStore);
}
```

### Pattern 2: OIDCProviderAdapter

**What:** A class (one per component, or shared in banking-core) that reads `PINGONE_*` env vars and normalizes them to standard OIDC endpoint fields. Internal code calls the adapter; no component reads `process.env.PINGONE_*` directly for endpoint URLs.

**Env var precedence order (Claude's discretion — recommended):**
1. `OIDC_*` override vars (highest — allows non-PingOne IDP)
2. `PINGONE_*` vars (default — existing deployments unchanged)
3. OIDC Discovery auto-resolution from `issuer` (fallback)

**Interface for banking_api_server:**
```javascript
// Source: verified env var surface from configStore.js envFallbackMap
class OIDCProviderAdapter {
  constructor(configStore) { this.configStore = configStore; }

  get issuer() {
    return process.env.OIDC_ISSUER ||
      `https://auth.pingone.${this.configStore.getEffective('pingone_region') || 'com'}/${this.configStore.getEffective('pingone_environment_id')}/as`;
  }
  get authorization_endpoint() {
    return process.env.OIDC_AUTHORIZATION_ENDPOINT || `${this.issuer}/authorize`;
  }
  get token_endpoint() {
    return process.env.OIDC_TOKEN_ENDPOINT || `${this.issuer}/token`;
  }
  get introspection_endpoint() {
    return process.env.OIDC_INTROSPECTION_ENDPOINT || `${this.issuer}/introspect`;
  }
  get userinfo_endpoint() {
    return process.env.OIDC_USERINFO_ENDPOINT || `${this.issuer}/userinfo`;
  }
  get jwks_uri() {
    return process.env.OIDC_JWKS_URI || `${this.issuer}/jwks`;
  }
}
```

**Interface for banking_mcp_server (TypeScript):**
```typescript
// Source: verified env var surface from banking_mcp_server/src/config/environments.ts
// Current: config.pingone.tokenIntrospectionEndpoint = env.PINGONE_INTROSPECTION_ENDPOINT
// After: OIDCProviderAdapter.introspection_endpoint (same value, standardized access)
export class OIDCProviderAdapter {
  get introspection_endpoint(): string {
    return process.env.OIDC_INTROSPECTION_ENDPOINT ||
      process.env.PINGONE_INTROSPECTION_ENDPOINT || '';
  }
  // ... other endpoints follow same pattern
}
```

**Key migration point:** `banking_mcp_server/src/auth/TokenIntrospector.ts` currently reads `config.tokenIntrospectionEndpoint` from the environments config. After migration it reads `oidcAdapter.introspection_endpoint`. The caller instantiation in `BankingAuthenticationManager.ts` passes an `OIDCProviderAdapter` instead of raw config.

### Pattern 3: banking-core/ Local Package

**What:** A new top-level folder with its own `package.json` that both `banking_api_server` and (optionally) `banking_mcp_server` can depend on via `file:../banking-core`.

**Extraction order (recommended — minimize risk):**
1. `exchangeAuditStore.js` first — no dependencies, self-contained, easiest to extract and verify
2. `configStore.js` — heaviest; needs `better-sqlite3` as peer dep; must preserve all exports including `FIELD_DEFS`, `validateTwoExchangeConfig`, `SECRET_KEYS`, `buildAllowedScopesByAudience`, `validateScopeAudience`, `ERROR_CODES`, `getErrorDetails`, `mapErrorToCode`
3. `demoDataService.js` — depends on configStore; extract after configStore
4. `demoScenarioStore.js` — optional; only needed if future components need scenario state

**Backward compat migration pattern:**
```javascript
// banking_api_server/services/configStore.js — AFTER extraction
// This file becomes a thin re-export so all existing requires() continue to work
module.exports = require('banking-core/configStore');
module.exports.FIELD_DEFS = require('banking-core/configStore').FIELD_DEFS;
// ... all other named exports preserved
```

### Pattern 4: Component README Structure

Per D-04, each component README must document the dependency contract. Required sections:

**For `banking_api_server/README.md`:**
- What it is (BFF + Authorization Server)
- Prerequisites (Node.js version, npm)
- Required env vars (grouped: PingOne OIDC, Session, MCP Server URL, Authorization Engine)
- Optional env vars (CIBA, two-exchange, feature flags)
- What it calls out to: `MCP_SERVER_URL` (WebSocket), PingOne OIDC endpoints
- What it exposes: REST API on port 3001 (or PORT), WebSocket proxy
- Standalone mode: `cp .env.example .env` → fill 5 minimum vars → `npm install && npm start`

**For `banking_mcp_server/README.md`:**
- What it is (MCP Server)
- Prerequisites (Node.js, TypeScript build)
- Required env vars: `BANKING_API_BASE_URL`, `PINGONE_INTROSPECTION_ENDPOINT`, `PINGONE_CLIENT_ID`, `PINGONE_CLIENT_SECRET`, `ENCRYPTION_KEY`
- Optional env vars: `HTTP_MCP_TRANSPORT_ENABLED`, `MCP_RESOURCE_URL`, `MCP_SERVER_RESOURCE_URI`, `BFF_CLIENT_ID`, `REQUIRE_MAY_ACT`
- What it calls out to: `BANKING_API_BASE_URL` (HTTP)
- What it exposes: WebSocket on `/` (port 8080), HTTP MCP on `POST /mcp`, RFC 9728 metadata on `GET /.well-known/oauth-protected-resource`
- Standalone mode: `cp .env.example .env` → fill 5 minimum vars → `npm install && npm run build && npm start`

**For `banking_api_ui/README.md`:**
- Required env vars: `REACT_APP_API_PORT` (or default 3001)
- What it calls out to: `banking_api_server` via proxy on port `REACT_APP_API_PORT`
- Standalone: requires `banking_api_server` running; `npm install && npm start`

### Anti-Patterns to Avoid

- **Don't re-export and restructure simultaneously.** Extract `configStore` to `banking-core/` in one step, update the original file to re-export, and run build — before touching any caller.
- **Don't create new configStore instances.** `configStore.js` exports a singleton. `banking-core/configStore.js` must also export a singleton. If both exist independently, they will have different in-memory caches.
- **Don't add `OIDC_*` vars to FIELD_DEFS in configStore.** The `OIDCProviderAdapter` reads these from `process.env` directly (they are not user-configurable via the Config UI — they are deployment-time overrides only).
- **Don't break the `better-sqlite3` path in configStore.** The SQLite path must still resolve correctly after extraction. `dbPath` uses `path.join(__dirname, '..', 'data', 'persistent')` — this path calculation must be updated to account for the new location.
- **Don't assume `HTTP_MCP_TRANSPORT_ENABLED` defaults to true without testing.** The env var defaults in `BankingMCPServer.ts` constructor already enable it unless explicitly set to `'false'`. Verify the transport is active in standalone mode.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Local npm package symlinks | Manual file copying | `file:` reference in package.json | npm handles symlink lifecycle; `npm install` refreshes it |
| OIDC endpoint construction | Custom URL building | Pattern from existing `config/oauth.js` `_base` getter | Already battle-tested with region TLDs |
| Adapter selection logic | New feature flag system | Extend existing `ff_authorize_simulated` + add `AUTHORIZATION_ENGINE` env var | Minimal delta from current; no new config surface |
| MCP HTTP transport | New Express middleware | `HttpMCPTransport.ts` already exists and handles session lifecycle | Would duplicate 400+ lines of spec-compliant logic |
| MCP tool schema documentation | Manual doc writing | `BankingToolRegistry.ts` already has full `inputSchema`, `requiredScopes`, `description` per tool | Generate `MCP-CONTRACT.md` from registry, don't maintain separately |

---

## Common Pitfalls

### Pitfall 1: configStore singleton split across packages

**What goes wrong:** If `banking-core/configStore.js` is extracted but `banking_api_server/services/configStore.js` is NOT updated to re-export it, there will be two singleton instances. Services that `require('./configStore')` get a different cache than services that `require('banking-core/configStore')`. Feature flags and config set via `/api/admin/config` will not be visible to the banking-core version.

**Why it happens:** Node.js module identity is path-based. Two files at different paths create two module instances.

**How to avoid:** After extraction, immediately update `banking_api_server/services/configStore.js` to be a pure re-export shim. Verify with `node -e "const a = require('./services/configStore'); const b = require('banking-core/configStore'); console.log(a === b)"` in banking_api_server.

**Warning signs:** Feature flags set via Config UI not reflected in authorization decisions; configStore.get() returns null for keys that were just set.

### Pitfall 2: SQLite `__dirname` path break after extraction

**What goes wrong:** `configStore.js` builds its database path using `path.join(__dirname, '..', 'data', 'persistent')`. After moving to `banking-core/configStore.js`, `__dirname` points to `banking-core/` not `banking_api_server/`. SQLite will create the database in the wrong location or fail to find existing data.

**Why it happens:** `__dirname` is resolved at module load time based on the file's actual location.

**How to avoid:** The extracted `configStore.js` must accept the data directory as a parameter OR use the consuming package's working directory (`process.cwd()`) instead of `__dirname` for the database path. Option: pass `dbDir` as a constructor option with a default of `path.join(process.cwd(), 'data', 'persistent')`.

**Warning signs:** `[ConfigStore] SQLite initialization failed` on startup; config values not persisting across restarts.

### Pitfall 3: AuthorizationAdapter caller impact from evaluateMcpTool unification

**What goes wrong:** `mcpToolAuthorizationService.js` currently delegates to either `simulatedAuthorizeService.evaluateMcpFirstTool()` or `pingOneAuthorizeService.evaluateMcpToolDelegation()`. These methods have slightly different signatures. When they are wrapped in `SimulatedAuthorizationAdapter.evaluateMcpTool()` and `PingOneAuthorizeAdapter.evaluateMcpTool()`, the HTTP blocking logic (status 428 body shape) is currently in `mcpToolAuthorizationService.js` — this must remain there (it uses Express response shaping) and must NOT be moved into the adapter.

**Why it happens:** The adapter returns decisions; the route/service translates decisions to HTTP responses. Mixing them would couple the adapter to Express.

**How to avoid:** Keep the adapter's `evaluateMcpTool()` return shape as a pure decision (`{ allowed, reason, decision, hitlRequired, stepUpRequired, decisionId, raw }`) with no HTTP concepts. `mcpToolAuthorizationService.js` does the `if (r.hitlRequired) return { ran: true, block: { status: 428, body: ... } }` translation.

### Pitfall 4: HTTP/SSE transport Bearer token source mismatch

**What goes wrong:** The existing WebSocket path delivers the MCP token via a custom session message (`session_init`). The HTTP transport reads `Authorization: Bearer <token>` from the HTTP header. If a client sends the token in the wrong place (e.g., in a query param or cookie), the `BankingAuthenticationManager` will see no token and reject the request with 401.

**Why it happens:** The transport abstraction layer extracts the token before passing to the auth manager. Each transport has its own extraction path.

**How to avoid:** Document the auth header requirement prominently in `MCP-CONTRACT.md`. The `HttpMCPTransport.ts` already reads from the `Authorization` header (verified in source). Add a clear error message for 401 responses indicating the `Authorization: Bearer` header is required.

### Pitfall 5: REGRESSION — run-bank.sh integration test after modularization

**What goes wrong:** If `banking-core/` extraction breaks the `require('./services/configStore')` path in ANY of the 32+ files that import it, the API server will fail to start and all existing flows will break.

**Why it happens:** Node.js module resolution for `file:` packages requires `npm install` to be re-run. In a CI or local dev context where `node_modules` is not refreshed, the symlink may not exist.

**How to avoid:** After extraction, update `banking_api_server/services/configStore.js` to re-export from `banking-core` AND keep all 6 named exports. Run `npm install` in `banking_api_server/` before testing. The re-export shim means no other file in `banking_api_server` needs to change.

---

## Code Examples

### banking-core/package.json

```json
{
  "name": "banking-core",
  "version": "0.1.0",
  "description": "Shared services for BX Finance Banking Demo components",
  "main": "index.js",
  "license": "UNLICENSED",
  "private": true,
  "dependencies": {
    "better-sqlite3": "^9.0.0"
  }
}
```

### banking-core/index.js

```javascript
// Source: verified export shapes from banking_api_server/services/
'use strict';
module.exports = {
  configStore: require('./configStore'),
  demoDataService: require('./demoDataService'),
  exchangeAuditStore: require('./exchangeAuditStore'),
};
```

### banking_api_server/services/configStore.js (after extraction)

```javascript
// Re-export shim — preserves all existing require() calls throughout banking_api_server
// Source: verified all named exports from original configStore.js
'use strict';
const core = require('banking-core/configStore');
module.exports = core;
module.exports.FIELD_DEFS = core.FIELD_DEFS;
module.exports.validateTwoExchangeConfig = core.validateTwoExchangeConfig;
module.exports.SECRET_KEYS = core.SECRET_KEYS;
module.exports.buildAllowedScopesByAudience = core.buildAllowedScopesByAudience;
module.exports.validateScopeAudience = core.validateScopeAudience;
module.exports.ERROR_CODES = core.ERROR_CODES;
module.exports.getErrorDetails = core.getErrorDetails;
module.exports.mapErrorToCode = core.mapErrorToCode;
```

### AuthorizationAdapter factory (in transactionAuthorizationService.js)

```javascript
// Source: verified pattern from transactionAuthorizationService.js + mcpToolAuthorizationService.js
'use strict';
const SimulatedAuthorizationAdapter = require('./authorization/SimulatedAuthorizationAdapter');
const PingOneAuthorizeAdapter = require('./authorization/PingOneAuthorizeAdapter');
const simulatedAuthorizeService = require('./simulatedAuthorizeService');

let _adapterCache = null;

function getAdapter(configStore) {
  // Re-evaluate on each call so config changes (via Config UI) take effect
  const useSimulated = simulatedAuthorizeService.isSimulatedModeEnabled(configStore);
  const engineOverride = process.env.AUTHORIZATION_ENGINE;
  if (engineOverride === 'simulated' || (useSimulated && engineOverride !== 'pingone-authorize')) {
    return new SimulatedAuthorizationAdapter(configStore);
  }
  return new PingOneAuthorizeAdapter(configStore);
}
module.exports = { getAdapter };
```

### OIDCProviderAdapter — banking_mcp_server usage

```typescript
// Source: verified from banking_mcp_server/src/auth/TokenIntrospector.ts constructor
// and banking_mcp_server/src/config/environments.ts pingone config shape
export class OIDCProviderAdapter {
  get introspection_endpoint(): string {
    return process.env.OIDC_INTROSPECTION_ENDPOINT
      || process.env.PINGONE_INTROSPECTION_ENDPOINT
      || '';
  }
  get token_endpoint(): string {
    return process.env.OIDC_TOKEN_ENDPOINT
      || process.env.PINGONE_TOKEN_ENDPOINT
      || '';
  }
  get authorization_endpoint(): string {
    return process.env.OIDC_AUTHORIZATION_ENDPOINT
      || process.env.PINGONE_AUTHORIZATION_ENDPOINT
      || '';
  }
  get issuer(): string {
    return process.env.OIDC_ISSUER
      || process.env.PINGONE_BASE_URL?.replace(/\/?$/, '/as')
      || '';
  }
  get jwks_uri(): string {
    return process.env.OIDC_JWKS_URI || `${this.issuer}/jwks`;
  }
  get userinfo_endpoint(): string {
    return process.env.OIDC_USERINFO_ENDPOINT || `${this.issuer}/userinfo`;
  }
}
```

---

## Runtime State Inventory

> This phase involves NO data migration, rename, or refactor of stored records. No runtime state audit required.
> Extraction of `configStore.js` to `banking-core/` uses a re-export shim — existing SQLite data files (`data/persistent/config.db`, `data/persistent/demoAccounts.db`) remain in their current locations. No records are renamed or moved.

**Confirmed nothing to migrate:** All changes are source code restructuring with backward-compatible shims. The SQLite `dbPath` calculation must be updated to preserve the existing `banking_api_server/data/persistent/` location.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All components | ✓ | Darwin/zsh environment | — |
| npm | banking-core/ package link | ✓ | Bundled with Node.js | — |
| better-sqlite3 | banking-core/configStore.js | ✓ | Already in banking_api_server/node_modules | Confirm re-install after extraction |
| TypeScript | banking_mcp_server build | ✓ | Already in banking_mcp_server devDependencies | — |

**Missing dependencies with no fallback:** None identified.

---

## Validation Architecture

### How to verify each outcome

#### 1. Standalone component verification (each starts without the others)

**banking_mcp_server standalone:**
```bash
# From a fresh terminal with no other components running:
cd banking_mcp_server
cp .env.example .env
# Fill: PINGONE_INTROSPECTION_ENDPOINT, PINGONE_CLIENT_ID, PINGONE_CLIENT_SECRET,
#       ENCRYPTION_KEY, BANKING_API_BASE_URL=http://localhost:3001 (intentionally unreachable)
npm run build && npm start
# Expected: server starts, logs "MCP server listening on 8080", HTTP transport active
# Expected: BANKING_API_BASE_URL calls fail gracefully when tools are invoked (not on startup)
# Verify HTTP transport: curl http://localhost:8080/.well-known/oauth-protected-resource → 200 JSON
```

**banking_api_server standalone:**
```bash
cd banking_api_server
cp env.example .env
# Fill: PINGONE_CORE_CLIENT_ID, PINGONE_CORE_CLIENT_SECRET, SESSION_SECRET
# Set: MCP_SERVER_URL=ws://localhost:8080 (unreachable — expected)
npm start
# Expected: server starts on port 3001
# Expected: GET /health → 200
# Expected: GET /api/mcp/inspector/tools → 200 (local catalog, no MCP connection needed)
# MCP-dependent routes gracefully degrade when MCP_SERVER_URL is unreachable
```

**Test command:**
```bash
curl -f http://localhost:3001/health && echo "API server standalone: PASS"
curl -f http://localhost:8080/.well-known/oauth-protected-resource && echo "MCP server standalone: PASS"
```

#### 2. AuthorizationAdapter swap verification

```bash
# Swap 1: simulated (default)
# In banking_api_server/.env: ff_authorize_simulated=true, authorize_enabled=true
# Test: POST /api/transactions with amount=20000 → expect 428 step_up_required
# Test: POST /api/transactions with amount=60000 → expect 403 transaction_denied
# Verify response body: { authorize_engine: "simulated", ... }

# Swap 2: pingone-authorize engine
# In banking_api_server/.env: AUTHORIZATION_ENGINE=pingone-authorize, ff_authorize_simulated=false
# (Requires real PingOne Authorize decision endpoint configured)
# Test: same transactions → expect same HTTP status codes, response body has authorize_engine: "pingone"

# Swap back: simulated
# In banking_api_server config UI: toggle ff_authorize_simulated back ON
# Test: same transactions → authorize_engine: "simulated" again
# Verify: evaluateTransaction and evaluateMcpTool both use same adapter (ff_authorize_mcp_first_tool=true)
```

#### 3. HTTP/SSE transport alongside WebSocket

```bash
# Verify both transports active simultaneously:
# Step 1: Start banking_mcp_server (HTTP_MCP_TRANSPORT_ENABLED=true, default)
# Step 2: Test HTTP transport
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer <valid-mcp-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  → expect 200 with JSON-RPC result (MCP-Session-Id header set)

# Step 3: Test WebSocket transport still works
# (existing banking_api_server mcpWebSocketClient.js connects as before)
# No change to WebSocket behavior expected

# Step 4: Verify RFC 9728 metadata
curl http://localhost:8080/.well-known/oauth-protected-resource
→ expect { resource: "...", authorization_servers: [...], bearer_methods_supported: ["header"] }
```

#### 4. Default integrated demo preservation

```bash
# Regression test: run-bank.sh path must continue to work
bash run-bank.sh
# Expected: API starts on 3002, UI on 4000, MCP on 8080
# Test: admin login → /admin → passes
# Test: user login → /dashboard → passes
# Test: agent chat → get_my_accounts → account list returned
# Test: transfer $20,000 → step-up auth required (if ff_authorize_simulated=true)
# Test: npm run build in banking_api_ui → exit code 0

# Quick regression check (per REGRESSION_PLAN.md §1):
cd banking_api_ui && npm run build
# Expected: exit code 0, no new errors
```

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (banking_api_server), Jest (banking_api_ui), Jest (banking_mcp_server) |
| Config file | `banking_api_server/package.json` jest config, `banking_mcp_server/tsconfig.json` |
| Quick run | `cd banking_api_server && npm test -- --testPathPattern=configStore` |
| Full suite | `cd banking_api_server && npm test` |
| Build check | `cd banking_api_ui && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| REQ-1 | banking_mcp_server starts without API server | smoke | `npm start` + health check curl |
| REQ-1 | banking_api_server starts without MCP server | smoke | `npm start` + health check curl |
| REQ-2 | AuthorizationAdapter swap: simulated returns correct decisions | unit | Add `banking_api_server/services/authorization/AuthorizationAdapter.test.js` |
| REQ-2 | evaluateMcpTool unified under same adapter | unit | Extend mcpToolAuthorizationService tests |
| REQ-3 | OIDCProviderAdapter: PINGONE_* vars resolve to standard fields | unit | Add OIDCProviderAdapter.test.js |
| REQ-3 | OIDCProviderAdapter: OIDC_* overrides take precedence | unit | Same test file |
| REQ-4 | run-bank.sh integrated demo still works | integration | Manual smoke + `npm run build` exit 0 |

### Wave 0 Gaps

- [ ] `banking_api_server/services/authorization/AuthorizationAdapter.test.js` — covers REQ-2 adapter interface
- [ ] `banking_api_server/services/oidc/OIDCProviderAdapter.test.js` — covers REQ-3 adapter
- [ ] `banking-core/configStore.test.js` — re-export shim returns same singleton

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — OIDCProviderAdapter wraps all auth endpoints | Keep existing PingOne PKCE + client_secret_basic patterns; adapter normalizes endpoint URLs only |
| V3 Session Management | no — sessions not changed in this phase | — |
| V4 Access Control | yes — AuthorizationAdapter controls transaction/MCP gate | Adapter interface must NOT weaken existing DENY/step-up behaviors |
| V5 Input Validation | yes — adapter context objects | Preserve existing input sanitization in services |
| V6 Cryptography | no — configStore encryption unchanged | AES-256-GCM in configStore stays as-is |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Silent adapter fallback (fail-open) | Elevation of Privilege | `AuthorizationAdapter` factory must throw if no valid engine, not default to permissive |
| OIDCProviderAdapter returning empty endpoint | Spoofing | Validate non-empty string before returning from OIDCProviderAdapter getters; throw `Error('OIDC endpoint not configured')` if empty and required |
| HTTP/SSE transport Bearer token logged | Information Disclosure | `HttpMCPTransport.ts` must not log raw Bearer tokens; already present in existing code but verify after any logging changes |
| banking-core singleton escape | Tampering | Verify via module identity check that `banking_api_server`'s `require('./services/configStore')` returns same object as `require('banking-core/configStore')` |

---

## Open Questions

1. **Where does OIDCProviderAdapter live — banking-core/ or per-component?**
   - What we know: `banking_mcp_server` is TypeScript; `banking-core` is JavaScript. Mixed-language packages are awkward to consume.
   - What's unclear: Whether we want a single OIDC adapter definition or two independent implementations.
   - Recommendation (Claude's discretion): Duplicate the adapter per component. The interface is small (~15 lines) and a TypeScript-in-JS package adds build complexity for minimal benefit. Document the interface in `banking-core/docs/OIDCProviderAdapter.md` instead.

2. **Does configStore extraction change the `data/persistent/` path?**
   - What we know: Current path uses `path.join(__dirname, '..', 'data', 'persistent')`. After extraction to `banking-core/`, `__dirname` changes.
   - What's unclear: Whether `process.cwd()` is reliable in all deployment contexts (Railway, Render, Vercel).
   - Recommendation: Pass `dbDir` as an optional constructor argument to extracted configStore, defaulting to `path.join(process.cwd(), 'data', 'persistent')`. Banking_api_server passes its own `__dirname`-relative path explicitly.

3. **Does `MCP-CONTRACT.md` need to be auto-generated or hand-maintained?**
   - What we know: `BankingToolRegistry.ts` has complete `inputSchema`, `requiredScopes`, and `description` per tool.
   - What's unclear: Whether a build script to generate the contract from the registry is worth the complexity.
   - Recommendation: Hand-write `MCP-CONTRACT.md` for v1 using registry as source of truth. Add a comment in `BankingToolRegistry.ts` pointing to the doc. Auto-generation is a future phase improvement.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `file:` npm references create symlinks that update automatically without re-install | Standard Stack | If wrong: developers must re-run `npm install` after every `banking-core` change — document this in banking-core/README |
| A2 | Node.js module identity (`===`) check works for singleton verification | Pitfalls | If wrong: configStore cache split is undetectable at startup; symptoms emerge at runtime |
| A3 | `process.cwd()` in `banking-core/configStore.js` will resolve to `banking_api_server/` when called from that package | Code Examples | If wrong: SQLite database created in wrong directory; data not persisted between restarts |

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: codebase read] `banking_api_server/services/transactionAuthorizationService.js` — complete adapter pattern, response shapes
- [VERIFIED: codebase read] `banking_api_server/services/simulatedAuthorizeService.js` — both evaluateTransaction and evaluateMcpFirstTool response shapes
- [VERIFIED: codebase read] `banking_api_server/services/mcpToolAuthorizationService.js` — existing gate implementation
- [VERIFIED: codebase read] `banking_api_server/services/configStore.js` — all exports, FIELD_DEFS, encryption, singleton, 32+ importers
- [VERIFIED: codebase grep] Cross-component dependency audit: banking_mcp_server imports zero services from banking_api_server
- [VERIFIED: codebase read] `banking_mcp_server/src/server/HttpMCPTransport.ts` — HTTP/SSE transport already implemented
- [VERIFIED: codebase read] `banking_mcp_server/src/server/BankingMCPServer.ts` — HTTP transport wired, enabled by default
- [VERIFIED: codebase read] `banking_mcp_server/src/auth/TokenIntrospector.ts` — introspection endpoint config surface
- [VERIFIED: codebase read] `banking_mcp_server/src/config/environments.ts` — full env var surface
- [VERIFIED: codebase read] `banking_mcp_server/.env.example` — current MCP server env var catalog
- [VERIFIED: codebase read] `banking_api_server/env.example` — current API server env var catalog
- [VERIFIED: codebase read] `REGRESSION_PLAN.md` §1 — do-not-break areas that constrain implementation

### Secondary (MEDIUM confidence)

- [CITED: CONTEXT.md] All decisions D-01 through D-15 — user-locked architecture decisions
- [CITED: .claude/skills/mcp-server/SKILL.md] MCP server architecture patterns, tool schema
- [CITED: .claude/skills/oauth-pingone/SKILL.md] PingOne OAuth endpoint patterns

---

## Metadata

**Confidence breakdown:**
- Current coupling audit: HIGH — verified by grep + codebase reads
- banking-core extraction approach: HIGH — verified configStore exports, demoDataService structure
- AuthorizationAdapter interface: HIGH — verified both existing response shapes match proposed contract
- HTTP/SSE transport status: HIGH — verified HttpMCPTransport.ts is fully implemented
- OIDCProviderAdapter env var surface: HIGH — verified environments.ts and configStore envFallbackMap
- `file:` npm package behavior: MEDIUM — standard npm feature, not verified against specific npm version in project

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (stable domain — no fast-moving dependencies)
