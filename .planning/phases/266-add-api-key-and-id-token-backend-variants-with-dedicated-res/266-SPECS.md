# Phase 266 — Spec Compliance Catalogue

**Status:** Authoritative cross-reference for every IETF + OIDC + MCP + AI-agent spec the Phase 266 token flow touches. Every plan task that handles tokens MUST cite the relevant spec here.

**Date:** 2026-05-10
**Revision:** R3 (spec-compliance pass — added after the user flagged that the gateway must re-exchange the bearer before forwarding to banking_resource_server)

---

## 1. OAuth 2.x foundations

| Spec | Title | Role in Phase 266 |
|---|---|---|
| **RFC 6749** | The OAuth 2.0 Authorization Framework | Defines AS / RS / client roles. PingOne is the AS; `banking_resource_server` is an RS; the MCP gateway is a client AND an RS (publishes its own `/.well-known/oauth-protected-resource`). |
| **RFC 6750** | The OAuth 2.0 Authorization Framework: Bearer Token Usage | §3 — defines the `Authorization: Bearer <token>` header and the RS's obligation to validate `aud`, `exp`, `signature`. §3.1 — the WWW-Authenticate response on 401. `authenticateToken` middleware implements this. |
| **RFC 7519** | JSON Web Token (JWT) | Canonical claim names: `iss`, `sub`, `aud`, `exp`, `iat`, `nbf`, `jti`. PingOne issues JWTs that follow this. |
| **RFC 9068** | JWT Profile for OAuth 2.0 Access Tokens | `typ: at+jwt` header convention. PingOne's tokens follow this. The RS knows what to expect when validating. |
| **RFC 7515** | JSON Web Signature (JWS) | Signature on the JWT. RS verifies via JWKS. |
| **RFC 7517** | JSON Web Key (JWK) Set | `jwks_uri` endpoint at PingOne. `tokenValidationService.js` already consumes this. |
| **RFC 8414** | OAuth 2.0 Authorization Server Metadata | `/.well-known/oauth-authorization-server` discovery. PingOne publishes this; gateway + BFF read it via `oauthEndpointResolver.js`. |
| **RFC 7662** | OAuth 2.0 Token Introspection | The AS endpoint `POST /introspect`. RS sends `token` + its own client credentials, gets back `{active, scope, sub, aud, exp, client_id, ...}`. Used for revocation freshness. Already implemented in `tokenIntrospectionService.js` (Phase 235 wiring). Phase 266 layers this on as a configurable defense-in-depth flag (`ff_introspection_required`). |
| **RFC 8693** | OAuth 2.0 Token Exchange | The grant `urn:ietf:params:oauth:grant-type:token-exchange`. **THIS IS THE SPEC THAT MAKES PHASE 266 WORK.** Plan 01's dual_token + oauth_bearer dispositions both call `exchangeTokenForBackend` (already in `banking_mcp_gateway/src/tokenExchange.ts`), which sends `grant_type=token-exchange`, `subject_token=<user bearer>`, gateway client creds via Basic auth (= actor), `audience=<banking_resource_server URI>`. Result: a new token with the right aud. |
| **RFC 8707** | Resource Indicators for OAuth 2.0 | The `audience` (a.k.a. `resource`) parameter on token requests. RFC 8693 references this; PingOne accepts the `audience` param on the exchange endpoint. The exchanged token's `aud` MUST match what the RS expects. |
| **RFC 9728** | OAuth 2.0 Protected Resource Metadata | The `/.well-known/oauth-protected-resource` discovery doc that an RS publishes so clients can find the AS issuer + required audience. The MCP gateway already serves this at `banking_mcp_gateway/src/index.ts:43-66`. In production, banking_resource_server would also publish one; for Phase 266 demo, the gateway uses the env-var-configured `BANKING_RESOURCE_SERVER_RESOURCE_URI` instead. |

## 2. OIDC

