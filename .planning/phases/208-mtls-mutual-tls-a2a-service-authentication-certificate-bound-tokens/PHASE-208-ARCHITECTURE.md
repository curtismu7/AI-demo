# Phase 208 Architecture — mTLS Mutual TLS & Certificate-Bound Tokens

**Status:** Planning  
**Date:** 2026-04-20  
**Prerequisite:** Phase 207 (MCP server token exchange + authorization gate)

---

## Problem Statement

The current architecture authenticates services using Bearer tokens and `client_secret`.
For A2A (Agent-to-Agent) communication this creates two risks:

1. **Token theft** — a stolen Bearer token works from any machine until expiry
2. **Secret leakage** — `client_secret` in env vars is a shared static credential

mTLS solves both: each service holds a private key that never leaves its machine.
A stolen token cannot be replayed without the matching private key.
RFC 8705 (OAuth 2.0 mTLS) lets PingOne issue **certificate-bound tokens** that
encode this binding as a `cnf.x5t#S256` claim.

---

## What mTLS Adds

```
BEFORE (token-only):
  Agent → Bearer token → BFF → Bearer token → MCP

AFTER (token + certificate binding):
  Agent → cert + cert-bound token → BFF → cert + cert-bound token → MCP
             ↑                                ↑
             Token proves: what you can do    Cert proves: which machine you are
```

Even if a token is stolen, it fails without the matching private key.

---

## RFC References

| RFC | Title | Relevance |
| --- | --- | --- |
| RFC 8705 | OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens | Core spec for this phase |
| RFC 8693 | OAuth 2.0 Token Exchange | Already implemented; mTLS adds cert binding to exchanged tokens |
| RFC 9449 | OAuth 2.0 DPoP | Alternative to mTLS (token binding via proof-of-possession); future option |

---

## Component Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser / External Agent                                             │
│  (no cert required for browser users — mTLS is service-to-service)   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTPS (standard TLS — server cert only)
                             ↓
┌──────────────────────────────────────────────────────────────────────┐
│  BFF  (banking_api_server)                                            │
│  ├─ Inbound: standard HTTPS from browser (no client cert required)   │
│  ├─ Inbound mTLS: from MCP server (requires MCP client cert)         │ ← NEW
│  ├─ Outbound mTLS: to PingOne token endpoint (presents BFF cert)     │ ← NEW
│  └─ Outbound mTLS: to MCP server WebSocket (presents BFF cert)       │ ← NEW (already does this)
└──────────────────┬───────────────────────────────────────────────────┘
                   │ mTLS WebSocket  (both sides present certs)
                   ↓
┌──────────────────────────────────────────────────────────────────────┐
│  MCP Server  (banking_mcp_server)                                     │
│  ├─ Inbound mTLS: requires BFF client cert on WebSocket connection   │ ← NEW
│  ├─ Validates: cnf.x5t#S256 claim matches BFF cert thumbprint        │ ← NEW
│  └─ Outbound mTLS: to Banking API (presents MCP cert)                │ ← NEW
└──────────────────┬───────────────────────────────────────────────────┘
                   │ mTLS HTTPS
                   ↓
