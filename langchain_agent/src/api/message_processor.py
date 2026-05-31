"""
Message processor for coordinating between chat interface and agent.
"""
import asyncio
import logging
from typing import Dict, Any, Optional, Callable, Tuple
from datetime import datetime, timezone, timedelta
import uuid

from models.chat import ChatMessage, ChatSession
from models.auth import AuthorizationCode
from agent.langchain_mcp_agent import LangChainMCPAgent
from .session_manager import SessionManager
from .websocket_handler import ChatWebSocketHandler
from config.settings import get_config


logger = logging.getLogger(__name__)


class _SessionWorker:
    """One ordered processing path for a single chat session (WR-02 Option A).

    Owns its own ``asyncio.Queue`` and exactly ONE worker ``asyncio.Task``.
    A single sequential consumer task is what guarantees the load-bearing
    property: messages for THIS session are processed in strict arrival
    order (conversation turns must never reorder). Concurrency across
    sessions is achieved by having one of these PER session — different
    sessions are different tasks and interleave on the event loop.

    The worker task is the context in which ``_handle_queued_message`` runs,
    which is why WR-06's ``_current_tracer`` ContextVar stays leak-proof
    under real concurrency: ``set_tracer()`` (inside the agent call) and the
    tool-path ``_current_tracer.get()`` both execute inside THIS task's
    context, and ``asyncio.create_task`` copy-on-create isolates it from
    every other session's worker.
    """

    __slots__ = ("session_id", "queue", "task", "last_activity", "closing")

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.queue: asyncio.Queue = asyncio.Queue()
        self.task: Optional[asyncio.Task] = None
        self.last_activity: datetime = datetime.now(timezone.utc)
        self.closing: bool = False


