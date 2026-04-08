---
phase: 91-external-mcp-client-access
created: 2026-04-08
status: locked
---

# Phase 91: external-mcp-client-access — Context

## Domain

Enable external AI clients (Claude, ChatGPT) to access the banking MCP server securely. This phase builds on Phase 90's scope/resource validation tooling by adding OAuth 2.0 Resource Server protection at the MCP gateway, per-client registration, and PingOne-enforced domain restrictions (@pingidentity.com Google login).

Target audience: AI agents (Claude, ChatGPT) and internal Ping teams who need secure, authorized access to banking APIs through the MCP spec.

---

## Decisions

### D-01: Public MCP endpoint with OAuth 2.0 Resource Server protection
Expose the MCP WebSocket server publicly (or on a restricted URL) and enforce RFC 6750 Bearer token validation at the gateway. Tokens are issued by PingOne and validated by the MCP gateway before any tool call is processed.

Rationale: Allows external clients to authenticate once, receive a token, then invoke MCP tools without per-tool re-authentication. Standard OAuth 2.0 Resource Server pattern per RFC 6750.

### D-02: PingOne as OAuth 2.0 Authorization Server
Use PingOne's OAuth 2.0 token endpoint to issue tokens for external clients. External clients (Claude, ChatGPT) authenticate using Client Credentials or Authorization Code flows, depending on client type.

Rationale: Single source of truth for token validation. Integrates with existing PingOne setup (scopes, policies, MFA). No separate auth system to maintain.

### D-03: Domain restriction via PingOne Google IdP
Configure PingOne to accept Google login but restrict to @pingidentity.com email domain. This ensures only Ping team members can onboard external clients.

Rationale: Simple, non-intrusive gate. Leverages existing PingOne Google IdP configuration. No separate LDAP or AD integration required.

### D-04: Per-client registration in OAuth client registry
Each external client (Claude, ChatGPT) gets a unique `client_id` and secret in the OAuth client registry. Clients register via an admin UI panel or CLI. Each client can have different scopes (e.g., Claude gets "banking:read banking:write", ChatGPT gets "banking:read only").

Rationale: Standard OAuth 2.0 client registration pattern. Enables per-client scope policies and revocation. Allows experimental clients to be onboarded and revoked independently.

### D-05: Token introspection at MCP gateway
The MCP gateway receives a Bearer token, calls the BFF's `/api/introspect` endpoint (or PingOne directly) to validate the token and extract scopes, then checks if the requested MCP tool is allowed by the token's scopes.

Rationale: Token validation happens at the security boundary (MCP gateway). Decouples MCP tool logic from auth. Allows token introspection caching for performance.

### D-06: Redirect URI handling for external clients
External clients (Claude, ChatGPT) do NOT redirect back to a custom app. Instead:
- If using Authorization Code flow: Issue a one-time authorization code to the client via secure channel; client exchanges it for a token server-to-server.
- If using Client Credentials: Token is issued directly; no redirect needed.

Rationale: External clients are not browser-based. No user-facing redirect. Keep the flow server-to-server for security.

### D-07: Scope policies per client
Define which MCP tools each client can call. Examples:
- Claude client: `banking:read`, `banking:write`, `transactions:view`
- ChatGPT client: `banking:read` only
- Internal admin: Full scopes

Rationale: Least privilege. If a client is compromised, its damage is limited to its authorized scopes.

### D-08: No user-facing landing page
Unlike the demo's 3-auth-flow landing page, external client access is admin-driven. No public login page. Clients are registered by PingOne OAuth app setup; tokens are issued server-to-server.

Rationale: Out-of-scope for this phase. Focus on the MCP gateway security + client registration. A future phase can add a polish UI for client management.

---

## Deferred Ideas

- Web UI dashboard for managing external clients (scope policy editor, token revocation, client creation) — Phase 94+
- Rate limiting per client — separate phase
- Analytics / audit logging of external client tool calls — separate phase
- Multi-region MCP gateway deployment — separate phase
- OpenAPI spec generation for external clients — separate phase

---

## Canonical Refs

- `banking_mcp_server/index.js` — WebSocket server entry point; where token validation will be added
- `banking_api_server/routes/introspect.js` (if exists) or new route — Token introspection endpoint
- `banking_api_server/services/oauthClientRegistry.js` — Client registration (from Phase 90)
- `.planning/phases/90-*/90-*-PLAN.md` — Phase 90 plans (scope/resource validation tooling)
- `REGRESSION_PLAN.md` — No-break list; MCP WebSocket protocol must remain compatible
- `docs/MCP_SPEC_2025.md` — Latest MCP spec language on auth challenges, error codes, tool call flow
- `.env.example` or `banking_api_server/.env.example` — Environment variables for MCP gateway (new: `PINGONE_MCP_CLIENT_ID`, `PINGONE_MCP_RESOURCE_ID`, etc.)

---

## Specific Context

**Why Phase 91 depends on Phase 90**: Phase 90 delivers scope/resource validation rules and fix capability. Phase 91 re-uses those rules at the MCP gateway layer. Both phases share the `oauthClientRegistry` service and scope validation logic.

**MCP Gateway Token Validation Flow**:
1. External client sends WebSocket message with Bearer token in Authorization header
2. MCP gateway extracts token, calls BFF's `/api/introspect` endpoint
3. Introspect returns `{scopes: [...], sub: "...", exp: ...}`
4. MCP gateway checks if token scopes include the required scope for the MCP tool
5. If allowed: process tool call; if denied: return MCP-spec 403 `invalid_scopes` error

**Scope format**: Use the Phase 90 scope format (e.g., `banking:read`, `transactions:write`). Do NOT change scope spelling or structure — Phase 91 must consume Phase 90's validation unchanged.

**No changes to BFF OAuth flows**: Phases 1-2 OAuth flows (user login, CIBA) are unchanged. Phase 91 adds a NEW OAuth flow (client credentials for external clients) alongside existing flows.
