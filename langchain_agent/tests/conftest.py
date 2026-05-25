# langchain_agent/tests/conftest.py
"""Shared pytest hooks and constants for stable test runs."""

import base64
import os
import sys
from unittest.mock import Mock, MagicMock


def _stub_langgraph():
    """
    Stub out langgraph imports so the test suite runs without langgraph installed.

    T-275-06: Tests mock create_react_agent and MemorySaver at the module level.
    This stub is inserted BEFORE any production module is imported by the test
    runner so the import-time 'from langgraph.prebuilt import create_react_agent'
    in langchain_mcp_agent.py resolves to a mock instead of raising ImportError.
    """
    if 'langgraph' not in sys.modules:
        langgraph_mock = MagicMock()
        langgraph_mock.prebuilt.create_react_agent = Mock()
        langgraph_mock.checkpoint.memory.MemorySaver = Mock()
        sys.modules['langgraph'] = langgraph_mock
        sys.modules['langgraph.prebuilt'] = langgraph_mock.prebuilt
        sys.modules['langgraph.checkpoint'] = langgraph_mock.checkpoint
        sys.modules['langgraph.checkpoint.memory'] = langgraph_mock.checkpoint.memory


_stub_langgraph()


def pytest_configure(config):
    """Force valid Fernet salt during tests (avoids bad ENCRYPTION_SALT from host env)."""
    os.environ["ENCRYPTION_SALT"] = base64.urlsafe_b64encode(b"sixteenbytesalt!").decode()
    os.environ.setdefault("ENCRYPTION_MASTER_KEY", "test-master-key-32-characters!!")


# Matches SecurityConfig in src/config/settings.py
TEST_SECURITY_KWARGS = {
    "encryption_master_key": "test-key-32-chars-long-for-aes-ok!!",
    "encryption_salt": base64.urlsafe_b64encode(b"sixteenbytesalt!").decode(),
    "token_expiry_buffer_seconds": 300,
    "session_timeout_minutes": 60,
    "max_retry_attempts": 3,
    "retry_backoff_seconds": 1,
}
