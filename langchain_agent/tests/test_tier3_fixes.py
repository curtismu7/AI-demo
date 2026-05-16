"""
Regression tests for the Tier-3 batch (LC WR-08/WR-13 + IN-01/04/05/06/07).

Kept in a dedicated module so they are unambiguously attributable to this
batch and not entangled with the pre-existing baseline failures in the
broader suite (see test_tier1_warning_fixes.py for the same rationale).
"""
import inspect

import pytest


# ---------------------------------------------------------------------------
# WR-08 — OAuth client registered exactly ONCE at startup
# ---------------------------------------------------------------------------
class TestWR08SingleRegistration:
    def test_main_constructs_manager_with_auto_register_false(self):
        """main.py must build the manager with auto_register=False so
        __aenter__ does NOT also register (which would double-register and
        orphan the scopeless client in PingOne on every restart)."""
        import src.main as main_mod

        src = inspect.getsource(main_mod.LangChainMCPApplication.initialize)
        assert "auto_register=False" in src
        # exactly one explicit register_client *call*, and it carries ai_agent.
        # Count `await self.oauth_manager.register_client(` to ignore prose.
        assert src.count("self.oauth_manager.register_client(") == 1
        assert 'additional_scopes=["ai_agent"]' in src

    async def test_aenter_with_auto_register_false_does_not_register(self):
        """With auto_register=False, __aenter__ must not call register_client."""
        from unittest.mock import AsyncMock, patch
        from src.authentication.oauth_manager import OAuthAuthenticationManager

        mgr = OAuthAuthenticationManager(config=object(), auto_register=False)
        with patch.object(
            OAuthAuthenticationManager, "register_client", new=AsyncMock()
        ) as reg, patch(
            "src.authentication.oauth_manager.DynamicClientRegistration"
        ) as dcr, patch(
            "src.authentication.oauth_manager.TokenManager"
        ) as tm, patch(
            "src.authentication.oauth_manager.UserAuthorizationFacilitator"
        ):
            dcr.return_value.__aenter__ = AsyncMock()
            tm.return_value.__aenter__ = AsyncMock()
            await mgr.__aenter__()
            reg.assert_not_awaited()


# ---------------------------------------------------------------------------
# WR-13 — Ollama-only: OPENAI_API_KEY optional, dead deps removed
# ---------------------------------------------------------------------------
class TestWR13OllamaOnly:
    def test_openai_api_key_not_required_at_startup(self, monkeypatch):
        """settings must not raise when OPENAI_API_KEY is unset."""
        from src.config.settings import ConfigManager

        for k in ("OPENAI_API_KEY",):
            monkeypatch.delenv(k, raising=False)
        # required PingOne/encryption vars are supplied by conftest/.env;
        # this asserts OPENAI_API_KEY specifically is no longer a hard req.
        mgr = ConfigManager()
        cfg = mgr.reload_config("test")
        assert cfg.langchain.openai_api_key == ""  # optional, empty default

    def test_requirements_drops_unused_provider_packages(self):
        from pathlib import Path

        req = Path(__file__).resolve().parents[1] / "requirements.txt"
        text = req.read_text()
        for dead in (
            "langchain-openai",
            "langchain-groq",
            "langchain-anthropic",
            "langchain-google-genai",
        ):
            assert dead not in text, f"{dead} should be removed (Ollama-only)"
        # the bare openai SDK line is gone too (langchain-ollama stays)
        assert "\nopenai>=" not in text and not text.startswith("openai>=")
        assert "langchain-ollama" in text


# ---------------------------------------------------------------------------
# IN-01 — _detect_authorization_code: no dead max() branch, prefix-only
# ---------------------------------------------------------------------------
class TestIN01DetectAuthCode:
    def _agent(self):
        # Build just enough of the agent to call the pure helper.
        from src.agent.langchain_mcp_agent import LangChainMCPAgent

        return LangChainMCPAgent.__new__(LangChainMCPAgent)

    def test_prefixed_code_extracted(self):
        a = self._agent()
        assert a._detect_authorization_code("code: ABC123def") == "ABC123def"
        assert a._detect_authorization_code("authorization=XYZ_789") == "XYZ_789"

    def test_unprefixed_message_not_treated_as_code(self):
        a = self._agent()
        assert a._detect_authorization_code("let-me-check-my-balance-please") is None

    def test_no_max_branch_in_source(self):
        import ast
        import inspect
        import textwrap
        from src.agent.langchain_mcp_agent import LangChainMCPAgent

        src = textwrap.dedent(
            inspect.getsource(LangChainMCPAgent._detect_authorization_code)
        )
        tree = ast.parse(src)
        # No `max(...)` call should remain anywhere in the function body
        # (AST ignores comments, so explanatory prose is safe).
        max_calls = [
            n
            for n in ast.walk(tree)
            if isinstance(n, ast.Call)
            and isinstance(n.func, ast.Name)
            and n.func.id == "max"
        ]
        assert max_calls == []


