# Phase 239 Context — PingOne API Docs Audit, Test Suite & Doc Links

## Goal
Audit every PingOne API call made by the BFF against the official PingOne developer docs
(https://developer.pingidentity.com/apis.html), verify the implementation matches the documented
request/response shapes, add clickable doc links to every relevant test page, and create a test
suite that exercises each API with real requests and validates responses against the documented schema.

## User requirement
> Lets look at PingOne docs for API, pay attention to curl sample code and results, to make sure
> that our server and frontend are doing the right things. We should make this a test suite as well.
> Plus add links to specific pages in ping docs, where it makes sense.

## PingOne API surface we call
| Category | Endpoint | BFF file |
|----------|----------|----------|
| OAuth 2.0 / OIDC | `POST /as/token` (auth code, client_credentials, token_exchange) | oauthService.js, agentMcpTokenService.js |
| OAuth 2.0 / OIDC | `GET /as/authorize` (PKCE) | oauthService.js |
| OAuth 2.0 / OIDC | `POST /as/introspect` | tokenIntrospectionService.js |
| OAuth 2.0 / OIDC | `GET /.well-known/openid-configuration` | configStore.js / discovery |
| PingOne Authorize | `POST /v1/environments/{envId}/decisions` | pingOneAuthorizeService.js |
| PingOne Users API | `GET /v1/environments/{envId}/users` | various |
| PingOne Management | `POST /v1/environments/{envId}/users/{userId}/mfaDevices` | cibaService.js |
| RFC 9728 | `GET /.well-known/oauth-protected-resource` | protectedResourceMetadata.js |

## Key constraint
All PingOne API interactions must match the documented request/response shapes exactly —
especially important for `POST /as/token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
and the PingOne Authorize decisions endpoint (which simulated mode must mimic exactly).

## Doc links to wire up
- OAuth token endpoint: https://apidocs.pingidentity.com/pingone/platform/v1/api/#post-token
- Authorization endpoint: https://apidocs.pingidentity.com/pingone/platform/v1/api/#get-authorize
- Token introspection: https://apidocs.pingidentity.com/pingone/platform/v1/api/#post-token-introspection
- PingOne Authorize: https://apidocs.pingidentity.com/pingone/platform/v1/api/#post-decision
- User management: https://apidocs.pingidentity.com/pingone/platform/v1/api/#get-read-all-users

## Existing test infrastructure
- `banking_api_ui/src/components/PingOneTestPage` — PingOne connectivity tests
- `banking_api_ui/src/components/MFATestPage` — MFA API tests
- `banking_api_ui/src/components/AuthzTestPage.jsx` — Authorization tests
- `banking_api_server/routes/apiCallTracker.js` — captures request/response bodies

## Simulated Authorize parity (linked todo)
`simulatedAuthorizeService.js` must produce responses byte-for-byte identical to PingOne Authorize:
- Same JSON field names and types
- Same HTTP status codes (200 PERMIT, 200 DENY, 428 step-up)
- Same error envelope format
- Request body sent to simulated endpoint must match PingOne Authorize POST body exactly
