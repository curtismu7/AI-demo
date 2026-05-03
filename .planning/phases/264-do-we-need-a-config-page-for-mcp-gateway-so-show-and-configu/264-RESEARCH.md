# Phase 264: MCP Gateway Config Page — Research

**Researched:** 2026-05-02  
**Domain:** UI form patterns, BFF route configuration, mock gateway RFC 9728 compliance  
**Confidence:** HIGH

## Summary

Phase 264 extends the existing `/mcp-gateway` admin page with:

1. **UI enhancements:** 4th "Docs & Setup" tab, numbered wizard for Real PingGateway tab, form fields for route-level config, live JSON preview with download button
2. **BFF endpoint extension:** POST `/api/admin/mcp-gateway/config` accepts new route-level fields (`mcp_gw_client_id`, `mcp_gw_public_url`, `mcp_scope`); GET response includes 5 new derived fields
3. **Mock gateway RFC 9728 compliance:** Add `WWW-Authenticate: Bearer realm="PingOne", resource_metadata="<URI>/.well-known/mcp-server"` to 401/403 responses

All existing patterns are established and well-tested. No new dependencies required.

**Primary recommendation:** Follow CONTEXT.md decisions D-01 through D-21 exactly. Reuse existing `mgc-*` CSS classes, configStore patterns, and form handling conventions from `McpGatewayConfig.jsx`.

---

## Mock Gateway 401/403 Locations (file paths + line numbers)

### authorizeMcpRequest.ts

| Response | Location | Current Behavior | Action Required |
|----------|----------|------------------|-----------------|
| **401 — Invalid Token** | Lines 112–125 | Sets `WWW-Authenticate: Bearer error="invalid_token"...` | **UPDATE:** Add `resource_metadata` parameter per RFC 9728 |
| **401 — Policy Violation** | Lines 137–145 | Sets `WWW-Authenticate: Bearer error="${err.code}"...` | **UPDATE:** Add `resource_metadata` parameter |
| **403 — Authorize DENY** | Lines 163–187 | **No WWW-Authenticate header** | **ADD:** Full RFC 9728 header with `realm="PingOne"` + `resource_metadata` |

### GatewayServer.ts

| Response | Location | Current Behavior | Action Required |
|----------|----------|------------------|-----------------|
| **401 — Missing Bearer** | Lines 208–210 | Calls `sendUnauthorized(res, 'invalid_token', 'Bearer token required')` | No change — `sendUnauthorized` handles header formatting |
| **401 — Token Validation Error** | Lines 214–220 | Calls `sendUnauthorized(res, err.code, err.message)` | No change — delegates to `sendUnauthorized` |
| **401 — DELETE invalid Bearer** | Lines 230–235 | Calls `sendUnauthorized(res, 'invalid_token', 'Bearer token required')` | No change — delegates to `sendUnauthorized` |
| **401 — POST invalid Bearer** | Lines 323–325 | Calls `sendUnauthorized(res, 'invalid_token', 'Bearer token required')` | No change — delegates to `sendUnauthorized` |
| **401 — POST token validation** | Lines 333–336 | Calls `sendUnauthorized(res, err.code, err.message)` | No change — delegates to `sendUnauthorized` |

**Key insight:** `GatewayServer.sendUnauthorized()` (lines 483–497) **already includes** `resource_metadata` in its WWW-Authenticate header. However, authorizeMcpRequest.ts bypasses this helper on lines 114–116 and 139–142, crafting its own headers without the RFC 9728 metadata. Phase 264 must update these inline headers to include `resource_metadata`.

---

## configStore Patterns

### Reading Values (getEffective)

**Pattern used throughout:** `configStore.getEffective(key)`

```javascript
// Source: banking_api_server/services/configStore.js line 450–578
const value = configStore.getEffective('pingone_environment_id');
```

**Lookup order:**
1. Environment variable (env fallbacks defined in `envFallbackMap`, line 456–552)
2. SQLite persisted store (in-memory cache)
3. Built-in defaults from `pingoneBackendDefaults` (optional file)
4. FIELD_DEFS default for the key

