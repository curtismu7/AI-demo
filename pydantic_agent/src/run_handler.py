from __future__ import annotations
import uuid
from typing import AsyncIterator
from fastapi import Request
from fastapi.responses import StreamingResponse
from .agent_factory import build_agent
from .agui_emitter import AGUIEmitter
from .models import BffDeps
from . import config as cfg


async def handle_run(request: Request) -> StreamingResponse:
    body = await request.json()
    thread_id: str = body.get("threadId", str(uuid.uuid4()))
    run_id: str = body.get("runId", str(uuid.uuid4()))
    messages: list[dict] = body.get("messages", [])
    tool_schemas: list[dict] = body.get("tools", [])
    ctx_data: dict = body.get("context", {})

    bff_tool_url: str = ctx_data.get("bffToolUrl") or cfg.BFF_INTERNAL_TOOL_URL
    # BFF doesn't include its internal secret in the run context (the secret
    # lives on the BFF, not in payloads). Fall back to the same env-resolved
    # value the agent will use for its own /internal/agent-tool callbacks.
    bff_internal_secret: str = ctx_data.get("bffInternalSecret") or cfg.BFF_INTERNAL_SECRET
    session_id: str = ctx_data.get("sessionId", "")
    # Per-run model override from BFF context wins; falls back to the env-
    # resolved default (LM Studio's loaded model).
    model: str = ctx_data.get("model") or cfg.LLM_MODEL

    deps = BffDeps(
        bff_tool_url=bff_tool_url,
        bff_internal_secret=bff_internal_secret,
        session_id=session_id,
    )

    user_message = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            user_message = msg.get("content", "")
            break

    agent = build_agent(
        tool_schemas,
        model_name=model,
        base_url=cfg.LLM_BASE_URL,
        api_key=cfg.LLM_API_KEY,
    )

    async def stream_events() -> AsyncIterator[str]:
        collected: list[str] = []

        async def sink(data: str) -> None:
            collected.append(data)

        emitter = AGUIEmitter(run_id, thread_id, sink)

        try:
            await emitter.on_run_start()
            while collected:
                yield collected.pop(0)

            message_id = str(uuid.uuid4())

            async with agent.run_stream(user_message, deps=deps) as result:
                await emitter.on_text_start(message_id)
                while collected:
                    yield collected.pop(0)

                async for text in result.stream_text(delta=True):
                    await emitter.on_text_token(message_id, text)
                    while collected:
                        yield collected.pop(0)

            await emitter.on_text_end(message_id)
            while collected:
                yield collected.pop(0)

            await emitter.on_run_end()
            while collected:
                yield collected.pop(0)

        except Exception as exc:
            collected.clear()
            await emitter.on_error(str(exc))
            while collected:
                yield collected.pop(0)

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
