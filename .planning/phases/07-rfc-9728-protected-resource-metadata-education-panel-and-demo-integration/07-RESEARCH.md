# Phase 7: RFC 9728 Protected Resource Metadata — Research

**Researched:** 2026-04-17
**Domain:** RFC 9728 OAuth Protected Resource Metadata / Express BFF / React education UI
**Confidence:** HIGH

## Summary

**This phase is already fully implemented.** Both plans (07-01: BFF endpoint, 07-02: education tab) were executed and have complete SUMMARY.md files with commit hashes. A subsequent Phase 59 audit further enhanced the education content with `enhancedRFC9728Content.js`.

The BFF serves `GET /.well-known/oauth-protected-resource` and `GET /api/rfc9728/metadata` via `routes/protectedResourceMetadata.js`. The `AgentGatewayPanel` has four tabs: overview, inrepo, rfc8707, and rfc9728. The rfc9728 tab imports from `enhancedRFC9728Content.js` (upgraded from the original `educationContent.js` export during Phase 59).

**Primary recommendation:** No further implementation needed. If re-planning is intended (e.g., scope additions), focus on the deferred items from CONTEXT.md (signed metadata JWT, WWW-Authenticate header, DPoP).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: BFF endpoint at GET /.well-known/oauth-protected-resource, plus GET /api/rfc9728/metadata proxy for React UI
- D-02: Metadata: resource, authorization_servers, scopes_supported, bearer_methods_supported, resource_name
- D-03: rfc9728 tab in AgentGatewayPanel with RFC9728Content export in educationContent.js — live fetch demo
- D-04: rfc8707 tab OUT OF SCOPE
- D-05: npm run build must exit 0

### Claude's Discretion
- Structure the live demo fetch using useEffect + useState matching the pattern in other tab content components in educationContent.js
- Match the copy / styling of existing education tabs (edu-code blocks, descriptive paragraph prose, `<strong>` for key terms)

### Deferred Ideas (OUT OF SCOPE)
- Signed metadata JWT (`signed_metadata` field) — not needed for demo
- WWW-Authenticate: Bearer resource_metadata= header on 401 responses — deferred to Phase 8
- DPoP support in metadata (`dpop_signing_alg_values_supported`) — deferred
- rfc8707 education tab — separate phase (note: was later implemented)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RFC9728-01 | BFF serves /.well-known/oauth-protected-resource with standards-compliant metadata | **ALREADY IMPLEMENTED** — `routes/protectedResourceMetadata.js`, commit b692bdb |
| RFC9728-02 | AgentGatewayPanel gains rfc9728 education tab with live demo | **ALREADY IMPLEMENTED** — `enhancedRFC9728Content.js` + AgentGatewayPanel tab, commit a71aee9, later enhanced in Phase 59 |
</phase_requirements>

## Existing Implementation Inventory

### BFF Route: `routes/protectedResourceMetadata.js` [VERIFIED: codebase]

Two endpoints via a shared `buildMetadata(req)` helper:

| Route | Mount Point | Auth |
|-------|------------|------|
| `GET /` | `/.well-known/oauth-protected-resource` | None (public per RFC 9728 §3) |
| `GET /metadata` | `/api/rfc9728/metadata` | None (same-origin UI proxy) |

**Metadata fields served:**
- `resource` — built from `PUBLIC_APP_URL` or `req.protocol + req.get('host')` + `/api`
- `authorization_servers` — `[https://auth.pingone.{region}/{envId}/as]` (omitted if no env ID)
- `scopes_supported` — hardcoded 6 banking scopes
- `bearer_methods_supported` — `["header"]`
- `resource_name` — `"Super Banking Banking API"`
- `resource_documentation` — RFC 9728 datatracker URL

**Server.js mount (lines 1143–1144):**
```js
app.use('/.well-known/oauth-protected-resource', protectedResourceMetadataRoutes);
app.use('/api/rfc9728', protectedResourceMetadataRoutes);
```

**Vercel routing:** `banking_api_server/vercel.json` has a rewrite for `/.well-known/oauth-protected-resource`.

### AgentGatewayPanel.js [VERIFIED: codebase]

Current tabs:
| Tab ID | Label | Content Source |
|--------|-------|---------------|
| `overview` | Pattern overview | `AgentGatewayContent` from `educationContent.js` |
| `inrepo` | In this repo | Inline JSX with `EduImplIntro` + `SNIP_AGENT_GATEWAY` |
| `rfc8707` | RFC 8707 | `RFC8707Content` from `RFC8707Content.js` |
| `rfc9728` | RFC 9728 | `RFC9728Content` from `enhancedRFC9728Content.js` |

Tab registration pattern: Array of `{ id, label, content }` objects passed to `<EducationDrawer>` with `initialTabId` prop.

### enhancedRFC9728Content.js [VERIFIED: codebase]

Enhanced version (Phase 59) of the original `RFC9728Content` in `educationContent.js`. Features:
- `useEffect` + `useState` for live metadata fetch from `/api/rfc9728/metadata`
- Optional compliance score fetch from `/api/rfc9728/audit/summary`
- Sections: What is RFC 9728, Well-known URL Structure, Why it matters for AI agents/MCP, Response shape, Field Requirements, Security validation, Live metadata demo, Integration with OAuth flows, MCP and AI Agent Integration, Implementation Best Practices, Testing and Validation

