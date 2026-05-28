# openai_agent/tests/test_config.py
import os
import pytest
from unittest.mock import patch


def test_config_reads_env_vars():
    with patch.dict(os.environ, {
        "OPENAI_API_KEY": "sk-test",
        "OPENAI_MODEL": "gpt-4o-mini",
        "BFF_INTERNAL_SECRET": "secret123",
        "BFF_INTERNAL_TOOL_URL": "http://127.0.0.1:3001/internal/agent-tool",
        "AGENT_HTTP_PORT": "8891",
    }):
        from importlib import reload
        import openai_agent.src.config as cfg
        reload(cfg)
        c = cfg.get_config()
        assert c.openai_api_key == "sk-test"
        assert c.model == "gpt-4o-mini"
        assert c.bff_internal_secret == "secret123"
        assert c.bff_tool_url == "http://127.0.0.1:3001/internal/agent-tool"
        assert c.port == 8891
