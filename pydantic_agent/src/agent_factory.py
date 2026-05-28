from __future__ import annotations
from pydantic_ai import Agent
from .bff_tool_adapter import build_tool_functions
from .models import BffDeps


def build_agent(
    tool_schemas: list[dict],
    model: str,
    system_prompt: str | None = None,
) -> Agent:
    tools = build_tool_functions(tool_schemas)
    prompt = system_prompt or (
        "You are a helpful banking assistant. "
        "Use the available tools to answer user questions accurately."
    )
    return Agent(
        model,
        deps_type=BffDeps,
        tools=tools,
        system_prompt=prompt,
        defer_model_check=True,
    )
