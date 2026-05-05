---
phase: "264"
slug: mcp-gateway-config-page-enhancement
reviewed_by: [opencode (kimi-k2.5)]
date: 2026-05-05
plans_reviewed: [264-01-PLAN.md, 264-02-PLAN.md, 264-03-PLAN.md]
verdict: MEDIUM risk — sound plans, minor corrections needed before execution
---

# Phase 264 — Peer Plan Review

> Independent review by opencode (kimi-k2.5). Claude (self-review) skipped.

---

## Plan 264-01 — BFF Route Extension

### PASS items
- `configStore.setRaw()` confirmed correct for non-FIELD_DEFS keys ✓
- `introspectEndpoint` derivation (`pingOneEnvUrl + '/as/introspect'`) matches PingOne OAuth2 spec ✓
- All 6 new GET fields are additive — no conflicts with existing cfg keys ✓
- Test structure covers the main behaviors ✓

### FLAG: Persistence timing
The plan persists new keys to configStore AFTER the gateway HTTP call succeeds. If the mock gateway isn't running (common in dev), POST will fail with 502 and config won't be persisted — even though all form values are valid and user clicked "Save to Config."

**Recommendation:** Consider persisting to configStore first (or unconditionally), then attempting the gateway push separately. If that's out of scope for this phase, at minimum: UI should show a helpful message distinguishing "config saved, gateway unreachable" from "save failed."

### FLAG: Missing test cases
- No test for: gateway call fails but what happens to configStore state?
- No test for: persisted values returned on subsequent GET

---

## Plan 264-02 — Mock Gateway RFC 9728 Header

### PASS items
- `Bearer realm="PingOne", resource_metadata="..."` is the correct RFC 9728 format ✓
- Appending new describe block to gateway-auth.test.ts is safe — won't interfere with existing sections ✓
- 403 with WWW-Authenticate is acceptable (RFC 9728 is silent on 403; consistent with real PingGateway behavior) ✓
- The reviewer noted RFC 9728 tests already exist in gateway-auth.test.ts Section 5 — verify no duplication

### No blocking issues found.

---

## Plan 264-03 — UI: Docs Tab + 5-Step Wizard

### FLAG: `pingOneEnvID` value in buildLiveMcpJson
The plan builds the live mcp.json `properties.pingOneEnvID` using `data.config.pingOneEnvUrl`:

```javascript
properties: {
  pingOneEnvID: data.config.pingOneEnvUrl || '',  // uses URL, not the actual env ID
```

PingGateway 2025.11.1 schema expects `pingOneEnvID` to be the PingOne Environment UUID (e.g., `abc-123`), not the full auth URL. The auth URL goes elsewhere (introspect endpoint, token endpoint).

**Resolution options:**
1. Add `pingOneEnvID` as a separate field in the backend GET response (just the raw UUID from `pingone_environment_id`)
2. OR confirm that PingGateway's mcp.json `pingOneEnvID` property actually accepts the full auth URL — in which case the plan is correct

Executor must verify the PingGateway 2025.11.1 mcp.json schema before implementing.

### FLAG: Wave 2 defensive fallback
If 264-03 is deployed without 264-01 running first, `data.config.introspectEndpoint` will be undefined. The plan doesn't add a fallback.

**Recommendation:** Add fallback in the introspectEndpoint display:
```javascript
value={config.introspectEndpoint || (config.pingOneEnvUrl ? `${config.pingOneEnvUrl}/as/introspect` : "")}
```

### FLAG: Emoji policy
CLAUDE.md §0 says "No emojis in UI text. Banking apps are professional." The plan includes emojis in:
- Tab label: "📖 Docs & Setup"
- Buttons: "⬆ Save to Config", "⬇ Download mcp.json"
- Step status indicators: "✓", "⚠"

The existing McpGatewayConfig.jsx already uses emoji tab labels ("🛡️ Mock Gateway", "🔐 Real PingGateway"), so this isn't new. Executor should flag this to the user and follow the existing pattern (keep emojis consistent with existing tabs, or remove from all tabs).

### PASS items
- React state pattern (routeForm spread updates, useEffect seeding) is idiomatic ✓
- CSS append-only approach is safe — no conflict with existing mgc-* classes ✓
- Field name mapping (backend `gatewayPublicUrl` → UI `gatewayUrl` → POST `mcp_gw_public_url`) is correctly threaded ✓
- `handleDownloadMcpJson` Blob+createObjectURL pattern is correct ✓

---

## Cross-Plan Assessment

### Sequencing: CORRECT
- 264-01 and 264-02 can execute in parallel (wave 1, no dependencies between them)
- 264-03 must follow 264-01 (wave 2)

### Integration gap: field name chain
The reviewer confirms this chain is consistent through all 3 plans:
```
backend GET cfg.gatewayPublicUrl → UI seeds routeForm.gatewayUrl → POST sends mcp_gw_public_url
```
No data loss — names change across layers but mapping is explicit.

### Missing integration test
No test exercises the full round-trip: POST new keys → verify GET returns persisted values on next load. Worth adding if the test setup allows it.

---

## Ranked Risk Table

| Rank | Risk | Plan | Action |
|------|------|------|--------|
| 1 | `pingOneEnvID` property value semantics (URL vs UUID) | 264-03 | Executor must verify PingGateway schema before buildLiveMcpJson |
| 2 | Config persistence only on gateway success | 264-01 | Consider unconditional persist or split save/push operations |
| 3 | Missing `introspectEndpoint` defensive fallback | 264-03 | Add fallback expression in display field |
| 4 | Emoji policy ambiguity | 264-03 | Follow existing tab emoji pattern; flag to user |

---

## Verdict

**MEDIUM risk. Plans are sound and can proceed to execution with executor attention on:**

1. **Before implementing buildLiveMcpJson**: Check what `properties.pingOneEnvID` actually means in PingGateway 2025.11.1 mcp.json — is it the raw UUID or the auth URL? The existing `buildPingGatewayMcpJson()` function in `banking_api_server/routes/mcpGatewayConfig.js` should be the canonical reference.

2. **Add defensive fallback** in the `introspectEndpoint` display field in case 264-01 isn't yet deployed.

3. **Persistence timing** in 264-01: if this phase is being demonstrated with the mock gateway stopped, users won't be able to save config. Low priority but worth noting.

No plan needs to be rewritten — these are executor-level clarifications, not design flaws.
