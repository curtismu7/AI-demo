# Phase 96: Audience (aud) claim validation — Context

**Gathered:** 2026-04-08  
**Status:** Ready for planning  
**Source:** Roadmap definition (Phase 96)

---

## Phase Boundary

Implement comprehensive audience (aud) claims validation across all OAuth tokens and APIs. Ensure every token includes a correct aud claim identifying the intended recipient (resource server, API, or service). Configure aud values in PingOne applications, validate on every incoming request, and audit aud mismatches to prevent token confusion and delegation attacks.

---

## Implementation Decisions

### Audience Value Definition

- **BFF API**: aud must include "banking-api" or configured API identifier (e.g., "https://banking-api.example.com")
- **MCP Server**: aud must include "mcp-server" or "mcp.pingdemo.com"
- **PingOne Resource Servers**: Each resource has its own aud (e.g., "https://api.example.com/users")
- **Agent Actor Tokens**: aud identifies the target API the agent can access on user's behalf
- **Best Practice**: Use HTTPS URLs for aud values (per OAuth 2.0 spec recommendation)

### PingOne Configuration Audit

- Audit all OAuth applications in PingOne: what aud values do they request/expect?
- Audit all resource servers in PingOne: what aud identifiers are configured?
- Ensure consistency: all BFF tokens have matching aud claims across environments
- Document aud values per environment: localhost, Vercel staging, production
- Create standardized PingOne configuration template with aud values clearly labeled

### Token Validation Implementation

- **BFF Middleware**: Validate aud claim on EVERY incoming request (fail closed = 401)
- **MCP Gateway**: Validate aud during WebSocket connection upgrade
- **Per-Route Validation**: Some routes may require specific aud values (restrictive)
- **Compound Validation**: Both scope AND aud must match request (not just one)
- **Error Handling**: Reject with 401 + log for audit; never silently accept wrong aud

### Audience in Different Token Types

- **User tokens** (from login): aud identifies the app/service requesting access
- **Agent actor tokens** (from token exchange): aud identifies the target API agent can access
- **MCP tokens**: aud identifies the MCP server as the intended recipient
- **API key / PAT tokens**: aud identifies the service they're valid for
- **Document**: aud claim variation and purpose for each token type

### Aud Mismatch Detection & Audit

- **Log all failures**: Every aud validation failure logged with full context
- **Audit table**: Track failures with timestamp, token type, expected/actual aud values
- **Admin dashboard**: Display aud validation failures and anomaly patterns (Grafana/Kibana)
- **Anomaly alerts**: Trigger alerts on suspicious patterns (same client sending many wrong aud)
- **Token replay prevention**: Same token cannot be accepted for different aud values (different APIs)

### Education & Documentation

- Create education panel: "Understanding Audience (aud) Claims"
- Diagram: How aud prevents token misuse (token for API A cannot be used for API B)
- Token inspector: Prominently display aud claim value and expected value
- Document aud values for each PingOne app in `ENVIRONMENT_MAPPING.md`
- Integrate aud checks into setup verification script (validate PingOne config)

---

## Canonical References

**Downstream agents MUST read before planning or implementation:**

### Existing Token Validation Patterns

- [banking_api_server/middleware/](banking_api_server/middleware/) — Token validation middleware patterns
- [banking_api_server/tokenIntrospectionService.js](banking_api_server/services/tokenIntrospectionService.js) — RFC 7662 token validation (Phase 91)
- [banking_mcp_server/](banking_mcp_server/) — WebSocket token handling patterns

### PingOne & OAuth Configuration

- [.env.example](.env.example) — Current environment variable configuration
- [ENVIRONMENT_MAPPING.md](ENVIRONMENT_MAPPING.md) — PingOne app and resource configuration
- `PingOne Admin Console` → Applications → [app details] → Token Endpoint → Audience field

### Token Inspection & Education

- [banking_api_ui/src/components/TokenInspector.tsx](banking_api_ui/src/components/TokenInspector.tsx) — Token display component  
- [banking_api_ui/src/components/EducationPanel.tsx](banking_api_ui/src/components/EducationPanel.tsx) — Education panel component
- [banking_api_server/](banking_api_server/) — Token claim extraction and validation

### Standards & Specifications

- RFC 6749: OAuth 2.0 Authorization Framework (Section 4 — aud claim semantics)
- RFC 7662: OAuth 2.0 Token Introspection (aud claim included in response)
- Phase 95 Context: Actor Token = Agent Token terminology (prerequisite for understanding aud in agent delegation)

---

## Success Criteria

1. ✓ Every OAuth token request includes correct aud claim (verified in ENVIRONMENT_MAPPING)
2. ✓ BFF validates aud on every incoming request; fails closed (401) if aud doesn't match
3. ✓ MCP gateway validates aud during WebSocket upgrade with fail-closed policy
4. ✓ All PingOne apps configured with correct, consistent aud values
5. ✓ Aud validation failures logged and queryable in audit logs
6. ✓ No token accepted without matching aud (fail-closed validation)
7. ✓ Education panel explains aud purpose and token misuse prevention
8. ✓ Setup script verifies aud configuration in PingOne and local config
9. ✓ Architecture diagrams show aud claim validation points in token flows

---

*Phase 96 Context*  
*Ready for /gsd-plan-phase 96*
