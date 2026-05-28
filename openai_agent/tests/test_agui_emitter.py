import pytest
from src.agui_emitter import AGUIEmitter


@pytest.fixture
def sink_and_emitter():
    collected = []
    async def sink(event): collected.append(event)
    emitter = AGUIEmitter(run_id="r1", thread_id="t1", sink=sink)
    return collected, emitter


@pytest.mark.asyncio
async def test_run_start_end(sink_and_emitter):
    collected, emitter = sink_and_emitter
    await emitter.on_run_start()
    await emitter.on_run_end()
    types = [e["type"] for e in collected]
    assert "RUN_STARTED" in types
    assert "RUN_FINISHED" in types


@pytest.mark.asyncio
async def test_text_token_sequence(sink_and_emitter):
    collected, emitter = sink_and_emitter
    await emitter.on_llm_start()
    await emitter.on_llm_token("hello")
    await emitter.on_llm_token(" world")
    await emitter.on_llm_end()
    types = [e["type"] for e in collected]
    assert types == ["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"]
    assert collected[1]["delta"] == "hello"


@pytest.mark.asyncio
async def test_tool_call_sequence(sink_and_emitter):
    collected, emitter = sink_and_emitter
    await emitter.on_tool_start("get_accounts", "tc_1", '{"userId":"u1"}')
    await emitter.on_tool_end("tc_1", {"accounts": []})
    types = [e["type"] for e in collected]
    assert "TOOL_CALL_START" in types
    assert "TOOL_CALL_ARGS" in types
    assert "STATE_DELTA" in types
    assert "TOOL_CALL_END" in types
    start = next(e for e in collected if e["type"] == "TOOL_CALL_START")
    assert start["toolCallName"] == "get_accounts"


@pytest.mark.asyncio
async def test_error_emits_error_and_finished(sink_and_emitter):
    collected, emitter = sink_and_emitter
    await emitter.on_error(RuntimeError("boom"))
    types = [e["type"] for e in collected]
    assert "ERROR" in types
    assert "RUN_FINISHED" in types
