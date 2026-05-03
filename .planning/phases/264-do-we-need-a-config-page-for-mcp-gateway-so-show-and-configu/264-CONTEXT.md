# Phase 264: MCP Gateway Config Page - Context

**Gathered:** 2026-05-02
**Updated:** 2026-05-02 (user additions: pre-fill, PingGateway compliance, guided setup)
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing `/mcp-gateway` admin page (`McpGatewayConfig.jsx` + `mcpGatewayConfig.js` route) to:

1. **Pre-fill everything possible** — auto-derive all values we already know (PingOne env, region, MCP server URL) so the user never has to look up URLs or IDs they've already configured elsewhere
2. **Guide the user step-by-step** through PingGateway setup — a numbered wizard, not just a form with fields
3. **Full compliance with real PingGateway (Identity Gateway/IG)** — the same config page works for both the mock gateway AND a real PingGateway installation; field names, JSON schema, and route structure match PingGateway 2025.11.1 / 2026 exactly
4. Add a dedicated **Docs & Setup** tab with links to 3 official PingGateway/PingOne-AI docs
5. Add `WWW-Authenticate` header (RFC 9728) to mock gateway 401/403 responses

**Key goal:** If the user later installs real PingGateway, this config page "just works" — no mapping or translation needed.

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

### Pre-Fill Everything Possible
- **D-04:** On page load, auto-derive and pre-fill ALL values we already know:
  - `pingOneEnvUrl` → derived from `pingone_environment_id` + `pingone_region` in configStore: `https://auth.pingone.${region}/${envId}` — shown as read-only with label "Derived from your PingOne config"
  - `upstreamMcpUrl` → from `mcp_server_url` in configStore (already in existing GET response)
  - `gatewayPublicUrl` → derived from `MCP_GW_RESOURCE_URI` env var (strip `/mcp` suffix if present)
  - `pingOneResourceId` → from `MCP_GW_CLIENT_ID` env var / configStore key `mcp_gw_client_id`
  - `mcpScope` → default `banking:mcp:invoke` (match the scope already used by agentMcpTokenService)
  - `introspectEndpoint` → auto-computed: `${pingOneEnvUrl}/as/introspect` — shown read-only
- **D-05:** Fields that are auto-derived show a "🔗 From PingOne config" chip; fields that need manual input are highlighted with a yellow "Required" badge until filled
- **D-06:** If `pingone_environment_id` is not set, show a callout: "Set your PingOne Environment ID in Configuration first" with a link to `/config`

### Guided Step-by-Step Setup (Real PingGateway Tab)
- **D-07:** Replace the current "sections" layout with a **numbered wizard** — 5 steps the user follows in order:
  - **Step 1 — Verify PingOne credentials** (read-only status: shows env ID, region, token endpoint — all auto-filled; green check if set, red if missing)
  - **Step 2 — Configure gateway routes** (the form fields: pingOneResourceId, gatewayPublicUrl, mcpScope — pre-filled where possible)
  - **Step 3 — Download route file** (copy/download the generated `mcp.json`; placement instructions: `$HOME/.openig/config/routes/mcp.json`)
  - **Step 4 — Configure admin.json** (copy/download the `admin.json` snippet; note about `streamingEnabled: true`)
  - **Step 5 — Point BFF to real gateway** (instructions: set `MCP_GATEWAY_HTTP_URL`, unset `MCP_GW_DEV_BYPASS`, restart)
- **D-08:** Each step has a status indicator (✓ complete / ⚠ needs input / ○ pending) — steps 1 and 3-5 auto-complete when values are present; step 2 completes when the user saves

### Form-Based Route Config (within Step 2)
- **D-09:** Form fields for the route-level values (all matching exact PingGateway 2025.11.1 mcp.json property names):
  - `pingOneEnvID` — auto-filled read-only (maps to `properties.pingOneEnvID` in mcp.json)
  - `pingOneResourceID` — required input; maps to `properties.pingOneResourceID` and the OAuth2ResourceServerFilter `username`
  - `gatewayUrl` — required input; maps to `properties.gatewayUrl` (the public HTTPS URL of PingGateway)
  - `mcpServerUrl` — auto-filled from configStore; maps to `properties.mcpServerUrl` and `baseURI`
  - `mcpScope` — input with default; maps to `OAuth2ResourceServerFilter.scopes[0]`
  - Each field has a hint explaining its PingGateway role (e.g., "Used as `username` in OAuth2ResourceServerFilter for introspection")