**Why this matters:** For Phase 264, all auto-derived fields use `getEffective()` to read base values:
- `pingone_environment_id` + `pingone_region` → construct `pingOneEnvUrl`
- `mcp_server_url` → `upstreamMcpUrl`
- `MCP_GW_RESOURCE_URI` env → `gatewayPublicUrl`
- `mcp_gw_client_id` (env or store) → `pingOneResourceId`

### Writing Values (setConfig / setRaw)

**For FIELD_DEFS keys:** `await configStore.setConfig(data)`
- Validates each key against FIELD_DEFS
- Encrypts SECRET_KEYS before storage
- Persists to SQLite + updates in-memory cache

**Pattern in Phase 264:**
```javascript
// BFF route: POST /api/admin/mcp-gateway/config
// allowed keys to accept from UI
const allowed = [
  'mcp_gw_client_id',         // maps to pingOneResourceId form field
  'mcp_gw_public_url',        // maps to gatewayUrl form field
  'mcp_scope',                // maps to mcpScope form field
  // ... existing fields
];

// Extract allowed keys from request
const updates = {};
for (const key of allowed) {
  if (key in (req.body || {})) {
    updates[key] = req.body[key];
  }
}

// Persist to configStore
// Note: Current implementation (mcpGatewayConfig.js line 250–306)
// forwards to the mock gateway via HTTP POST, NOT to configStore.
// Phase 264 extends this to also call configStore.setConfig() for persistence.
```

**CRITICAL:** The current POST route pushes config to the mock gateway via HTTP (line 272–306). Phase 264 must ALSO persist route-level fields to configStore so they survive BFF restart. This is a **new responsibility** for the BFF route.

### Encryption

Secret keys are encrypted before storage. However, the 3 new fields for Phase 264 are **not** secrets:
- `mcp_gw_client_id` — public resource ID (encryption not needed)
- `mcp_gw_public_url` — public URL (encryption not needed)
- `mcp_scope` — public scope string (encryption not needed)

These can be written to configStore without encryption overhead.

---

## Existing Test Infrastructure

### Mock Gateway Tests

**Location:** `banking_mcp_gateway/tests/gateway-auth.test.ts` (198 lines)  
**Runner:** Jest  
**Run command:** `cd banking_mcp_gateway && npm test`

**Existing test coverage:**
- Token policy validation (GatewayTokenPolicy.validate)
- PingOne Authorize evaluation (authorizeMcpRequest middleware)
- RFC 8693 token exchange
- Correct next-hop audience selection

**Test structure pattern:**
```typescript
// Mock HTTP responses via jest.mock('axios')
// Create minimal unsigned JWT tokens for testing
// Inject mock config into authorizeMcpRequest builder function
// Assert on res.writeHead(statusCode, headers) and res.end(body)
```

**Relevant for Phase 264:**
- Tests use `jest.fn()` to spy on `res.writeHead()` and `res.end()`
- Can assert on `WWW-Authenticate` header format
- Can add new test cases for 403 + WWW-Authenticate

**File:** `banking_mcp_gateway/tests/gateway-server.test.ts` (200+ lines)  
**Coverage:** Basic transport layer, metadata endpoint, token validation shape

### BFF Route Tests

**Location:** `banking_api_server/tests/` (8 test files)  
**Runner:** Jest  
**Run command:** `cd banking_api_server && npm test`

**No existing tests for `mcpGatewayConfig.js` route.**  
Phase 264 must add:
- GET `/api/admin/mcp-gateway/config` assertions (5 new response fields)
- POST `/api/admin/mcp-gateway/config` assertions (new allowlist keys, persistence)

**Test pattern from existing files (e.g., `tokenUtils.test.js`):**
```javascript
// Use supertest to make HTTP requests
// Assert response status, body structure, field presence
// Mock axios or other HTTP calls as needed
// Example: banking_api_server/tests/oauth-endpoint-config.test.js line 50+
const res = await request.get('/api/admin/config');
expect(res.status).toBe(200);
expect(res.body.config).toHaveProperty('pingone_environment_id');
```

---

## Form Reuse Patterns from McpGatewayConfig.jsx

### Existing Components (Reusable)

| Component | Lines | Purpose | Phase 264 Use |
|-----------|-------|---------|--------------|
| `StatusBadge` | 6–11 | Display status of gateway (running/stopped) | Reuse for wizard step status |
| `CopyButton` | 28–41 | Copy text to clipboard with feedback | Reuse for Docs tab links and JSON copy |
| `EnvVarTable` | 43–59 | Display env vars in 2-column table | Reuse for displaying config values |

