# Phase 208 Reference — mTLS Build Spec

**Status:** Planning  
**Date:** 2026-04-20

---

## Goal

Add mutual TLS (mTLS) authentication for A2A service communication, implemented in
5 waves. Each wave is independently deployable. Wave 1 (cert generation) is a
prerequisite for all others; Waves 2-5 can be sequenced based on priority.

Primary RFC: **RFC 8705** — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens.

---

## Requirements

### MTLS-01 — Local Certificate Authority

- `scripts/gen-local-certs.sh` generates a self-signed CA + leaf certs for BFF and MCP
- Output: `certs/local/` directory (gitignored)
- Certs: `ca.cert`, `bff.cert`, `bff.key`, `mcp-server.cert`, `mcp-server.key`
- Each cert has `CN=<service-name>` and `SAN=localhost`
- 365-day validity for local dev
- Script is idempotent: does not overwrite existing certs

**Test:** `openssl verify -CAfile certs/local/ca.cert certs/local/bff.cert` exits 0.

---

### MTLS-02 — BFF Outbound mTLS to PingOne

- `banking_api_server/services/mtlsAgent.js` exports a singleton `https.Agent` configured with BFF cert
- All PingOne token endpoint calls in `agentMcpTokenService.js` use `mtlsAgent`
- `client_secret` removed from token exchange POST body when `MTLS_ENABLED=true`
- PingOne app `token_endpoint_auth_method` = `tls_client_auth`
- PingOne app has BFF cert fingerprint or Subject DN registered
- Issued tokens contain `cnf.x5t#S256` claim when PingOne is configured for cert binding
- Feature flag: `MTLS_ENABLED` (default: false — backward compat)

**Test assertions:**
- `MTLS-02-A`: Token exchange request uses `mtlsAgent` (no `client_secret` in body)
- `MTLS-02-B`: Response token payload contains `cnf` key when PingOne cert binding enabled
- `MTLS-02-C`: `MTLS_ENABLED=false` falls back to `client_secret` (no regression)

---

### MTLS-03 — MCP Server Inbound mTLS

- `MCPServer.ts` creates `https.createServer` with TLS options when `MTLS_ENABLED=true`
- `requestCert: true`, `rejectUnauthorized: true` when `MTLS_ENABLED=true`
- Peer cert extracted from WebSocket socket: `ws.socket.getPeerCertificate()`
- Peer cert stored in `MessageHandlerContext.peerCert`
- WebSocket upgrade rejected with `close(1008, 'mtls_cert_required')` if no valid cert

**Test assertions:**
- `MTLS-03-A`: WebSocket connection without client cert rejected
- `MTLS-03-B`: WebSocket connection with cert signed by trusted CA accepted
- `MTLS-03-C`: `peerCert` available in `MessageHandlerContext` after connection

---

### MTLS-04 — Certificate-Bound Token Verification

- `mcpTokenValidator.ts` adds `verifyCertBinding(token: string, peerCert?: tls.PeerCertificate): void`
- Logic:
  - If `peerCert` absent → skip (mTLS not in use)
  - Decode `cnf.x5t#S256` from token payload (unsigned decode — already validated)
  - If `cnf` absent → skip (token not cert-bound — backward compat)
  - Compute: `sha256 = crypto.createHash('sha256').update(peerCert.raw).digest('base64url')`
  - If `cnf['x5t#S256'] !== sha256` → throw `CertBindingMismatch` → HTTP 401 `mtls_binding_mismatch`
- `MCPMessageHandler.handleToolCall` calls `verifyCertBinding` before executing any tool
- Log on success: `[MCPMessageHandler] cert binding verified for <act.sub> (tool: <toolName>)`

**Test assertions:**
- `MTLS-04-A`: Token with no `cnf` claim + any cert → passes (backward compat)
- `MTLS-04-B`: Token with matching `cnf.x5t#S256` + matching cert → passes
- `MTLS-04-C`: Token with `cnf.x5t#S256` + mismatched cert → HTTP 401 `mtls_binding_mismatch`
- `MTLS-04-D`: Token with `cnf.x5t#S256` + no cert at all → HTTP 401 `mtls_binding_mismatch`

---

### MTLS-05 — External Agent mTLS on Delegation Endpoint

