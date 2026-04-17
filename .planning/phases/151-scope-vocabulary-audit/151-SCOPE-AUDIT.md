# Phase 151 — Scope Vocabulary Audit

## 1. Canonical Scope Registry (`banking_api_server/config/scopes.js`)

| Scope String | Constant | Description |
|---|---|---|
| `banking:read` | `BANKING_SCOPES.BANKING_READ` | Read access to banking data |
| `banking:write` | `BANKING_SCOPES.BANKING_WRITE` | Write access to banking data |
| `banking:admin` | `BANKING_SCOPES.ADMIN` | Administrative access |
| `banking:sensitive` | `BANKING_SCOPES.SENSITIVE` | Sensitive data access |
| `banking:ai:agent` | `BANKING_SCOPES.AI_AGENT` | AI agent scope |
| `ai_agent` | `BANKING_SCOPES.AI_AGENT_MARKER` | Agent identity marker |

### Deprecated Compound Scopes (scopes.js COMPOUND_SCOPES)

| Scope String | Maps To |
|---|---|
| `banking:accounts:read` | `banking:read` |
| `banking:transactions:read` | `banking:read` |
| `banking:transactions:write` | `banking:write` |

### User Type Scope Assignments (scopes.js USER_TYPE_SCOPES)

| User Type | Scopes |
|---|---|
| admin | banking:read, banking:write, banking:admin, banking:sensitive, banking:ai:agent |
| customer | banking:read, banking:write, banking:sensitive |
| readonly | banking:read |
| ai_agent | banking:read, banking:write, banking:ai:agent, ai_agent |

---

## 2. Cross-Module Scope Reference Matrix

### banking_api_server

| File | Scopes Used | Issue? |
|---|---|---|
| `config/scopes.js` | All canonical + compound (defines them) | ✅ Source of truth |
| `SCOPE_AUTHORIZATION.md` | Compound scopes in route examples | ⚠️ Docs show deprecated compounds |
| `SCOPE_VOCABULARY.md` | Canonical registry | ✅ Aligned |
| `src/__tests__/standardizationValidation.test.js` | Compound→canonical mapping | ✅ Tests deprecation path |

### banking_mcp_server

| File | Scopes Used | Issue? |
|---|---|---|
| `src/tools/toolScopeMap.ts` | `banking:read`, `banking:write` | ✅ Canonical |
| `src/tools/BankingToolRegistry.ts` | `banking:accounts:read`, `banking:transactions:read/write`, `banking:sensitive:read` | ❌ **Uses deprecated compounds** |
| `src/tools/AuthorizationChallengeHandler.ts` | `banking:accounts:read`, `banking:transactions:read/write` | ❌ **Uses deprecated compounds** |
| `src/server/BankingMCPServer.ts` | `banking:accounts:read`, `banking:transactions:read/write`, `banking:sensitive:read` | ❌ **Uses deprecated compounds** |
| `src/server/HttpMCPTransport.ts` | `banking:accounts:read`, `banking:transactions:read/write`, `banking:sensitive:read` | ❌ **Uses deprecated compounds** |
| `src/auth/AuthorizationRequestGenerator.ts` | `banking:accounts:read`, `banking:transactions:read/write`, `banking:read`, `banking:write` | ⚠️ **Mixed — both canonical and compound** |
| `src/server/AuthenticationIntegration.ts` | `banking:accounts:read banking:transactions:read banking:transactions:write` | ❌ **Hardcoded compound scope string** |

### banking_api_ui