### Form Field Pattern (Push Form)

**Existing pattern (lines 239–281):**
```jsx
// Map over field definitions
[
  { key: "gatewayResourceUri", label: "Gateway Resource URI", placeholder: "...", hint: "..." },
  // ... more fields
].map(({ key, label, placeholder, hint }) => (
  <label key={key} className="mgc-field">
    <span className="mgc-field-label">{label}</span>
    <input
      type="text"
      className="mgc-input"
      placeholder={placeholder}
      value={pushForm[key] ?? ""}
      onChange={(e) => setPushForm((f) => ({ ...f, [key]: e.target.value }))}
    />
    {hint && <span className="mgc-field-hint">{hint}</span>}
  </label>
))
```

**For Phase 264:** Replicate this pattern for the 5-field route config form:
- `pingOneEnvID` (read-only)
- `pingOneResourceID` (required input)
- `gatewayPublicUrl` (required input)
- `mcpServerUrl` (read-only)
- `mcpScope` (input with default)
- `introspectEndpoint` (read-only derived)

### CSS Classes Available

**Form styling:**
- `.mgc-field` — wrapper for label + input + hint
- `.mgc-field-label` — label text (16px, 600 weight)
- `.mgc-input` — text input (padding, border, font)
- `.mgc-field-hint` — hint text (12px, gray)
- `.mgc-field--inline` — for checkboxes (line 261)

**Button styling:**
- `.mgc-push-btn` — primary action button (blue, line 270–275)
- `.mgc-copy-btn` — secondary copy button (blue, already defined in CSS line 173–181)

**Alert styling:**
- `.mgc-alert` — alert container
- `.mgc-alert--success` — green success message
- `.mgc-alert--error` — red error message
- `.mgc-alert--info` — info message

**Badges:**
- `.mgc-badge` — status indicator
- `.mgc-badge--on` / `.mgc-badge--off` — toggle states

---

## Current POST Allowlist

**File:** `banking_api_server/routes/mcpGatewayConfig.js` lines 253–258

```javascript
const allowed = [
    'gatewayResourceUri', 'mcpOlbWsUrl', 'mcpInvestWsUrl',
    'mcpOlbResourceUri', 'mcpInvestResourceUri',
    'pingAuthorizeEndpoint', 'pingAuthorizeWorkerId',
    'hitlServiceUrl', 'devBypass',
];
```

**Phase 264 additions:**
```javascript
const allowed = [
    // Existing fields (unchanged)
    'gatewayResourceUri', 'mcpOlbWsUrl', 'mcpInvestWsUrl',
    'mcpOlbResourceUri', 'mcpInvestResourceUri',
    'pingAuthorizeEndpoint', 'pingAuthorizeWorkerId',
    'hitlServiceUrl', 'devBypass',
    
    // NEW: Route-level PingGateway config
    'mcp_gw_client_id',    // pingOneResourceID → persisted
    'mcp_gw_public_url',   // gatewayUrl → persisted
    'mcp_scope',           // mcpScope → persisted
];
```

**Current POST behavior:**
- Extracts allowed keys from req.body
- POSTs them to the mock gateway HTTP endpoint (`/admin/config`)
- Gateway responds with updated in-memory config
- BFF returns the response

**Phase 264 change:**
- Also persist new keys to configStore for BFF restart survival
- Existing keys continue to POST to gateway (in-memory only)

---

## Pre-Fill Derivation Map

**On GET `/api/admin/mcp-gateway/config`:**

| UI Field | Source | Derivation Formula | Read-Only |
|----------|--------|-------------------|-----------|
| `pingOneEnvID` | `configStore.getEffective('pingone_environment_id')` + `configStore.getEffective('pingone_region')` | `https://auth.pingone.${region}/${envId}` | ✓ Yes |
| `pingOneResourceID` | `process.env.MCP_GW_CLIENT_ID` OR `configStore.getEffective('mcp_gw_client_id')` | Direct value | ✗ No (required input) |
| `gatewayUrl` | `process.env.MCP_GW_RESOURCE_URI` OR `configStore.getEffective('mcp_gw_public_url')` | Direct value (strip `/mcp` suffix if present) | ✗ No (required input) |
| `mcpServerUrl` | `configStore.getEffective('mcp_server_url')` OR env `MCP_OLB_WS_URL` | Direct value | ✓ Yes (already shown in line 191) |
| `mcpScope` | `configStore.getEffective('mcp_scope')` OR env `MCP_SCOPE` | Default `'banking:mcp:invoke'` | ✗ No (input with default) |
| `introspectEndpoint` | Computed from `pingOneEnvUrl` | `${pingOneEnvUrl}/as/introspect` | ✓ Yes |

