---
phase: 145
plan: 02
status: complete
completed: 2026-04-17
---

# Summary — 145-02: Metadata-First Agent Tool Schema Handling

## What Was Built

- Refactored `create_tool_input_schema()` in `langchain_agent/src/agent/mcp_tool_provider.py` to be metadata-first:
  - uses `tool_info.parameters.properties` when available
  - falls back to generic `MCPToolInput` when metadata is missing/incomplete
  - logs schema source (`metadata` vs `generic-fallback`) at debug level
- Hardened schema ingestion in `langchain_agent/src/mcp/tool_registry.py`:
  - accepts full MCP tool definitions (`inputSchema`)
  - accepts bare JSON schema objects (`type/properties/required`)
  - stores normalized parameters for provider consumption
- Added regression coverage in `langchain_agent/tests/test_mcp_dynamic_tool_schemas.py`:
  - metadata-driven schema for read tool
  - metadata-driven schema for write tool
  - registry metadata plumbing plus generic fallback for unknown tools

## Verification

- `cd langchain_agent && bash scripts/run-pytest.sh tests/test_mcp_dynamic_tool_schemas.py` -> pass (3 tests)

## Self-Check: PASSED