| Spec | Title | Role in Phase 266 |
|---|---|---|
| **OpenID Connect Core 1.0** | OIDC Core | id_token issuance (§2 + §3.1.3.7). The Phase 266 dual_token Path renders id_token CLAIMS (name, email, sub, picture if present) on the SPA's AccessIdTokenPathPage. The RAW id_token is decoded server-side and never crosses the browser boundary. |
| **OpenID Connect Discovery 1.0** | OIDC Discovery | `/.well-known/openid-configuration`. Auto-resolved by `oauthEndpointResolver.js` from PingOne's `PINGONE_ENVIRONMENT_ID` + `PINGONE_REGION` env vars. |

## 3. MCP

| Spec | Title | Role in Phase 266 |
|---|---|---|
| **MCP 2025-11-25** | Model Context Protocol — Authorization appendix | MCP servers (the gateway) MUST treat downstream resources as separate audiences and MUST exchange tokens before forwarding. The spec defers the exchange mechanism to OAuth (RFC 8693). The Authorization appendix also requires the MCP server to publish its protected-resource metadata (RFC 9728) and to validate inbound tokens against its own resource identifier. **The gateway is BOTH an MCP server (validates inbound user bearer) AND a client (exchanges to call banking_resource_server).** |
| **MCP 2025-06-18** | Earlier MCP spec referenced in CLAUDE.md | Compatible — same audience-binding requirement. |
| **JSON-RPC 2.0** | The wire protocol for MCP tool calls | Phase 266's dual_token POST uses a JSON-RPC envelope (`{jsonrpc:'2.0', method:'identity.show', params:{idToken}, id}`) on the gateway→banking_resource_server hop. |

## 4. AI agent identity / delegation

| Spec | Title | Role in Phase 266 |
|---|---|---|
| **RFC 8693 §4.1** | act / may_act claims | When the gateway (as the agent) exchanges a user's token, the resulting token carries `act: { sub: <gateway-client>, client_id: <gateway-client>, ... }` and `iat`. The user's original token MUST carry `may_act: { sub: <gateway-client>, ... }` to permit the gateway as an actor. This is THE delegated-identity audit trail. |
| **draft-ietf-oauth-identity-chaining** (JAG — "JWT Authorization Grant" / cross-domain identity chaining) | In-progress IETF work | Formalizes multi-hop delegation patterns. When a request crosses multiple agents (user → BFF → gateway → banking_resource_server), each hop's actor is appended to the `act` chain. PingOne's implementation already does this for the existing OLB tools; Phase 266 extends the pattern to the new `bankingdata` target. |
| **WIMSE / OAuth-for-AI-Agents IETF discussions** | In-progress | Same delegated-identity principles. Phase 266 follows the established RFC 8693 pattern; no new spec needed. |
| **CLAUDE.md "RFC 8693 Token Exchange (MCP Agent)" section** | Repo-local docs | Documents the PingOne config required for the actor token: AI_AGENT app type, `client_secret_post` auth method, MCP_TOKEN_EXCHANGE_SCOPES env var. Phase 266 reuses this exact config. |

## 5. Phase 266 token flow — spec citations per hop