**Implementation location:** Extend GET response in `mcpGatewayConfig.js` lines 187–206. Already building `cfg` object; add computed fields there and include in JSON response (line 208–239).

---

## Risks and Implementation Notes

### Risk: Persistence Disconnect

**Risk:** New route config fields saved to UI, but BFF POST doesn't persist to configStore → values lost on BFF restart.

**Mitigation:** Phase 264 extends POST `/api/admin/mcp-gateway/config` to:
1. Extract new allowed keys
2. POST to mock gateway (existing behavior)
3. **NEW:** Call `await configStore.setConfig({mcp_gw_client_id, mcp_gw_public_url, mcp_scope})`
4. Return both gateway response + configStore confirmation

**Code location:** `banking_api_server/routes/mcpGatewayConfig.js` line 270–306, extend the try/catch block.

### Risk: Field Name Misalignment

**Risk:** UI form field names don't match configStore keys or BFF route allowlist.

**Mitigation:** Use snake_case for all configStore keys:
- UI form state: `pingOneResourceId` (camelCase in React state)
- Request body sent to BFF: camelCase (as per existing pattern in pushForm)
- BFF allowlist: lowercase with underscores (`mcp_gw_client_id`)
- configStore keys: snake_case (`mcp_gw_client_id`)
- Mapping is explicit in BFF route line 260–265

**Current pattern (McpGatewayConfig.jsx):**
```javascript
// Form state uses camelCase (line 115–124)
gatewayResourceUri: c.gatewayResourceUri || "",
mcpOlbWsUrl: c.upstreamMcpUrl || "",
// ... POST body uses same camelCase keys
body: JSON.stringify(pushForm)
```

**For Phase 264 new fields, follow the same pattern:**
- React state: `pingOneResourceId` (camelCase)
- Request body: `pingOneResourceId` (camelCase)
- BFF allowlist: accept camelCase `pingOneResourceId`
- Map camelCase → snake_case in BFF before calling configStore.setConfig()

### Risk: Optional PingOne Config Missing

**Risk:** User hasn't set `PINGONE_ENVIRONMENT_ID` → auto-derived fields show placeholders → form incomplete.

**Mitigation:** Per CONTEXT.md D-06, show callout: "Set your PingOne Environment ID in Configuration first" with `/config` link. Wizard Step 1 includes this guard.

### Risk: RFC 9728 Header Format Validation

**Risk:** `WWW-Authenticate` header format doesn't match RFC 9728 exactly → client-facing discovery fails.

**Mitigation:** Use exact format from CONTEXT.md D-16:
```
Bearer realm="PingOne", resource_metadata="<MCP_GW_RESOURCE_URI>/.well-known/mcp-server"
```

Not:
```
Bearer realm="PingOne", resource_metadata="<MCP_GW_RESOURCE_URI>/.well-known/oauth-protected-resource"
```

**Current code:** GatewayServer.sendUnauthorized() (line 485) uses `/oauth-protected-resource` endpoint. authorizeMcpRequest.ts should construct the same URI for consistency.

---

## Code Examples

### GET Response (BFF Extension)

