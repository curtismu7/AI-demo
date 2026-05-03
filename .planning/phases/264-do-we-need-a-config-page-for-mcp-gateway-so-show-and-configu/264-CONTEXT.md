# Phase 264: MCP Gateway Config Page - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing `/mcp-gateway` admin page (`McpGatewayConfig.jsx` + `mcpGatewayConfig.js` route):
1. Add a dedicated **Docs & Setup** tab with links to 3 official PingGateway/PingOne-AI docs
2. Add form-based route configuration to the "Real PingGateway" tab — editable fields that feed the JSON generator and persist to configStore
3. Add `WWW-Authenticate` header (RFC 9728 Bearer realm + resource_metadata) to 401/403 responses from the mock gateway

This phase does NOT add new capabilities beyond the three points above. It enhances an already-functional page.

</domain>

<decisions>
## Implementation Decisions

### Doc Links
- **D-01:** Add a 4th tab "📖 Docs & Setup" to `McpGatewayConfig.jsx` alongside the existing 3 tabs
- **D-02:** The 3 docs to link (organized by topic):
  - [Securing AI Agents with PingOne](https://developer.pingidentity.com/identity-for-ai/identity/idai-securing-agents-pingone.html) — PingOne identity patterns for AI agents
  - [PingGateway + PingOne Authorize (AAM)](https://docs.pingidentity.com/pinggateway/2026/pingone/aam.html) — how PingGateway integrates with PingOne Authorize for agent authorization
  - Third doc from phase description (same PingGateway/PingOne setup topic) — include all 3 URLs from the phase roadmap entry
- **D-03:** Each doc link should include a short description of what it covers and which tab/use case it relates to

### Form-Based Route Config (Real PingGateway Tab)
- **D-04:** Add form fields at the TOP of the "Real PingGateway" tab for the route-level config values:
  - `pingOneEnvUrl` (pre-fills from configStore `pingone_environment_id` + `pingone_region`)
  - `pingOneResourceId` (MCP gateway client ID)
  - `gatewayPublicUrl`
  - `upstreamMcpUrl`
  - `mcpScope`
- **D-05:** Live JSON preview: as user edits form fields, the `mcp.json` JSON below updates in real-time (client-side, no BFF round-trip)
- **D-06:** "Save to Config" button POSTs values to the existing `/api/admin/mcp-gateway/config` endpoint (extend it to accept these new route-level fields and save to configStore)
- **D-07:** On page load, form fields pre-fill from the values returned by the GET `/api/admin/mcp-gateway/config` response's `config` object

### Route Visualization Layout
- **D-08:** Stacked layout in the Real PingGateway tab: form fields on top, live JSON preview section below. The existing copy buttons stay alongside the JSON.
- **D-09:** No side-by-side two-pane layout — keep it compatible with all screen widths

### Mock Gateway Fidelity
- **D-10:** Add `WWW-Authenticate` header to 401 and 403 responses from the mock gateway (`banking_mcp_gateway/`):
  - Format: `Bearer realm="PingOne", resource_metadata="<MCP_GW_RESOURCE_URI>/.well-known/mcp-server"`
  - This matches RFC 9728 and real PingGateway behavior
  - Only add to mock gateway responses, not BFF responses

### Claude's Discretion
- CSS styling of the new Docs tab (consistent with existing `mgc-*` CSS class pattern in `McpGatewayConfig.css`)
- Whether to use `<a target="_blank" rel="noopener noreferrer">` or open in same tab (use `target="_blank"` for external docs)
- The exact configStore key names for the new route-level fields (follow existing camelCase pattern)
- Error handling on the new Save button (show success/error inline, same pattern as existing push form)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing MCP Gateway UI
- `banking_api_ui/src/components/McpGatewayConfig.jsx` — existing 361-line component; all edits go here
- `banking_api_ui/src/components/McpGatewayConfig.css` — existing CSS; extend with `mgc-*` classes only

### Existing MCP Gateway Backend
- `banking_api_server/routes/mcpGatewayConfig.js` — GET and POST `/api/admin/mcp-gateway/config`; extend POST to accept new route-level fields
- `banking_api_server/services/mcpGatewayClient.js` — HTTP client that calls the gateway; not changed in this phase
- `banking_api_server/services/configStore.js` — key-value store; use `configStore.set()` / `getEffective()` pattern

### Mock Gateway
- `banking_mcp_gateway/` directory — the mock gateway server that needs WWW-Authenticate header fix
- Look for 401/403 response handlers in `banking_mcp_gateway/` to add the header

### App Routing
- `banking_api_ui/src/App.js` — `/mcp-gateway` route already wired; no routing changes needed
- `banking_api_ui/src/components/AdminSideNav.jsx` — "MCP Gateway" nav item already exists; no changes needed

### External Docs (to link)
- https://developer.pingidentity.com/identity-for-ai/identity/idai-securing-agents-pingone.html
- https://docs.pingidentity.com/pinggateway/2026/pingone/aam.html
- Third doc from phase roadmap description (same PingGateway/PingOne setup domain)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StatusBadge`, `McpModeChip`, `CopyButton`, `EnvVarTable` — all defined in `McpGatewayConfig.jsx`; use them for the new Docs tab and form
- Tab switching: already uses `activeTab` state with `mgc-tab` / `mgc-tab--active` CSS classes — add 4th tab with same pattern
- Push form pattern (seeded from API data, inline success/error) — reuse exactly for the new Save button in the route config form
- `mgc-field`, `mgc-input`, `mgc-field-hint` CSS classes — use for new form fields

### Established Patterns
- `configStore.getEffective(key)` — read config (falls back to env var → runtime store → default)
- `configStore.set(key, value)` — write to runtime store
- POST to `/api/admin/mcp-gateway/config` with an allowlist of accepted keys — extend this pattern
- All form state managed in React `useState` with `setPushForm` / spread pattern

### Integration Points
- `GET /api/admin/mcp-gateway/config` → `data.config` → pre-fills both the existing push form and the new route config form
- `POST /api/admin/mcp-gateway/config` → extend the `allowed` keys array to include the 5 new route-level fields
- Mock gateway HTTP server in `banking_mcp_gateway/` — add header to 401/403 response handlers

</code_context>

<specifics>
## Specific Ideas

- The phase description explicitly references all 3 URLs; include all three in the Docs tab
- The mock gateway is intended to be "byte-for-byte indistinguishable" from real PingGateway (per STATE.md pending todos) — the WWW-Authenticate header is part of that fidelity
- The route form in the Real PingGateway tab replaces the need to set env vars first just to see a populated JSON — the form is the primary input

</specifics>

<deferred>
## Deferred Ideas

- Side-by-side form + JSON pane layout (user chose stacked instead)
- Stricter aud/scope validation in mock (out of scope for this phase)
- PingOne Authorize response shape matching (out of scope for this phase)
- None — discussion stayed within phase scope

</deferred>

---

*Phase: 264-do-we-need-a-config-page-for-mcp-gateway-so-show-and-configu*
*Context gathered: 2026-05-02*
