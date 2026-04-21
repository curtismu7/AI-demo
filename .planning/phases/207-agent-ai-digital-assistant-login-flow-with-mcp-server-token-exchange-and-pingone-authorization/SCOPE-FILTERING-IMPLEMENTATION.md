# Scope-Based Tool List Filtering — Implementation Doc

**Phase:** 207 pre-work  
**Date:** 2026-04-20  
**Status:** Implemented, pending TypeScript build verification

---

## What Was Built

Scope-based `tools/list` filtering in the MCP server TypeScript codebase.
When the MCP client calls `tools/list`, the server decodes the agent token's
scope claim and returns **only the tools the token is authorized to call**.
Tools the token cannot call are hidden — the agent never sees them.

This is pure client-side filtering (no authz server call), which makes it
compatible with a future PingOne Authorize integration (PA evaluates one
request at a time; it cannot filter a list in bulk).

---

## Four Files Changed

### 1. [toolScopeMap.ts](../../../../banking_mcp_server/src/tools/toolScopeMap.ts)

**Added:** `filterToolsByScope(tools, tokenScopes)`

```typescript
export function filterToolsByScope(
  tools: BankingToolDefinition[],
  tokenScopes: string[],
): BankingToolDefinition[] {
  // No scopes decoded yet — return full list; token validation already enforced auth.
  if (tokenScopes.length === 0) return tools;

  const hasWildcard = tokenScopes.includes('*') || tokenScopes.includes('banking:*');
  if (hasWildcard) return tools;

  return tools.filter(tool =>
    tool.requiredScopes.length === 0 ||
    tool.requiredScopes.every(s => tokenScopes.includes(s)),
  );
}
```

**Logic:**
- Empty `tokenScopes` → return all tools (token was already validated upstream, no scope claim = trust)
- Wildcard `*` or `banking:*` → return all tools (admin/service token)
- Otherwise: include a tool only if **every** scope it requires is present in the token
- Tools with `requiredScopes: []` are always included (e.g. `sequential_think`, `query_user_by_email`)

**Also contains:** `getScopesForTool(toolName)` — used at tool *execution* time to narrow the RFC 8693 token exchange to the minimum scope per tool.

---

### 2. [BankingToolRegistry.ts](../../../../banking_mcp_server/src/tools/BankingToolRegistry.ts)

**Changed:** Flattened all `requiredScopes` from fine-grained internal format to coarse token format.

| Tool | Before | After |
|------|--------|-------|
| `get_my_accounts` | `banking:accounts:read` | `banking:read` |
| `get_account_balance` | `banking:accounts:read` | `banking:read` |
| `get_sensitive_account_details` | `banking:sensitive:read` | `banking:read` |
| `get_my_transactions` | `banking:transactions:read` | `banking:read` |
| `create_deposit` | `banking:transactions:write` | `banking:write` |
| `create_withdrawal` | `banking:transactions:write` | `banking:write` |
| `create_transfer` | `banking:transactions:write` | `banking:write` |
| `query_user_by_email` | `[]` | `[]` (unchanged) |
| `sequential_think` | `[]` | `[]` (unchanged) |

**Why:** PingOne tokens carry coarse scopes (`banking:read`, `banking:write`).
Fine-grained internal scopes would never match, making all tools visible to all tokens.
Flattening removes the need for any bridging logic — direct `includes()` match works.

**PingOne Authorize compatibility:** PA evaluates scope claims in flat format.
This mapping is directly compatible — no translation layer needed when PA is integrated.

---

### 3. [BankingToolProvider.ts](../../../../banking_mcp_server/src/tools/BankingToolProvider.ts)

**Added:** `getAvailableToolsForToken(tokenScopes: string[])`

```typescript
/**
 * Get tools permitted for the given token scopes (tools/list filtering).
 * Uses flat scope matching: banking:read / banking:write.
 * No authz server call — pure token introspection.
 */
getAvailableToolsForToken(tokenScopes: string[]): BankingToolDefinition[] {
  return filterToolsByScope(BankingToolRegistry.getAllTools(), tokenScopes);
}
```

**Existing method unchanged:** `getAvailableTools()` still returns all tools
(used in other contexts where unfiltered list is needed).

---