**Current (lines 188–206):**
```javascript
const cfg = {
    // Mock gateway fields
    gatewayResourceUri: ...,
    upstreamMcpUrl: ...,
    // ... more fields
    
    // Real PingGateway mcp.json fields
    pingOneEnvUrl:    `https://auth.pingone.${region}/${envId}`,
    pingOneResourceId: ...,
    gatewayPublicUrl:  ...,
    mcpScope: 'test',
};
```

**Phase 264 enhancement:**
```javascript
const cfg = {
    // Existing fields...
    
    // DERIVED for pre-fill
    pingOneEnvUrl:     `https://auth.pingone.${region}/${envId}`,
    pingOneResourceId: process.env.MCP_GW_CLIENT_ID || configStore.getEffective('mcp_gw_client_id') || '',
    gatewayPublicUrl:  (process.env.MCP_GW_RESOURCE_URI || '').replace(/\/mcp$/, '') || 'https://ig.example.com:8443',
    upstreamMcpUrl:    configStore.getEffective('mcp_server_url') || 'http://localhost:8000',
    mcpScope:          configStore.getEffective('mcp_scope') || 'banking:mcp:invoke',
    
    // NEW: Computed endpoint
    introspectEndpoint: `${pingOneEnvUrl}/as/introspect`,
};

res.json({
    // ... existing fields
    config: cfg,  // Already includes new fields now
});
```

[VERIFIED: banking_api_server/routes/mcpGatewayConfig.js]

### POST Request Handling (BFF Extension)

**Current (lines 250–306):** HTTP POST to mock gateway only.

**Phase 264 addition:**
```javascript
router.post('/config', async (req, res) => {
    const allowed = [
        // Existing...
        'gatewayResourceUri', 'mcpOlbWsUrl',
        // NEW for Phase 264
        'mcp_gw_client_id',
        'mcp_gw_public_url',
        'mcp_scope',
    ];
    
    const updates = {};
    for (const key of allowed) {
        if (key in (req.body || {})) {
            updates[key] = req.body[key];
        }
    }
    
    // 1. POST to mock gateway (existing behavior, in-memory)
    const response = await fetch(`/admin/config`, { method: 'POST', body: JSON.stringify(updates) });
    
    // 2. NEW: Persist new keys to configStore (survives restart)
    const configStoreUpdates = {};
    if ('mcp_gw_client_id' in updates) configStoreUpdates['mcp_gw_client_id'] = updates['mcp_gw_client_id'];
    if ('mcp_gw_public_url' in updates) configStoreUpdates['mcp_gw_public_url'] = updates['mcp_gw_public_url'];
    if ('mcp_scope' in updates) configStoreUpdates['mcp_scope'] = updates['mcp_scope'];
    
    if (Object.keys(configStoreUpdates).length > 0) {
        await configStore.setConfig(configStoreUpdates);
    }
    
    res.json({ ok: true, pushed: updates, gatewayConfig: response.body.config });
});
```

[VERIFIED: banking_api_server/routes/mcpGatewayConfig.js lines 250–306]

### Mock Gateway 401 Header (authorizeMcpRequest.ts Extension)

**Current (lines 112–125):**
```typescript
res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': 'Bearer error="invalid_token", error_description="Token is revoked or no longer active"',
});
```

**Phase 264 update:**
```typescript
const resourceMetadata = `${this.config.gatewayResourceUri}/.well-known/mcp-server`;
const wwwAuth = [
    `Bearer realm="PingOne"`,
    `resource_metadata="${resourceMetadata}"`,
    `error="invalid_token"`,
    `error_description="Token is revoked or no longer active"`,
].join(', ');
res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': wwwAuth,
});
```

[VERIFIED: banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts lines 112–125, 137–145]

### Mock Gateway 403 Header (authorizeMcpRequest.ts Extension)

**Current (lines 163–187):** No WWW-Authenticate header on 403 DENY.

**Phase 264 addition:**
```typescript
if (authzDecision.decision !== 'PERMIT') {
    setAuditHeader(res);
    const statusCode = authzDecision.decision === 'INDETERMINATE' ? 403 : 403;
    const resourceMetadata = `${config.gatewayResourceUri}/.well-known/mcp-server`;
    const wwwAuth = [
        `Bearer realm="PingOne"`,
        `resource_metadata="${resourceMetadata}"`,
        authzDecision.decision === 'INDETERMINATE'
            ? `error="insufficient_scope"` // or "authorization_pending"
            : `error="insufficient_scope"`,
        `error_description="${authzDecision.reason || 'Request denied by policy'}"`,
    ].join(', ');
    
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': wwwAuth,
    });
    res.end(JSON.stringify({...}));
    return;
}
```

[VERIFIED: banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts lines 163–187]

---

## Test Implementation Notes

### BFF Route Tests (New)

**File to create:** `banking_api_server/tests/mcpGatewayConfig.test.js`

**Test cases:**
```javascript
describe('GET /api/admin/mcp-gateway/config', () => {
    it('returns 5 new fields: pingOneEnvUrl, pingOneResourceId, gatewayPublicUrl, upstreamMcpUrl, mcpScope', async () => {
        const res = await request.get('/api/admin/mcp-gateway/config');
        expect(res.body.config).toHaveProperty('pingOneEnvUrl');
        expect(res.body.config).toHaveProperty('pingOneResourceId');
        expect(res.body.config).toHaveProperty('gatewayPublicUrl');
        expect(res.body.config).toHaveProperty('upstreamMcpUrl');
        expect(res.body.config).toHaveProperty('mcpScope');
        expect(res.body.config).toHaveProperty('introspectEndpoint');
    });
    
    it('derives pingOneEnvUrl from environment_id + region', async () => {
        // Mock configStore to return test env id and region
        // Assert pingOneEnvUrl = 'https://auth.pingone.com/<envId>'
    });
    
    it('includes introspectEndpoint as pingOneEnvUrl + /as/introspect', async () => {
        // Assert introspectEndpoint matches pattern
    });
});

