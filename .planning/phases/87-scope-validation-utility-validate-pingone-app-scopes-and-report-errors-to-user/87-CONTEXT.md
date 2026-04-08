# Phase 87: Scope Validation Utility - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** User-provided PingOne resource server screenshots + PINGONE_MAY_ACT_SETUP.md reference table

## Phase Boundary

Build an interactive utility that validates PingOne resource server configurations against the canonical expected values documented in PINGONE_MAY_ACT_SETUP.md. The utility should:

1. **Resource Existence Check:** Verify all 5 required resources exist by name and ID
2. **Resource Attribute Validation:** Check resource audiences (URIs) and basic attributes
3. **Scope Validation:** Compare live PingOne resource scopes against the reference table
4. **Report:** Display which resources are correctly configured, misconfigured, or missing
5. **Suggest Fixes:** 
   - For simple scope mismatches, propose the correct scope list
   - For missing/incorrect resource names, audiences, propose the canonical values
6. **User-Initiated Fixes:** Allow users to auto-apply corrections if desired (stretch goal)

## Locked Decisions

### Resource Validation Rules

**Required Resources:** All 5 of these must exist in the PingOne environment

| Resource Name | Expected Audience | Expected Attr | Purpose |
|---|---|---|---|
| **Super Banking AI Agent** | `https://ai-agent.pingdemo.com` | TTL 3600s, auth: `Client Secret Basic` | Subject Token audience |
| **Super Banking MCP Server** | `https://mcp-server.pingdemo.com` | TTL 3600s, auth: `Client Secret Basic` | MCP Token audience, delegation expression |
| **Super Banking Agent Gateway** | `https://agent-gateway.pingdemo.com` | TTL 3600s, auth: `Client Secret Basic` | Actor token audience (no scopes) |
| **Super Banking Banking API** | `https://banking-api.pingdemo.com` | Resource server (standard) | 2-exchange output audience |
| **PingOne API** | `https://api.pingone.com` | Built-in (do not modify) | Management API access |

**Validation Steps:**
1. List all resource servers via PingOne Management API
2. For each expected resource, check:
   - ✅ Resource exists by name
   - ✅ Resource has correct audience URI (exact match)
   - ✅ Token introspection endpoint auth method is `Client Secret Basic` (if applicable)
3. Mark as **MISSING** if resource not found
4. Mark as **CONFIG_ERROR** if audience URI doesn't match
5. Mark as **AUDIT_WARNING** if auth method differs from expected

### Scope Validation Rules

Reference table from PINGONE_MAY_ACT_SETUP.md Part 1:

| Resource | Expected Scopes |
|----------|-----------------|
| **Super Banking AI Agent** | `banking:agent:invoke` |
| **Super Banking MCP Server** | `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` |
| **Super Banking Agent Gateway** | *(none — audience-only identity)* |
| **Super Banking Banking API** | `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` |

### Current State (from Screenshots)

**Correct ✓:**
- Super Banking AI Agent Service: `banking:agent:invoke`
- Super Banking Banking API: `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write`
- Super Banking MCP Server: `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write`

**Potentially Incorrect ⚠️:**
- Super Banking Agent Gateway: has `agent:invoke` but expected *(none)* — need to verify if this should be removed or kept as-is
- Super Banking MCP Gateway: has `mcp:invoke` — unclear if this should exist, be `banking:mcp:invoke`, or removed

### User Visible Output

- ✅ **Green checkmark** for correctly configured resources
- ⚠️ **Yellow warning** for mismatches
- Display both current and expected values
- Provide copy-paste-ready scope assignments for PingOne CLI (if applicable)

### Where the Utility Lives

User preference pending — likely homes:
- Embedded in `/demo-data` section (alongside token exchange demo)
- Separate `/admin` route (if admin authz already exists)
- Installable as separate Node script in `scripts/`

### Stretch Goal: Auto-Fix

If user grants permission, utility can:
- Call PingOne Management API to PATCH resource server scopes
- Requires `p1:read:resource` and `p1:update:resource` scopes on BFF client
- Show confirmation before applying changes

## Claude's Discretion

- **Scope Validation Algorithm:** SpEL-like comparison (exact match vs presence/absence check)
- **UI Framework:** React component (if in web), plain Node script (if standalone)
- **MCP Gateway Clarification:** Recommend asking user during planning if `mcp:invoke` is intentional or erroneous
- **Error Handling:** What if PingOne API call fails? (fallback to report-only mode?)
- **Caching:** Should validation results be cached or always fresh from PingOne?

## Canonical References

**MUST READ before planning:**

- [PINGONE_MAY_ACT_SETUP.md](../../docs/PINGONE_MAY_ACT_SETUP.md) — Lines 1–100 (reference table in Part 1), lines 792–889 (resource server definitions with exact scope specs)
- [CLAUDE.md](../../CLAUDE.md) — Lines 1–50 (project guidelines, BFF security, Vercel patterns)
- [pingone-api-calls skill](../../.claude/skills/pingone-api-calls/SKILL.md) — How to call PingOne Management API from BFF for resource introspection and updates

## Specific Ideas

**Technology Stack:**
- PingOne Management API for resource/scope reading (via BFF)
- React component for rendering results (if web-based)
- Table-based UI showing: Resource Name | Current Scopes | Expected Scopes | Status

**Entry Points:**
- `/demo-data` as primary (user-friendly)
- CLI script in `scripts/validate-pingone-scopes.js` as fallback

**Sample Output:**
```
Validating PingOne Resource Scopes...

✅ Super Banking AI Agent Service
   Current:  banking:agent:invoke
   Expected: banking:agent:invoke
   Status:   CORRECT

⚠️ Super Banking Agent Gateway
   Current:  agent:invoke
   Expected: (none — audience-only)
   Status:   Needs Review — scope may be incorrect

✅ Super Banking MCP Server
   Current:  banking:accounts:read, banking:transactions:read, banking:transactions:write
   Expected: banking:accounts:read, banking:transactions:read, banking:transactions:write
   Status:   CORRECT
```

## Deferred Ideas

- **Phase 2:** Validate JWT token claims (decode tokens and check `scope` array)
- **Phase 3:** Validate PingOne app grant types and token endpoint auth methods
- **Phase 4:** Validate user `mayAct` attribute presence and format
- **Phase 5:** Build live token exchange simulator with warnings

**Reason:** Phase 87 focuses on resource/scope configuration only. Token introspection and broader validation are future phases.

---

*Phase: 87 - scope-validation-utility*  
*Context gathered: 2026-04-08 via user screenshots + PINGONE_MAY_ACT_SETUP.md*
