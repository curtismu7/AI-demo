# openai_agent/tests/test_bff_tool_adapter.py
import pytest
import httpx
import respx


TOOL_SCHEMA = {
    "name": "get_accounts",
    "description": "List the user's bank accounts.",
    "inputSchema": {
        "type": "object",
        "properties": {"userId": {"type": "string"}},
        "required": ["userId"],
    },
}

RUN_CONTEXT = {
    "bff_tool_url": "http://127.0.0.1:3001/internal/agent-tool",
    "bff_internal_secret": "secret",
    "session_id": "sess_abc",
}


def test_build_tools_returns_one_callable_per_schema():
    from src.bff_tool_adapter import build_bff_tools
    tools = build_bff_tools([TOOL_SCHEMA], RUN_CONTEXT)
    assert len(tools) == 1


@pytest.mark.asyncio
@respx.mock
async def test_tool_posts_to_bff_and_returns_result():
    """Tool function calls BFF and returns result JSON."""
    from src.bff_tool_adapter import build_bff_tools

    respx.post("http://127.0.0.1:3001/internal/agent-tool").mock(
        return_value=httpx.Response(200, json={"result": {"accounts": []}})
    )

    tools = build_bff_tools([TOOL_SCHEMA], RUN_CONTEXT)
    result = await tools[0].on_invoke_tool(None, '{"userId": "u1"}')
    assert result is not None


@pytest.mark.asyncio
@respx.mock
async def test_tool_raises_on_bff_error():
    from src.bff_tool_adapter import build_bff_tools, BffToolError

    respx.post("http://127.0.0.1:3001/internal/agent-tool").mock(
        return_value=httpx.Response(500, json={"error": "internal"})
    )

    tools = build_bff_tools([TOOL_SCHEMA], RUN_CONTEXT)
    with pytest.raises(BffToolError):
        await tools[0].on_invoke_tool(None, '{"userId": "u1"}')