describe('POST /api/admin/mcp-gateway/config', () => {
    it('accepts new allowlist keys: mcp_gw_client_id, mcp_gw_public_url, mcp_scope', async () => {
        const res = await request.post('/api/admin/mcp-gateway/config').send({
            mcp_gw_client_id: 'test-client-id',
            mcp_gw_public_url: 'https://ig.example.com:8443',
            mcp_scope: 'banking:mcp:invoke',
        });
        expect(res.status).toBe(200); // or 201
        expect(res.body.pushed).toHaveProperty('mcp_gw_client_id');
    });
    
    it('persists new fields to configStore', async () => {
        // Mock configStore.setConfig
        // POST request with new fields
        // Assert configStore.setConfig was called with the right keys
    });
    
    it('rejects keys not in allowlist', async () => {
        const res = await request.post('/api/admin/mcp-gateway/config').send({
            random_field: 'should-be-ignored',
        });
        expect(res.body.pushed).not.toHaveProperty('random_field');
    });
});
```

[VERIFIED: banking_api_server/tests/ — similar patterns in existing test files]

### Mock Gateway WWW-Authenticate Tests (New)

**File to update:** `banking_mcp_gateway/tests/gateway-auth.test.ts`

**Test cases:**
```typescript
describe('authorizeMcpRequest — RFC 9728 WWW-Authenticate header', () => {
    it('includes WWW-Authenticate on 401 invalid_token', async () => {
        const middleware = buildAuthorizeMcpRequest(config);
        const { res, ended } = mockReqRes();
        
        // Mock introspection to return inactive token
        await middleware(
            'invalid_token',
            mcpBody('tools/list'),
            mockReq,
            res,
            async () => { /* should not forward */ }
        );
        
        const writeHeadCall = (res.writeHead as jest.Mock).mock.calls[0];
        expect(writeHeadCall[0]).toBe(401);
        expect(writeHeadCall[1]['WWW-Authenticate']).toMatch(/Bearer realm="PingOne"/);
        expect(writeHeadCall[1]['WWW-Authenticate']).toMatch(/resource_metadata=/);
    });
    
    it('includes WWW-Authenticate on 403 authorization denied', async () => {
        // Mock Authorize to return DENY
        const middleware = buildAuthorizeMcpRequest(config);
        
        await middleware(
            validToken,
            mcpBody('tools/call'),
            mockReq,
            res,
            async () => { /* should not forward */ }
        );
        
        const writeHeadCall = (res.writeHead as jest.Mock).mock.calls.find(
            (call: unknown[]) => (call[0] as number) === 403
        );
        expect(writeHeadCall).toBeDefined();
        expect(writeHeadCall[1]['WWW-Authenticate']).toMatch(/Bearer realm="PingOne"/);
        expect(writeHeadCall[1]['WWW-Authenticate']).toMatch(/resource_metadata=/);
    });
});
```

[VERIFIED: banking_mcp_gateway/tests/gateway-auth.test.ts — existing test structure]

---

## State of the Art

| Aspect | Current Approach | Phase 264 Enhancement |
|--------|------------------|----------------------|
| **Config page layout** | Tabbed interface (mock, real, env vars) | Add 4th tab (docs); Real tab becomes guided wizard |
| **Form fields** | Existing push form (7 fields, mock gateway only) | New route config form (5 fields, persisted) |
| **Pre-fill** | Manual env var lookup | Auto-derive all fields from configStore |
| **Gateway compliance** | Basic HTTP proxy + auth pipeline | Add RFC 9728 resource_metadata header |
| **Persistence** | Mock gateway in-memory only | New fields persisted to configStore |
| **JSON export** | Copy button (text to clipboard) | Copy + Download buttons |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `configStore.getEffective()` reads from env vars first, then SQLite | configStore Patterns | If env vars are not prioritized, config overrides will fail silently |
| A2 | POST `/api/admin/mcp-gateway/config` already has HTTP request guard for the mock gateway | Current POST Allowlist | Phase 264 must handle errors gracefully when persisting to configStore while gateway POST succeeds |
| A3 | New fields `mcp_gw_client_id`, `mcp_gw_public_url`, `mcp_scope` are NOT in SECRET_KEYS and do not require encryption | configStore Patterns | If treated as secrets, encryption overhead is unnecessary but harmless |
| A4 | Test runner is Jest in both `banking_api_server` and `banking_mcp_gateway` | Existing Test Infrastructure | If different test runners are used, test structure and commands will differ |
| A5 | `configStore.setConfig()` does not throw on unknown keys — it silently skips them | configStore Patterns | If strict validation fails, need to pre-filter keys before calling setConfig |

---

## Open Questions

1. **Second response body for POST?**
   - Should POST `/api/admin/mcp-gateway/config` return both the gateway response AND a confirmation of configStore persistence?
   - Current response: `{ ok: true, pushed: updates, gatewayConfig: response.body.config }`
   - Recommendation: Extend to include `{ ..., persisted: configStoreUpdates }`

2. **Config validation on the UI?**
   - Should the route config form validate that `pingOneResourceId` and `gatewayPublicUrl` are non-empty before allowing Save?
   - Current: Form allows Save, server rejects if allowlist keys are missing
   - Recommendation: Add client-side validation badge per CONTEXT.md D-05 (yellow "Required" badge on empty fields)

3. **Fallback when introspection endpoint is not set?**
   - If `pingone_environment_id` is not set, introspectEndpoint will be `https://auth.pingone.undefined/as/introspect`
   - Recommendation: Show placeholder or error state per D-06 (callout with `/config` link)

