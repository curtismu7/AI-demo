# Phase 145 Research: MCP Server Audit (Spec + Dynamic Tool Metadata)

**Completed:** 2026-04-17
**Status:** Ready for planning

## Scope Signal

Phase title targets an audit and remediation pass for:
- MCP protocol/spec behavior of the server
- Exposure of tool metadata (capabilities, descriptions, parameter schemas)
- Agent-side dynamic tool decisions based on advertised tool schemas rather than hardcoded assumptions

## Key Findings

### 1) MCP tool metadata source is centralized in BankingToolRegistry
- File: `banking_mcp_server/src/tools/BankingToolRegistry.ts`
- Registry currently contains richer metadata per tool (`name`, `title`, `description`, `inputSchema`, `requiredScopes`, `requiresUserAuth`, `readOnly`, `icons`, `annotations`).
- This is the canonical source that should drive both runtime exposure and audit checks.

### 2) tools/list response currently drops part of registry metadata
- File: `banking_mcp_server/src/server/MCPMessageHandler.ts`
- `handleListTools()` maps only a subset of fields (`name`, `description`, `inputSchema`, `requiresUserAuth`, `requiredScopes`, `readOnly`).
- Rich metadata such as `title`, `icons`, and `annotations` from the registry is not propagated.

### 3) Test baseline is stale vs current registry shape
- File: `banking_mcp_server/tests/tools/BankingToolRegistry.test.ts`
- Several tests still assert legacy assumptions (7 tools, old descriptions), while current registry includes expanded tool metadata and additional tools.
- This phase should make tests authoritative for current behavior and schema shape.

### 4) Dynamic-tool behavior is partially undermined by hardcoded agent fallback
- File: `langchain_agent/src/agent/mcp_tool_provider.py`
- `_get_input_schema_for_tool()` falls back to `_create_banking_tool_schema()` (hardcoded per tool-name) when metadata is missing/incomplete.
- This creates drift risk and weakens "decide dynamically from tool metadata" objective.

### 5) LangChain-side registry can already ingest schema metadata
- File: `langchain_agent/src/mcp/tool_registry.py`
- `register_server_tools()` accepts `tool_schemas`; descriptions and parameters are extracted when provided.
- This supports a dynamic path if we tighten fallback behavior and add tests that assert metadata-first construction.

## Risks

1. **Spec drift risk:** tools/list payload diverges from registry model, producing incomplete client capability views.
2. **Decision drift risk:** hardcoded banking schemas in agent layer can become stale and bias tool execution paths.
3. **Regression risk:** stale tests give false confidence and miss metadata-contract regressions.

## Recommended Plan Split (2 plans)

### Plan 145-01 (Wave 1): MCP metadata contract audit + server/list compliance hardening
- Align tools/list payload with registry metadata contract
- Refresh MCP server tests to current registry behavior
- Add audit artifact documenting contract, gaps, and acceptance checks

### Plan 145-02 (Wave 2): Agent dynamic schema consumption hardening
- Reduce/remove hardcoded banking schema fallback path in Python agent provider
- Require metadata-first schema building with generic fallback only
- Add tests proving agent tool schema comes from MCP metadata

## Verification Targets

- `banking_mcp_server` tests for registry + message handler pass with updated expectations.
- `langchain_agent` tests confirm metadata-driven schema construction and no hardcoded banking-tool schema dependence.
- UI/API build smoke remains green where touched.

## RESEARCH COMPLETE

Phase 145 should be delivered as a focused audit+remediation effort that upgrades metadata fidelity in MCP tool exposure and ensures downstream agent tool behavior is metadata-driven rather than hardcoded.