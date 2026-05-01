---
status: resolved
trigger: "I did transfer but got no HITL"
created: 2026-05-01
updated: 2026-05-01
---

## Symptoms
- User performed a `create_transfer` tool call via the agent
- Expected HITL consent dialog to appear
- HITL did not fire — transfer executed without approval

## Root Cause

**Three compounding reasons HITL never fires:**

### 1. `ff_authorize_mcp_first_tool` feature flag is OFF (primary cause)
`evaluateMcpFirstToolGate()` checks this flag first:
```js
const flag = configStore.get('ff_authorize_mcp_first_tool') === true || ...;
if (!flag) return { ran: false, reason: 'feature_flag_disabled' };
```
Current value in `runtimeData.json`: `null` (not set). The entire authorize gate — which is the only path to HITL — is disabled.

### 2. `SIMULATED_MCP_HITL_TOOLS` env var not set
Even if flag #1 were enabled in simulated mode, HITL only fires when the tool name is in this env var:
```js
const hitlSet = _simulatedMcpHitlToolSet();  // reads SIMULATED_MCP_HITL_TOOLS
const hitlRequired = toolName && hitlSet.has(toolName);
```
`create_transfer` is not listed → `hitlRequired = false` → PERMIT.

### 3. Gate fires only ONCE per session
Even if #1 and #2 were fixed, the gate is guarded by:
```js
if (req.session?.mcpFirstToolAuthorizeDone) return { ran: false, reason: 'already_evaluated' };
```
If any other tool ran first in this session, the gate already set `mcpFirstToolAuthorizeDone=true` and will never re-evaluate for `create_transfer`.

## Fix

**To get HITL on transfer, ALL of the following must be true:**

1. Enable the flag in Config UI: `ff_authorize_mcp_first_tool = true`
2. Set env var: `SIMULATED_MCP_HITL_TOOLS=create_transfer` (or use live PingOne Authorize that returns `hitlRequired: true`)
3. Start a **fresh session** (logout/login) so `mcpFirstToolAuthorizeDone` is not already set
4. Make `create_transfer` the **first** MCP tool call in that session (or remove the "first tool only" gate — see Phase 257 for per-tool-type HITL settings)

## Resolution
Diagnosed. Phase 257 planned to add a HITL/P1MFA settings page so these thresholds are configurable per tool/transaction type without requiring env vars or session restarts.
