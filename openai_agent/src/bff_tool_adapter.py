"""Wraps BFF /internal/agent-tool calls as OpenAI Agents SDK FunctionTool objects."""
from __future__ import annotations
import json
import logging
from typing import TypedDict

import httpx
from agents import FunctionTool, RunContextWrapper

logger = logging.getLogger(__name__)


class BffToolError(Exception):
    pass


class RunCtx(TypedDict):
    bff_tool_url: str
    bff_internal_secret: str
    session_id: str


def build_bff_tools(tool_schemas: list[dict], run_ctx: RunCtx) -> list[FunctionTool]:
    """
    For each tool schema from the BFF run payload, create a FunctionTool that
    POSTs to the BFF /internal/agent-tool endpoint when invoked.
    """
    return [_make_tool(schema, run_ctx) for schema in tool_schemas]


def _make_tool(schema: dict, run_ctx: RunCtx) -> FunctionTool:
    tool_name = schema["name"]
    tool_description = schema.get("description", "")
    input_schema = schema.get("inputSchema", {"type": "object", "properties": {}})

    async def _invoke(ctx: RunContextWrapper, args_json: str) -> str:
        args = json.loads(args_json) if args_json else {}
        logger.info("[BffTool] %s args=%s session=%s", tool_name, args, run_ctx["session_id"])
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                run_ctx["bff_tool_url"],
                json={"tool": tool_name, "args": args, "sessionId": run_ctx["session_id"]},
                headers={
                    "x-internal-gateway-secret": run_ctx["bff_internal_secret"],
                    "x-session-id": run_ctx["session_id"],
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code != 200:
            body = resp.text[:200]
            logger.error("[BffTool] %s HTTP %s: %s", tool_name, resp.status_code, body)
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
