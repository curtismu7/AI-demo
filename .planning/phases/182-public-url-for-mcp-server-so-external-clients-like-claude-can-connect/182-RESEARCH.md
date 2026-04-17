# Phase 182: Public URL for MCP Server — Research

**Date:** 2026-04-17
**Phase:** 182-public-url-for-mcp-server-so-external-clients-like-claude-can-connect
**Discovery Level:** 1 (Quick Verification — known patterns, confirming K8s specifics)

---

## Standard Stack

| Component | Approach | Notes |
|-----------|----------|-------|
| Container | Existing Dockerfile (multi-stage, node:20-alpine, port 8080) | No changes needed |
| Orchestration | K8s Deployment + Service + Ingress on EKS | Standard manifests |
| Transport | WebSocket + HTTP Streamable on same port | Ingress needs WS upgrade annotations |
| Auth | RFC 9728 `/.well-known/oauth-protected-resource` (already implemented) | No code changes for auth |
| CORS | `MCP_ALLOWED_ORIGINS` env var (already implemented in `HttpMCPTransport.ts`) | Just configure env |
| Rate Limiting | Not yet implemented — needs middleware or ingress annotation | New work |
| Health | `/health` endpoint returns `{"status":"healthy"}` | Ready for K8s probes |
| Discovery | `/.well-known/mcp-server` returns tool manifest | Already implemented |

---

## Architecture Findings

### Existing Server Capabilities (No Code Changes Needed)

1. **Dockerfile** — Production-ready multi-stage build:
   - `node:20-alpine`, non-root user (`appuser:appgroup`), port 8080 exposed
   - `HEALTHCHECK` using `scripts/health-check.js` against `/.well-known/mcp-server`
   - `CMD ["node", "dist/index.js"]`
   - `ENV MCP_SERVER_HOST=0.0.0.0`

2. **HTTP Endpoints** already served on same port as WebSocket:
   - `GET /health` — returns `{"status":"healthy"}` (liveness probe)
   - `GET /.well-known/mcp-server` — MCP discovery manifest (readiness probe)
   - `GET /.well-known/oauth-protected-resource` — RFC 9728 metadata
   - `POST /mcp` — HTTP Streamable MCP transport
   - `DELETE /mcp` — session termination
   - WebSocket upgrade — full MCP protocol

3. **CORS** — Already implemented in `HttpMCPTransport`:
   - `MCP_ALLOWED_ORIGINS` env var (comma-separated list)
   - Empty = allow all origins (current default for demo)
   - `isOriginAllowed()` checks against allowlist

4. **Environment Variables** (from `interfaces/config.ts`):
   - `MCP_SERVER_HOST` / `MCP_SERVER_PORT` — bind address (default `0.0.0.0:8080`)
   - `HTTP_MCP_TRANSPORT_ENABLED` — enable HTTP Streamable (default `true`)
   - `MCP_RESOURCE_URL` — public URL for RFC 9728 metadata
   - `MCP_ALLOWED_ORIGINS` — CORS allowlist
   - `MCP_SERVER_RESOURCE_URI` — audience validation
   - PingOne vars: `PINGONE_BASE_URL`, `PINGONE_CLIENT_ID`, `PINGONE_CLIENT_SECRET`, etc.
   - Banking API: `BANKING_API_BASE_URL`, etc.

### What Needs to Be Created

1. **K8s Manifests** (`banking_mcp_server/k8s/`):
   - `namespace.yaml` — `banking-demo` namespace
   - `deployment.yaml` — Deployment with container spec, probes, resource limits, env from ConfigMap/Secret
   - `service.yaml` — ClusterIP service on port 8080
   - `ingress.yaml` — Ingress for `api.pingdemo.com` with WebSocket upgrade annotations
   - `configmap.yaml` — Non-sensitive env vars
   - `secret.yaml` — Template for sensitive vars (PingOne credentials, encryption key)
   - `kustomization.yaml` — Kustomize overlay for environment management