- **D-10:** Live JSON preview updates client-side as user types — no BFF round-trip
- **D-11:** "Save to Config" POSTs to `/api/admin/mcp-gateway/config`; values persisted to configStore; survive BFF restart
- **D-12:** Add "⬇ Download mcp.json" button alongside the existing "📋 Copy" button

### PingGateway Compliance (Real ↔ Mock Parity)
- **D-13:** All JSON field names in the generated `mcp.json` MUST match the PingGateway 2025.11.1 schema exactly:
  - `name`, `condition`, `properties.pingOneEnvID`, `properties.pingOneResourceID`, `properties.gatewayUrl`, `properties.mcpServerUrl`, `baseURI`, `heap[].type`, filter names (`OAuth2ResourceServerFilter`, `ReverseProxyHandler`)
  - These names are already correct in `buildPingGatewayMcpJson` — do not change them
- **D-14:** The config page must work identically whether the user is configuring the **mock gateway** (dev) or **real PingGateway** (prod) — the same form generates the mcp.json for both. The only difference is where the file goes.
- **D-15:** Add a note in the UI: "This config page generates files compatible with PingGateway (Identity Gateway) 2025.11.1 and 2026. Install PingGateway and drop in the generated files — no manual JSON editing needed."

### Mock Gateway Fidelity
- **D-16:** Add `WWW-Authenticate` header to 401 and 403 responses from the mock gateway (`banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts` and `banking_mcp_gateway/src/server/GatewayServer.ts`):
  - Format: `Bearer realm="PingOne", resource_metadata="${MCP_GW_RESOURCE_URI}/.well-known/mcp-server"`
  - This matches RFC 9728 §3 and real PingGateway behavior exactly
  - Only in mock gateway responses, not BFF responses

### Route Visualization Layout
- **D-17:** Stacked layout: wizard steps list on top, form fields in step 2, live JSON preview below step 2. Works at all screen widths.

### Testing — Create, Fix, and Verify
- **D-18:** Add tests for the BFF route changes in `banking_api_server/routes/mcpGatewayConfig.js`:
  - GET `/api/admin/mcp-gateway/config` — assert the 5 new fields (`pingOneEnvUrl`, `pingOneResourceId`, `gatewayPublicUrl`, `upstreamMcpUrl`, `mcpScope`) are present and correctly derived from configStore values
  - POST `/api/admin/mcp-gateway/config` — assert newly allowed keys (`mcp_gw_client_id`, `mcp_gw_public_url`, `mcp_scope`) are saved to configStore
  - Assert `pingGatewayJson` response contains correct `properties.pingOneEnvID`, `properties.pingOneResourceID`, `properties.gatewayUrl`, `properties.mcpServerUrl`
- **D-19:** Add tests for the mock gateway `WWW-Authenticate` header:
  - In `banking_mcp_gateway/tests/` — assert 401 response includes `WWW-Authenticate` header matching `Bearer realm="PingOne", resource_metadata="..."`
  - Assert 403 response also includes the header
- **D-20:** Fix any pre-existing test failures in files we touch (follow REGRESSION_PLAN.md rule: fix obvious pre-existing failures in files you already had to change)
- **D-21:** Run `npm run build` in `banking_api_ui/` after UI changes — build must exit 0

### Claude's Discretion
- CSS styling of new Docs tab and wizard steps (use existing `mgc-*` CSS class pattern)
- `target="_blank" rel="noopener noreferrer"` for all external doc links
- configStore key names for new fields (follow `snake_case` pattern: `mcp_gw_client_id`, `mcp_gw_public_url`, `mcp_scope`)
- Inline success/error on Save button (same pattern as existing push form)

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