```
[1] SPA → BFF (cookie session)
     • OIDC Core §3.1.3.7 — id_token persisted on session (oauthUser.js:471)
     • RFC 6749 §1.1 — BFF is the OAuth client (custody of all tokens)

[2] BFF → Gateway (WebSocket: tools/call with user MCP bearer in Authorization)
     • RFC 6750 §3 — Bearer in Authorization header
     • Token's aud = AI-agent-resource (NOT banking_resource_server)
     • Token's may_act allows gateway-client (RFC 8693 §4.1)

[3] Gateway → BFF (HTTP: GET /internal/id-token)
     • Localhost-only, secret-gated (no spec — internal hop)
     • Server-to-server id_token retrieval; raw JWT never reaches browser

[4] Gateway → PingOne (HTTP: POST /as/token, grant_type=token-exchange)
     • RFC 8693 §2 — token exchange grant
     • subject_token = user MCP bearer (from [2])
     • subject_token_type = urn:ietf:params:oauth:token-type:access_token
     • audience = config.bankingResourceServerResourceUri (RFC 8707)
     • actor = gateway client creds via Basic auth → token's `act.client_id` = gateway-client
     • Result: NEW access token with aud=banking_resource_server, act chain preserved

[5] Gateway → banking_resource_server (HTTP: POST /api/resource-server/identity)
     • RFC 6750 §3.1 — Authorization: Bearer <exchanged token from [4]>
     • JSON-RPC 2.0 body — params.idToken carries the id_token from [3]

[6] banking_resource_server validates inbound bearer
     • RFC 7515 — JWS signature via PingOne JWKS (RFC 7517 + RFC 8414 discovery)
     • RFC 6750 §3.1 — aud MUST match BANKING_API_RESOURCE_URI (env)
     • RFC 8707 — aud is the audience indicator
     • OPTIONAL: RFC 7662 introspection if ff_introspection_required=true
     • Result: req.user populated with sub, scope, act, aud

[7] banking_resource_server reads id_token from params.idToken (gateway) OR session (SPA)
     • Integrity check: id_token.sub MUST match access_token.sub (custom check; phase-local rule)
     • If mismatch: 412 id_token_subject_mismatch

[8] banking_resource_server logs the act chain to ActivityLogs
     • appEventService.logEvent('INTROSPECTION', 'identity_call', { sub, aud, act, may_act, ... })
     • Phase 235 wired the INTROSPECTION event category for this purpose
     • Audit trail per draft-ietf-oauth-identity-chaining

[9] banking_resource_server decodes both tokens server-side (decodeJwtClaims + sanitizeClaims)
     • scrubRawJwts walker on the response body — defense-in-depth
     • Returns { credentialPath, accessTokenClaims, idTokenClaims, idTokenSource, ... }

[10] Response → Gateway → BFF → SPA
     • CLAUDE.md token-custody rule — only CLAIMS reach the browser, never raw JWTs
```

## 6. Phase 266 spec-critical acceptance checklist

- [ ] **RFC 8693 exchange happens before dual_token forward** (Plan 01 Task 1 + Test 2 mock assertion)
- [ ] **Exchanged token's audience matches config.bankingResourceServerResourceUri** (Plan 01 acceptance grep)
- [ ] **The inbound user MCP-side bearer is NEVER passed unchanged on the dual_token path** (Plan 01 dispatch comment: `Authorization: credential.authorization` — NOT `token`)
- [ ] **banking_resource_server validates aud against BANKING_API_RESOURCE_URI** (Plan 02 integration test 5c)
- [ ] **Act chain logged on every identity call** (Plan 02 Task 2 audit log + Test 5d)
- [ ] **id_token sub integrity check vs access_token sub** (Plan 02 Test 4c)
- [ ] **scrubRawJwts walker on response body** (Plan 02 Test 3 JWT-pattern assertion)
- [ ] **Optional RFC 7662 introspection layering** (Plan 02 Test 5e + ff_introspection_required flag)
- [ ] **Token Chain UI shows the full spec chain** (Plan 03 dual_token narrative: inbound + idtoken-fetch + exchange + forward + bearer-validated + idtoken-decoded — 6 events, each tagged with specRef)
- [ ] **Architecture diagrams cite spec at each hop** (Plan 05 ArchitectureFlowPage scenario step descriptions)

## 7. References

- IETF OAuth Working Group: https://datatracker.ietf.org/wg/oauth/documents/
- MCP spec: https://modelcontextprotocol.io/specification/
- PingOne RFC 8693 docs: linked from oauth-pingone skill (`.claude/skills/oauth-pingone/`)
- Repo-local: `CLAUDE.md` §"RFC 8693 Token Exchange (MCP Agent)" — PingOne-specific config
- Repo-local: `REGRESSION_PLAN.md` §1 — files affecting token handling (auth.js, agentMcpTokenService.js, tokenValidationService.js, tokenIntrospectionService.js)