---

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | Jest |
| Config files | `banking_api_server/jest.config.js`, `banking_mcp_gateway/jest.config.js` |
| Quick run | `npm test` (per package.json script) |
| Full suite | `npm run test:all` in banking_api_server; `npm test` in banking_mcp_gateway |

### Phase Requirements → Test Map

| Feature | Behavior | Test Type | Automated Command | Existing File? |
|---------|----------|-----------|-------------------|---|
| GET `/api/admin/mcp-gateway/config` — new fields present | Response includes 5 new fields | unit | `npm test -- mcpGatewayConfig.test.js` | ❌ Wave 0 |
| POST `/api/admin/mcp-gateway/config` — accept new allowlist keys | New keys in allowlist, persisted to configStore | unit | `npm test -- mcpGatewayConfig.test.js` | ❌ Wave 0 |
| Mock gateway 401 response — RFC 9728 header | `WWW-Authenticate` includes `resource_metadata` | unit | `npm test -- gateway-auth.test.ts` | ✅ Exists (extend) |
| Mock gateway 403 response — RFC 9728 header | `WWW-Authenticate` includes `resource_metadata` | unit | `npm test -- gateway-auth.test.ts` | ✅ Exists (extend) |
| UI form renders route config fields | Form displays all 6 fields + labels + hints | manual | `npm run build` in banking_api_ui | ✅ Exists (extend) |

### Sampling Rate
- **Per task commit:** `npm test -- mcpGatewayConfig.test.js` (new BFF tests) + `npm test -- gateway-auth.test.ts` (mock gateway tests)
- **Per wave merge:** Full `npm test` in both banking_api_server and banking_mcp_gateway
- **Phase gate:** `npm run build` in banking_api_ui exits 0 + all BFF/gateway tests pass

