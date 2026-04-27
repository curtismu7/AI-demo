---
phase: 169-multi-idp-abstraction
plan: "02"
subsystem: backend/oauth
tags: [oauth, oidc-discovery, idp, configStore, resolver, discovery-cache]
dependency_graph:
  requires: [169-01]
  provides: [oidc-discovery-service, discovery-cache-resolver]
  affects: [banking_api_server/services, banking_api_server/server.js]
tech_stack:
  added:
    - banking_api_server/services/oauthDiscoveryService.js
    - banking_api_server/tests/oidc-discovery.test.js
    - banking_api_server/docs/OIDC-DISCOVERY.md
  modified:
    - banking_api_server/services/oauthEndpointResolver.js
    - banking_api_server/services/configStore.js
    - banking_api_server/server.js
  patterns: [sync-cache-for-async-discovery, optional-chain, non-blocking-startup]
key_files:
  created:
    - banking_api_server/services/oauthDiscoveryService.js
    - banking_api_server/tests/oidc-discovery.test.js
    - banking_api_server/docs/OIDC-DISCOVERY.md
  modified:
    - banking_api_server/services/oauthEndpointResolver.js
    - banking_api_server/services/configStore.js
    - banking_api_server/server.js
decisions:
  - "Sync/async split: resolver getters stay sync; discovery populates module-level _discoveryCache at startup"
  - "Priority 2 slot: discovery cache sits between explicit config (priority 1) and PingOne computed (priority 3)"
  - "Non-blocking: initializeDiscovery() called with .catch() at startup; server never waits on it"
  - "HTTPS enforcement: http:// discovery URLs rejected in production; allowed in development"
  - "Issuer validation: discovered issuer must match configured oauth_issuer (trailing slash normalized)"
  - "Jest mock pattern: jest.mock('axios') + re-require in beforeEach to get fresh mock instance after resetModules()"
metrics:
  duration: "~35 minutes"
  completed: "2026-04-27"
  tasks_completed: 6
  files_changed: 6
  tests_added: 17
---

# Phase 169 Plan 02: OIDC Discovery Summary

New `oauthDiscoveryService` fetches `.well-known/openid-configuration` at startup. The `oauthEndpointResolver` now has a 4-tier priority: explicit config → discovery cache → PingOne pattern → empty. Discovery is opt-in via `OAUTH_DISCOVERY_ENABLED=true`.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Create oauthDiscoveryService | 12977418 | oauthDiscoveryService.js |
| 2 | Add oauth_discovery_enabled to configStore | 38f1175d | configStore.js |
| 3 | Add discovery cache + initializeDiscovery() to resolver | 38f1175d | oauthEndpointResolver.js |
| 4 | Wire initializeDiscovery() at server startup | 38f1175d | server.js |
| 5 | 17-test OIDC discovery test suite | 1f26cdb1 | tests/oidc-discovery.test.js |
| 6 | OIDC-DISCOVERY.md documentation | 68f468e4 | docs/OIDC-DISCOVERY.md |

## Architecture

```
server.js startup
  └─ initializeDiscovery()  (non-blocking)
       └─ oauthDiscoveryService.fetchDiscoveryMetadata(url)
            ├─ GET /.well-known/openid-configuration (5s timeout)
            ├─ validate required fields
            └─ validate issuer match
       └─ _discoveryCache = extractEndpoints(metadata)

Request time (sync)
  └─ resolver.getTokenEndpoint()
       ├─ 1. configStore.getEffective('oauth_token_endpoint')  → explicit
       ├─ 2. _discoveryCache?.token_endpoint                   → discovered
       └─ 3. https://auth.pingone.{region}/{envId}/as/token    → PingOne
```

## Decisions Made

1. **Sync/async split** — Existing callers (config/oauth.js, etc.) use sync getters; discovery uses async. Solved by populating a module-level cache at startup that sync getters read from. Zero breaking changes.
2. **Non-blocking startup** — `initializeDiscovery()` is called with `.catch()` in server.js. Discovery failure never prevents the server from starting.
3. **Issuer validation** — Discovered `issuer` must match configured `oauth_issuer` (normalized). Prevents accepting metadata from a rogue discovery endpoint.
4. **Test mock pattern** — `jest.mock('axios')` + `require('axios')` in `beforeEach` after `jest.resetModules()` ensures the test holds the same mock instance as the freshly-required service module.

## Test Results

```
PASS tests/oidc-discovery.test.js
  oauthDiscoveryService
    ✓ returns null when no discoveryUrl and no oauth_issuer configured
    ✓ constructs discovery URL from oauth_issuer when no URL provided
    ✓ uses explicit discoveryUrl when provided
    ✓ strips trailing slash from issuer when building discovery URL
    ✓ rejects http:// discovery URL in production
    ✓ allows http:// discovery URL in development
    ✓ returns null when required field missing from metadata
    ✓ returns null when discovered issuer does not match configured oauth_issuer
    ✓ accepts issuer with or without trailing slash (normalization)
    ✓ returns null and does not throw on network error
    ✓ extractEndpoints returns normalized object from metadata
    ✓ extractEndpoints returns null when metadata is null
  oauthEndpointResolver — discovery cache
    ✓ initializeDiscovery no-ops when oauth_discovery_enabled != true
    ✓ initializeDiscovery populates cache when enabled
    ✓ explicit config overrides discovery cache
    ✓ falls back to PingOne pattern when discovery fails
    ✓ _resetDiscoveryCache clears cached endpoints
  17/17 passed
```

## Self-Check: PASSED

- All 6 plan success criteria met
- 17/17 tests pass
- Discovery is fully opt-in (disabled by default; zero behavior change for existing PingOne deployments)
- Sync getters unchanged; backward compatible
- Server startup non-blocking on discovery