┌──────────────────────────────────────────────────────────────────────┐
│  PingOne AS                                                           │
│  ├─ Validates BFF client cert against registered cert for OAuth app  │
│  ├─ Issues cert-bound access token (cnf.x5t#S256 = SHA-256 of cert) │
│  └─ token_endpoint_auth_method: tls_client_auth                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Certificate Architecture

```
Local CA (banking-local-ca)
├── bff.cert          — BFF presents as client cert to PingOne + MCP
├── mcp-server.cert   — MCP presents as client cert to BFF + Banking API
└── banking-api.cert  — Banking API presents as client cert (future)

External Agent certs (one per registered agent):
├── n8n-agent.cert
├── bedrock-agent.cert
└── glean-agent.cert
```

For local development: self-signed CA.
For production: PingDirectory CA or a public CA (ACM, Let's Encrypt).

---

## Token Flow: Certificate-Bound Token Exchange (RFC 8705 + RFC 8693)

```
1. BFF presents bff.cert + bff.key to PingOne token endpoint
   POST /token  (mTLS connection — no client_secret)
   grant_type: urn:ietf:params:oauth:grant-type:token-exchange
   subject_token: <user-access-token>

2. PingOne issues cert-bound delegated token:
   {
     "sub": "<user-id>",
     "act": { "sub": "<bff-client-id>" },
     "scope": "banking:read",
     "cnf": {
       "x5t#S256": "<sha256-thumbprint-of-bff.cert>"
     }
   }

3. BFF sends delegated token to MCP over mTLS WebSocket
   Authorization: Bearer <cert-bound-token>
   TLS: BFF presents bff.cert (same cert as x5t#S256 in token)

4. MCP verifies both:
   a. Token signature (existing mcpTokenValidator.js)
   b. cnf.x5t#S256 == SHA-256(socket.getPeerCertificate().raw)
      → mismatch = token stolen and replayed from different machine → reject
```

---

## Scope of Changes

### BFF (banking_api_server)

| File | Change |
| --- | --- |
| `server.js` | Add HTTPS server with `requestCert` option for mTLS-protected routes |
| `services/mtlsAgent.js` | New: axios `https.Agent` with BFF client cert (outbound calls to PingOne + MCP) |
| `services/agentMcpTokenService.js` | Use `mtlsAgent` for token exchange calls to PingOne (drop `client_secret`) |
| `routes/agentDelegation.js` | Require client cert on delegation endpoint for external agents |
| `services/envValidation.js` | Add `TLS_CLIENT_CERT`, `TLS_CLIENT_KEY`, `TLS_CA_CERT` to required env vars |

### MCP Server (banking_mcp_server)

| File | Change |
| --- | --- |
| `src/server/MCPServer.ts` | Switch from `ws.WebSocketServer` to `https.createServer` + `ws.WebSocketServer` with `requestCert: true` |
| `src/auth/mcpTokenValidator.ts` | Add `verifyCertBinding(token, peerCert)` — checks `cnf.x5t#S256` |
| `src/server/MCPMessageHandler.ts` | Pass `peerCert` into context; call `verifyCertBinding` in `handleToolCall` |
| `src/interfaces/mcp.ts` | Add `peerCert?: tls.PeerCertificate` to `MessageHandlerContext` |

### New Files

| File | Purpose |
| --- | --- |
| `scripts/gen-local-certs.sh` | Generate local CA + BFF + MCP self-signed certs (one-time setup) |
| `banking_api_server/services/mtlsAgent.js` | Shared axios mTLS agent factory |
| `banking_api_server/middleware/requireClientCert.js` | Express middleware: reject if no valid client cert |
| `.env.example` additions | `TLS_CLIENT_CERT`, `TLS_CLIENT_KEY`, `TLS_CA_CERT`, `TLS_SERVER_CERT`, `TLS_SERVER_KEY` |

---

## Build Waves

### Wave 1 — Certificate Generation + Local CA

Requirements:
- `scripts/gen-local-certs.sh` generates: `ca.cert`, `bff.cert`/`bff.key`, `mcp-server.cert`/`mcp-server.key`
- Certs stored in `certs/local/` (gitignored)
- `.env.example` updated with TLS env var keys (values not committed)

### Wave 2 — BFF Outbound mTLS to PingOne

Requirements:
- `mtlsAgent.js` creates an `https.Agent` from `TLS_CLIENT_CERT` + `TLS_CLIENT_KEY` + `TLS_CA_CERT`
- `agentMcpTokenService.js` uses `mtlsAgent` for all PingOne token endpoint calls
- PingOne app configured with `tls_client_auth` and BFF cert registered
- `client_secret` usage removed from token exchange (cert IS the auth)
- Test: token exchange succeeds; issued token contains `cnf.x5t#S256`

### Wave 3 — MCP Server Inbound mTLS

Requirements:
- `MCPServer.ts` wraps WebSocketServer in `https.createServer` with `requestCert: true`, `rejectUnauthorized: true`
- WebSocket upgrade rejected if client does not present cert signed by trusted CA
- `peerCert` extracted from socket and passed into `MessageHandlerContext`
- Existing token validation unchanged

### Wave 4 — Certificate-Bound Token Verification

Requirements:
- `verifyCertBinding(token, peerCert)` implemented in `mcpTokenValidator.ts`:
  - If `cnf.x5t#S256` absent in token: pass (not a cert-bound token — backward compat)
  - If `cnf.x5t#S256` present: compute `sha256(peerCert.raw)` and compare
  - Mismatch → throw `CertBindingMismatch` error → HTTP 401
- `handleToolCall` calls `verifyCertBinding` before executing any tool
- Log: `[MCPMessageHandler] cert binding verified for <act.sub>`

### Wave 5 — External Agent mTLS (Delegation Endpoint)

Requirements:
- `requireClientCert.js` middleware: if no valid peer cert → HTTP 401 `cert_required`
- `/api/agent/delegate` protected by `requireClientCert` middleware
- Each external agent registered: cert thumbprint stored in config/DB
- Agent cert thumbprint validated against registered agent record
- Audit log: `{ agentCertThumbprint, userId, scope, timestamp }`

---

## PingGateway Compatibility

When PingGateway is added (future phase), it terminates TLS at the edge:

```
External client → PingGateway (mTLS termination)
                → PG forwards cert as X-SSL-CERT header to BFF/MCP
```

**Impact on Phase 208 code:**
- BFF/MCP switch from reading `socket.getPeerCertificate()` to reading `X-SSL-CERT` header
- `verifyCertBinding` must support both modes: direct socket cert (no PG) and forwarded header (behind PG)
- Build this as a config flag: `MTLS_MODE=socket | forwarded-header`

### PingGateway + PingOne Authorize Compatibility Table

| Phase 208 decision | PingGateway compatible? | PingOne Authorize compatible? |
| --- | --- | --- |
| Flat scopes `banking:read`/`banking:write` | ✅ Yes | ✅ Yes |
| `cnf.x5t#S256` cert binding | ✅ Yes — PG can validate binding | ✅ Yes — PA can receive `cnf` as input claim |
| `tls_client_auth` at PingOne | ✅ Yes — PG can proxy mTLS to PingOne | ✅ N/A (AS-level concern) |
| External agent cert-per-agent | ✅ Yes — PG validates cert at edge | ✅ Yes — `cnf` claim in token identifies agent |
| `MTLS_MODE` config flag | ✅ Yes — needed for PG forwarded-header mode | ✅ N/A |

---

## Error Codes

| Scenario | HTTP | Error code |
| --- | --- | --- |
| No client cert presented | 401 | `mtls_cert_required` |
| Cert not signed by trusted CA | 401 | `mtls_cert_untrusted` |
| Token `cnf.x5t#S256` mismatch | 401 | `mtls_binding_mismatch` |
| Cert thumbprint not in registered agents | 403 | `mtls_agent_unknown` |
| Rate limit | 429 | `rate_limit` |

---

## Local Development Setup

```bash
# Step 1: generate certs (one-time)
bash scripts/gen-local-certs.sh

# Step 2: add to .env
TLS_CA_CERT=certs/local/ca.cert
TLS_SERVER_CERT=certs/local/bff.cert
TLS_SERVER_KEY=certs/local/bff.key
TLS_CLIENT_CERT=certs/local/bff.cert
TLS_CLIENT_KEY=certs/local/bff.key

# MCP server .env
TLS_CA_CERT=../certs/local/ca.cert
TLS_SERVER_CERT=../certs/local/mcp-server.cert
TLS_SERVER_KEY=../certs/local/mcp-server.key

# Step 3: register BFF cert with PingOne app
# PingOne console: App → Edit → Authentication → tls_client_auth
# Paste contents of certs/local/bff.cert

# Step 4: start servers (HTTPS only — no plain HTTP in mTLS mode)
npm run start:mtls
```

---

## What Does NOT Change

- `decodeScopesFromToken` — unchanged (reads scope claim; cert binding is additive)
- `tools/list` scope filtering — unchanged (client-side, no cert involvement)
- RFC 8693 `act` claim — unchanged (mTLS authenticates the actor; `act` identifies it)
- `mcpInstructions.js` route contract — unchanged
- Home-built authz server integration — unchanged
- All existing token validation (signature, expiry, `aud`, `act`) — unchanged; cert binding is a new check added after existing checks pass

---

**Architecture Version**: 1.0  
**Phase**: 208  
**Prerequisite phases**: 207