### educationContent.js — original RFC9728Content [VERIFIED: codebase]

Lines 1239–1315: Simpler version with same `useEffect`/`useState` live fetch pattern. Currently **not used** by `AgentGatewayPanel` (superseded by `enhancedRFC9728Content.js`).

### Scope List [VERIFIED: codebase — config/scopes.js]

Canonical banking scopes:
- `banking:read`, `banking:write`, `banking:admin`, `banking:sensitive`, `banking:ai:agent`
- Compound (deprecated path): `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write`
- OIDC: `openid profile email offline_access`

**Note:** The metadata endpoint hardcodes 6 scopes — does NOT import from `config/scopes.js`. This is a minor divergence: `banking:sensitive` and `banking:ai:agent` are missing from the metadata response.

### Environment Variables [VERIFIED: codebase]

| Variable | Used By | Purpose |
|----------|---------|---------|
| `PUBLIC_APP_URL` | `buildMetadata()` | Resource identifier base URL |
| `PINGONE_ENVIRONMENT_ID` | `buildMetadata()` | Authorization server URI construction |
| `PINGONE_REGION` | `buildMetadata()` | PingOne domain suffix (default: `com`) |

### .well-known Pattern Precedent [VERIFIED: codebase]

`routes/clientRegistration.js` serves `GET /.well-known/oauth-client/:clientId` (CIMD) — same public-no-auth pattern used for RFC 9728.

### Tests [VERIFIED: codebase]

- `rfc9728-verification.test.js` — endpoint scenarios, metadata structure, security headers, error responses, edge cases
- `rfc9728ComplianceAuditService.test.js` — compliance audit service tests
- `rfc9728-documentation-verification.test.js` — documentation coverage tests

## Architecture Patterns

### Route Registration Pattern
Express routers in `routes/*.js`, required and mounted in `server.js`. Public endpoints mount directly on `app` (no `authenticateToken` middleware). API proxy endpoints mount under `/api/` prefix.

### Education Tab Pattern
1. Content component exported from a dedicated `.js` file (or `educationContent.js` for simpler ones)
2. Tab object `{ id, label, content: <Component /> }` added to panel's `tabs` array
3. `EducationDrawer` renders tabs with `initialTabId` support for deep-linking from `RFCIndexPanel`

### Live Demo Fetch Pattern
```jsx
const [data, setData] = React.useState(null);
const [error, setError] = React.useState(null);

React.useEffect(() => {
  fetch('/api/some-endpoint')
    .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
    .then(setData)
    .catch(e => setError(e.message));
}, []);
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RFC 9728 metadata | Custom metadata builder | Existing `buildMetadata()` in `protectedResourceMetadata.js` | Already implemented and tested |
| Education drawer | Custom tab panel | `EducationDrawer` component | Consistent with all other education panels |

## Common Pitfalls

### Pitfall 1: Scope List Divergence
**What goes wrong:** Metadata `scopes_supported` doesn't match `config/scopes.js` canonical list.
**Current state:** The metadata hardcodes 6 scopes; `config/scopes.js` defines 7 canonical scopes (`banking:sensitive` and `banking:ai:agent` are missing from metadata).
**How to avoid:** Import from `config/scopes.js` instead of hardcoding.

### Pitfall 2: Duplicate RFC9728Content Exports
**What goes wrong:** Two `RFC9728Content` exports exist — one in `educationContent.js` (original) and one in `enhancedRFC9728Content.js` (current). Importing from the wrong file gives stale content.
**Current state:** `AgentGatewayPanel` correctly imports from `enhancedRFC9728Content.js`.
**How to avoid:** If modifying, edit `enhancedRFC9728Content.js`. The original in `educationContent.js` is dead code.

### Pitfall 3: CORS on .well-known
**What goes wrong:** React UI on port 4000 can't fetch `/.well-known/...` on port 3002.
**How to avoid:** Use the `/api/rfc9728/metadata` proxy (already implemented). The proxy path goes through CRA's `setupProxy.js`.

## Open Questions

1. **Scope list sync** — Should `scopes_supported` in metadata import from `config/scopes.js` dynamically? Currently hardcoded. Low priority since phase is complete.
2. **Dead code** — `RFC9728Content` in `educationContent.js` (lines 1239–1315) is unused. Could be removed for cleanliness.

## Sources

### Primary (HIGH confidence)
- Codebase: `routes/protectedResourceMetadata.js`, `server.js`, `AgentGatewayPanel.js`, `enhancedRFC9728Content.js`, `educationContent.js`, `config/scopes.js`
- Phase summaries: `07-01-SUMMARY.md`, `07-02-SUMMARY.md`

## Metadata

**Confidence breakdown:**
- Implementation status: HIGH — verified via codebase and commit summaries
- Architecture patterns: HIGH — verified via existing code
- Pitfalls: HIGH — identified from codebase inspection

**Research date:** 2026-04-17
**Valid until:** N/A — phase already complete