# ---------------------------------------------------------------------------
# IN-04 — get_llm forwards `streaming` to ChatOllama
# ---------------------------------------------------------------------------
class TestIN04StreamingForwarded:
    def test_streaming_kwarg_passed_to_chatollama(self, monkeypatch):
        import src.agent.llm_factory as lf

        captured = {}

        class _FakeChatOllama:
            def __init__(self, **kwargs):
                captured.update(kwargs)

        import langchain_ollama

        monkeypatch.setattr(langchain_ollama, "ChatOllama", _FakeChatOllama)
        lf.get_llm(provider="ollama", model="llama3.2", streaming=False)
        assert captured.get("streaming") is False
        lf.get_llm(provider="ollama", model="llama3.2", streaming=True)
        assert captured.get("streaming") is True


# ---------------------------------------------------------------------------
# IN-05 — unset MCP_SERVER_*_CAPABILITIES yields [] not [""]
# ---------------------------------------------------------------------------
class TestIN05CapabilitiesEmpty:
    def test_unset_capabilities_is_empty_list(self, monkeypatch):
        from src.config.settings import ConfigManager

        for k in list(__import__("os").environ):
            if k.startswith("MCP_SERVER_"):
                monkeypatch.delenv(k, raising=False)
        monkeypatch.setenv("MCP_SERVER_DEMO_ENDPOINT", "ws://localhost:9/x")
        cfgs = ConfigManager().get_mcp_server_configs()
        assert cfgs["demo"]["capabilities"] == []

    def test_set_capabilities_filtered_and_trimmed(self, monkeypatch):
        from src.config.settings import ConfigManager

        monkeypatch.setenv("MCP_SERVER_DEMO_ENDPOINT", "ws://localhost:9/x")
        monkeypatch.setenv(
            "MCP_SERVER_DEMO_CAPABILITIES", " read , , write "
        )
        cfgs = ConfigManager().get_mcp_server_configs()
        assert cfgs["demo"]["capabilities"] == ["read", "write"]


# ---------------------------------------------------------------------------
# IN-06 — handle_authorization_callback rejects a missing session_id
# ---------------------------------------------------------------------------
class TestIN06SessionIdRequired:
    def _facilitator(self):
        from types import SimpleNamespace
        from src.authentication.oauth_manager import UserAuthorizationFacilitator

        cfg = SimpleNamespace(
            pingone=SimpleNamespace(
                redirect_uri="https://api.ping.demo:4000/callback",
                authorization_endpoint="https://auth.example/as/authorize",
            )
        )
        return UserAuthorizationFacilitator(config=cfg)

    def test_signature_has_no_optional_session_id(self):
        from src.authentication.oauth_manager import UserAuthorizationFacilitator

        sig = inspect.signature(
            UserAuthorizationFacilitator.handle_authorization_callback
        )
        p = sig.parameters["session_id"]
        assert p.default is inspect.Parameter.empty  # required, no default

    def test_empty_session_id_rejected_before_state_check(self):
        fac = self._facilitator()
        url = fac.generate_authorization_url(
            client_id="c1",
            scope="banking:read",
            session_id="sess-1",
            mcp_server_id="mcp-1",
        )
        from urllib.parse import urlparse, parse_qs

        state = parse_qs(urlparse(url).query)["state"][0]
        with pytest.raises(ValueError, match="session_id is required"):
            fac.handle_authorization_callback("the-code", state, "")

    def test_valid_session_still_works(self):
        fac = self._facilitator()
        url = fac.generate_authorization_url(
            client_id="c1",
            scope="banking:read",
            session_id="sess-ok",
            mcp_server_id="mcp-1",
        )
        from urllib.parse import urlparse, parse_qs

        state = parse_qs(urlparse(url).query)["state"][0]
        data = fac.handle_authorization_callback(
            "the-code", state, session_id="sess-ok"
        )
        assert data["authorization_code"] == "the-code"
        assert data["session_id"] == "sess-ok"


# ---------------------------------------------------------------------------
# IN-07 — PBKDF2 derivation memoised across EncryptionManager instances
# ---------------------------------------------------------------------------
class TestIN07DerivationCached:
    def test_same_key_salt_derives_once(self):
        from src.security import encryption

        encryption._derive_fernet_key.cache_clear()
        m1 = encryption.EncryptionManager("shared-master-key-aaaa")
        m2 = encryption.EncryptionManager("shared-master-key-aaaa")
        info = encryption._derive_fernet_key.cache_info()
        # two managers, one derivation: the second was a cache hit
        assert info.hits >= 1
        # behavior intact: round-trips and cross-instance decryptable
        token = m1.encrypt("hello")
        assert m2.decrypt(token) == "hello"

    def test_distinct_keys_independent(self):
        from src.security import encryption

        m1 = encryption.EncryptionManager("key-one-xxxxxxxxxxxx")
        m2 = encryption.EncryptionManager("key-two-yyyyyyyyyyyy")
        token = m1.encrypt("secret")
        with pytest.raises(encryption.EncryptionError):
            m2.decrypt(token)  # different key -> cannot decrypt
