"""
Helix LangChain chat model adapter.

Wraps the Helix conversation API in a LangChain BaseChatModel so it can be
passed directly to create_react_agent() and used anywhere LangChain expects
a chat model.

API flow (mirrors demo_api_server/services/helixLlmService.js):
  1. POST /environments/{env_id}/agents/{agent_id}/conversations
         body: {"agent": {"version": "published"}}
  2. POST /environments/{env_id}/conversations/{conv_id}/channels/{channel_id}/messages
         body: {"class": "start", "content": {prompt_field_id: prompt}}
         Content-Type: application/json; async=false
  3. Poll GET same messages URL until agent reply found (30 s timeout).

Auth: x-api-key header (NOT Authorization: Bearer).

System message handling: Helix directive fields are not always active in
published agents.  The system message is prepended to the user text so the
LLM receives full instruction context, matching helixLlmService.js behaviour.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, List, Optional
from urllib.parse import urlparse

import httpx
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

logger = logging.getLogger(__name__)

HELIX_PATH = "/dpc/jas/helix/v1"
POLL_TIMEOUT_SECONDS = 30
POLL_INTERVAL_SECONDS = 1


def _api_base(base_url: str) -> str:
    """Return the canonical Helix API root from an arbitrary base URL."""
    try:
        origin = urlparse(base_url).scheme + "://" + urlparse(base_url).netloc
        return origin + HELIX_PATH
    except Exception:
        return base_url.rstrip("/").split("/dpc/")[0] + HELIX_PATH


def _extract_value(data: Any) -> Optional[str]:
    """
    Extract the agent response text from a Helix messages payload.
    Mirrors extractValue() in helixLlmService.js.
    """
    items = data if isinstance(data, list) else (data.get("content", [data]) if isinstance(data, dict) else [data])
    # Find completed message
    for m in items:
        if not isinstance(m, dict):
            continue
        if m.get("class") in ("complete",) or m.get("message_class") == "complete":
            raw = m.get("value")
            if raw is not None:
                if isinstance(raw, str):
                    try:
                        import json
                        parsed = json.loads(raw)
                        if isinstance(parsed, dict) and isinstance(parsed.get("response"), str):
                            return parsed["response"]
                    except Exception:
                        pass
                    return raw
    return None


def _build_prompt(messages: List[BaseMessage]) -> str:
    """
    Collapse a LangChain message list into the single prompt string that Helix
    receives via the prompt_field_id content key.

    System message is prepended to the last user message so instruction context
    is always present (matches helixLlmService.js behaviour).
    """
    system_text = ""
    user_text = ""
    for msg in messages:
        role = msg.__class__.__name__
        content = msg.content if isinstance(msg.content, str) else str(msg.content)
        if role == "SystemMessage":
            system_text = content
        elif role in ("HumanMessage",):
            user_text = content  # last one wins

    if not user_text:
        # Fall back to last message of any type
        last = messages[-1] if messages else None
        user_text = (last.content if last and isinstance(last.content, str) else str(last.content)) if last else ""

    return f"{system_text}\n\n{user_text}" if system_text else user_text


class ChatHelix(BaseChatModel):
    """
    LangChain BaseChatModel backed by the Helix conversation API.

    Required fields (set at construction or via HELIX_* env vars):
        helix_base_url
        helix_api_key
        helix_environment_id
        helix_agent_id
        helix_prompt_field_id
    """

    helix_base_url: str = Field(..., description="Helix tenant origin URL")
    helix_api_key: str = Field(..., description="Helix API key (agent-scoped)")
    helix_environment_id: str = Field(..., description="Helix environment UUID")
    helix_agent_id: str = Field(..., description="Helix agent name (case-sensitive)")
    helix_prompt_field_id: str = Field(..., description="Input field ID inside the AI Task node")

    @property
    def _llm_type(self) -> str:
        return "helix"

    # ------------------------------------------------------------------
    # Internal async implementation
    # ------------------------------------------------------------------

    async def _call_helix_async(self, messages: List[BaseMessage]) -> str:
        """Call the Helix conversation API and return the agent's text reply."""
        base = _api_base(self.helix_base_url)
        headers_json = {"Content-Type": "application/json", "x-api-key": self.helix_api_key}
        prompt = _build_prompt(messages)

        async with httpx.AsyncClient(timeout=60.0) as client:
            # Step 1 — create conversation
            conv_url = f"{base}/environments/{self.helix_environment_id}/agents/{self.helix_agent_id}/conversations"
            logger.debug("Helix: creating conversation at %s", conv_url)
            conv_resp = await client.post(conv_url, headers=headers_json, json={"agent": {"version": "published"}})
            if conv_resp.status_code != 200 and conv_resp.status_code != 201:
                raise RuntimeError(f"Helix createConversation failed: {conv_resp.status_code} {conv_resp.text}")
            conv = conv_resp.json()
            if not conv or not conv.get("id"):
                raise RuntimeError(
                    "Helix createConversation returned null — check agent name, key scope, and published version"
                )
            conversation_id = conv["id"]
            channel_id = conv.get("home_channel", "default")
            logger.debug("Helix: conversation %s channel %s", conversation_id, channel_id)

            # Step 2 — post message
            msg_url = f"{base}/environments/{self.helix_environment_id}/conversations/{conversation_id}/channels/{channel_id}/messages"
            msg_headers = {**headers_json, "Content-Type": "application/json; async=false"}
            body = {"class": "start", "content": {self.helix_prompt_field_id: prompt}}
            msg_resp = await client.post(msg_url, headers=msg_headers, json=body)
            if not msg_resp.is_success:
                raise RuntimeError(f"Helix sendMessage failed: {msg_resp.status_code} {msg_resp.text}")
            msg_data = msg_resp.json()
            query_message_id = msg_data.get("message_id") or msg_data.get("id")

            # Check if POST response already contains the answer (immediate mode)
            immediate = _extract_value(msg_data)
            if immediate is not None:
                logger.debug("Helix: immediate response received")
                return immediate

            # Step 3 — poll for agent response
            logger.debug("Helix: polling for response (timeout=%ds)", POLL_TIMEOUT_SECONDS)
            deadline = asyncio.get_event_loop().time() + POLL_TIMEOUT_SECONDS
            while asyncio.get_event_loop().time() < deadline:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                poll_resp = await client.get(msg_url, headers={"x-api-key": self.helix_api_key})
                if not poll_resp.is_success:
                    raise RuntimeError(f"Helix poll failed: {poll_resp.status_code} {poll_resp.text}")
                data = poll_resp.json()
                # Look for agent message that isn't the one we posted
                if isinstance(data, list):
                    for m in data:
                        if (
                            isinstance(m, dict)
                            and m.get("sender_role") == "agent"
                            and m.get("message_id") != query_message_id
                            and m.get("value") is not None
                        ):
                            result = _extract_value(m)
                            if result is not None:
                                logger.debug("Helix: agent reply received (poll)")
                                return result
                # Fall back to top-level extraction
                result = _extract_value(data)
                if result is not None:
                    return result

        raise TimeoutError(f"Timed out waiting for Helix response (agent={self.helix_agent_id})")

    # ------------------------------------------------------------------
    # LangChain interface — sync wrapper around async implementation
    # ------------------------------------------------------------------

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        """Sync entry point — runs the async implementation in a new event loop."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Inside an already-running loop (e.g. FastAPI) — use a thread executor
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    future = pool.submit(asyncio.run, self._call_helix_async(messages))
                    content = future.result(timeout=POLL_TIMEOUT_SECONDS + 5)
            else:
                content = loop.run_until_complete(self._call_helix_async(messages))
        except Exception as exc:
            logger.error("Helix _generate error: %s", exc)
            raise

        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=content))])

    async def _agenerate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        """Async entry point used by LangGraph graph.ainvoke()."""
        content = await self._call_helix_async(messages)
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=content))])
