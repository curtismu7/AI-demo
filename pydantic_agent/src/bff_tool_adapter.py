from __future__ import annotations
from typing import Any
import httpx
from pydantic_ai import RunContext
from pydantic_ai.tools import Tool
from .models import BffDeps


class BffToolError(Exception):
    pass


def build_tool_functions(tool_schemas: list[dict]) -> list[Tool]:
    tools = []
    for schema in tool_schemas:
        tools.append(_make_tool(schema))
    return tools


def _make_tool(schema: dict) -> Tool:
    name: str = schema["name"]
    description: str = schema["description"]
    properties: dict = schema.get("inputSchema", {}).get("properties", {})
    param_names: list[str] = list(properties.keys())

    async def tool_fn(ctx: RunContext[BffDeps], **kwargs: Any) -> Any:
        args = {k: kwargs[k] for k in param_names if k in kwargs}
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                ctx.deps.bff_tool_url,
                json={"tool": name, "args": args, "sessionId": ctx.deps.session_id},
                headers={
                    "x-internal-gateway-secret": ctx.deps.bff_internal_secret,
                    "x-session-id": ctx.deps.session_id,
                },
                timeout=30.0,
            )
        if resp.status_code != 200:
            raise BffToolError(f"BFF returned HTTP {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        return data.get("result", data)

    tool_fn.__name__ = name
    tool_fn.__doc__ = description
    return Tool(tool_fn, name=name, description=description, takes_ctx=True)
