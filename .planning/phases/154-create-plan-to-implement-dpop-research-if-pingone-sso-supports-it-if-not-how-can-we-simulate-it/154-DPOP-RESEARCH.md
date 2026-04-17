# Phase 154 — DPoP Research (RFC 9449) and PingOne Support Assessment

## 1. DPoP Overview

**Demonstrating Proof of Possession (DPoP)** is an application-level mechanism for sender-constraining OAuth 2.0 access and refresh tokens, defined in [RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449) (September 2023, Internet Standards Track).

### How It Works

1. **Client generates an asymmetric key pair** (e.g., ES256 P-256) — private key stays on client
2. **Token request**: Client sends a `DPoP` HTTP header containing a signed JWT (`typ: dpop+jwt`) proving possession of the private key. The JWT includes `htm` (HTTP method), `htu` (target URI), `iat`, and `jti` claims.
3. **Authorization server binds the token**: The issued access token contains a `cnf.jkt` claim — the SHA-256 thumbprint of the client's public key. The `token_type` is `DPoP` (not `Bearer`).
4. **Resource access**: Client sends `Authorization: DPoP <token>` plus a new `DPoP` proof JWT (with `ath` = hash of access token). The resource server verifies the proof signature matches the public key bound in the token.

### Why DPoP Matters for AI Agents

In the Super Banking demo, tokens flow through multiple hops:
- User → BFF (Authorization Code + PKCE) → Session
- BFF → MCP server (RFC 8693 token exchange)
- MCP server → Banking API (delegated access)

DPoP would:
- **Prevent token theft/replay**: A stolen MCP token is useless without the private key
- **Bind tokens to specific services**: Each hop can have its own DPoP key pair
- **Complement RFC 8693**: Token exchange + DPoP = sender-constrained delegated tokens
- **Demonstrate defense-in-depth**: Bearer tokens + DPoP > Bearer tokens alone

### DPoP vs mTLS (RFC 8705)

| Dimension | DPoP (RFC 9449) | mTLS (RFC 8705) |
|---|---|---|
| Layer | Application (HTTP headers) | Transport (TLS) |
| Client type | Works with public + confidential | Requires certificates |
| SPA support | Yes (Web Crypto API for non-extractable keys) | No |
| Complexity | Moderate (JWT signing) | High (cert management) |
| AS support | Growing | Widespread |
| Replay protection | Per-request proof + optional nonce | TLS channel binding |

---

## 2. PingOne SSO DPoP Support Assessment

### Evidence of Support

**Strong positive signal**: Two of the six DPoP RFC co-authors are from Ping Identity:
- **Brian Campbell** (Ping Identity) — co-author
- **David Waite** (Ping Identity) — co-author

**PingOne Platform API**: The PingOne API documentation references DPoP-related parameters:
- Application configuration includes `dpop_bound_access_tokens` boolean
- Token endpoint accepts `DPoP` header
- AS metadata exposes `dpop_signing_alg_values_supported`

### Assessment: **Supported (with configuration)**

PingOne SSO supports DPoP natively. The implementation path:

1. **Enable DPoP on the application** — Set `dpop_bound_access_tokens: true` on the PingOne OIDC application via Management API
2. **Client sends DPoP proof** — Include `DPoP` header on all token requests
3. **PingOne issues DPoP-bound tokens** — Returns `token_type: "DPoP"` with `cnf.jkt` in access token
4. **Resource server validates** — Verify `cnf.jkt` matches DPoP proof public key

### PingOne Configuration Checklist

| Step | API Call | Notes |
|---|---|---|
| Enable DPoP on app | `PATCH /environments/{envId}/applications/{appId}` with `dpopBoundAccessTokens: true` | Per-application setting |
| Check AS metadata | `GET /{envId}/as/.well-known/openid-configuration` | Should include `dpop_signing_alg_values_supported` |
| Test DPoP token request | `POST /{envId}/as/token` with `DPoP` header | Returns `token_type: "DPoP"` |
| Verify cnf claim | Decode access token JWT | Should contain `cnf.jkt` |

---

## 3. Current Token Flow (Without DPoP)

```
User Browser
    │
    ├─ Authorization Code + PKCE ──────> PingOne AS
    │                                        │
    │ <── access_token (Bearer) ─────────────┘
    │
    ├─ Bearer AT in session ───────────> BFF (banking_api_server)
    │                                        │
    │              RFC 8693 exchange          │
    │              user AT → MCP token       │
    │                                        ├──> PingOne Token Endpoint
    │                                        │ <── MCP AT (Bearer)
    │                                        │
    │                                        ├──> MCP Server (banking_mcp_server)
    │                                             │
    │                                             ├──> Banking API
```

All tokens are **Bearer** — usable by anyone who possesses them.

---

## 4. DPoP Integration Points

### Where DPoP Proofs Would Be Generated and Validated

| Hop | DPoP Proof Generator | DPoP Proof Validator | Key Pair Owner |
|---|---|---|---|
| **User → PingOne** | BFF (on behalf of session) | PingOne AS | BFF |
| **BFF → PingOne (token exchange)** | BFF | PingOne AS | BFF |
| **MCP Server → Banking API** | MCP server | Banking API middleware | MCP server |
| **Browser → BFF** (optional) | Browser (Web Crypto API) | BFF middleware | Browser |

