# Scope-Audience Mapping Reference (RFC 8707)

## Overview

This document maps each OAuth scope to the audiences where it can be applied per RFC 8707 "OAuth 2.0 Resource Indicators" and RFC 8693 token exchange.

Scope-to-audience mapping is explicit and mandatory. All scopes for a token exchange must be valid for the target audience. Scopes cannot be escalated — only maintained or narrowed.

## Scope-Audience Mapping Table

### Agent Gateway (Step 1)
Audience: `https://agent-gateway.example.com`  
OAuth app: `PINGONE_AI_AGENT_CLIENT_ID`  
Purpose: Authorization for initial agent actor token request

| Scope | Purpose | Valid |
|-------|---------|-------|
| banking:agent:invoke | AI Agent authorization | ✅ Yes |
| ai_agent | Legacy AI Agent scope | ✅ Yes |
| banking:read | User data access | ❌ No |
| transfer:execute | Transfer permission | ❌ No |
| banking:mcp:invoke | MCP authorization | ❌ No |

### AI Agent Intermediate (Step 2)
Audience: `https://ai-agent-gateway.example.com`  
OAuth resource server: AI Agent receiving on-behalf-of delegation token  
Purpose: Input for delegated token exchange to MCP Gateway

| Scope | Purpose | Valid |
|-------|---------|-------|
| banking:read | User account/transaction reading | ✅ Yes |
| banking:write | User data modification | ✅ Yes |
| banking:agent:invoke | Delegation scope | ✅ Yes |
| transfer:execute | Transfer permission | ❌ No |
| banking:mcp:invoke | MCP authorization | ❌ No |

### MCP Gateway (Step 3)
Audience: `https://mcp-gateway.example.com`  
OAuth app: `PINGONE_MCP_CLIENT_ID` (or derived from environment)  
Purpose: Authorization for MCP actor token request

| Scope | Purpose | Valid |
|-------|---------|-------|
| banking:mcp:invoke | MCP authorization | ✅ Yes |
| mcp_resource_access | Resource access token | ✅ Yes |
| banking:read | User data access | ❌ No |
| banking:write | User data modification | ❌ No |

### MCP Resource Server (Step 4)
Audience: `https://resource.example.com/mcp`  
OAuth resource server: MCP Server receiving final narrowed token  
Purpose: Authorization for tool execution on MCP server

| Scope | Purpose | Valid |
|-------|---------|-------|
| get_accounts:read | List user accounts | ✅ Yes |
| transfer:execute | Execute transfers | ✅ Yes |
| check:read | Check reading | ✅ Yes |
| banking:read | Generic banking | ❌ No |
| banking:agent:invoke | Agent delegation | ❌ No |

## Validation Rules

1. **No Scope Escalation**: Scopes can only be maintained or narrowed, never escalated
2. **Audience-based Filtering**: Only scopes valid for the target audience are included in token exchange requests
3. **Explicit Allow List**: Only scopes in the allowlist for an audience are permitted
4. **No Hard-Coded Defaults**: Missing scopes result in explicit error, not silent fallback w/ generic scope
5. **Narrowing is Logged**: Events logged when scopes are narrowed during token exchange
6. **Validation at Every Step**: Each hop in the two-exchange flow validates scopes for the target audience

## Configuration

The mapping is configured in `banking_api_server/services/configStore.js`:

**Constant**: `ALLOWED_SCOPES_BY_AUDIENCE` — Maps audience URIs to arrays of valid scopes  
**Function**: `validateScopeAudience(scopes, audience)` — Validates scopes against audience allowlist

```javascript
const configStore = require('../services/configStore');

// Function signature
const result = configStore.validateScopeAudience(
  ['banking:read', 'banking:write'],  // User's scopes from token
  'https://ai-agent-gateway.example.com' // Target audience
);

// Returns: { valid: true, scopes: [...], narrowed: boolean }
// Throws: Error if validation fails
```

## Examples

### Example 1: Correct Narrowing
```
Step: Two-exchange flow Step 2 (User → AI Agent → MCP)
User Token Scopes: [banking:read, banking:write, transfer:execute]
Target Audience: https://ai-agent-gateway.example.com
Allowed for Audience: [banking:read, banking:write, banking:agent:invoke]
Exchange Scopes: [banking:read, banking:write] (transfer:execute removed)
Result: ✅ Success (scopes narrowed appropriately)
```

### Example 2: Maintaining Scopes
```
Step: MCP Gateway → MCP Resource Server
Current Scopes: [get_accounts:read]
Target Audience: https://resource.example.com/mcp
Allowed for Audience: [get_accounts:read, transfer:execute, check:read]
Exchange Scopes: [get_accounts:read]
Result: ✅ Success (no narrowing needed)
```

