"""FastAPI route: POST /run — AG-UI SSE endpoint (Phase 1.5).

Streams AG-UI events as Server-Sent Events for the AG-UI protocol.
Only registered when config.langchain.agui_enabled is True.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..agui.emitter import AGUIEventEmitter
from ..agui.sse_transport import format_sse, KEEPALIVE_PING

logger = logging.getLogger(__name__)

router = APIRouter()

_message_processor: Optional[Any] = None


def set_message_processor(mp: Any) -> None:
    """Wire in the MessageProcessor instance at startup."""
    global _message_processor
    _message_processor = mp


@router.post("/run")
async def agent_run(request: Request) -> StreamingResponse:
    """Accept a chat message and stream AG-UI events back as SSE."""
    body: Dict[str, Any] = await request.json()
    message: str = body.get("message", "")
    session_id: str = body.get("session_id", f"sess_{uuid.uuid4().hex[:8]}")
    auth_token: str = body.get("auth_token", "")
    run_id: str = f"run_{uuid.uuid4().hex[:12]}"

    logger.info("[AG-UI] /run session=%s run=%s", session_id, run_id)

    return StreamingResponse(
        _run_stream(run_id, session_id, message, auth_token),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _run_stream(
    run_id: str, session_id: str, message: str, auth_token: str
) -> AsyncGenerator[str, None]:
    """Drive the agent and yield SSE frames from an asyncio.Queue."""
    queue: asyncio.Queue = asyncio.Queue()

    async def sink(event_dict: Dict[str, Any]) -> None:
        await queue.put(event_dict)

    async def finish() -> None:
        await queue.put(None)  # sentinel: stream done

    emitter = AGUIEventEmitter(run_id=run_id, thread_id=session_id, sink=sink)

    async def keepalive() -> None:
        while True:
            await asyncio.sleep(15)
            await queue.put("__ping__")

    ka_task = asyncio.create_task(keepalive())
    agent_task = asyncio.create_task(
        _invoke_agent(emitter, session_id, message, auth_token, finish)
    )

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            if item == "__ping__":
                yield KEEPALIVE_PING
            else:
                yield format_sse(item)
    finally:
        ka_task.cancel()
        agent_task.cancel()


async def _invoke_agent(
    emitter: AGUIEventEmitter,
    session_id: str,
    message: str,
    auth_token: str,
    finish_fn,
) -> None:
    """Invoke the message processor and drive emitter lifecycle."""
    if _message_processor is None:
        await emitter.on_run_start()
        await emitter.on_error(RuntimeError("Message processor not initialised"))
        await finish_fn()
        return

    process_fn = getattr(_message_processor, "process_agui_message", None)
    if process_fn is None:
        await emitter.on_run_start()
        await emitter.on_error(
            NotImplementedError(
                "MessageProcessor.process_agui_message not yet implemented"
            )
        )
        await finish_fn()
        return

    try:
        await emitter.on_run_start()
        await process_fn(
            session_id=session_id,
            message=message,
            auth_token=auth_token,
            emitter=emitter,
        )
        await emitter.on_run_end()
    except Exception as exc:
        logger.exception("[AG-UI] Agent run error session=%s", session_id)
        await emitter.on_error(exc)
    finally:
        await finish_fn()