### Implementation by Component

#### banking_api_server (BFF)

**Files affected**: `config/oauthUser.js`, `config/oauthAdmin.js`, `services/tokenExchange.js`

1. **Key pair generation**: Generate ES256 key pair on server start, store in memory
2. **DPoP proof creation**: Sign `dpop+jwt` before each token request to PingOne
3. **Token request modification**: Add `DPoP` header to authorization code exchange and token exchange requests
4. **Response handling**: Accept `token_type: "DPoP"` responses, store `cnf.jkt` with session

#### banking_mcp_server

**Files affected**: `src/auth/AuthorizationRequestGenerator.ts`, `src/server/AuthenticationIntegration.ts`

1. **Key pair generation**: Generate ES256 key pair per session or per server instance
2. **DPoP proof for resource access**: Sign proof before calling Banking API
3. **DPoP validation**: Validate incoming DPoP proofs if MCP server is also a resource server

#### banking_api_ui (optional educational)

**Files affected**: New `src/components/DPoPDemo.js` or panel in PingOne Test page

1. **Visualize DPoP flow**: Show proof JWT contents, `cnf.jkt` binding, verification steps
2. **No actual DPoP logic**: Educational display only — BFF handles real DPoP

---

## 5. Implementation Plan

### Phase A: Foundation (1 plan, 2 tasks)

1. **Add DPoP utility module** to `banking_api_server`:
   - `services/dpop.js` — key pair generation (ES256/P-256), proof JWT creation, thumbprint calculation
   - Uses `jose` library (already used for JWT in BFF)
2. **Enable DPoP on PingOne app**:
   - Add PingOne Test endpoint `POST /api/pingone-test/enable-dpop` to toggle `dpopBoundAccessTokens` on apps
   - Verify AS metadata includes `dpop_signing_alg_values_supported`

### Phase B: BFF Integration (1 plan, 2-3 tasks)

1. **Wire DPoP into Authorization Code flow**: Add `DPoP` header to token endpoint calls in `oauthUser.js`
2. **Wire DPoP into token exchange**: Add `DPoP` header to RFC 8693 exchange requests
3. **Handle DPoP-bound tokens**: Update session storage to track `token_type: "DPoP"` and present `Authorization: DPoP <token>` to protected resources

### Phase C: MCP Server Integration (1 plan, 2 tasks)

1. **DPoP for MCP → Banking API calls**: Generate proofs in `AuthenticationIntegration.ts`
2. **DPoP validation middleware**: Optional — validate incoming DPoP proofs on resource endpoints

### Phase D: Educational UI (1 plan, 1 task)

1. **DPoP visualization panel**: Show decoded DPoP proof, `cnf.jkt` binding, token type in PingOne Test page

### Estimated Complexity

| Phase | Complexity | Files Changed | New Files |
|---|---|---|---|
| A: Foundation | Low | 0 | 1-2 |
| B: BFF Integration | Medium | 2-3 | 0 |
| C: MCP Server | Medium | 2 | 0-1 |
| D: Educational UI | Low | 1 | 0-1 |

**Total**: 4 phases, ~8-10 tasks, all manageable in scope.

---

## 6. Risks and Considerations

### Token Exchange + DPoP Interaction

RFC 9449 doesn't explicitly address DPoP with RFC 8693 token exchange. Two approaches:
1. **New DPoP key per exchange**: Each exchanged token is bound to a new key pair
2. **Carry-forward key**: Exchange preserves the original DPoP binding

PingOne's behavior here needs testing — this is the main unknown.

### Key Management

- BFF key pair: ephemeral (per process), regenerated on restart — acceptable for demo
- MCP server key pair: per session or per instance — needs design decision
- Browser key pair: Web Crypto `non-extractable` keys for XSS protection (if implementing browser-side DPoP)

### Backward Compatibility

DPoP is opt-in per application. The demo can run with or without DPoP:
- DPoP disabled: tokens are Bearer (current behavior)
- DPoP enabled: tokens are DPoP-bound (requires all hops to handle `DPoP` auth scheme)

Feature flag in BFF config: `DPOP_ENABLED=true|false`

---

## 7. Educational Value

DPoP demonstrates to demo viewers:

1. **Sender-constrained tokens** — Why Bearer tokens are risky and how to fix it
2. **Application-layer PoP** — No TLS client certificates needed
3. **RFC 9449 in practice** — How the standard works with a real AS (PingOne)
4. **Defense-in-depth for AI agents** — Token exchange + DPoP = multi-layer security
5. **PingOne's standards compliance** — Two co-authors from Ping Identity

---

## 8. Recommendation

**Proceed with implementation.** PingOne supports DPoP natively. The demo already has the `jose` library for JWT operations. Implementation is incremental (4 phases, each independently shippable). DPoP is high educational value for the demo's target audience (identity architects evaluating PingOne).

**Suggested starting point**: Phase A (foundation utilities + PingOne app config endpoint) — low risk, immediate verification that PingOne DPoP works as expected.
