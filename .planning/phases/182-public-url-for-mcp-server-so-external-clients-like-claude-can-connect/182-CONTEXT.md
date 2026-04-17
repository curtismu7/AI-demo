# Phase 182: Public URL for MCP Server — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the `banking_mcp_server` to a publicly reachable URL on an existing EKS cluster so external AI clients (Claude Desktop, other MCP clients) can connect via WebSocket and HTTP Streamable transport. Create K8s manifests only — no BFF/UI wiring changes.

</domain>

<decisions>
## Implementation Decisions

### Hosting Platform
- **D-01:** Deploy to an existing EKS (AWS) cluster — no cluster provisioning needed
- **D-02:** Use existing ingress controller on the cluster
- **D-03:** K8s namespace: `banking-demo`
- **D-04:** Create standard K8s manifests: Deployment, Service, Ingress

### Transport Exposure
- **D-05:** Expose both WebSocket and HTTP Streamable (`POST /mcp`) transports publicly
- **D-06:** Ingress must support WebSocket upgrade (annotations required)

### Auth & Security
- **D-07:** Use OAuth 2.0 Protected Resource (RFC 9728) — leverage existing `/.well-known/oauth-protected-resource` endpoint from `HttpMCPTransport.ts`. MCP spec 2025-11-25 compliant auth discovery.
- **D-08:** Add CORS allowlist — restrict origins to Vercel domain + known MCP clients
- **D-09:** Add rate limiting — 60 req/min per IP

### DNS & URL Management
- **D-10:** Custom subdomain: `api.pingdemo.com` as the public MCP server hostname
- **D-11:** Ingress host set to `api.pingdemo.com`
- **D-12:** Only create K8s manifests and Dockerfile updates — user will wire `MCP_SERVER_URL` in BFF/Vercel env manually

### Agent's Discretion
- Container resource limits/requests (reasonable defaults for a demo)
- Number of replicas (1 is fine for demo)
- TLS configuration approach (cert-manager or manual — depends on what's on the cluster)
- Specific rate limiting implementation (in-app middleware vs ingress annotation)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP Server
- `.github/skills/mcp-server/SKILL.md` — MCP server architecture, tool registry, session management, deployment guidance (Railway/Render/Fly mentioned but K8s chosen instead)
- `banking_mcp_server/Dockerfile` — Existing multi-stage production Dockerfile (port 8080, non-root user, health check)
- `banking_mcp_server/docker-compose.prod.yml` — Production Docker Compose reference for env vars and resource limits
- `banking_mcp_server/src/server/BankingMCPServer.ts` — WebSocket server implementation
- `banking_mcp_server/src/server/HttpMCPTransport.ts` — HTTP Streamable MCP transport (POST /mcp, /.well-known/oauth-protected-resource)

### Auth
- `.github/skills/oauth-pingone/SKILL.md` — PingOne OAuth flows, RFC 9728 protected resource metadata

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Dockerfile:** Production-ready multi-stage build, exposes port 8080, non-root user, health check via `scripts/health-check.js`
- **HttpMCPTransport.ts:** Already serves `/.well-known/oauth-protected-resource` (RFC 9728) and `POST /mcp` (HTTP Streamable). Enabled by `HTTP_MCP_TRANSPORT_ENABLED=true` (default true)
- **Health check:** `scripts/health-check.js` checks `/.well-known/mcp-server` — usable as K8s liveness/readiness probe
- **docker-compose.prod.yml:** Reference for env vars, resource limits (512M mem, 1 CPU)

### Established Patterns
- Server listens on `0.0.0.0:8080` (`MCP_SERVER_HOST` / port from config)
- WebSocket + HTTP on same port via `http.createServer` with upgrade handling
- Environment config via `.env` files and `loadConfiguration()`

### Integration Points
- BFF (`banking_api_server/server.js`) reads `MCP_SERVER_URL` env var to connect to MCP server
- UI config page has `MCP_SERVER_URL` field (placeholder `wss://your-mcp-server.railway.app`)
- `BankingAPIClient` in MCP server calls the banking API server at `config.bankingApi.baseUrl`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard K8s deployment with WebSocket ingress support.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 182-public-url-for-mcp-server-so-external-clients-like-claude-can-connect*
*Context gathered: 2026-04-17*
