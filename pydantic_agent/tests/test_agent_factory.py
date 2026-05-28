import pytest
from unittest.mock import patch, MagicMock
from src.agent_factory import build_agent

SCHEMAS = [
    {
        "name": "get_accounts",
        "description": "List accounts",
        "inputSchema": {"type": "object", "properties": {"userId": {"type": "string"}}},
    }
]


def test_build_agent_returns_agent():
    with patch("src.agent_factory.Agent") as MockAgent:
        MockAgent.return_value = MagicMock()
        agent = build_agent(SCHEMAS, "openai:gpt-4o")
        assert agent is not None
        MockAgent.assert_called_once()


def test_build_agent_passes_model():
    with patch("src.agent_factory.Agent") as MockAgent:
        MockAgent.return_value = MagicMock()
        build_agent(SCHEMAS, "openai:gpt-4o")
        call_args = MockAgent.call_args
        assert call_args[0][0] == "openai:gpt-4o"


def test_build_agent_uses_default_system_prompt():
    with patch("src.agent_factory.Agent") as MockAgent:
        MockAgent.return_value = MagicMock()
        build_agent(SCHEMAS, "openai:gpt-4o")
        call_kwargs = MockAgent.call_args[1]
        assert "banking assistant" in call_kwargs.get("system_prompt", "")


def test_build_agent_uses_custom_system_prompt():
    with patch("src.agent_factory.Agent") as MockAgent:
        MockAgent.return_value = MagicMock()
        build_agent(SCHEMAS, "openai:gpt-4o", system_prompt="Custom prompt")
        call_kwargs = MockAgent.call_args[1]
        assert call_kwargs.get("system_prompt") == "Custom prompt"
