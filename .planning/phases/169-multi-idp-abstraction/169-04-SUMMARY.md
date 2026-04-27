---
phase: 169-multi-idp-abstraction
plan: "04"
subsystem: backend/oauth
tags: [oauth, role-mapping, idp, configStore, roleClaimResolver, backward-compat]
dependency_graph:
  requires: [169-01, 169-03]
  provides: [role-claim-resolver, any-idp-role-mapping]
  affects: [banking_api_server/services, banking_api_server/routes]
tech_stack:
  added:
    - banking_api_server/services/roleClaimResolver.js
    - banking_api_server/tests/role-claim-mapping.test.js
    - banking_api_server/docs/ROLE-MAPPING.md
    - banking_api_server/docs/FEDERATE-SETUP.md
  modified:
    - banking_api_server/services/configStore.js
    - banking_api_server/routes/oauthUser.js
  patterns: [null-return-for-unconfigured, uri-suffix-matching, additive-signal]
key_files:
  created:
    - banking_api_server/services/roleClaimResolver.js
    - banking_api_server/tests/role-claim-mapping.test.js
    - banking_api_server/docs/ROLE-MAPPING.md
    - banking_api_server/docs/FEDERATE-SETUP.md
  modified:
    - banking_api_server/services/configStore.js
    - banking_api_server/routes/oauthUser.js
decisions:
  - "null return: resolver returns null when admin/customer values unconfigured; legacy signals unchanged"
  - "Additive signal: wired as Signal 5 in oauthUser.js, not a replacement for existing 4 signals"
  - "URI suffix matching: 'admin' matches 'https://...roles/admin' for Auth0-style role URIs"
  - "Admin-wins: when array has both admin and customer values, admin is checked first"
  - "Case sensitive: exact string matching, no normalization; matches security requirement"
  - "oauth.js admin callback unchanged: always grants admin (admin OAuth app = admin user)"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-27"
  tasks_completed: 6
  files_changed: 6
  tests_added: 13
---

# Phase 169 Plan 04: Role Claim Resolver Summary

New `roleClaimResolver` service abstracts role/permission claim extraction from tokens. Any IDP claim can be mapped to admin/customer role via `OAUTH_ROLE_CLAIM_*` env vars. Backward compatible — returns `null` when unconfigured so existing PingOne population/username/claim signals continue working unchanged.

## Tasks Completed

| # | Task | Files |
|---|------|-------|
| 1 | Add 4 role claim fields to configStore | configStore.js |
| 2 | Create roleClaimResolver service | roleClaimResolver.js |
| 3 | Wire into oauthUser.js as Signal 5 | oauthUser.js |
| 5 | 13-test role claim mapping suite | tests/role-claim-mapping.test.js |
| 6 | ROLE-MAPPING.md documentation | docs/ROLE-MAPPING.md |
| 7 | FEDERATE-SETUP.md migration guide | docs/FEDERATE-SETUP.md |

(Task 4 — Config UI role claim fields — deferred to Config UI phase)

## Architecture

```
oauthUser.js /callback
  ├─ Signal 1: username allowlist (admin_username)
  ├─ Signal 2: PingOne population (admin_population_id)
  ├─ Signal 3: custom claim (admin_role_claim / admin_role)
  ├─ Signal 4: existing dataStore record
  └─ Signal 5: roleClaimResolver (oauth_role_claim_* config)
       ├─ reads claim name, admin/customer values, is_array flag
       ├─ string: exact match
       ├─ array: exact match + URI suffix matching
       └─ returns 'admin' | 'customer' | null
```

## Test Results

```
PASS tests/role-claim-mapping.test.js
  roleClaimResolver
    ✓ returns admin for PingOne population_id string match
    ✓ returns customer for PingOne population_id customer match
    ✓ returns admin for Azure AD app_roles array containing admin value
    ✓ returns customer for Azure AD app_roles array with only user role
    ✓ returns admin for Auth0 role URI when suffix matches
    ✓ returns null for Auth0 when no role matches admin or customer
    ✓ returns admin for Okta groups array containing admin group
    ✓ returns null when claim is missing from token
    ✓ returns null when neither admin nor customer value is configured
    ✓ admin wins when array contains both admin and customer values
    ✓ role value matching is case-sensitive
    ✓ returns null for null or undefined claims argument
    ✓ wraps non-array claim in array when oauth_role_claim_is_array=true
  13/13 passed
```

## Self-Check: PASSED

- All success criteria met (except Config UI task — deferred)
- 13/13 tests pass
- Backward compatible — existing PingOne setups unaffected (resolver returns null when unconfigured)
- FEDERATE-SETUP.md provides complete end-to-end migration guide