### Wave 0 Gaps
- [ ] `banking_api_server/tests/mcpGatewayConfig.test.js` — GET/POST response fields and persistence
- [ ] `banking_mcp_gateway/tests/gateway-auth.test.ts` — extend with WWW-Authenticate header tests for 401/403

---

## Project Constraints (from CLAUDE.md)

1. **Read REGRESSION_PLAN.md §1 before editing:** No regression items list `mcpGatewayConfig.js` or `authorizeMcpRequest.ts`, so no explicit do-not-break list. However:
   - Existing form push pattern must remain functional
   - GET response must remain backward-compatible (add fields, don't remove)
   - POST allowlist extension must not break existing keys

2. **Minimal diff:** Name the component/element, don't refactor unrelated code.
   - Don't reorganize existing form fields
   - Don't rename existing `mgc-*` classes
   - Only add new CSS classes when needed

3. **After `banking_api_ui` UI edit:** `npm run build` must exit 0.

4. **Bug fixes:** Add entry to REGRESSION_PLAN.md §4 if bugs are discovered in files you already had to change.

5. **Non-negotiable non-editorial files:** `/marketing` pages not touched (not in scope).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer token validation (existing GatewayTokenPolicy) |
| V3 Session Management | no | Not applicable (stateless JWT) |
| V4 Access Control | yes | PingOne Authorize policy evaluation (existing) + RFC 9728 resource awareness |
| V5 Input Validation | yes | JSON-RPC format, field allowlist on POST |
| V6 Cryptography | no | No new encryption (existing configStore handles secrets) |

### Known Threat Patterns for MCP Gateway

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Spoofed authorization server | Spoofing | Validate token `iss` claim against known PingOne issuer (existing) |
| Token substitution (wrong audience) | Tampering | Validate `aud` matches gateway resource URI (existing GatewayTokenPolicy) |
| Bearer token in logs | Information Disclosure | Ensure exchanged tokens are not logged; original bearer never reaches upstream (existing D-04) |
| Malformed JSON-RPC DoS | Denial of Service | Validate JSON-RPC format early; reject invalid requests (existing McpValidationFilter) |

**New in Phase 264:** RFC 9728 `resource_metadata` header signals to clients that this gateway owns the protected resource claim, preventing token confusion attacks.

---

## Sources

### Primary (HIGH confidence)

- **banking_api_server/routes/mcpGatewayConfig.js** — GET response structure (lines 176–244), POST allowlist and handler (lines 250–306)
- **banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts** — 401/403 response paths (lines 104–187)
- **banking_mcp_gateway/src/server/GatewayServer.ts** — `sendUnauthorized()` helper and POST /mcp handler (lines 483–497, 308–370)
- **banking_api_ui/src/components/McpGatewayConfig.jsx** — Form pattern, CSS classes, state management (lines 1–361)
- **banking_api_server/services/configStore.js** — `getEffective()` and `setConfig()` patterns (lines 450–578, 350–395)

### Secondary (MEDIUM confidence)

- **banking_api_server/tests/** — Jest test patterns (oauth-endpoint-config.test.js, tokenUtils.test.js)
- **banking_mcp_gateway/tests/** — Jest + supertest patterns (gateway-auth.test.ts, gateway-server.test.ts)

### Design Spec

- **264-UI-SPEC.md** — UI design contract (approved spacing, typography, colors, new elements)
- **264-CONTEXT.md** — Phase decisions D-01 through D-21 (canonical requirements)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Existing patterns well-established, code is stable
- Architecture: HIGH — Multi-layer responsibility clear (UI → BFF → configStore; gateway auth pipeline)
- Pitfalls: MEDIUM — Only risk is persistence disconnect (mitigated by explicit configStore.setConfig call)
- Test patterns: HIGH — Jest infrastructure exists; new test cases follow established patterns

**Research date:** 2026-05-02  
**Valid until:** 2026-05-30 (stable domain, no major library updates expected)

**Assessment:** Phase is well-scoped, dependencies are internal, no blocking unknowns. Planner can proceed with confidence.

---

*Phase: 264-do-we-need-a-config-page-for-mcp-gateway-so-show-and-configu*  
*Research complete: 2026-05-02*
