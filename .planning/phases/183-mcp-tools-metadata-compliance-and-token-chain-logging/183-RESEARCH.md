# Phase 183 Research: MCP Tools Metadata Compliance and Token Chain Logging

**Completed:** 2026-04-17
**Status:** Ready for planning

---

## Research Questions Answered

### 1. MCP 2025-11-25 Spec Compliance — Annotations, Titles, Icons

**Finding:** The `ToolDefinition` interface in `banking_mcp_server/src/interfaces/mcp.ts` already has optional fields:
- `title?: string` — human-readable display name 
- `icons?: Array<{ src: string; mimeType?: string; sizes?: string[] }>`
- `annotations?: Record<string, any>` — metadata about tool behavior

**Implementation path:**
```typescript
// Current output from getMCPToolDefinitions() (line ~310 in BankingToolRegistry.ts):
public static getMCPToolDefinitions(): ToolDefinition[] {
  return Object.values(this.TOOLS).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    requiresUserAuth: tool.requiresUserAuth,
    requiredScopes: tool.requiredScopes
  }));
}

// MUST be extended to:
public static getMCPToolDefinitions(): ToolDefinition[] {
  return Object.values(this.TOOLS).map(tool => ({
    name: tool.name,
    title: tool.title,  // NEW
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,  // if applicable
    icons: tool.icons,  // NEW
    annotations: tool.annotations,  // NEW
    requiresUserAuth: tool.requiresUserAuth,
    requiredScopes: tool.requiredScopes
  }));
}
```

**Annotations mapping from D-02 (per MCP spec, field is `annotations.userFacing`)**:
```json
{
  "userFacing": {
    "readable": true,
    "destructive": false,
    "idempotent": true,
    "openWorld": false
  }
}
```

MCP spec 2025-11-25 doesn't define a rigid schema for annotations — it's implementation-specific metadata. Using `readable`/`destructive`/`idempotent`/`openWorld` (derived from `readOnlyHint`, `destructiveHint`, etc.) is safe and self-documenting.

---

### 2. Token Chain Audit — Structure and Integration

**Finding:** Current state:
- `BankingToolProvider.executeTool()` calls tools but does NOT log audit events
- `TokenExchangeService` has `logAuditEvent()` which logs to console (line ~85-89)
- `AuditLogger` (Redis-backed) exists with `logBankingOperation()`, `logAuthentication()`, `logAuthorization()`, `logSessionManagement()`
- No token chain audit method exists in `AuditLogger`

**Token chain audit schema (needed):**
```typescript
// New interface in AuditLogger
interface TokenChainAudit extends AuditEvent {
  eventType: 'token_chain';  // new event type
  toolName: string;  // which tool was called
  chainIndex: number;  // ordinal in session (call #1, #2, #3...)
  userTokenInfo: {
    sub: string;  // user subject
    scope: string[];  // scopes on incoming user token
    issuedAt: string;  // timestamp
    exp: number;  // expiry seconds
  };
  exchangedTokenInfo?: {  // if token was exchanged
    sub: string;  // MCP agent's sub (for delegation audit trail)
    act?: {  // RFC 8693 act claim (multi-hop)
      iss: string;
      sub: string;
    };
    aud?: string;
    scope: string[];
    issuedAt: string;
  };
  toolExecutionStatus: 'started' | 'completed' | 'failed';
  toolResult?: {
    success: boolean;
    errorCode?: string;
    duration: number;  // ms
  };
}
```

**Integration point:** In `BankingToolProvider.executeTool()` (line ~50-150), after `const result = await this.executeSpecificTool(tool, context, agentToken)`, add:
```typescript
await auditLogger.logTokenChain(tokenChainData);
```

---

### 3. Admin Audit Page Extension

**Current:** `/audit` route in `banking_api_ui/src/components/AuditPage.js` fetches MCP audit events from `/api/mcp/audit` endpoint (via BFF proxy).

**Finding:** AuditPage.js already has:
- Filter dropdowns: EVENT_TYPES, OUTCOMES, filterEventType, filterOperation (line 5-6)
- Table display with columns: timestamp, operation, outcome, details (line ~130+)
- Real-time refresh via polling (line ~100)

**Enhancement needed:**
- Add `filterEventType` option for new `'token_chain'` event type (already supported)
- Add new tab/filter: "Token Chain" which filters `eventType === 'token_chain'`
- Display token chain tab with columns: Tool, User, Incoming Token Scopes, Exchanged Token (if any), Status, Duration
- Link to user token info when clicked