class MessageProcessor:
    """
    Coordinates message processing between chat interface and LangChain agent.
    
    Handles message routing, authorization flow coordination, and response delivery
    for the chat interface backend.
    """
    
    def __init__(self, 
                 agent: LangChainMCPAgent,
                 session_manager: SessionManager,
                 websocket_handler: ChatWebSocketHandler,
                 config=None):
        """
        Initialize the message processor.
        
        Args:
            agent: The LangChain MCP agent
            session_manager: The session manager
            websocket_handler: The WebSocket handler
            config: Optional configuration object
        """
        self.config = config or get_config()
        self.agent = agent
        self.session_manager = session_manager
        self.websocket_handler = websocket_handler
        
        # Pending authorization requests: state -> (session_id, created_at).
        # Tuple form lets us TTL-evict abandoned states whose user never
        # returned the auth code. Without TTL the dict grew unbounded
        # (one entry per abandoned login).
        self._pending_auth_requests: Dict[str, Tuple[str, datetime]] = {}
        self._pending_auth_ttl = timedelta(minutes=15)

        # Authorization callbacks: session_id -> callback
        self._auth_callbacks: Dict[str, Callable] = {}
        
        # Ingress queue (compat surface). process_chat_message /
        # process_auth_response enqueue here; a single dispatcher task drains
        # it and FANS each item OUT to the owning session's worker. The
        # dispatcher does no real work — it only routes — so it never blocks
        # on an LLM turn. Real processing happens in per-session workers
        # (WR-02 Option A): different sessions run concurrently, turns within
        # one session stay strictly ordered.
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._processing_task: Optional[asyncio.Task] = None
        self._shutdown_event = asyncio.Event()

        # WR-02 Option A: per-session worker pool.
        # session_id -> _SessionWorker (own asyncio.Queue + own worker Task).
        self._session_workers: Dict[str, "_SessionWorker"] = {}
        self._workers_lock = asyncio.Lock()
        self._max_session_workers = self.config.chat.max_session_workers
        self._session_worker_idle_ttl = timedelta(
            seconds=self.config.chat.session_worker_idle_ttl_seconds
        )
        self._reap_interval_seconds = (
            self.config.chat.session_worker_reap_interval_seconds
        )
        # CR-01-class guard: this reaper MUST be started at app init (see
        # MessageProcessor.start(), called from main.py). A cleanup loop that
        # is wired but never started is the exact CR-01 bug.
        self._reaper_task: Optional[asyncio.Task] = None

        logger.info(
            "Initialized MessageProcessor (per-session workers; cap=%d, "
            "idle_ttl=%ss)",
            self._max_session_workers,
            self.config.chat.session_worker_idle_ttl_seconds,
        )

    async def start(self) -> None:
        """Start the dispatcher and the per-session-worker idle reaper.

        CR-01-class invariant: the reaper is started HERE. main.py calls
        MessageProcessor.start() during app init alongside
        SessionManager.start() / ConversationMemory.start_cleanup_task().
        """
        if self._processing_task is None or self._processing_task.done():
            self._processing_task = asyncio.create_task(self._process_message_queue())
            logger.info("Started message dispatcher task")
        if self._reaper_task is None or self._reaper_task.done():
            self._reaper_task = asyncio.create_task(self._reap_idle_workers_loop())
            logger.info("Started per-session worker idle reaper task")

    async def stop(self) -> None:
        """Stop the dispatcher, reaper, and all per-session workers."""
        self._shutdown_event.set()

        if self._processing_task and not self._processing_task.done():
            try:
                await asyncio.wait_for(self._processing_task, timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("Message dispatcher task did not stop gracefully")
                self._processing_task.cancel()

        if self._reaper_task and not self._reaper_task.done():
            try:
                await asyncio.wait_for(self._reaper_task, timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("Worker reaper task did not stop gracefully")
                self._reaper_task.cancel()

        # Tear down every per-session worker (cancel + await — no orphans).
        async with self._workers_lock:
            session_ids = list(self._session_workers.keys())
        for session_id in session_ids:
            await self._teardown_session_worker(
                session_id, reason="processor shutdown"
            )

        logger.info("Stopped MessageProcessor")
    
    async def process_chat_message(self, chat_message: ChatMessage) -> None:
        """
        Process a chat message from a user.
        
        Args:
            chat_message: The chat message to process
        """
        try:
            # Validate session exists and is active
            if not await self.session_manager.is_session_active(chat_message.session_id):
                logger.warning(f"Received message for inactive session {chat_message.session_id}")
                await self._send_error_response(
                    chat_message.session_id,
                    "Session expired or invalid. Please refresh and try again."
                )
                return
            
            # Add message to session history
            await self.session_manager.add_message_to_session(chat_message.session_id, chat_message)
            
            # Queue message for processing
            await self._message_queue.put({
                "type": "chat_message",
                "message": chat_message,
                "timestamp": datetime.now(timezone.utc)
            })
            
            logger.debug(f"Queued chat message {chat_message.id} for processing")
            
        except Exception as e:
            logger.error(f"Error processing chat message {chat_message.id}: {e}")
            await self._send_error_response(
                chat_message.session_id,
                "Failed to process your message. Please try again."
            )
    
    async def process_auth_response(self, session_id: str, auth_code: str, state: str) -> None:
        """
        Process an authorization response from a user.
        
        Args:
            session_id: The session ID
            auth_code: The authorization code
            state: The state parameter
        """
        try:
            # Evict expired pending requests before validating, so a slow-but-valid
            # response still works but truly-abandoned states don't leak.
            self._sweep_pending_auth_requests()

            # Validate state parameter
            if state not in self._pending_auth_requests:
                logger.warning(f"Received auth response with unknown state {state}")
                await self._send_error_response(
                    session_id,
                    "Invalid authorization state. Please try again."
                )
                return

            # Validate session matches
            expected_session_id = self._pending_auth_requests[state][0]
            if session_id != expected_session_id:
                logger.warning(f"Session ID mismatch for auth response: expected {expected_session_id}, got {session_id}")
                await self._send_error_response(
                    session_id,
                    "Session mismatch for authorization. Please try again."
                )
                return
            
            # Create authorization code object. PingOne issues authorization
            # codes with a default TTL of 10 minutes; mirror that on the
            # client object so AuthorizationCode.is_expired() doesn't
            # short-circuit immediately. The MCP server still does the
            # authoritative validation against the IdP.
            auth_code_obj = AuthorizationCode(
                code=auth_code,
                state=state,
                session_id=session_id,
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
            
            # Queue auth response for processing
            await self._message_queue.put({
                "type": "auth_response",
                "session_id": session_id,
                "auth_code": auth_code_obj,
                "timestamp": datetime.now(timezone.utc)
            })
            
            # Clean up pending request
            del self._pending_auth_requests[state]
            
            logger.info(f"Queued auth response for session {session_id}")
            
        except Exception as e:
            logger.error(f"Error processing auth response for session {session_id}: {e}")
            await self._send_error_response(
                session_id,
                "Failed to process authorization response. Please try again."
            )
    
    async def request_user_authorization(self, session_id: str, auth_url: str, scope: str) -> str:
        """
        Request user authorization and return state parameter.
        
        Args:
            session_id: The session ID
            auth_url: The authorization URL
            scope: The requested scope
            
        Returns:
            str: The state parameter for tracking the request
        """
        try:
            # Generate state parameter
            state = str(uuid.uuid4())
            
            # Store pending request with timestamp for TTL eviction.
            self._pending_auth_requests[state] = (session_id, datetime.now(timezone.utc))
            
            # Send authorization request to user
            success = await self.websocket_handler.send_auth_request(session_id, auth_url, state)
            
            if not success:
                # Clean up if sending failed
                del self._pending_auth_requests[state]
                raise RuntimeError("Failed to send authorization request to user")
            
            logger.info(f"Sent authorization request to session {session_id} with state {state}")
            return state
            
        except Exception as e:
            logger.error(f"Error requesting user authorization for session {session_id}: {e}")
            raise
    
    @staticmethod
    def _session_id_of(message_data: Dict[str, Any]) -> Optional[str]:
        """Extract the owning session_id from an ingress queue item."""
        if message_data.get("type") == "chat_message":
            msg = message_data.get("message")
            return getattr(msg, "session_id", None)
        return message_data.get("session_id")

    async def _process_message_queue(self) -> None:
        """Dispatcher: drain the ingress queue, FAN OUT to per-session workers.

        This task does NO real work. It only routes — so a slow LLM turn in
        one session never blocks dispatch for another (the head-of-line
        blocking WR-02 was about). Strict per-session ordering is preserved
        because each session's items are appended to that ONE session's
        worker queue in dispatch order, and the dispatcher pulls the ingress
        queue FIFO.
        """
        logger.info("Started message dispatcher")

        idle_ticks = 0
        while not self._shutdown_event.is_set():
            try:
                try:
                    message_data = await asyncio.wait_for(
                        self._message_queue.get(),
                        timeout=1.0
                    )
                except asyncio.TimeoutError:
                    # Sweep abandoned pending auth requests every ~60 idle
                    # ticks (≈1 minute). Cheap when the dict is empty.
                    idle_ticks += 1
                    if idle_ticks >= 60:
                        idle_ticks = 0
                        self._sweep_pending_auth_requests()
                    continue  # Check shutdown event

                session_id = self._session_id_of(message_data)
                if not session_id:
                    logger.warning(
                        "Dispatcher dropped item with no session_id: type=%s",
                        message_data.get("type"),
                    )
                    continue

                worker = await self._get_or_create_session_worker(session_id)
                if worker is None:
                    # Cap reached — apply backpressure (do NOT silently drop).
                    logger.warning(
                        "Per-session worker cap (%d) reached — rejecting "
                        "message for session %s",
                        self._max_session_workers,
                        session_id,
                    )
                    await self._send_error_response(
                        session_id,
                        "The assistant is at capacity right now. Please retry "
                        "in a few seconds.",
                    )
                    continue

                worker.last_activity = datetime.now(timezone.utc)
                await worker.queue.put(message_data)

            except Exception as e:
                logger.error(f"Error in message dispatcher: {e}")

        logger.info("Message dispatcher stopped")

    async def _get_or_create_session_worker(
        self, session_id: str
    ) -> Optional["_SessionWorker"]:
        """Return the session's worker, lazily creating it (capped).

        Returns None when the concurrent-worker cap is hit (caller must
        apply backpressure). Worker creation is serialized by
        ``_workers_lock`` so two back-to-back messages for a NEW session
        cannot spawn two workers (which would break intra-session ordering).
        """
        async with self._workers_lock:
            worker = self._session_workers.get(session_id)
            if worker is not None and not worker.closing:
                return worker

            if len(self._session_workers) >= self._max_session_workers:
                return None

            worker = _SessionWorker(session_id)
            worker.task = asyncio.create_task(self._session_worker_loop(worker))
            self._session_workers[session_id] = worker
            logger.info(
                "Created per-session worker for %s (active workers=%d)",
                session_id,
                len(self._session_workers),
            )
            return worker

    async def _session_worker_loop(self, worker: "_SessionWorker") -> None:
        """The single ordered consumer for ONE session.

        Strictly sequential: it awaits each message to completion before
        pulling the next, so conversation turns for this session never
        reorder. Running ``_handle_queued_message`` HERE is also what keeps
        WR-06's ``_current_tracer`` ContextVar isolated per session under
        real concurrency (set + read both happen inside this task).
        """
        session_id = worker.session_id
        logger.debug("Session worker started for %s", session_id)
        try:
            while not self._shutdown_event.is_set() and not worker.closing:
                try:
                    message_data = await asyncio.wait_for(
                        worker.queue.get(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue
                worker.last_activity = datetime.now(timezone.utc)
                await self._handle_queued_message(message_data)
                worker.last_activity = datetime.now(timezone.utc)
        except asyncio.CancelledError:
            logger.debug("Session worker for %s cancelled", session_id)
            raise
        except Exception as e:
            logger.error(
                "Session worker for %s crashed: %s", session_id, e
            )
        finally:
            logger.debug("Session worker stopped for %s", session_id)

    async def _teardown_session_worker(
        self, session_id: str, reason: str
    ) -> None:
        """Deterministically tear down a session's worker.

        Cancels + awaits the worker task (no orphans) and discards any
        still-queued messages for the now-dead session with a logged reason
        — they are NOT processed against a closed session.
        """
        async with self._workers_lock:
            worker = self._session_workers.pop(session_id, None)
        if worker is None:
            return

        worker.closing = True
        pending = worker.queue.qsize()
        if pending:
            logger.info(
                "Discarding %d pending message(s) for session %s (%s)",
                pending,
                session_id,
                reason,
            )
        if worker.task and not worker.task.done():
            worker.task.cancel()
            try:
                await worker.task
            except (asyncio.CancelledError, Exception):
                pass
        logger.info(
            "Tore down per-session worker for %s (%s)", session_id, reason
        )

    async def _reap_idle_workers_loop(self) -> None:
        """Reap per-session workers idle past TTL.

        Mirrors SessionManager._cleanup_loop / ConversationMemory._cleanup_loop:
        a wait-for(shutdown, timeout=interval) tick loop that exits promptly
        on shutdown. CR-01-class invariant: this loop is only useful if it is
        actually STARTED — MessageProcessor.start() schedules it at app init.
        """
        logger.info(
            "Started per-session worker reaper (idle_ttl=%ss, interval=%ss)",
            self._session_worker_idle_ttl.total_seconds(),
            self._reap_interval_seconds,
        )
        while not self._shutdown_event.is_set():
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=self._reap_interval_seconds,
                )
                break  # shutdown requested
            except asyncio.TimeoutError:
                pass  # interval elapsed — run a reap pass

            try:
                await self._reap_idle_workers_once()
            except Exception as e:
                logger.error(f"Error during worker reap pass: {e}")

        logger.info("Per-session worker reaper stopped")

    async def _reap_idle_workers_once(self) -> int:
        """Tear down workers idle (no messages, empty queue) past TTL."""
        cutoff = datetime.now(timezone.utc) - self._session_worker_idle_ttl
        async with self._workers_lock:
            idle = [
                sid
                for sid, w in self._session_workers.items()
                if w.queue.empty() and w.last_activity < cutoff
            ]
        for session_id in idle:
            await self._teardown_session_worker(
                session_id, reason="idle TTL expired"
            )
        if idle:
            logger.info("Reaped %d idle session worker(s)", len(idle))
        return len(idle)
    
    async def _handle_queued_message(self, message_data: Dict[str, Any]) -> None:
        """
        Handle a queued message.
        
        Args:
            message_data: The message data from the queue
        """
        message_type = message_data.get("type")
        
        try:
            if message_type == "chat_message":
                await self._handle_chat_message(message_data["message"])
            elif message_type == "auth_response":
                await self._handle_auth_response(
                    message_data["session_id"],
                    message_data["auth_code"]
                )
            else:
                logger.warning(f"Unknown message type in queue: {message_type}")
        
        except Exception as e:
            logger.error(f"Error handling queued message of type {message_type}: {e}")
    
    async def _handle_chat_message(self, chat_message: ChatMessage) -> None:
        """
        Handle a chat message by processing it with the agent.
        
        Args:
            chat_message: The chat message to handle
        """
        session_id = chat_message.session_id
        
        try:
            logger.info(f"Processing chat message {chat_message.id} from session {session_id}")
            
            # Send typing indicator
            await self.websocket_handler.send_message_to_session(session_id, {
                "type": "typing_start",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            # Process message with agent (with real-time tracing + optional WebSocket streaming)
            response = await self.agent.process_message_with_tracing(
                chat_message.content,
                session_id,
                stream_context={"websocket_handler": self.websocket_handler},
            )
            
            # Stop typing indicator
            await self.websocket_handler.send_message_to_session(session_id, {
                "type": "typing_stop",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            # Create assistant message
            assistant_message = ChatMessage.create_assistant_message(
                session_id=session_id,
                content=response,
                metadata={
                    "processing_time": datetime.now(timezone.utc).isoformat(),
                    "agent_version": "1.0"
                }
            )
            
            # Add to session history
            await self.session_manager.add_message_to_session(session_id, assistant_message)
            
            # Send response to user
            await self.websocket_handler.send_chat_response(
                session_id,
                response,
                metadata=assistant_message.metadata
            )
            
            logger.info(f"Successfully processed chat message {chat_message.id}")
            
        except Exception as e:
            logger.error(f"Error handling chat message {chat_message.id}: {e}")
            
            # Stop typing indicator
            await self.websocket_handler.send_message_to_session(session_id, {
                "type": "typing_stop",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            # Send error response
            await self._send_error_response(
                session_id,
                "I encountered an error while processing your message. Please try again."
            )
    
    async def _handle_auth_response(self, session_id: str, auth_code: AuthorizationCode) -> None:
        """
        Handle an authorization response by notifying waiting callbacks.
        
        Args:
            session_id: The session ID
            auth_code: The authorization code
        """
        try:
            logger.info(f"Handling auth response for session {session_id}")
            
            # Check if there's a callback waiting for this session
            callback = self._auth_callbacks.get(session_id)
            if callback:
                # Remove callback and execute it
                del self._auth_callbacks[session_id]
                await callback(auth_code)
            else:
                # Store auth code in session context for later use
                await self.session_manager.add_session_context(
                    session_id,
                    "pending_auth_code",
                    {
                        "code": auth_code.code,
                        "state": auth_code.state,
                        "received_at": datetime.now(timezone.utc).isoformat()
                    }
                )
            
            # Send confirmation to user
            await self.websocket_handler.send_message_to_session(session_id, {
                "type": "auth_confirmed",
                "message": "Authorization received successfully.",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            logger.info(f"Successfully handled auth response for session {session_id}")
            
        except Exception as e:
            logger.error(f"Error handling auth response for session {session_id}: {e}")
            await self._send_error_response(
                session_id,
                "Failed to process authorization response. Please try again."
            )
    
    async def _send_error_response(self, session_id: str, error_message: str) -> None:
        """
        Send an error response to a session.
        
        Args:
            session_id: The session ID
            error_message: The error message to send
        """
        try:
            await self.websocket_handler.send_message_to_session(session_id, {
                "type": "error_response",
                "message": error_message,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to send error response to session {session_id}: {e}")
    
    async def register_auth_callback(self, session_id: str, callback: Callable) -> None:
        """
        Register a callback for authorization responses.
        
        Args:
            session_id: The session ID
            callback: The callback function to call when auth response is received
        """
        self._auth_callbacks[session_id] = callback
        logger.debug(f"Registered auth callback for session {session_id}")
    
    async def get_pending_auth_code(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get pending authorization code for a session.
        
        Args:
            session_id: The session ID
            
        Returns:
            Dict with auth code data or None if not found
        """
        auth_code_data = await self.session_manager.get_session_context(
            session_id,
            "pending_auth_code"
        )
        
        if auth_code_data:
            # Clear the pending auth code after retrieving
            await self.session_manager.add_session_context(
                session_id,
                "pending_auth_code",
                None
            )
        
        return auth_code_data
    
    async def get_processor_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the message processor.
        
        Returns:
            Dict containing processor statistics
        """
        return {
            "queue_size": self._message_queue.qsize(),
            "pending_auth_requests": len(self._pending_auth_requests),
            "active_auth_callbacks": len(self._auth_callbacks),
            "processing_task_running": (
                self._processing_task is not None and
                not self._processing_task.done()
            ),
            "active_session_workers": len(self._session_workers),
            "max_session_workers": self._max_session_workers,
            "reaper_running": (
                self._reaper_task is not None
                and not self._reaper_task.done()
            ),
        }
    
    async def process_session_init_with_token(self, session_id: str, user_token: str) -> None:
        """
        Pre-identify the user STRICTLY from a validated PingOne access token
        delivered by the BFF proxy in `session_init` (Path A, CR-02/CR-04).

        Identity is derived only from validated token claims. Any failure is
        propagated so the WebSocket handler can refuse the session — there is
        no fallback to a client-supplied id/email (the CR-02 spoof primitive
        has been removed).

        Args:
            session_id: The chat session ID
            user_token: PingOne access token resolved server-side by the BFF.

        Raises:
            TokenValidationError: token absent / invalid / expired / wrong aud.
        """
        await self.agent.initialize_session_with_token(session_id, user_token)
        logger.info(
            "Token-bound identity established for session %s (Path A)", session_id
        )


    async def process_agui_message(
        self,
        session_id: str,
        message: str,
        auth_token: str,
        emitter,  # AGUIEventEmitter
        vertical_flavor: str = None,
    ) -> None:
        """Process one agent turn and emit AG-UI events via the provided emitter.

        on_run_start / on_run_end are NOT called here -- the /run endpoint
        handles those before and after this method.

        Session identity is resolved from auth_token on every call so that
        stateless /run requests work without a prior session_init handshake.
        If the session is already identified (e.g. a second turn in the same
        SSE connection) the call is a no-op because initialize_session_with_token
        writes into conversation_memory which is idempotent on re-writes.

        Args:
            session_id: Conversation thread ID.
            message: The user message text for this turn.
            auth_token: PingOne access token (BFF-resolved; never browser-supplied).
            emitter: AGUIEventEmitter instance owned by the /run endpoint.
        """
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_core.runnables import RunnableConfig

        # 1. Establish token-derived identity (mirrors process_session_init_with_token).
        if auth_token:
            await self.agent.initialize_session_with_token(session_id, auth_token)
        else:
            logger.warning(
                "[AG-UI] process_agui_message called without auth_token for session %s",
                session_id,
            )

        # 2. Ensure the graph is initialised.
        if not self.agent._graph:
            await self.agent.initialize_tools()
            if not self.agent._graph:
                raise RuntimeError("Agent graph failed to initialise")

        # 3. Prepare the message list for LangGraph (inject SystemMessage only on
        #    the first turn -- mirrors the pattern in process_message_with_tracing).
        try:
            graph_state = self.agent._graph.get_state(
                {"configurable": {"thread_id": session_id}}
            )
            has_prior_history = bool(graph_state.values.get("messages"))
        except Exception:
            has_prior_history = False

        if has_prior_history:
            msgs_for_graph = [HumanMessage(content=message)]
        else:
            system_msg_text = await self.agent._build_system_message(session_id, vertical_flavor=vertical_flavor)
            msgs_for_graph = [
                SystemMessage(content=system_msg_text),
                HumanMessage(content=message),
            ]

        # 4. Set session context for tools.
        await self.agent.mcp_tool_provider.set_session_context(session_id)

        config = RunnableConfig(
            configurable={"thread_id": session_id},
            recursion_limit=getattr(self.agent.config.langchain, "max_iterations", 25),
        )
        agent_input = {"messages": msgs_for_graph}

        # 5. Stream events from LangGraph and route to the emitter.
        #    We track whether an LLM text message is currently open so we can
        #    call on_llm_start() exactly once per continuous token stream and
        #    on_llm_end() when the stream pauses for a tool call or ends.
        llm_streaming = False
        total_input_tokens = 0
        total_output_tokens = 0

        async for event in self.agent._graph.astream_events(
            agent_input, config=config, version="v2"
        ):
            event_name = event.get("event")
            event_data = event.get("data") or {}

            if event_name == "on_chat_model_stream":
                chunk = event_data.get("chunk")
                token = getattr(chunk, "content", "") if chunk is not None else ""
                if token:
                    if not llm_streaming:
                        await emitter.on_llm_start()
                        llm_streaming = True
                    await emitter.on_llm_new_token(token)

            elif event_name == "on_chat_model_end":
                output = event_data.get("output")
                usage = getattr(output, "usage_metadata", None) if output else None
                if usage:
                    total_input_tokens += getattr(usage, "input_tokens", 0)
                    total_output_tokens += getattr(usage, "output_tokens", 0)

            elif event_name == "on_tool_start":
                # Close any open LLM message before a tool call.
                if llm_streaming:
                    await emitter.on_llm_end()
                    llm_streaming = False
                serialized = {"name": event.get("name", "unknown_tool")}
                tool_call_id = event.get("run_id")
                await emitter.on_tool_start(
                    serialized,
                    tool_call_id=tool_call_id,
                    inputs=event_data.get("input"),
                )

            elif event_name == "on_tool_end":
                output = event_data.get("output", "")
                tool_call_id = event.get("run_id")
                await emitter.on_tool_end(output, tool_call_id=tool_call_id)

            elif event_name == "on_chain_error":
                error = event_data.get("error") or RuntimeError("Agent chain error")
                if llm_streaming:
                    await emitter.on_llm_end()
                    llm_streaming = False
                await emitter.on_error(error)
                return  # on_error emits RUN_FINISHED; avoid double RUN_FINISHED from caller

        # 6. Close the LLM message if it was still open at stream end.
        if llm_streaming:
            await emitter.on_llm_end()

        if total_input_tokens or total_output_tokens:
            await emitter.on_usage(total_input_tokens, total_output_tokens)

        logger.info("[AG-UI] process_agui_message complete for session %s", session_id)

    def _sweep_pending_auth_requests(self) -> int:
        """Evict pending auth requests older than _pending_auth_ttl.

        Called on every auth_response receipt and at queue-loop idle ticks.
        Returns the number of entries evicted.
        """
        cutoff = datetime.now(timezone.utc) - self._pending_auth_ttl
        expired_states = [
            state
            for state, (_sid, created_at) in self._pending_auth_requests.items()
            if created_at < cutoff
        ]
        for state in expired_states:
            del self._pending_auth_requests[state]
        if expired_states:
            logger.info(
                "Evicted %d expired pending auth request(s)", len(expired_states)
            )
        return len(expired_states)

    async def clear_session_data(self, session_id: str) -> None:
        """
        Clear all processor data for a session.
        
        Args:
            session_id: The session ID to clear
        """
        # Remove auth callback if exists
        if session_id in self._auth_callbacks:
            del self._auth_callbacks[session_id]
        
        # Remove pending auth requests for this session
        states_to_remove = [
            state for state, (sid, _ts) in self._pending_auth_requests.items()
            if sid == session_id
        ]
        for state in states_to_remove:
            del self._pending_auth_requests[state]

        # WR-02 Option A: deterministic per-session worker teardown on close
        # (WS disconnect / session_close). Pending messages for the now-dead
        # session are discarded with a logged reason — never processed
        # against a closed session.
        await self._teardown_session_worker(
            session_id, reason="session closed"
        )

        logger.debug(f"Cleared processor data for session {session_id}")
    
    async def shutdown(self) -> None:
        """Shutdown the message processor and clean up resources."""
        await self.stop()
        
        # Clear all pending data
        self._pending_auth_requests.clear()
        self._auth_callbacks.clear()
        
        # Clear message queue
        while not self._message_queue.empty():
            try:
                self._message_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        
        logger.info("MessageProcessor shutdown complete")