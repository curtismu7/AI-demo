"""
LLM factory — Helix (default), Ollama, LM Studio (OpenAI-compat), and LM Studio (Anthropic-compat).

Provider resolution rules (mirrors demo_api_server/services/llmProviderResolver.js):
  - "helix"              → ChatHelix; requires HELIX_* config
  - "ollama"             → ChatOllama; requires ollama_base_url / OLLAMA_BASE_URL
  - "lmstudio"           → ChatOpenAI pointed at LM Studio's OpenAI-compatible endpoint
                           (default: http://localhost:1234/v1); any model loaded in LM Studio.
  - "anthropic-lmstudio" → ChatAnthropic pointed at LM Studio's Anthropic-compatible endpoint
                           (default: http://localhost:1234); uses the Anthropic SDK wire format
                           so the LangGraph tooling chain (function calling, tool_use blocks) works
                           without modification. Dummy API key accepted.
  - no provider / unknown → "helix" (Helix is the project-wide default LLM)

No other module may inline a provider default.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from langchain_core.language_models.chat_models import BaseChatModel

logger = logging.getLogger(__name__)

# Ollama fallback model list (used only when provider="ollama" is explicit)
OLLAMA_MODELS: list[str] = [
    "gemma4:e4b",
    "llama3.2",
    "llama3.1",
    "mistral",
    "phi3",
]
OLLAMA_DEFAULT_MODEL = "llama3.2"


def get_llm(
    provider: str = "helix",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    streaming: bool = True,
    ollama_base_url: str = "http://localhost:11434",
    lmstudio_base_url: str = "http://localhost:1234/v1",
    anthropic_base_url: str = "",
    # Helix-specific kwargs (passed through from LangChainConfig)
    helix_base_url: str = "",
    helix_api_key: str = "",
    helix_environment_id: str = "",
    helix_agent_id: str = "",
    helix_prompt_field_id: str = "",
    **kwargs: Any,
) -> BaseChatModel:
    """
    Return a chat model for the given provider.

    Args:
        provider: "helix" (default), "ollama", "lmstudio", or "anthropic-lmstudio".
        model: Model name hint (Ollama/LM Studio; Helix ignores it).
        api_key: Anthropic API key for "anthropic-lmstudio" (any non-empty string works).
        temperature: Sampling temperature (not used by Helix).
        max_tokens: Max tokens to generate.
        streaming: Enable streaming (Ollama only).
        ollama_base_url: Base URL for Ollama server.
        lmstudio_base_url: Base URL for LM Studio endpoint (OpenAI or Anthropic compat).
        helix_*: Helix connection fields.

    Returns:
        A BaseChatModel instance.
    """
    resolved = provider.lower() if provider else "helix"

    if resolved == "anthropic-lmstudio":
        # Use the Anthropic SDK wire format pointing at LM Studio's Anthropic-compatible
        # endpoint. The base_url must be the origin only (no /v1 path) — the Anthropic
        # SDK appends /v1/messages itself. LM Studio accepts any non-empty API key.
        resolved_model = model or "local-model"
        # Strip trailing /v1 path if the user provided the OpenAI-style URL
        base = lmstudio_base_url.rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3]
        resolved_api_key = api_key or "lm-studio"
        logger.info(
            "Initializing LLM: provider=anthropic-lmstudio model=%s url=%s",
            resolved_model, base,
        )
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=resolved_model,
            anthropic_api_url=base,
            anthropic_api_key=resolved_api_key,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    if resolved == "anthropic":
        # Real Anthropic cloud — or LM Studio proxy when ANTHROPIC_BASE_URL is set to localhost.
        # anthropic_base_url="" → SDK default (api.anthropic.com); non-empty → override.
        resolved_model = model or "claude-sonnet-4-5"
        resolved_api_key = api_key or "lm-studio"
        base = (anthropic_base_url or "").rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3]
        logger.info(
            "Initializing LLM: provider=anthropic model=%s base=%s",
            resolved_model, base or "api.anthropic.com",
        )
        from langchain_anthropic import ChatAnthropic
        kwargs_anthro = dict(
            model=resolved_model,
            anthropic_api_key=resolved_api_key,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if base:
            kwargs_anthro["anthropic_api_url"] = base
        return ChatAnthropic(**kwargs_anthro)

    if resolved == "lmstudio":
        resolved_model = model or "local-model"
        logger.info("Initializing LLM: provider=lmstudio model=%s url=%s", resolved_model, lmstudio_base_url)
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=resolved_model,
            openai_api_base=lmstudio_base_url,
            openai_api_key="lm-studio",  # LM Studio ignores the key; any non-empty string works
            temperature=temperature,
            max_tokens=max_tokens,
            streaming=streaming,
        )

    if resolved == "ollama":
        resolved_model = model or OLLAMA_DEFAULT_MODEL
        logger.info("Initializing LLM: provider=ollama model=%s", resolved_model)
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=resolved_model,
            temperature=temperature,
            num_predict=max_tokens,
            base_url=ollama_base_url,
            streaming=streaming,
        )

    if resolved == "helix":
        logger.info("Initializing LLM: provider=helix agent=%s", helix_agent_id or "(from env)")
        from .helix_llm import ChatHelix
        return ChatHelix(
            helix_base_url=helix_base_url,
            helix_api_key=helix_api_key,
            helix_environment_id=helix_environment_id,
            helix_agent_id=helix_agent_id,
            helix_prompt_field_id=helix_prompt_field_id,
        )

    # Unknown provider → fall back to Helix (project default)
    logger.warning("Unknown LLM provider %r — falling back to helix", provider)
    from .helix_llm import ChatHelix
    return ChatHelix(
        helix_base_url=helix_base_url,
        helix_api_key=helix_api_key,
        helix_environment_id=helix_environment_id,
        helix_agent_id=helix_agent_id,
        helix_prompt_field_id=helix_prompt_field_id,
    )
