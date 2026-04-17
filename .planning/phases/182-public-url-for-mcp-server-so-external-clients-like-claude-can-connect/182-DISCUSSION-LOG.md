# Phase 182: Public URL for MCP Server — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 182-public-url-for-mcp-server-so-external-clients-like-claude-can-connect
**Areas discussed:** Hosting platform, Transport exposure, Auth & security, DNS & URL management

---

## Hosting Platform

| Option | Description | Selected |
|--------|-------------|----------|
| Railway | Simple Docker deploys, persistent containers, WebSocket support, ~$5/mo hobby | |
| Render | Free tier with auto-sleep, paid stays awake, native Docker | |
| Fly.io | Edge deployment, persistent containers, WebSocket-native | |
| Other | User-specified platform | ✓ |

**User's choice:** Kubernetes (K8s) on existing EKS cluster
**Notes:** Cluster already running. Just needs manifests and deploy. No provisioning.

### Follow-up: Cloud Provider

| Option | Description | Selected |
|--------|-------------|----------|
| EKS (AWS) | | ✓ |
| GKE (Google Cloud) | | |
| AKS (Azure) | | |
| Self-managed / other | | |

### Follow-up: Registry & Ingress

| Option | Description | Selected |
|--------|-------------|----------|
| ECR + ALB Ingress Controller | | |
| ECR + nginx ingress | | |
| Other | User-specified | ✓ |

**User's choice:** Existing ingress controller (unspecified type)

### Follow-up: Namespace & Domain

**User's choice:** Namespace `banking-demo`, domain provided separately

---

## Transport Exposure

| Option | Description | Selected |
|--------|-------------|----------|
| Both WebSocket + HTTP Streamable | Maximum compatibility, Claude Desktop + existing UI | ✓ |
| HTTP Streamable only | Simpler ingress, Claude compatible, UI WebSocket needs update | |
| WebSocket only | Current UI works, modern MCP clients may not connect | |
| You decide | Agent's discretion | |

**User's choice:** Both WebSocket + HTTP Streamable
**Notes:** Ingress needs WebSocket upgrade support annotations.

---

## Auth & Security

### Connection-level Auth

| Option | Description | Selected |
|--------|-------------|----------|
| Open connect, auth on tool calls | Anyone can connect/discover, tools require PingOne tokens | |
| Bearer token required to connect | All connections need valid token | |
| OAuth 2.0 Protected Resource (RFC 9728) | Existing /.well-known/oauth-protected-resource, MCP spec compliant | ✓ |
| You decide | Agent's discretion | |

**User's choice:** OAuth 2.0 Protected Resource (RFC 9728)

### Additional Hardening

| Option | Description | Selected |
|--------|-------------|----------|
| CORS allowlist + rate limiting | Restrict origins + 60 req/min per IP | ✓ |
| Rate limiting only | No CORS restrictions, throttle abuse | |
| No additional hardening | OAuth sufficient for demo | |
| You decide | Agent's discretion | |

**User's choice:** CORS allowlist + rate limiting (60 req/min per IP)

---

## DNS & URL Management

### URL Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Custom subdomain | User provides domain for Ingress host | ✓ |
| Ingress-assigned URL | Use whatever ingress assigns | |
| You decide | Agent picks defaults with placeholders | |

**User's choice:** `api.pingdemo.com`

### BFF/UI Wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Update MCP_SERVER_URL in BFF, Vercel, UI config | Full wiring in this phase | |
| Just manifests | Only K8s manifests, user wires URL manually | ✓ |
| You decide | Agent's discretion | |

**User's choice:** Just manifests — user will wire URL manually

---

## Agent's Discretion

- Container resource limits/requests
- Number of replicas
- TLS configuration approach
- Rate limiting implementation method

## Deferred Ideas

None — discussion stayed within phase scope.
