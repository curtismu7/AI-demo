---
phase: 169-multi-idp-abstraction
plan: "01"
subsystem: backend/oauth
tags: [oauth, idp, abstraction, configStore, resolver, endpoints]
dependency_graph:
  requires: []
  provides: [oauth-endpoint-resolver, configurable-idp-endpoints]
  affects: [banking_api_server/services, banking_api_server/config]
tech_stack:
  added: [services/oauthEndpointResolver.js, tests/oauth-endpoint-config.test.js]
  patterns: [resolver-pattern, env-var-override, backward-compatible-fallback]
key_files:
  created:
    - banking_api_server/services/oauthEndpointResolver.js
    - banking_api_server/tests/oauth-endpoint-config.test.js
  modified:
    - banking_api_server/services/configStore.js
    - banking_api_server/config/oauth.js
    - banking_api_server/config/oauthUser.js
    - banking_api_server/services/resourceValidationService.js
    - banking_api_server/services/mfaService.js
    - banking_api_server/services/pingOneUserService.js
    - banking_api_server/services/pingoneProvisionService.js
    - banking_api_server/services/emailService.js
    - banking_api_server/services/pingoneScopeUpdateService.js
decisions:
  - "Resolver priority: explicit configStore value → PingOne pattern → empty string"
  - "Setup-wizard services (provision, scopeUpdate) use resolver || param fallback to preserve pre-config behavior"
  - "OAUTH_* env vars map to configStore fields, taking precedence over SQLite and builtin defaults"
  - "_base getter kept in oauth.js/oauthUser.js for backward compat (cibaEndpoint and any external callers)"
metrics:
  duration: "~45 minutes"
  completed: "2026-04-27"
  tasks_completed: 6
  files_changed: 11
  tests_added: 13
---

# Phase 169 Plan 01: Configurable OAuth Endpoints Summary

Six new optional OAuth endpoint fields added to configStore + centralized `oauthEndpointResolver` service. All services that previously hardcoded `https://auth.pingone.${region}/${envId}/as/...` URLs now call the resolver, enabling IDP swap via `OAUTH_*` env vars or Config UI without code changes.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Add 6 OAuth endpoint fields to configStore | d7b66ef9 | configStore.js |
| 2 | Create oauthEndpointResolver service | e7d3b5f6 | oauthEndpointResolver.js |
| 3 | Wire oauth.js + oauthUser.js through resolver | dc01ba14 | config/oauth.js, config/oauthUser.js |
| 4 | Update resourceValidationService + mfaService | 3fa43cf7 | resourceValidationService.js, mfaService.js |
| 5 | Migrate remaining 4 services | 5ecfd767 | pingOneUserService.js, pingoneProvisionService.js, emailService.js, pingoneScopeUpdateService.js |
| 6 | Comprehensive test suite | 447a0acd | tests/oauth-endpoint-config.test.js |

## Architecture

```
OAUTH_AUTHORIZATION_ENDPOINT (env var)
OAUTH_TOKEN_ENDPOINT          ↓
...                          configStore.getEffective('oauth_token_endpoint')
                                         ↓
                        oauthEndpointResolver.getTokenEndpoint()
                          ├─ explicit config → return it
                          └─ else → https://auth.pingone.${region}/${envId}/as/token

config/oauth.js           → endpointResolver.getAuthorizationEndpoint()
config/oauthUser.js       → endpointResolver.getTokenEndpoint()  etc.
resourceValidationService → endpointResolver.getTokenEndpoint()
mfaService                → endpointResolver.getTokenEndpoint() / getIssuer()
pingOneUserService        → endpointResolver.getTokenEndpoint()
pingoneProvisionService   → endpointResolver.getTokenEndpoint() || param fallback
emailService              → endpointResolver.getTokenEndpoint()
pingoneScopeUpdateService → endpointResolver.getTokenEndpoint() || param fallback
```

## Decisions Made

1. **Resolver priority** — explicit configStore > PingOne computed > empty string. Backward compatible: existing PingOne environments continue working with zero config changes.
2. **Setup-wizard fallback** — `pingoneProvisionService` and `pingoneScopeUpdateService` both call `getTokenEndpoint() || builtin` because they accept caller-supplied `envId`/`region` for environments being configured *before* config is saved.
3. **Env vars** — `OAUTH_AUTHORIZATION_ENDPOINT`, `OAUTH_TOKEN_ENDPOINT`, `OAUTH_USERINFO_ENDPOINT`, `OAUTH_JWKS_URI`, `OAUTH_ISSUER`, `OAUTH_DISCOVERY_ENDPOINT` all override configStore and take precedence over PingOne defaults.
4. **`_base` kept** — `config/oauth.js` and `config/oauthUser.js` retain `get _base()` for `cibaEndpoint` and any external callers.

## Test Results

```
PASS tests/oauth-endpoint-config.test.js
  OAuth Endpoint Configuration
    ✓ PingOne URLs from environment_id + region (backward compat)
    ✓ EU region support
    ✓ Custom authorization endpoint override
    ✓ Custom token endpoint override
    ✓ Custom JWKS URI override
    ✓ Custom issuer override
    ✓ Full Federate endpoint pattern (5 endpoints)
    ✓ Auth0 endpoint pattern
    ✓ Partial config (some PingOne, some custom)
    ✓ Explicit override always wins over PingOne default
    ✓ getOAuthEndpoints() returns all 6 fields
    ✓ PingOne discovery endpoint computed from env_id
    ✓ Custom discovery endpoint override
  13/13 passed
```

## Hardcoded URL Audit

`grep -rn "https://auth.pingone" banking_api_server/services/` → minimal output:
- `oauthEndpointResolver.js` — the resolver's own PingOne fallback (correct)
- `pingoneProvisionService.js`, `pingoneScopeUpdateService.js` — `resolver || param` fallback (correct)
- `tokenValidationService.js` — JSDoc comment only
- `audValidationService.js` — test data literal `'https://auth.pingone.test'`
- Out-of-scope: `pingOneClientService.js`, `scopeAuditService.js` (not in plan's files_modified)

## Self-Check: PASSED

- All 6 plan success criteria met
- 13/13 tests pass
- No hardcoded URLs in in-scope service code
- oauth.js/oauthUser.js backward compatible (_base getter preserved)
- PingOne environments work with zero config changes
- Federate/Auth0/Okta/Okta supported via OAUTH_* env vars
