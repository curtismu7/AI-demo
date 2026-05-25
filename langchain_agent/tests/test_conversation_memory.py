"""
Unit tests for Conversation Memory.

Plan 275-02: _langchain_memories removed; get_conversation_history deprecated (returns []).
The tests in TestConversationMemoryPostMigration assert the new behaviour.
Legacy tests that were tightly coupled to the removed _langchain_memories dict have been
updated to reflect the slimmed interface.
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timedelta, timezone

from src.agent.conversation_memory import ConversationMemory
from src.models.chat import ChatMessage, ChatSession


@pytest.fixture
def conversation_memory():
    """Create conversation memory for testing."""
    return ConversationMemory(
        max_messages_per_session=5,  # Small limit for testing
        session_timeout_hours=1,     # Short timeout for testing
        cleanup_interval_minutes=1   # Short interval for testing
    )


@pytest.fixture
def sample_chat_message():
    """Sample chat message for testing."""
    return ChatMessage(
        id="msg-123",
        session_id="session-123",
        content="Hello, how are you?",
        role="user",
        timestamp=datetime.now(),
        metadata={}
    )


@pytest.fixture
def sample_chat_session():
    """Sample chat session for testing."""
    return ChatSession(
        session_id="session-123",
        user_id="user-456",
        created_at=datetime.now(timezone.utc),
        last_activity=datetime.now(timezone.utc),
        context={"key": "value"}
    )


# ---------------------------------------------------------------------------
# Post-migration tests (Plan 275-02): assert _langchain_memories is gone
# ---------------------------------------------------------------------------

class TestConversationMemoryPostMigration:
    """Tests that assert the Plan 275-02 invariants:
    - _langchain_memories dict has been removed
    - get_conversation_history is deprecated and returns []
    - All other public methods still work correctly
    """

    def test_no_langchain_memories_attribute(self):
        """_langchain_memories must not exist on ConversationMemory after migration."""
        memory = ConversationMemory()
        assert not hasattr(memory, "_langchain_memories"), (
            "_langchain_memories must be removed — LangGraph MemorySaver owns chat history now"
        )

    def test_initialization_no_langchain_memories(self):
        """__init__ must not create a _langchain_memories dict."""
        memory = ConversationMemory(
            max_messages_per_session=100,
            session_timeout_hours=24,
            cleanup_interval_minutes=60,
        )
        assert memory.max_messages_per_session == 100
        assert memory.session_timeout == timedelta(hours=24)
        assert memory.cleanup_interval == timedelta(minutes=60)
        assert memory._sessions == {}
        assert memory._messages == {}
        assert not hasattr(memory, "_langchain_memories")
        assert memory._cleanup_task is None

    @pytest.mark.asyncio
    async def test_get_conversation_history_returns_empty_list(self, conversation_memory):
        """get_conversation_history() is deprecated — must return [] regardless of session state."""
        # Session doesn't exist
        result = await conversation_memory.get_conversation_history("nonexistent")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_conversation_history_returns_empty_for_active_session(self, conversation_memory):
        """get_conversation_history() returns [] even when the session has messages."""
        session_id = "session-xyz"
        msg = ChatMessage(
            id="1",
            session_id=session_id,
            content="Hello",
            role="user",
            timestamp=datetime.now(),
            metadata={},
        )
        await conversation_memory.add_message(session_id, msg)

        # Must still return [] — history lives in LangGraph MemorySaver now
        result = await conversation_memory.get_conversation_history(session_id)
        assert result == []

    @pytest.mark.asyncio
    async def test_get_conversation_history_with_limit_returns_empty(self, conversation_memory):
        """get_conversation_history(limit=N) also returns []."""
        result = await conversation_memory.get_conversation_history("any-session", limit=5)
        assert result == []

    @pytest.mark.asyncio
    async def test_add_message_still_stores_in_raw_messages(self, conversation_memory, sample_chat_message):
        """add_message must still store the ChatMessage in _messages (session_manager uses get_raw_messages)."""
        sid = sample_chat_message.session_id
        await conversation_memory.add_message(sid, sample_chat_message)

        raw = await conversation_memory.get_raw_messages(sid)
        assert len(raw) == 1
        assert raw[0].content == sample_chat_message.content

    @pytest.mark.asyncio
    async def test_get_or_create_session_does_not_create_langchain_memory(self, conversation_memory):
        """get_or_create_session must NOT initialise a _langchain_memories entry."""
        session = await conversation_memory.get_or_create_session("sid-1", "uid-1")
        assert session.session_id == "sid-1"
        assert not hasattr(conversation_memory, "_langchain_memories")

    @pytest.mark.asyncio
    async def test_clear_session_works_without_langchain_memories(self, conversation_memory, sample_chat_message):
        """clear_session must work even though _langchain_memories no longer exists."""
        sid = sample_chat_message.session_id
        await conversation_memory.add_message(sid, sample_chat_message)

        # Should not raise
        await conversation_memory.clear_session(sid)

        assert sid not in conversation_memory._sessions
        assert sid not in conversation_memory._messages

    @pytest.mark.asyncio
    async def test_cleanup_works_without_langchain_memories(self, conversation_memory):
        """cleanup() must not reference _langchain_memories."""
        sid = "session-for-cleanup"
        await conversation_memory.get_or_create_session(sid)
        msg = ChatMessage(
            id="c1",
            session_id=sid,
            content="Hi",
            role="user",
            timestamp=datetime.now(),
            metadata={},
        )
        await conversation_memory.add_message(sid, msg)
        await conversation_memory.start_cleanup_task()

        # Should not raise
        await conversation_memory.cleanup()

        assert conversation_memory._sessions == {}
        assert conversation_memory._messages == {}
        assert not hasattr(conversation_memory, "_langchain_memories")

    @pytest.mark.asyncio
    async def test_trim_session_messages_works_without_langchain_memories(self, conversation_memory):
        """Adding more than max_messages_per_session must trim _messages only (no _langchain_memories)."""
        sid = "session-trim"
        # max_messages_per_session=5 for the fixture
        for i in range(7):
            msg = ChatMessage(
                id=f"m{i}",
                session_id=sid,
                content=f"msg {i}",
                role="user",
                timestamp=datetime.now(),
                metadata={},
            )
            await conversation_memory.add_message(sid, msg)

        raw = await conversation_memory.get_raw_messages(sid)
        assert len(raw) == 5
        assert raw[0].content == "msg 2"
        assert raw[-1].content == "msg 6"


# ---------------------------------------------------------------------------
# Core public-API tests (still valid after migration)
# ---------------------------------------------------------------------------

class TestConversationMemory:
    """Tests for the stable public ConversationMemory interface."""

    @pytest.mark.asyncio
    async def test_start_stop_cleanup_task(self, conversation_memory):
        """Test starting and stopping cleanup task."""
        await conversation_memory.start_cleanup_task()

        assert conversation_memory._cleanup_task is not None
        assert not conversation_memory._cleanup_task.done()

        await conversation_memory.stop_cleanup_task()

        assert conversation_memory._cleanup_task.done()

    @pytest.mark.asyncio
    async def test_get_or_create_session_new(self, conversation_memory):
        """Test creating a new session."""
        session_id = "new-session-123"
        user_id = "user-456"

        session = await conversation_memory.get_or_create_session(session_id, user_id)

        assert session.session_id == session_id
        assert session.user_id == user_id
        assert session.created_at is not None
        assert session.last_activity is not None
        assert session.context == {}

        # Session is stored in _sessions
        assert session_id in conversation_memory._sessions

    @pytest.mark.asyncio
    async def test_get_or_create_session_existing(self, conversation_memory, sample_chat_session):
        """Test getting an existing session."""
        session_id = sample_chat_session.session_id

        conversation_memory._sessions[session_id] = sample_chat_session
        original_activity = sample_chat_session.last_activity

        await asyncio.sleep(0.01)

        session = await conversation_memory.get_or_create_session(session_id)

        assert session == sample_chat_session
        assert session.last_activity > original_activity

    @pytest.mark.asyncio
    async def test_add_message(self, conversation_memory, sample_chat_message):
        """Test adding a message to conversation."""
        await conversation_memory.add_message(
            session_id=sample_chat_message.session_id,
            message=sample_chat_message,
        )

        messages = conversation_memory._messages[sample_chat_message.session_id]
        assert len(messages) == 1
        assert messages[0] == sample_chat_message

    @pytest.mark.asyncio
    async def test_add_message_with_trimming(self, conversation_memory):
        """Test adding messages with automatic trimming."""
        session_id = "session-123"

        for i in range(7):  # Limit is 5
            message = ChatMessage(
                id=f"msg-{i}",
                session_id=session_id,
                content=f"Message {i}",
                role="user",
                timestamp=datetime.now(),
                metadata={},
            )
            await conversation_memory.add_message(session_id, message)

        messages = conversation_memory._messages[session_id]
        assert len(messages) == 5
        assert messages[0].content == "Message 2"
        assert messages[-1].content == "Message 6"

    @pytest.mark.asyncio
    async def test_get_conversation_history_nonexistent_session(self, conversation_memory):
        """get_conversation_history returns [] for nonexistent session (deprecated)."""
        history = await conversation_memory.get_conversation_history("nonexistent")
        assert history == []

    @pytest.mark.asyncio
    async def test_get_raw_messages(self, conversation_memory, sample_chat_message):
        """Test getting raw chat messages."""
        await conversation_memory.add_message(
            session_id=sample_chat_message.session_id,
            message=sample_chat_message,
        )

        messages = await conversation_memory.get_raw_messages(sample_chat_message.session_id)

        assert len(messages) == 1
        assert messages[0] == sample_chat_message

    @pytest.mark.asyncio
    async def test_get_raw_messages_with_limit(self, conversation_memory):
        """Test getting raw messages with limit."""
        session_id = "session-123"

        for i in range(5):
            message = ChatMessage(
                id=f"msg-{i}",
                session_id=session_id,
                content=f"Message {i}",
                role="user",
                timestamp=datetime.now(),
                metadata={},
            )
            await conversation_memory.add_message(session_id, message)

        messages = await conversation_memory.get_raw_messages(session_id, limit=2)

        assert len(messages) == 2
        assert messages[0].content == "Message 3"
        assert messages[1].content == "Message 4"

    @pytest.mark.asyncio
    async def test_update_session_context(self, conversation_memory):
        """Test updating session context."""
        session_id = "session-123"

        await conversation_memory.get_or_create_session(session_id)

        context_updates = {"key1": "value1", "key2": "value2"}
        await conversation_memory.update_session_context(session_id, context_updates)

        session = conversation_memory._sessions[session_id]
        assert session.context["key1"] == "value1"
        assert session.context["key2"] == "value2"

    @pytest.mark.asyncio
    async def test_get_session_context(self, conversation_memory):
        """Test getting session context."""
        session_id = "session-123"

        await conversation_memory.get_or_create_session(session_id)
        await conversation_memory.update_session_context(session_id, {"key": "value"})

        context = await conversation_memory.get_session_context(session_id)

        assert context == {"key": "value"}

    @pytest.mark.asyncio
    async def test_get_session_context_nonexistent(self, conversation_memory):
        """Test getting context for nonexistent session."""
        context = await conversation_memory.get_session_context("nonexistent")
        assert context == {}

    @pytest.mark.asyncio
    async def test_clear_session(self, conversation_memory, sample_chat_message):
        """Test clearing a session."""
        session_id = sample_chat_message.session_id

        await conversation_memory.add_message(session_id, sample_chat_message)

        assert session_id in conversation_memory._sessions
        assert session_id in conversation_memory._messages

        await conversation_memory.clear_session(session_id)

        assert session_id not in conversation_memory._sessions
        assert session_id not in conversation_memory._messages

    @pytest.mark.asyncio
    async def test_get_active_sessions(self, conversation_memory):
        """Test getting active sessions."""
        from datetime import timezone
        now = datetime.now(timezone.utc)

        active_session = ChatSession(
            session_id="active-session",
            user_id=None,
            created_at=now,
            last_activity=now,
            context={},
        )
        conversation_memory._sessions["active-session"] = active_session

        expired_session = ChatSession(
            session_id="expired-session",
            user_id=None,
            created_at=now - timedelta(hours=2),
            last_activity=now - timedelta(hours=2),
            context={},
        )
        conversation_memory._sessions["expired-session"] = expired_session

        active_sessions = await conversation_memory.get_active_sessions()

        assert "active-session" in active_sessions
        assert "expired-session" not in active_sessions

    @pytest.mark.asyncio
    async def test_get_active_sessions_count(self, conversation_memory):
        """Test getting active sessions count."""
        await conversation_memory.get_or_create_session("active-session")

        count = await conversation_memory.get_active_sessions_count()
        assert count == 1

    @pytest.mark.asyncio
    async def test_get_session_stats(self, conversation_memory):
        """Test getting session statistics."""
        session_id = "session-123"

        await conversation_memory.get_or_create_session(session_id)

        user_message = ChatMessage(id="1", session_id=session_id, content="Hello", role="user", timestamp=datetime.now(), metadata={})
        assistant_message = ChatMessage(id="2", session_id=session_id, content="Hi", role="assistant", timestamp=datetime.now(), metadata={})

        await conversation_memory.add_message(session_id, user_message)
        await conversation_memory.add_message(session_id, assistant_message)
        await conversation_memory.update_session_context(session_id, {"key": "value"})

        stats = await conversation_memory.get_session_stats(session_id)

        assert stats["exists"] is True
        assert stats["total_messages"] == 2
        assert stats["user_messages"] == 1
        assert stats["assistant_messages"] == 1
        assert stats["context_keys"] == ["key"]
        assert stats["is_active"] is True

    @pytest.mark.asyncio
    async def test_get_session_stats_nonexistent(self, conversation_memory):
        """Test getting stats for nonexistent session."""
        stats = await conversation_memory.get_session_stats("nonexistent")
        assert stats == {"exists": False}

    @pytest.mark.asyncio
    async def test_cleanup_expired_sessions(self, conversation_memory):
        """Test cleanup of expired sessions."""
        from datetime import timezone
        now = datetime.now(timezone.utc)

        expired_session = ChatSession(
            session_id="expired-session",
            user_id=None,
            created_at=now - timedelta(hours=2),
            last_activity=now - timedelta(hours=2),
            context={},
        )
        conversation_memory._sessions["expired-session"] = expired_session

        active_session = ChatSession(
            session_id="active-session",
            user_id=None,
            created_at=now,
            last_activity=now,
            context={},
        )
        conversation_memory._sessions["active-session"] = active_session

        await conversation_memory._cleanup_expired_sessions()

        assert "expired-session" not in conversation_memory._sessions
        assert "active-session" in conversation_memory._sessions

    @pytest.mark.asyncio
    async def test_get_memory_stats(self, conversation_memory):
        """Test getting memory statistics."""
        session_id = "session-123"
        await conversation_memory.get_or_create_session(session_id)

        message = ChatMessage(id="1", session_id=session_id, content="Hello", role="user", timestamp=datetime.now(), metadata={})
        await conversation_memory.add_message(session_id, message)

        stats = await conversation_memory.get_memory_stats()

        assert stats["total_sessions"] == 1
        assert stats["active_sessions"] == 1
        assert stats["total_messages"] == 1
        assert stats["max_messages_per_session"] == 5
        assert stats["session_timeout_hours"] == 1
        assert stats["cleanup_running"] is False

    @pytest.mark.asyncio
    async def test_cleanup(self, conversation_memory):
        """Test cleanup of conversation memory."""
        session_id = "session-123"
        await conversation_memory.get_or_create_session(session_id)

        message = ChatMessage(id="1", session_id=session_id, content="Hello", role="user", timestamp=datetime.now(), metadata={})
        await conversation_memory.add_message(session_id, message)

        await conversation_memory.start_cleanup_task()

        await conversation_memory.cleanup()

        assert conversation_memory._sessions == {}
        assert conversation_memory._messages == {}
        assert conversation_memory._cleanup_task.done()


if __name__ == "__main__":
    pytest.main([__file__])
