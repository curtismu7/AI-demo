# TODO: Create Comprehensive PingOne Apps × Resources × Scopes Matrix

## Problem Statement

Currently tracking PingOne app/resource/scope configuration across multiple scattered documents:
- `docs/PINGONE_APP_SCOPE_MATRIX.md` - Apps and app-level scopes
- `SCOPE_AUDIT_REPORT.md` - Abstract scope requirements
- `.planning/debug/pingone-scope-configuration-actual-vs-required.md` - Actual vs required (debug)
- Various `.planning/debug/*.md` files with partial info

**Missing:** Single, authoritative table showing:
- Resource names + URIs
- Which apps connect to which resources  
- Which scopes exist on each resource
- Which scopes each app has been granted access to

## Immediate Question

User reports: "My PingOne app is getting `agent:invoke` from resource 'Super Banking Agent gateway'"

**Need to clarify:**
- Is "Super Banking Agent gateway" a real/current resource name?
- Should it be "Super Banking API" or "Super Banking MCP Server" instead?
- Is `agent:invoke` the correct or legacy scope name?
- (We standardized to `banking:ai:agent:read` in Phase 69.1)

## Proposed Solution

Create **`docs/PINGONE_RESOURCES_AND_SCOPES_MATRIX.md`** with:

### Table 1: Resource Servers
| Resource Name | URI | Custom | Scopes Defined | Purpose |
|---|---|---|---|---|
| Main Banking API | `https://resource.pingdemo.com` or similar | ✓ | `banking:*`, `ai_agent`, etc. | User login + token exchange |
| MCP Server | `https://mcp-resource.pingdemo.com` or similar | ✓ | `admin:*`, `users:*`, `banking:*` | MCP server resource |
| PingOne API | `https://api.pingone.com` | OIDC built-in | `p1:read:*`, `p1:update:*`, etc. | Management API |

### Table 2: Applications × Resources × Scopes

| Application | Client ID Env | Resource Server | Scopes Granted | Purpose |
|---|---|---|---|---|
| Super Banking Admin App | `admin_client_id` | Main Banking API | `banking:admin` + all | Staff login + token exchange |
| Super Banking User App | `user_client_id` | Main Banking API | `banking:ai:agent:read` + read/write | Customer login + 2-exchange |
| Worker App | `pingone_client_id` | PingOne API | `p1:read:user`, `p1:update:user` | Management API |
| Agent MCP Exchanger | `AGENT_OAUTH_CLIENT_ID` | MCP Server | `banking:ai:agent:read` + admin scopes | Token exchange for MCP |

### Table 3: Scope Reference (by Resource)
- Main Banking API scopes
- MCP Server scopes  
- PingOne API scopes

## Why This Matters

1. **Debugging:** Makes it crystal clear which scopes come from which resource
2. **Onboarding:** New team members see the full picture in one place
3. **Verification:** Can compare actual PingOne config against this matrix
4. **Prevents regressions:** Can spot if scope moved to wrong resource

## Files to Read Before Implementation

- `docs/PINGONE_APP_SCOPE_MATRIX.md` (current app-level doc)
- `SCOPE_AUDIT_REPORT.md` (scope audit)
- `docs/PINGONE_NAMING_STANDARDIZATION_AUDIT.md` (Phase 69.1 - scope names)
- `CHANGELOG.md` (history of resource/app changes)
- `.env.example` files (shows current env var structure)

## Acceptance Criteria

- [ ] New doc created: `docs/PINGONE_RESOURCES_AND_SCOPES_MATRIX.md`
- [ ] Table 1: All resource servers clearly listed with URIs
- [ ] Table 2: Apps × Resources × Scopes cross-reference
- [ ] Clarification: Is "Super Banking Agent gateway" real or legacy?
- [ ] Backward compatibility: Existing `PINGONE_APP_SCOPE_MATRIX.md` updated to reference this new doc
- [ ] Code sources cited: Show where these config values come from (env var, code file, line #)

## Related Issues / Context

- User's immediate concern: "Is `agent:invoke` from 'Super Banking Agent gateway' correct?"
- Phase 69.1 standardized scopes to `banking:ai:agent:read` (not `agent:invoke`)
- Phase 101 code fix changed validation from `agent:invoke` → `banking:ai:agent:read`
- Token scope logging (commit `5a4519a`) now shows actual scopes in token