**BFF endpoint:** Already proxies `/audit` from MCP server to `/api/mcp/audit` — no changes needed if MCP server writes to AuditLogger.

---

### 4. User-Facing Token Chain Panel

**Current:** `TokenChainContext` (React context, Phase 33) + localStorage-backed chain display.

**Finding:**
- Frontend already has `/api/token-chain` route on BFF (banking_api_server/routes/tokenChain.js) that calls `getTokenChain()` and `synthesizeFromSession()`
- TokenChainContext subscribes to updates via polling
- Panel shows delegation trail (user → agent token exchanges)

**Enhancement needed:**
- Extend `/api/token-chain` response to include MCP tool call delegation trail:
  ```json
  {
    "sessionTokens": [...],  // existing
    "delegationTrail": [...],  // existing  
    "mcpToolCallsChain": [  // NEW — from audit logs
      {
        "toolName": "get_my_accounts",
        "callTimestamp": "...",
        "userTokenScopes": ["banking:accounts:read"],
        "exchangedTokenUsed": true,
        "exchangedTokenScope": ["banking:ai:agent"],
        "status": "success"
      }
    ]
  }
  ```
- TokenChainContext fetches this and displays "MCP Delegation Trail" as a new panel showing which tools were called and with which delegation chain segment

---

### 5. Tool Title and Icon Mapping

**Finding:** Decisions D-10, D-11 require semantic grouping.

**Grouping strategy (from existing `readOnly` field):**
- **Read-only tools** (readOnly: true) → 👁️ "View" icon (blue)
  - get_my_accounts, get_account_balance, get_my_transactions, sequential_think
- **Sensitive read tools** (readOnly: false but `banking:sensitive:read`) → 🔐 "Sensitive" icon (red)
  - get_sensitive_account_details
- **Write tools** (readOnly: false, write scopes) → ✏️ "Modify" icon (orange)
  - create_deposit, create_withdrawal, create_transfer
- **Query tools** (low-security query) → 🔍 "Query" icon (gray)
  - query_user_by_email

**Titles (human-friendly names from D-10):**
- get_my_accounts → "My Bank Accounts"
- get_account_balance → "Account Balance"
- get_account_details → "Account Details (Sensitive)" — use 🔐 icon
- get_my_transactions → "Transaction History"
- create_deposit → "Create Deposit"
- create_withdrawal → "Create Withdrawal"
- create_transfer → "Transfer Money"
- query_user_by_email → "Check Email"
- sequential_think → "Reason & Analyze"

**Icon storage (SVG embedded or URL):**
- Option A: Embed as data URIs in BankingToolRegistry (inline SVG)
- Option B: Reference public URLs (e.g., cdn.example.com/icons/)

Recommendation: **Embed as data URIs** — simpler, no external dependency, spec-compliant.

Example:
```typescript
icons: [
  {
    src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cpath fill="%2300a0ff" d="M..."%3E%3C/svg%3E',
    mimeType: 'image/svg+xml',
    sizes: ['16x16', '32x32']
  }
]
```

---

### 6. AuditLogger Extension Point

**Finding:** `AuditLogger` (Redis-backed) has pattern for new audit types.

**Add new method:**
```typescript
// In AuditLogger
async logTokenChain(
  toolName: string,
  chainIndex: number,
  userTokenInfo: { sub, scope[], issuedAt, exp },
  exchangedTokenInfo?: { sub, act?, aud?, scope[], issuedAt },
  context: {
    sessionId,
    ipAddress?,
    userAgent?,
  },
  toolExecutionStatus: 'started' | 'completed' | 'failed',
  toolResult?: { success, errorCode?, duration }
): Promise<void> {
  const baseEvent = this.createBaseAuditEvent(
    'token_chain',  // NEW event type
    `tool_call_${toolName}`,
    toolResult?.success ? 'success' : 'failure',
    { sessionId, ...context }
  );

  const auditEvent: AuditEvent = {
    ...baseEvent,
    details: {
      toolName,
      chainIndex,
      userTokenInfo,
      exchangedTokenInfo,
      toolExecutionStatus,
      toolResult
    }
  };

  await this.logger.info('Token chain audit', { auditEvent });
  await this.writeToRedis(auditEvent);
}
```

**Where to call:** In `BankingToolProvider.executeTool()` after line ~120-140 (after tool execution completes).

