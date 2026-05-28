"""Wraps BFF /internal/agent-tool calls as OpenAI Agents SDK FunctionTool objects."""
from __future__ import annotations
import json
import logging
from typing import Any

import httpx
from agents import FunctionTool

logger = logging.getLogger(__name__)


class BffToolError(Exception):
    pass


def build_bff_tools(tool_schemas: list[dict], run_ctx: dict) -> list[FunctionTool]:
    """
    For each tool schema from the BFF run payload, create a FunctionTool that
    POSTs to the BFF /internal/agent-tool endpoint when invoked.

    run_ctx keys: bff_tool_url, bff_internal_secret, session_id
    """
    return [_make_tool(schema, run_ctx) for schema in tool_schemas]


def _make_tool(schema: dict, run_ctx: dict) -> FunctionTool:
    tool_name = schema["name"]
    tool_description = schema.get("description", "")
    input_schema = schema.get("inputSchema", {"type": "object", "properties": {}})

    # Capture by value via default args to avoid closure-over-loop-variable issues.
    async def _invoke(ctx: Any, args_json: str, *, _name: str = tool_name, _ctx: dict = run_ctx) -> str:
        args = json.loads(args_json) if args_json else {}
        logger.info("[BffTool] %s args=%s session=%s", _name, args, _ctx["session_id"])
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _ctx["bff_tool_url"],
                json={"tool": _name, "args": args, "sessionId": _ctx["session_id"]},
                headers={
                    "x-internal-gateway-secret": _ctx["bff_internal_secret"],
                    "x-session-id": _ctx["session_id"],
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code != 200:
            body = resp.text[:200]
            logger.error("[BffTool] %s HTTP %s: %s", _name, resp.status_code, body)
            raise BffToolError(f"BFF returned HTTP {resp.status_code}: {body}")
        data = resp.json()
        return json.dumps(data.get("result", data))

    return FunctionTool(
        name=tool_name,
        description=tool_description,
        params_json_schema=input_schema,
        on_invoke_tool=_invoke,
        strict_json_schema=False,
    )
