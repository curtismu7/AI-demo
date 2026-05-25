"""
LLM factory — Helix (default), Ollama, and LM Studio.

Provider resolution rules (mirrors demo_api_server/services/llmProviderResolver.js):
  - "helix"    → ChatHelix; requires HELIX_* config
  - "ollama"   → ChatOllama; requires ollama_base_url / OLLAMA_BASE_URL
  - "lmstudio" → ChatOpenAI pointed at LM Studio's OpenAI-compatible endpoint
                 (default: http://localhost:1234/v1); any model loaded in LM Studio.
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
        provider: "helix" (default), "ollama", or "lmstudio".
        model: Model name hint (used for Ollama/LM Studio; Helix ignores it — agent_id is the model).
        api_key: Ignored for Helix/Ollama/LM Studio.
        temperature: Sampling temperature (Ollama/LM Studio only; Helix agents manage this internally).
        max_tokens: Max tokens (Ollama/LM Studio only).
        streaming: Enable streaming (Ollama only; LM Studio streaming TBD by model).
        ollama_base_url: Base URL for Ollama server.
        lmstudio_base_url: Base URL for LM Studio's OpenAI-compatible endpoint.
        helix_base_url: Helix tenant origin URL.
        helix_api_key: Helix API key (agent-scoped).
        helix_environment_id: Helix environment UUID.
        helix_agent_id: Helix agent name (case-sensitive).
        helix_prompt_field_id: Input field ID inside the AI Task node.

    Returns:
        A BaseChatModel instance.
    """
    resolved = provider.lower() if provider else "helix"

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
