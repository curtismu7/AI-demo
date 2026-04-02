"""
LLM factory for multi-provider support in LangChain 0.3.x.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from langchain_core.language_models.chat_models import BaseChatModel

logger = logging.getLogger(__name__)

# Models available per provider
PROVIDER_MODELS: Dict[str, list[str]] = {
    "groq": [
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "llama3-8b-8192",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-3.5-turbo",
    ],
    "anthropic": [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
    ],
    "google": [
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
    ],
    "ollama": [
        "llama3.2",
        "llama3.1",
        "mistral",
        "phi3",
    ],
}

DEFAULT_MODELS: Dict[str, str] = {
    "groq": "llama-3.1-8b-instant",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-20241022",
    "google": "gemini-2.0-flash",
    "ollama": "llama3.2",
}


def get_llm(
    provider: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
    streaming: bool = True,
    ollama_base_url: str = "http://localhost:11434",
    **kwargs: Any,
) -> BaseChatModel:
    """
    Return a chat model for the given provider.

    Args:
        provider: One of groq, openai, anthropic, google, ollama.
        model: Model name; defaults to DEFAULT_MODELS[provider].
        api_key: API key for the provider (not required for ollama).
        temperature: Sampling temperature.
        max_tokens: Max tokens to generate.
        streaming: Enable streaming.
        ollama_base_url: Base URL for Ollama server.

    Returns:
        A BaseChatModel instance.
    """
    provider = provider.lower()
    resolved_model = model or DEFAULT_MODELS.get(provider)
    if not resolved_model:
        raise ValueError(f"Unknown provider: {provider!r}")

    logger.info("Initializing LLM: provider=%s model=%s", provider, resolved_model)

    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=resolved_model,
            temperature=temperature,
            max_tokens=max_tokens,
            streaming=streaming,
            api_key=api_key or None,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=resolved_model,
            temperature=temperature,
            max_tokens=max_tokens,
            streaming=streaming,
            api_key=api_key or None,
        )

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=resolved_model,
            temperature=temperature,
            max_tokens=max_tokens,
            streaming=streaming,
            api_key=api_key or None,
        )

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=resolved_model,
            temperature=temperature,
            max_output_tokens=max_tokens,
            streaming=streaming,
            google_api_key=api_key or None,
        )

    if provider == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=resolved_model,
            temperature=temperature,
            num_predict=max_tokens,
            base_url=ollama_base_url,
        )

    raise ValueError(
        f"Unsupported provider: {provider!r}. "
        f"Choose one of: {list(PROVIDER_MODELS.keys())}"
    )