2. **Rate Limiting** — Two approaches:

   **Option A: Ingress-level (recommended for K8s):**
   - If using nginx ingress: `nginx.ingress.kubernetes.io/limit-rps: "1"` (60/min ≈ 1/sec)
   - If using other ingress: platform-specific annotations
   - Pro: No code changes. Con: Less granular control.

   **Option B: In-app middleware:**
   - Add rate limiting middleware in `BankingMCPServer.handleHttpRequest()`
   - Use in-memory store (Map with sliding window)
   - Pro: Works regardless of ingress. Con: New code, per-pod not per-cluster.

   **Recommendation:** Ingress-level for simplicity. The manifest can include nginx rate-limit annotations. If the user's ingress controller doesn't support it, in-app fallback is straightforward.

### K8s Ingress WebSocket Considerations

For WebSocket support through ingress:

**nginx ingress annotations:**
```yaml
nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
nginx.ingress.kubernetes.io/proxy-connect-timeout: "60"
nginx.ingress.kubernetes.io/websocket-services: "banking-mcp-server"
```

The default nginx ingress controller supports WebSocket upgrade natively. The key settings are:
- Increased timeouts for long-lived WS connections (default 60s would kill connections)
- `websocket-services` annotation to ensure upgrade headers are forwarded

**For ALB Ingress Controller (if used instead):**
- ALB natively supports WebSocket — no special annotations needed
- Stickiness may be needed if multiple replicas

### Health Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 30
  timeoutSeconds: 5
readinessProbe:
  httpGet:
    path: /.well-known/mcp-server
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 15
  timeoutSeconds: 5
```

- Liveness: `/health` (lightweight, always responds)
- Readiness: `/.well-known/mcp-server` (confirms tool registry loaded, server fully operational)

### Resource Estimates

Based on `docker-compose.prod.yml` reference:
- CPU: 250m request, 500m limit (demo load)
- Memory: 256Mi request, 512Mi limit
- Replicas: 1 (demo, no HA needed)

---

## Don't Hand-Roll

| Pattern | Use Instead |
|---------|-------------|
| Custom rate limiter code | Ingress-level rate limiting annotations |
| Manual TLS cert setup | cert-manager or existing cluster TLS approach |
| Custom health check protocol | Standard HTTP `/health` endpoint (already exists) |
| Container registry auth in manifest | ImagePullSecrets reference (if private registry) |

---

## Common Pitfalls

1. **WebSocket timeout** — Default ingress proxy timeout (60s) kills WS connections. Must set `proxy-read-timeout` to 3600+ seconds.
2. **CORS for WebSocket** — CORS doesn't apply to WebSocket connections (browser doesn't enforce). Only matters for HTTP Streamable (`POST /mcp`). The existing `isOriginAllowed()` in `HttpMCPTransport` handles this.
3. **`MCP_RESOURCE_URL` must match public URL** — This env var drives RFC 9728 metadata. Must be `https://api.pingdemo.com` not `http://localhost:8080`.
4. **Secret management** — K8s Secrets are base64-encoded, not encrypted. For production, use AWS Secrets Manager + External Secrets Operator. For demo, plain K8s Secrets are acceptable.
5. **Single replica + WebSocket** — With 1 replica, no session affinity concerns. If scaling to multiple replicas later, WebSocket connections are per-pod and need sticky sessions.

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Public endpoint exposure | OAuth 2.0 Protected Resource (RFC 9728) — tools require valid PingOne tokens |
| DDoS / abuse | Ingress-level rate limiting (60 req/min per IP) |
| CORS bypass | `MCP_ALLOWED_ORIGINS` restricts HTTP Streamable origins |
| Secret exposure | K8s Secrets for PingOne credentials; never in ConfigMap |
| Container privilege | Non-root user in Dockerfile (already configured) |
| Network policy | Optional: restrict egress to banking API + PingOne only |

---

*Research complete — ready for planning.*