### Example 3: Invalid Scope
```
Step: User → Agent Gateway
User Token Scopes: [invalid:scope]
Target Audience: https://agent-gateway.example.com
Allowed for Audience: [banking:agent:invoke, ai_agent]
Exchange Scopes: None (0 matches)
Result: ❌ SCOPE_MISMATCH Error
Message: "User scopes [invalid:scope] do not match allowed scopes for https://agent-gateway.example.com [banking:agent:invoke, ai_agent]"
```

### Example 4: Unknown Audience
```
Target Audience: https://unknown.example.com
Allowed Audiences: [https://agent-gateway.example.com, ...]
Result: ❌ AUDIENCE_ERROR
Message: "Unknown audience https://unknown.example.com. Allowed audiences: [list...]"
```

### Example 5: Empty Scope List
```
User Token Scopes: [] (no scopes)
Target Audience: https://ai-agent-gateway.example.com
Result: ❌ SCOPE_ERROR
Message: "No scopes provided for audience https://ai-agent-gateway.example.com"
```

## Design Rationale

### Why Explicit Mapping?

Previous implementation used a 3-level fallback mechanism:
1. Try tool-specific scopes
2. Fall back to generic `banking:*` scopes
3. Fall back to tool candidate scopes

This was complex and hidden the actual scope validation logic. The fallback approach made it hard to:
- Understand which scopes would be requested
- Debug scope mismatch errors
- Ensure RFC 8693 compliance
- Validate scope constraints per audience

**Explicit mapping** replaces this with clear, documented rules.

### Why per-Audience?

RFC 8707 resource indicators allow servers to define which scopes apply to which resources. Different audiences often have different scope requirements:
- Agent Gateway expects delegation scopes (`banking:agent:invoke`)
- MCP Resource Server expects tool-specific scopes (`get_accounts:read`)

Audience-based filtering ensures:
- Scope validation matches resource requirements
- Token exchange policies are honored
- Scope narrowing is intentional (not accidental)

## Implementation: validateScopeAudience()

Located in `configStore.js`:

```javascript
/**
 * @param {string[]} scopes - OAuth scopes to validate
 * @param {string} audience - Target audience URI
 * @returns {object} { valid, scopes: narrowedScopes[], narrowed: boolean }
 * @throws {Error} if validation fails
 */
function validateScopeAudience(scopes, audience) {
  // 1. Check scopes list not empty
  if (!scopes || scopes.length === 0) {
    throw new Error(`SCOPE_ERROR: No scopes provided for audience ${audience}`);
  }

  // 2. Check audience is known
  const allowedForAudience = ALLOWED_SCOPES_BY_AUDIENCE[audience];
  if (!allowedForAudience) {
    throw new Error(
      `AUDIENCE_ERROR: Unknown audience ${audience}. ` +
      `Allowed audiences: ${Object.keys(ALLOWED_SCOPES_BY_AUDIENCE).join(', ')}`
    );
  }

  // 3. Filter scopes to those valid for this audience
  const validScopes = scopes.filter(s => 
    ALLOWED_SCOPES_BY_AUDIENCE[audience].includes(s)
  );

  // 4. Check at least one scope matched
  if (validScopes.length === 0) {
    throw new Error(
      `SCOPE_MISMATCH: User scopes [${scopes.join(', ')}] ` +
      `do not match allowed scopes for ${audience} ` +
      `[${ALLOWED_SCOPES_BY_AUDIENCE[audience].join(', ')}]`
    );
  }

  return {
    valid: true,
    scopes: validScopes,
    narrowed: validScopes.length < scopes.length,
  };
}
```

## Usage

### In agentMcpTokenService.js

```javascript
try {
  const scopeValidation = configStore.validateScopeAudience(
    Array.from(userTokenScopes),
    audienceFactory // https://ai-agent-gateway.example.com
  );
  
  const effectiveToolScopes = scopeValidation.scopes;
  
  if (scopeValidation.narrowed) {
    // Log narrowing event
    writeExchangeEvent({
      type: 'scope-narrowing',
      message: `Scopes narrowed from [...] to [...]`,
      originalScopes: userTokenScopes,
      narrowedScopes: effectiveToolScopes,
    });
  }
} catch (error) {
  // Handle validation failure
  throw new Error(`Scope validation failed: ${error.message}`);
}
```

## References

- **RFC 8693**: OAuth 2.0 Token Exchange — https://tools.ietf.org/html/rfc8693
  - Section 2.1: Implicit Token Flows
  - Section 2.2: Defining Resource Indicators
- **RFC 8707**: OAuth 2.0 Resource Indicators — https://tools.ietf.org/html/rfc8707
  - Section 2: Using Resource Indicators in Requests
  - Section 3: Interactions with Token Scope
- **Phase 56-04**: Scope & Audience Explicit Mapping
- **CONFIGURATION_GUIDE.md**: Environment variable setup
- **configStore.js**: Implementation reference