---

### 7. TokenExchangeService Upgrade

**Finding:** `TokenExchangeService.exchangeToken()` at line ~80-100 logs to console:
```typescript
console.log(`[TokenExchangeService] Token exchange successful for request ${auditLog.request_id}`);
```

**Upgrade needed:**
- Replace console.log with AuditLogger call in TokenExchangeService ctor:
  ```typescript
  private auditLogger: AuditLogger;
  
  constructor(config: TokenExchangeConfig) {
    // ... existing code ...
    this.auditLogger = AuditLogger.getInstance();
  }
  ```
- In `exchangeToken()` after successful response (line ~95), call:
  ```typescript
  await this.auditLogger.logAuthentication(
    'token_exchange',
    'success',
    { sessionId: context.sessionId, ... },
    { 
      tokenType: 'exchanged',
      scopes: request.scope?.split(' '),
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange'
    }
  );
  ```

---

## Dependency Graph

| Component | Depends On | Status |
|-----------|-----------|--------|
| BankingToolRegistry | mcp.ts ToolDefinition interface | ✓ Ready |
| getMCPToolDefinitions() | BankingToolRegistry | Needs update |
| BankingToolProvider.executeTool() | AuditLogger | Needs audit calls |
| TokenExchangeService | AuditLogger | Needs upgrade |
| AuditLogger | New logTokenChain() method | Needs addition |
| /api/token-chain (BFF) | AuditLogger query | Needs extension |
| AuditPage (admin) | New token_chain filter | Needs UI update |
| TokenChainContext (user) | MCP tool calls chain | Needs extension |

---

## Common Pitfalls & Mitigations

1. **Icon data URIs too large** — Limit to 1-2 KB per icon. Test with multiple tools in `tools/list` response size.
2. **AuditLogger Redis write failure** — Already handles silently (writes to stderr). Verify log aggregation.
3. **Token chain audit explosion** — Each tool call adds event. Consider TTL = 7 days (already set in Redis config).
4. **Admin audit page performance** — Filter by eventType='token_chain' first to limit table rows.
5. **User privacy** — Don't show full token claims in user panel, only delegation trail (tool name, status, timestamp).

---

## Implementation Strategy (for planner)

**Wave 1 (core metadata compliance):**
- Add title + annotations + icons to BankingToolRegistry tool definitions
- Update getMCPToolDefinitions() to emit them
- Test with `/tools/list` response (verify response size)

**Wave 2 (audit infrastructure):**
- Add `logTokenChain()` method to AuditLogger
- Update TokenExchangeService to call new method
- Update BankingToolProvider.executeTool() to log per-tool-call chain

**Wave 3 (frontend visibility):**
- Add token_chain event type filter to admin /audit page
- Extend /api/token-chain endpoint to include mcpToolCallsChain from audit logs
- Update TokenChainContext to fetch + display MCP delegation trail

---

## Validation Architecture (Nyquist Dimension 8)

### Dimension 1: Requirements Coverage
- ✓ All 12 decisions (D-01 to D-12) have implementation tasks
- ✓ Tool annotations mapped per spec
- ✓ Token chain audit schema defined

### Dimension 2: State Propagation
- User token → exchanged token → tool execution → audit log → admin page / user panel
- Token lineage tracked per tool call (chain index)

### Dimension 3: Error Handling
- Failed tool executions logged with errorCode
- Token exchange failures logged to AuditLogger (upgrade from console.log)
- Admin audit page filters by outcome (success/failure/partial)

### Dimension 4: Scope Enforcement
- Each tool call's scopes validated before execution (existing)
- Exchanged token scopes logged for audit trail (new)
- Admin audit page shows scope coverage per tool

### Dimension 5: Session Lifecycle
- Per-session token chain maintained (chainIndex incremented per tool call)
- Audit events associate with sessionId for correlation

### Dimension 6: Data Integrity
- Audit events immutable (Redis-backed, not editable)
- User privacy (PII redacted in audit logs per existing AuditLogger pattern)

### Dimension 7: Performance
- Async logging (non-blocking)
- Redis TTL prevents log explosion
- Admin page filters before rendering

### Dimension 8: Observability
- Each tool call has audit trail entry (duration, result, scopes)
- Admin audit page shows full chain per session
- User token chain panel shows delegation trail

---

## Research Complete ✓

All questions answered. Ready for planning.