### 4. [MCPMessageHandler.ts](../../../../banking_mcp_server/src/server/MCPMessageHandler.ts)

**Updated:** `handleListTools(message, context)` — now decodes token and filters.

Before:
```typescript
// Used _context (unused), returned all tools unconditionally
const bankingTools = this.toolProvider.getAvailableTools();
```

After:
```typescript
const tokenScopes = this.decodeScopesFromToken(context.agentToken);
const bankingTools = this.toolProvider.getAvailableToolsForToken(tokenScopes);
console.log(`[MCPMessageHandler] tools/list: ${bankingTools.length} tools permitted for scopes [${tokenScopes.join(', ') || 'none'}]`);
```

**Added private method:** `decodeScopesFromToken(token?: string): string[]`

```typescript
private decodeScopesFromToken(token?: string): string[] {
  if (!token) return [];
  try {
    const parts = token.split('.');
    if (parts.length < 2) return [];
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as Record<string, unknown>;
    const scope = payload['scope'];
    if (typeof scope === 'string') return scope.split(' ').filter(Boolean);
    if (Array.isArray(scope)) return (scope as unknown[]).filter(
      (s): s is string => typeof s === 'string'
    );
    return [];
  } catch {
    return [];
  }
}
```

**Security note (in code comment):** No signature verification here — the token
was already validated at the transport boundary before reaching `handleListTools`.
This is scope *claim inspection* only, not authorization.

---

## Call Chain

```
MCP client → tools/list
  MCPMessageHandler.handleListTools(message, context)
    decodeScopesFromToken(context.agentToken)          ← reads JWT scope claim
    BankingToolProvider.getAvailableToolsForToken(scopes)
      filterToolsByScope(BankingToolRegistry.getAllTools(), scopes)
        tool.requiredScopes.every(s => tokenScopes.includes(s))
    → filtered tool list returned to client
```

---

## Behavior by Token Type

| Token scopes | Read tools (4) | Write tools (3) | No-scope tools (2) |
|---|---|---|---|
| `banking:read` only | **Visible** | Hidden | **Visible** |
| `banking:write` only | Hidden | **Visible** | **Visible** |
| `banking:read banking:write` | **Visible** | **Visible** | **Visible** |
| `banking:*` or `*` | **Visible** | **Visible** | **Visible** |
| No token / no scope claim | **Visible** | **Visible** | **Visible** |

> **No-token fallback:** When `agentToken` is absent, `decodeScopesFromToken`
> returns `[]`, and `filterToolsByScope` treats `length === 0` as "return all".
> This preserves backward compatibility with direct MCP calls that skip token exchange.

---

## What This Does NOT Do

- **Does not call the authz server** during `tools/list`. Filtering is pure token introspection.
- **Does not prevent tool execution** if the agent tries to call a hidden tool anyway.
  The existing execution-time scope check in `BankingToolProvider.executeTool` handles that.
- **Does not verify JWT signature.** Signature verification happens at the transport boundary,
  before the message reaches `MCPMessageHandler`.

---

## PingOne Authorize Compatibility

This design was explicitly shaped to be compatible with a future PingOne Authorize integration:

| Design constraint | How satisfied |
|---|---|
| PA evaluates one request at a time (no bulk) | `tools/list` filtering is client-side — no PA call |
| PA uses flat scope format | Registry uses `banking:read` / `banking:write` (flat) |
| PA APPROVED/DENIED per tool call | `executeTool` is where per-call PA decisions will be enforced |
| No short-lived PA tokens | Scope filtering uses the existing access token, no PA token needed |

When PA is integrated (future phase), it will plug into `executeTool` per-call decisions,
not into `tools/list` filtering. The `tools/list` layer remains scope-based client-side.

---

## Planning Documents

All Phase 207 docs are at:

```
.planning/phases/207-agent-ai-digital-assistant-login-flow-with-mcp-server-token-exchange-and-pingone-authorization/
  PHASE-207-ARCHITECTURE.md   ← system design, before/after diagrams, mcpInstructions.js contract
  PHASE-207-REFERENCE.md      ← wave-by-wave build spec, file list, test assertions
  PHASE-207-REVIEW.md         ← quality review with concerns/risks/clarifications table
  SCOPE-FILTERING-IMPLEMENTATION.md  ← this file
```