- `banking_api_server/middleware/requireClientCert.js` exports Express middleware
- Middleware reads `req.socket.getPeerCertificate()` (or `X-SSL-CERT` if `MTLS_MODE=forwarded-header`)
- If no cert → HTTP 401 `{ error: 'mtls_cert_required' }`
- If cert not signed by trusted CA → HTTP 401 `{ error: 'mtls_cert_untrusted' }`
- `/api/agent/delegate` route uses `requireClientCert` middleware when `MTLS_ENABLED=true`
- Agent registry (config store or SQLite): maps cert `x5t#S256` thumbprint to agent record `{ agentId, name, allowedScopes }`
- If thumbprint not in registry → HTTP 403 `{ error: 'mtls_agent_unknown' }`
- Audit log entry: `{ event: 'agent_delegation', agentId, userId, scope, certThumbprint, timestamp }`

**Test assertions:**
- `MTLS-05-A`: `/api/agent/delegate` without cert → 401 `mtls_cert_required`
- `MTLS-05-B`: Valid cert but not registered → 403 `mtls_agent_unknown`
- `MTLS-05-C`: Valid cert, registered → 200 + delegated token
- `MTLS-05-D`: `MTLS_ENABLED=false` → `/api/agent/delegate` accepts without cert (backward compat)

---

### MTLS-06 — PingGateway Forwarded-Header Mode

- `MTLS_MODE=socket | forwarded-header` env var (default: `socket`)
- When `MTLS_MODE=forwarded-header`:
  - BFF `requireClientCert.js` reads cert from `X-SSL-CERT` request header (URL-decoded PEM)
  - MCP `MCPServer.ts` reads cert from first WebSocket message header (PG injects it)
  - `verifyCertBinding` receives cert parsed from header, not from socket
- Both modes produce identical `x5t#S256` thumbprint for verification
- Doc: add note to PHASE-208-ARCHITECTURE.md on PG forwarded-header config

**Test assertions:**
- `MTLS-06-A`: `MTLS_MODE=socket` reads cert from socket (unit test with mock socket)
- `MTLS-06-B`: `MTLS_MODE=forwarded-header` reads cert from header (unit test with mock header)
- `MTLS-06-C`: Both modes produce same thumbprint for same cert

---

## Environment Variables

```bash
# Feature flags
MTLS_ENABLED=true                  # master switch (default: false)
MTLS_MODE=socket                   # socket | forwarded-header

# BFF certs
TLS_CA_CERT=certs/local/ca.cert
TLS_SERVER_CERT=certs/local/bff.cert
TLS_SERVER_KEY=certs/local/bff.key
TLS_CLIENT_CERT=certs/local/bff.cert    # BFF presents this to PingOne + MCP
TLS_CLIENT_KEY=certs/local/bff.key

# MCP server certs (in banking_mcp_server/.env)
TLS_CA_CERT=../certs/local/ca.cert
TLS_SERVER_CERT=../certs/local/mcp-server.cert
TLS_SERVER_KEY=../certs/local/mcp-server.key
```

---

## Files to Create

| File | Wave | Description |
| --- | --- | --- |
| `scripts/gen-local-certs.sh` | 1 | Self-signed CA + BFF + MCP cert generation |
| `certs/local/.gitkeep` | 1 | Keep dir in git; actual certs gitignored |
| `banking_api_server/services/mtlsAgent.js` | 2 | Axios HTTPS agent with BFF client cert |
| `banking_api_server/middleware/requireClientCert.js` | 5 | Express middleware: require valid client cert |

## Files to Modify

| File | Wave | Change |
| --- | --- | --- |
| `banking_api_server/services/agentMcpTokenService.js` | 2 | Use `mtlsAgent` for PingOne calls; remove `client_secret` when `MTLS_ENABLED` |
| `banking_api_server/services/envValidation.js` | 1 | Add TLS env var validation (warn, not hard-fail, when `MTLS_ENABLED=false`) |
| `banking_api_server/routes/agentDelegation.js` | 5 | Add `requireClientCert` middleware |
| `banking_api_server/server.js` | 3 | Conditionally create HTTPS server when `MTLS_ENABLED=true` |
| `banking_mcp_server/src/server/MCPServer.ts` | 3 | Switch to `https.createServer` + mTLS options when `MTLS_ENABLED` |
| `banking_mcp_server/src/interfaces/mcp.ts` | 3 | Add `peerCert?: tls.PeerCertificate` to `MessageHandlerContext` |
| `banking_mcp_server/src/auth/mcpTokenValidator.ts` | 4 | Add `verifyCertBinding()` |
| `banking_mcp_server/src/server/MCPMessageHandler.ts` | 4 | Call `verifyCertBinding` in `handleToolCall` |
| `.gitignore` | 1 | Add `certs/local/*.key` and `certs/local/*.cert` |
| `banking_api_server/.env.example` | 1 | Add TLS env var keys |
| `banking_mcp_server/.env.example` | 1 | Add TLS env var keys |

---

## Spec Version: 1.0
