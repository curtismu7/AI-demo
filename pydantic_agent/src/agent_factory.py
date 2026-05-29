from __future__ import annotations
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from .bff_tool_adapter import build_tool_functions
from .models import BffDeps


def build_agent(
    tool_schemas: list[dict],
    model_name: str,
    base_url: str,
    api_key: str,
    system_prompt: str | None = None,
) -> Agent:
    # Constructing OpenAIModel with an explicit provider keeps pydantic_ai from
    # falling back to the env-driven default (which would 401 on LM Studio).
    model = OpenAIModel(
        model_name=model_name,
        provider=OpenAIProvider(base_url=base_url, api_key=api_key),
    )
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
