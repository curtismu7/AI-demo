"""
LLM factory — Ollama only (local inference).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from langchain_core.language_models.chat_models import BaseChatModel

logger = logging.getLogger(__name__)

# Models available per provider
PROVIDER_MODELS: Dict[str, list[str]] = {
    "ollama": [
        "gemma4:e4b",
        "llama3.2",
        "llama3.1",
        "mistral",
        "phi3",
    ],
}

DEFAULT_MODELS: Dict[str, str] = {
    "ollama": "llama3.2",
}


def get_llm(
    provider: str = "ollama",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    streaming: bool = True,
    ollama_base_url: str = "http://localhost:11434",
    **kwargs: Any,
) -> BaseChatModel:
    """
    Return a chat model for the given provider (Ollama only).

    Args:
        provider: Must be 'ollama'.
        model: Model name; defaults to DEFAULT_MODELS['ollama'].
        api_key: Ignored (Ollama is local).
        temperature: Sampling temperature.
        max_tokens: Max tokens to generate.
        streaming: Enable streaming.
        ollama_base_url: Base URL for Ollama server.

    Returns:
        A BaseChatModel instance.
    """
    provider = provider.lower()
    if provider != "ollama":
        raise ValueError(
            f"Unsupported provider: {provider!r}. Only 'ollama' is supported."
        )

    resolved_model = model or DEFAULT_MODELS["ollama"]
    logger.info("Initializing LLM: provider=ollama model=%s", resolved_model)

    from langchain_ollama import ChatOllama

    return ChatOllama(
        model=resolved_model,
        temperature=temperature,
        num_predict=max_tokens,
        base_url=ollama_base_url,
    )
