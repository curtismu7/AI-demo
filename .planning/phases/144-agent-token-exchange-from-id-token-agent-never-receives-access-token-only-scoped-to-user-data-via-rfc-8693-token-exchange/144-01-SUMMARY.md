---
phase: 144
plan: 01
subsystem: banking_api_server
tags: [token-exchange, rfc8693, id-token, feature-flags, oauth]
dependency_graph:
  requires: []
  provides: [ff_id_token_exchange, performTokenExchangeFromIdToken, exchange-id-token-to-mcp-route]
  affects: [featureFlags.js, oauthService.js, pingoneTestRoutes.js]
tech_stack:
  added: []
  patterns: [RFC 8693 token exchange with id_token subject_token_type, FF-gated BFF route]
key_files:
  created: []
  modified:
    - banking_api_server/routes/featureFlags.js
    - banking_api_server/services/oauthService.js
    - banking_api_server/routes/pingoneTestRoutes.js
decisions:
  - ff_id_token_exchange defaultValue set to false (opt-in; standard access token flows unchanged by default)
  - performTokenExchangeFromIdToken uses same applyAdminTokenEndpointClientAuth pattern as siblings
  - BFF route returns 400 (not 403) when FF is off — consistent with other FF-gated test routes
metrics:
  duration: ~5 minutes
  completed: 2026-04-14T16:51:45Z
---

# Phase 144 Plan 01: Register ff_id_token_exchange + performTokenExchangeFromIdToken + BFF Test Route Summary

RFC 8693 ID-token-as-subject exchange: registered feature flag, added `performTokenExchangeFromIdToken` method with `subject_token_type: urn:ietf:params:oauth:token-type:id_token`, and wired a FF-gated BFF test route.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Register ff_id_token_exchange in FLAG_REGISTRY | dd2e704 | featureFlags.js |
| 2 | Add performTokenExchangeFromIdToken to oauthService.js | dd2e704 | oauthService.js |
| 3 | Add /exchange-id-token-to-mcp route + ffIdTokenExchange config field | dd2e704 | pingoneTestRoutes.js |

## What Was Built

- **`ff_id_token_exchange`** added to `FLAG_REGISTRY` in featureFlags.js — category: Token Exchange, `defaultValue: false`, `warnIfEnabled: false`. Appears automatically in the Feature Flags UI.

- **`performTokenExchangeFromIdToken(idToken, audience, scopes)`** added to `OAuthService` in oauthService.js — uses `subject_token_type: urn:ietf:params:oauth:token-type:id_token` per RFC 8693. Mirrors the structured error pattern of `performTokenExchange` (richErr with `httpStatus`, `pingoneError`, `pingoneErrorDescription`, `requestContext`). Logs `[TokenExchange:ID_TOKEN:REQUEST]` and `[TokenExchange:ID_TOKEN:FAILED]` for observability.

- **`GET /api/pingone-test/exchange-id-token-to-mcp`** added to pingoneTestRoutes.js — FF-gated (returns HTTP 400 if `ff_id_token_exchange` is OFF). Reads `oauthTokens.idToken` from session, calls `performTokenExchangeFromIdToken`, and returns decoded token + subject claims without exposing raw token bytes.

- **`ffIdTokenExchange`** added to the `/config` route response object alongside `ffTwoExchangeDelegation`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — route is functional end-to-end; it will return a meaningful error from PingOne if the token-exchange policy is not yet configured for `id_token` subject type.

## Verification

```
node --check banking_api_server/routes/featureFlags.js → OK
node --check banking_api_server/services/oauthService.js → OK
node --check banking_api_server/routes/pingoneTestRoutes.js → OK
```

## Self-Check: PASSED

- [x] `ff_id_token_exchange` entry present in featureFlags.js FLAG_REGISTRY
- [x] `performTokenExchangeFromIdToken` method present in oauthService.js (line ~300)
- [x] `GET /exchange-id-token-to-mcp` route present in pingoneTestRoutes.js
- [x] `ffIdTokenExchange` field in /config response
- [x] Commit dd2e704 exists
