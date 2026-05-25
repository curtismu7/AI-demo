---
phase: 280
plan: 01
status: complete
completed_at: "2026-05-25"
commits:
  - 8b95814c feat(280-01): wire annotations through connection->ToolInfo->MCPTool.metadata
  - d1d1ffc9 feat(280): add annotation-aware instruction to agent system prompt (item 20)
---

# Phase 280 Plan 01 — Summary

## What was done

Wired MCP tool annotations (`destructive`, `idempotent`, `readable`) from the JSON-RPC `tools/list` response through the full Python pipeline to `BaseTool.metadata`, and added an annotation-aware instruction to the agent system prompt.

### Task 1 — Annotations pipeline (4 files)

1. **`connection.py`** — `_refresh_tools()`: added `"annotations": tool.get("annotations", {})` to the `_tool_schemas` dict literal so annotations survive the JSON-RPC → connection hop.

2. **`tool_registry.py`** — `ToolInfo` dataclass: added `annotations: Optional[Dict[str, Any]] = None` field. `register_server_tools()`: extracts `annotations = tool_schema.get("annotations") if tool_schema else None` and passes it to `ToolInfo(...)`.

3. **`mcp_tool_provider.py`** — `MCPTool.__init__`: before `super().__init__()`, extracts `user_facing` from `tool_info.annotations`, builds `tool_metadata = {"destructive": bool(...), "idempotent": bool(...), "readable": bool(...)}`, passes `metadata=tool_metadata` to `super().__init__()`. Defaults to safe (destructive=False) when annotations absent.

4. **`tests/test_mcp_annotations.py`** (new): 4 TDD tests:
   - `test_toolinfo_carries_annotations` — ToolInfo stores annotations dict
   - `test_mcptool_metadata_populated` — MCPTool.metadata["destructive"]=True from ToolInfo
   - `test_destructive_tools_flagged` — destructive=True vs False correctly mapped
   - `test_annotations_default_to_safe` — None annotations → destructive=False

### Task 2 — System prompt
Added item 20 to the "Key guidelines:" list in `_build_system_message()`:
> Before calling any tool where the tool's metadata marks it as destructive (such as create_withdrawal, create_transfer, freeze_account, or delete_customer), state clearly what you are about to do and what the effect will be, so the user understands the action before it executes.

## Verification

```
✅ test_mcp_annotations.py — 4 passed
✅ test_langchain_mcp_agent.py — 49 passed (no regressions)
✅ test_mcp_tool_registry.py — 25 passed (no regressions)
✅ grep "destructive" langchain_mcp_agent.py → 1 match (system prompt item 20)
✅ ToolInfo.annotations field exists in tool_registry.py
✅ connection.py _tool_schemas includes "annotations" key
✅ MCPTool.metadata populated from tool_info.annotations
```