| File | Scopes Used | Issue? |
|---|---|---|
| `src/config/agentMcpScopes.js` | `banking:general:read`, `banking:general:write`, `banking:admin`, `banking:sensitive`, `banking:ai:agent`, `ai_agent` | ⚠️ **`banking:general:read/write` not in canonical list** |
| `src/hooks/useResourceIndicators.js` | `banking:read`, `banking:write`, `transactions:read`, `accounts:read`, `ai:act`, `ai:read`, `ai:write`, `agent:manage` | ❌ **Mock data — non-standard scopes** (`transactions:read` missing `banking:` prefix; `ai:act/read/write` and `agent:manage` don't exist) |
| `src/services/__tests__/oauth-ui-integration.test.js` | `banking:admin`, `banking:read` | ✅ Canonical |
| `src/components/Transactions.js` | `ai_agent` (client type check) | ✅ Identity marker usage |
| `src/components/BankingAdminOps.js` | `banking:ai:agent:read` (in UI string) | ⚠️ **Non-standard — likely typo** (should be `banking:ai:agent`) |
| `tests/e2e/customer-dashboard.spec.js` | `banking:transactions:read` | ⚠️ **Uses deprecated compound** |

### Postman

| File | Scopes Used | Issue? |
|---|---|---|
| `Super-Banking-PingOne-Test.postman_collection.json` | Scope endpoints (test/scopes, update-scopes, etc.) | ✅ Calls scope APIs, doesn't hardcode values |
| `Super-Banking-Local.postman_environment.json` | `banking:read banking:write banking:mcp:invoke` (`mcpTokenExchangeScopes`) | ⚠️ **`banking:mcp:invoke` not in canonical list** |
| `PingOne Authorization Code — pi.flow.postman_collection.json` | `{{scope}}` variable | ✅ Parameterized |

---

## 3. Issues Found

### CRITICAL — MCP Server compound scope divergence

The `banking_mcp_server` has **two parallel scope systems**:

- **toolScopeMap.ts** uses canonical scopes (`banking:read`, `banking:write`) ✅
- **BankingToolRegistry.ts** uses deprecated compounds (`banking:accounts:read`, `banking:transactions:read/write`, `banking:sensitive:read`) ❌

These coexist in the same server. When a tool is registered, `BankingToolRegistry` declares `requiredScopes: ['banking:accounts:read']` but `toolScopeMap` would map that same tool to `['banking:read']`. This creates a dual-scope path that works only because the BFF's `scopes.js` maps compounds → canonical at token validation time.

**Risk:** If PingOne RS is configured only with canonical scopes, compound scope strings in token exchange requests (from AuthenticationIntegration.ts hardcoded `scope: 'banking:accounts:read banking:transactions:read banking:transactions:write'`) would be rejected.

**Files to fix (6):**
1. `banking_mcp_server/src/tools/BankingToolRegistry.ts` — Replace compound → canonical in `requiredScopes`
2. `banking_mcp_server/src/tools/AuthorizationChallengeHandler.ts` — Replace compound scope descriptions
3. `banking_mcp_server/src/server/BankingMCPServer.ts` — Replace compound scope arrays
4. `banking_mcp_server/src/server/HttpMCPTransport.ts` — Replace compound scope arrays
5. `banking_mcp_server/src/auth/AuthorizationRequestGenerator.ts` — Remove compound scopes, keep canonical
6. `banking_mcp_server/src/server/AuthenticationIntegration.ts` — Replace hardcoded compound scope string

### MODERATE — UI non-standard scopes

| Location | Non-standard Scope | Action |
|---|---|---|
| `agentMcpScopes.js` | `banking:general:read`, `banking:general:write` | Align with canonical `banking:read`, `banking:write` or add to canonical list |
| `useResourceIndicators.js` | `transactions:read`, `accounts:read`, `ai:act`, `ai:read`, `ai:write`, `agent:manage` | Fix mock data to use real scopes |
| `BankingAdminOps.js` | `banking:ai:agent:read` | Fix typo → `banking:ai:agent` |

### LOW — Documentation uses deprecated compounds

`SCOPE_AUTHORIZATION.md` route examples show `banking:accounts:read` etc. Should be updated after code migration.

### LOW — Postman non-canonical scope

`Super-Banking-Local.postman_environment.json` has `banking:mcp:invoke` — not in canonical registry. Either add to canonical scopes or remove from environment.

---

## 4. Recommendations

### Priority 1 — Standardize MCP server (6 files)
Migrate all MCP server files from compound → canonical scopes. The `toolScopeMap.ts` pattern is correct; align `BankingToolRegistry.ts` and auth files to match.

### Priority 2 — Fix UI mock/config scopes (3 files)
Correct `useResourceIndicators.js` mock data, align `agentMcpScopes.js` labels, fix `BankingAdminOps.js` typo.

### Priority 3 — Update documentation (1 file)
Refresh `SCOPE_AUTHORIZATION.md` examples to use canonical scopes after code migration.

### Priority 4 — Postman environment (1 file)
Decide whether `banking:mcp:invoke` is a real scope to register or remove from environment.

---

## 5. Scope Alignment Summary

| Scope | scopes.js | toolScopeMap | BankingToolRegistry | UI agentMcpScopes | Postman env |
|---|---|---|---|---|---|
| `banking:read` | ✅ | ✅ | ❌ (uses compound) | ❌ (`general:read`) | ✅ |
| `banking:write` | ✅ | ✅ | ❌ (uses compound) | ❌ (`general:write`) | ✅ |
| `banking:admin` | ✅ | — | — | ✅ | — |
| `banking:sensitive` | ✅ | — | ❌ (`sensitive:read`) | ✅ | — |
| `banking:ai:agent` | ✅ | — | — | ✅ | — |
| `ai_agent` | ✅ | — | — | ✅ | — |
| `banking:mcp:invoke` | ❌ | — | — | — | ⚠️ present |
