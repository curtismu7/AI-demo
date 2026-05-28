import pytest
import respx
import httpx
from src.models import BffDeps
from src.bff_tool_adapter import build_tool_functions, BffToolError

SCHEMA = {
    "name": "get_accounts",
    "description": "List accounts",
    "inputSchema": {"type": "object", "properties": {"userId": {"type": "string"}}},
}

DEPS = BffDeps(
    bff_tool_url="http://127.0.0.1:3001/internal/agent-tool",
    bff_internal_secret="secret",
    session_id="sess_abc",
)


def test_build_tool_functions_returns_one_tool():
    tools = build_tool_functions([SCHEMA])
    assert len(tools) == 1


def test_tool_has_correct_name():
    tools = build_tool_functions([SCHEMA])
    assert tools[0].name == "get_accounts"
