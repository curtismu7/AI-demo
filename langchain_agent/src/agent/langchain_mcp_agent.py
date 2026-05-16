"""
LangChain MCP Agent implementation.
"""
import asyncio
import logging
from typing import Any, Dict, List, Optional, Union
from datetime import datetime

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langchain.memory import ConversationBufferMemory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import BaseTool
from langchain_core.language_models.chat_models import BaseChatModel
from .llm_factory import get_llm

from mcp.tool_registry import MCPClientManager
from authentication.oauth_manager import OAuthAuthenticationManager
from models.auth import AccessToken
from models.chat import ChatMessage, ChatSession
from config.settings import get_config
from .mcp_tool_provider import MCPToolProvider, build_auth_popup_message
from .conversation_memory import ConversationMemory
from .execution_tracer import AgentExecutionTracer, TracingMixin
from .tracing_callback import DetailedTracingCallbackHandler
from .websocket_stream_callback import WebSocketStreamCallbackHandler


logger = logging.getLogger(__name__)


class LangChainMCPAgent(TracingMixin):
    """
    LangChain agent that integrates with MCP servers for tool execution.
    
    This agent processes user messages using LangChain's reasoning capabilities
    and executes actions through MCP servers with proper OAuth authentication.
    
    Now includes real-time execution tracing and visualization capabilities.
    """
    
    def __init__(self, 
                 mcp_client_manager: MCPClientManager,
                 auth_manager: OAuthAuthenticationManager,
                 config=None):
        """
        Initialize the LangChain MCP agent.
        
        Args:
            mcp_client_manager: Manager for MCP server connections and tool execution
            auth_manager: OAuth authentication manager for agent tokens
            config: Optional configuration object
        """
        self.config = config or get_config()
        self.mcp_client_manager = mcp_client_manager
        self.auth_manager = auth_manager
        
        # Initialize LangChain components
        self.llm = self._initialize_llm()
        self.conversation_memory = ConversationMemory()
        self.mcp_tool_provider = MCPToolProvider(mcp_client_manager, auth_manager, self.conversation_memory)
        
        # Agent executor will be initialized when tools are available
        self._agent_executor: Optional[AgentExecutor] = None
        self._tools: List[BaseTool] = []
        
        logger.info("Initialized LangChain MCP Agent")
    
    def _initialize_llm(self) -> BaseChatModel:
        """Initialize the language model for the agent via Ollama factory."""
        lc = self.config.langchain
        llm = get_llm(
            provider="ollama",
            model=lc.model_name or None,
            temperature=lc.temperature,
            max_tokens=lc.max_tokens,
            streaming=bool(getattr(lc, "stream_llm_tokens", True)),
            ollama_base_url=getattr(lc, "ollama_base_url", "http://localhost:11434"),
        )
        logger.info("Initialized LLM via factory: provider=ollama model=%s", lc.model_name)
        return llm
    
    async def initialize_tools(self) -> None:
        """Initialize MCP tools for the agent."""
        try:
            # Get available MCP tools
            self._tools = await self.mcp_tool_provider.get_langchain_tools()
            
            if not self._tools:
                logger.warning("No MCP tools available for agent, creating basic chat agent")
                # Create a basic agent without tools for general conversation
                self._agent_executor = self._create_basic_agent()
                logger.info("Initialized basic chat agent without MCP tools")
                return
            
            # Don't create agent executor here - create it dynamically per session
            # This allows us to use session-specific prompts with user identification info
            self._agent_executor = "dynamic"  # Placeholder to indicate tools are ready
            
            logger.info(f"Initialized agent with {len(self._tools)} MCP tools")
            
        except Exception as e:
            logger.error(f"Failed to initialize agent tools: {e}")
            raise
    
    async def _create_agent_prompt(self, session_id: str) -> ChatPromptTemplate:
        """Create the prompt template for the agent."""
        # Create detailed tool descriptions for the system message
        if self._tools:
            tool_descriptions = []
            for tool in self._tools:
                tool_desc = f"- {tool.name}: {tool.description}"
                # Add parameter information if available
                if hasattr(tool, 'args_schema') and tool.args_schema:
                    try:
                        schema = tool.args_schema.schema()
                        if 'properties' in schema:
                            params = list(schema['properties'].keys())
                            if params:
                                tool_desc += f" (Parameters: {', '.join(params)})"
                    except:
                        pass  # Skip if schema extraction fails
                tool_descriptions.append(tool_desc)
            tools_info = "\n".join(tool_descriptions)
        else:
            tools_info = "None currently available"
        
        # Check if user is identified for this session
        user_identified = await self.conversation_memory.is_user_identified(session_id)
        identified_user = await self.conversation_memory.get_identified_user(session_id) if user_identified else None
        
        # Create user identification context
        if user_identified and identified_user:
            user_context = f"""
CURRENT USER STATUS: ✅ USER IDENTIFIED
- User Email: {identified_user.get('user_email', 'Unknown')}
- User ID: {identified_user.get('user_id', 'Unknown')}
- Identified At: {identified_user.get('identification_timestamp', 'Unknown')}

You can now proceed with banking operations for this identified user. Do NOT ask for their email again."""
        else:
            user_context = """
CURRENT USER STATUS: ❌ USER NOT IDENTIFIED
- You MUST ask the user to identify themselves by providing their email address
- Use the banking_query_user_by_email tool to check if the user exists in the system
- If the user doesn't exist, offer to help them register a new account
- Only proceed with banking operations after the user is identified and has an account"""

        system_message = f"""You are a helpful AI banking assistant that can perform actions through various MCP (Model Context Protocol) servers.

{user_context}

Account Registration Process:
When registering a new user, collect the following information conversationally:
1. Email address (already provided during lookup)
2. First name and last name
3. Phone number
4. Date of birth (YYYY-MM-DD format)
5. Complete address (street, city, state, zip code, country)

Then use the user_management_account_registration tool with all collected information.

You have access to tools that can interact with external systems and APIs. When a user asks you to do something that requires external actions, use the appropriate tools to help them.

Key guidelines:
1. ALWAYS start by asking for the user's email address if they haven't been identified yet
2. Use banking_query_user_by_email to verify user existence before any banking operations
3. If user doesn't exist, guide them through account registration
4. When collecting registration info, ask for one piece of information at a time in a friendly, conversational manner
5. Validate information format (especially email, phone, date of birth) before proceeding
6. When a user asks to transfer money, use the banking_create_transfer tool (only after user identification)
7. When a user asks to check account balances, use the banking_get_account_balance tool (only after user identification)
8. When a user asks to list accounts, use the banking_get_my_accounts tool (only after user identification)
9. When a user asks about transactions, use the banking_get_my_transactions tool (only after user identification)
10. IMPORTANT: Account IDs are critical for banking operations. When you retrieve accounts with banking_get_my_accounts, the response includes account IDs that you MUST use for other operations like transfers, balance checks, etc.
11. When users refer to accounts by type (e.g., "checking account", "savings account"), use the account ID from the most recent account listing
12. If you need to perform operations on specific accounts but don't have recent account information, first call banking_get_my_accounts to get current account IDs
13. TRANSFER REVERSALS: When a user asks to reverse or undo a transfer, look at the conversation history for the most recent transfer details. A reversal means transferring the same amount back from the destination account to the source account. For example, if the last transfer was $100 from Account A to Account B, the reversal would be $100 from Account B to Account A.
14. Pay close attention to the conversation history - recent transfers will show the exact account IDs and amounts that can be used for reversals
13. Explain what you're doing when using tools
14. Handle authentication challenges gracefully by informing the user when authorization is needed
15. Provide clear, helpful responses based on tool results
16. If a tool fails, explain the error and suggest alternatives when possible
17. Be conversational and friendly when collecting user information for registration

Available tools:
{tools_info}

IMPORTANT: Always review the conversation history before asking for additional information. Recent transfers, account details, and other banking operations are recorded in the chat history and should be referenced when users ask for related actions like reversals or follow-up operations.

Remember to maintain conversation context and provide helpful, accurate responses. Always prioritize user identification before banking operations."""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_message),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        return prompt
    
    async def _get_agent_executor_for_session(self, session_id: str) -> AgentExecutor:
        """Get or create an agent executor for a specific session with user context."""
        # Create session-specific prompt with user identification info
        prompt = await self._create_agent_prompt(session_id)
        
        # Create agent
        agent = create_tool_calling_agent(
            llm=self.llm,
            tools=self._tools,
            prompt=prompt
        )
        
        # Create memory and populate it with existing conversation history
        memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )
        
        # Pre-populate the memory with existing conversation history
        try:
            existing_history = await self.conversation_memory.get_conversation_history(session_id)
            logger.info(f"Pre-populating agent memory with {len(existing_history)} messages")
            for message in existing_history:
                memory.chat_memory.add_message(message)
        except Exception as e:
            logger.error(f"Error pre-populating memory: {e}")
        
        # Create agent executor
        agent_executor = AgentExecutor(
            agent=agent,
            tools=self._tools,
            memory=memory,
            verbose=self.config.langchain.verbose,
            max_iterations=self.config.langchain.max_iterations,
            max_execution_time=self.config.langchain.max_execution_time
        )
        
        return agent_executor

    def _maybe_attach_websocket_streaming(
        self,
        agent_executor: AgentExecutor,
        session_id: str,
        stream_context: Optional[Dict[str, Any]],
    ) -> None:
        """
        Attach WebSocket stream callback when stream_context provides websocket_handler.
        Emits MCP tool_start/tool_end and optional LLM token deltas during ainvoke.
        """
        if not stream_context:
            return
        handler = stream_context.get("websocket_handler")
        if handler is None:
            return
        stream_tools = getattr(self.config.langchain, "stream_mcp_tool_events", True)
        stream_tokens = getattr(self.config.langchain, "stream_llm_tokens", True)
        if not stream_tools and not stream_tokens:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning("No running event loop; WebSocket streaming disabled for this turn")
            return
        stream_cb = WebSocketStreamCallbackHandler(
            session_id=session_id,
            loop=loop,
            websocket_handler=handler,
            stream_mcp_tool_events=stream_tools,
            stream_llm_tokens=stream_tokens,
        )
        if getattr(agent_executor, "callbacks", None) is None:
            agent_executor.callbacks = []
        agent_executor.callbacks.append(stream_cb)
    
    def _create_basic_agent(self):
        """Create a basic agent without MCP tools for general conversation."""
        from langchain.agents import AgentExecutor
        from langchain.memory import ConversationBufferMemory
        from langchain.schema import BaseMessage
        
        class BasicChatAgent:
            """Basic chat agent that uses LLM directly without tools."""
            
            def __init__(self, llm, memory):
                self.llm = llm
                self.memory = memory
            
            async def ainvoke(self, inputs):
                """Process input and return response."""
                user_input = inputs.get("input", "")
                chat_history = inputs.get("chat_history", [])
                
                # Create a simple conversation prompt
                messages = []
                
                # Add system message
                system_msg = "You are a helpful AI assistant. You can have conversations and answer questions, but you don't currently have access to external tools or services."
                messages.append({"role": "system", "content": system_msg})
                
                # Add chat history
                for msg in chat_history[-10:]:  # Keep last 10 messages for context
                    if hasattr(msg, 'content'):
                        role = "user" if msg.__class__.__name__ == "HumanMessage" else "assistant"
                        messages.append({"role": role, "content": msg.content})
                
                # Add current user input
                messages.append({"role": "user", "content": user_input})
                
                # Get response from LLM
                try:
                    response = await self.llm.ainvoke(messages)
                    if hasattr(response, 'content'):
                        return {"output": response.content}
                    else:
                        return {"output": str(response)}
                except Exception as e:
                    logger.error(f"Error getting LLM response: {e}")
                    return {"output": "I'm sorry, I encountered an error while processing your message. Please try again."}
        
        # Create basic agent
        memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )
        
        return BasicChatAgent(self.llm, memory)
    
    def _is_authorization_complete_message(self, message: str) -> bool:
        """
        Detect if the user message indicates authorization completion.
        
        Args:
            message: The user message
            
        Returns:
            bool: True if this indicates authorization completion
        """
        # Check for session success messages from frontend
        if message.startswith('SESSION_SUCCESS:'):
            return True
            
        # Check for common authorization completion phrases
        auth_completion_phrases = [
            'authorization completed',
            'authorized successfully',
            'auth complete',
            'login complete',
            'signed in successfully'
        ]
        
        message_lower = message.lower()
        return any(phrase in message_lower for phrase in auth_completion_phrases)

    def _detect_authorization_code(self, message: str) -> Optional[str]:
        """
        Detect if the user message contains an authorization code.
        
        Args:
            message: The user message
            
        Returns:
            Optional[str]: The authorization code if detected, None otherwise
        """
        import re
        
        # Check for session-based authorization success
        if message.startswith('SESSION_SUCCESS:'):
            logger.info("Detected session-based authorization success")
            return message  # Return the full session success message
        
        # Require an explicit prefix. The previous heuristic — \b[A-Za-z0-9_-]{20,}\b
        # plus a whole-message fallback — fired on normal user messages like
        # "let-me-check-my-balance-please", silently steering them into the OAuth
        # callback path. An OAuth code is only well-defined when the user is
        # responding to a request_user_authorization step, so callers must
        # surface it with a clear "code=", "authorization=", or "auth=" prefix.
        prefixed_patterns = [
            r'\bcode[:\s=]+([A-Za-z0-9_-]+)\b',
            r'\bauthorization[:\s=]+([A-Za-z0-9_-]+)\b',
            r'\bauth[:\s=]+([A-Za-z0-9_-]+)\b',
        ]
        for pattern in prefixed_patterns:
            # IN-01: each pattern has exactly one capture group, so re.findall
            # returns a list[str]. A prefixed OAuth code is a single token —
            # the first match for the first matching prefix is the code. The
            # old `max(matches, key=len)` "longest wins" tie-break was dead
            # complexity (and silently wrong if a group ever became a tuple).
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1)
        return None
    
    def _looks_like_email(self, message: str) -> bool:
        """
        Check if a message looks like an email address.
        
        Args:
            message: The message to check
            
        Returns:
            bool: True if message looks like an email
        """
        message = message.strip()
        return "@" in message and "." in message and len(message.split()) == 1
    
    async def _handle_user_identification(self, email: str, session_id: str, tracer=None) -> str:
        """
        Handle user identification by email lookup.
        
        Args:
            email: The user's email address
            session_id: The chat session ID
            tracer: Optional execution tracer
            
        Returns:
            str: Response message
        """
        try:
            logger.info(f"Looking up user with email: {email}")
            
            # Store the user's email message
            user_msg = ChatMessage.create_user_message(session_id, email)
            await self.conversation_memory.add_message(session_id, user_msg)
            
            # Set session context for tools
            await self.mcp_tool_provider.set_session_context(session_id)
            
            # Set tracer for MCP tool execution if provided (do this before tool execution)
            if tracer:
                self.mcp_tool_provider.set_tracer(tracer)
            
            # Use user lookup tool. IN-02: resolve by name with an explicit
            # guard so a missing/renamed MCP tool fails loudly (logged with
            # the names that ARE registered) instead of silently falling
            # through to the opaque "having trouble" message.
            USER_LOOKUP_TOOL = "banking_query_user_by_email"
            lookup_tool = next(
                (
                    t
                    for t in self._tools
                    if getattr(t, "name", None) == USER_LOOKUP_TOOL
                ),
                None,
            )
            if lookup_tool is None:
                logger.warning(
                    "User-lookup tool %r not registered; available tools: %s. "
                    "Has the MCP server renamed it?",
                    USER_LOOKUP_TOOL,
                    [getattr(t, "name", "?") for t in self._tools],
                )
            for tool in ([lookup_tool] if lookup_tool is not None else []):
                if tool.name == USER_LOOKUP_TOOL:
                    logger.info("Found user lookup tool, executing...")
                    
                    # Log the tool execution start if tracer is available
                    if tracer:
                        tracer.log_step("direct_tool_execution", "User Identification", {
                            "tool_name": tool.name,
                            "reason": "Direct user identification via email",
                            "input_parameters": {"email": email},
                            "session_id": session_id,
                            "bypass_langchain_agent": True
                        })
                    
                    start_time = datetime.now()
                    result = await tool.arun({"email": email})
                    execution_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                    
                    logger.info(f"User lookup result: {result}")
                    
                    # Log the tool execution result if tracer is available
                    if tracer:
                        tracer.log_step("direct_tool_result", "User Identification", {
                            "tool_name": tool.name,
                            "result": result,
                            "execution_time_ms": execution_time_ms,
                            "session_id": session_id,
                            "success": True
                        })
                    
                    # Parse the result
                    import json
                    try:
                        # Extract JSON from the result string
                        if "exists" in result:
                            # Find the JSON part
                            start_idx = result.find("{")
                            end_idx = result.rfind("}") + 1
                            if start_idx >= 0 and end_idx > start_idx:
                                json_str = result[start_idx:end_idx]
                                user_data = json.loads(json_str)
                                
                                if user_data.get("exists", False):
                                    # User exists, mark as identified
                                    user_info = user_data.get("user", {})
                                    user_id = user_info.get("id", "")
                                    first_name = user_info.get("firstName", "")
                                    
                                    await self.conversation_memory.set_user_identified(session_id, email, user_id)
                                    
                                    response = f"✅ Welcome back, {first_name}! I've identified your account. How can I help you with your banking today?"
                                    
                                    # Log response generation (template-based, not LLM)
                                    if tracer:
                                        tracer.log_step("template_response_generation", "Response Generator", {
                                            "response_type": "user_identification_success",
                                            "template_used": "welcome_back_template",
                                            "variables": {
                                                "first_name": first_name,
                                                "user_id": user_id,
                                                "email": email
                                            },
                                            "generated_response": response,
                                            "llm_used": False,
                                            "reason": "System template for user identification"
                                        })
                                    
                                    # Store the assistant's response
                                    assistant_msg = ChatMessage.create_assistant_message(
                                        session_id, 
                                        response,
                                        {"user_identified": True, "user_email": email, "user_id": user_id}
                                    )
                                    await self.conversation_memory.add_message(session_id, assistant_msg)
                                    
                                    return response
                                else:
                                    # User doesn't exist, offer registration
                                    # Store registration context in session
                                    await self.conversation_memory.update_session_context(session_id, {
                                        "registration_offered": True,
                                        "registration_email": email,
                                        "registration_step": "confirmation"
                                    })
                                    
                                    response = f"""I couldn't find an account with the email address: {email}

Would you like me to help you register a new banking account? I'll need to collect some information from you:
- Your full name
- Phone number
- Date of birth
- Address

Would you like to proceed with account registration? Just say "yes" or "register" to get started!"""
                                    
                                    # Log response generation (template-based, not LLM)
                                    if tracer:
                                        tracer.log_step("template_response_generation", "Response Generator", {
                                            "response_type": "user_not_found_registration_offer",
                                            "template_used": "registration_offer_template",
                                            "variables": {
                                                "email": email
                                            },
                                            "generated_response": response,
                                            "llm_used": False,
                                            "reason": "System template for registration offer"
                                        })
                                    
                                    # Store the assistant's response
                                    assistant_msg = ChatMessage.create_assistant_message(
                                        session_id, 
                                        response,
                                        {"registration_offered": True, "user_email": email}
                                    )
                                    await self.conversation_memory.add_message(session_id, assistant_msg)
                                    
                                    return response
                    except json.JSONDecodeError as e:
                        logger.error(f"Error parsing user lookup result: {e}")
                        logger.error(f"Raw result: {result}")
                    
                    break
            
            # Fallback if tool not found or failed
            response = f"I'm having trouble looking up your account right now. Please try again or contact support."
            
            assistant_msg = ChatMessage.create_assistant_message(
                session_id, 
                response,
                {"lookup_failed": True}
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)
            
            return response
            
        except Exception as e:
            logger.error(f"Error during user identification: {e}")
            response = f"I encountered an error while looking up your account. Please try again or contact support."
            
            assistant_msg = ChatMessage.create_assistant_message(
                session_id, 
                response,
                {"identification_error": True}
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)
            
            return response

    def _looks_like_registration_confirmation(self, message: str) -> bool:
        """
        Check if a message looks like a registration confirmation.
        
        Args:
            message: The message to check
            
        Returns:
            bool: True if message looks like registration confirmation
        """
        message_lower = message.lower().strip()
        confirmation_phrases = [
            'yes', 'y', 'register', 'sure', 'ok', 'okay', 'proceed', 'continue'
        ]
        return message_lower in confirmation_phrases

    async def _handle_registration_flow(self, user_message: str, session_id: str) -> str:
        """
        Handle the registration flow for new users.
        
        Args:
            user_message: The user's message
            session_id: The session ID
            
        Returns:
            str: Response message
        """
        context = await self.conversation_memory.get_session_context(session_id)
        registration_step = context.get("registration_step", "")
        registration_email = context.get("registration_email", "")
        
        if registration_step == "confirmation" and self._looks_like_registration_confirmation(user_message):
            # User confirmed registration, start collecting info
            await self.conversation_memory.update_session_context(session_id, {
                "registration_step": "collecting_name",
                "registration_data": {"email": registration_email}
            })
            
            response = f"""Great! Let's get you registered. I'll collect your information step by step.

First, what's your full name? (Please provide your first and last name)"""
            
            # Store the assistant's response
            assistant_msg = ChatMessage.create_assistant_message(
                session_id, 
                response,
                {"registration_step": "collecting_name"}
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)
            
            return response
        
        elif registration_step == "collecting_name":
            # User provided their name, store it and ask for phone
            registration_data = context.get("registration_data", {})
            registration_data["full_name"] = user_message.strip()
            
            await self.conversation_memory.update_session_context(session_id, {
                "registration_step": "collecting_phone",
                "registration_data": registration_data
            })
            
            response = f"""Thank you, {user_message.strip()}! 

Next, I need your phone number. Please provide your phone number (e.g., +1-555-123-4567):"""
            
            # Store the assistant's response
            assistant_msg = ChatMessage.create_assistant_message(
                session_id, 
                response,
                {"registration_step": "collecting_phone"}
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)
            
            return response
        
        elif registration_step == "collecting_phone":
            # User provided phone, store it and ask for date of birth
            registration_data = context.get("registration_data", {})
            registration_data["phone"] = user_message.strip()
            
            await self.conversation_memory.update_session_context(session_id, {
                "registration_step": "collecting_dob",
                "registration_data": registration_data
            })
            
            response = """Great! Now I need your date of birth.

Please provide your date of birth in YYYY-MM-DD format (e.g., 1990-01-15):"""
            
            # Store the assistant's response
            assistant_msg = ChatMessage.create_assistant_message(
                session_id, 
                response,
                {"registration_step": "collecting_dob"}
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)
            
            return response
        
        elif registration_step == "collecting_dob":
            # User provided date of birth, store it and ask for address
            registration_data = context.get("registration_data", {})
            registration_data["date_of_birth"] = user_message.strip()
            
            await self.conversation_memory.update_session_context(session_id, {
                "registration_step": "collecting_address",
                "registration_data": registration_data
            })
            
            response = """Perfect! Finally, I need your address information.

Please provide your complete address in this format:
Street Address, City, State, ZIP Code, Country

For example: 123 Main St, New York, NY, 10001, USA"""
            
            # Store the assistant's response
            assistant_msg = ChatMessage.create_assistant_message(
                session_id, 
                response,
                {"registration_step": "collecting_address"}
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)
            
            return response
        
        elif registration_step == "collecting_address":
            # User provided address. The actual user-registration MCP tool
            # is not wired up here yet (the original code path silently
            # faked success and stored a synthetic "new_user_<sid>" id).
            # Until the registration MCP tool is integrated, surface the
            # gap to the user instead of claiming a fake completion.
            registration_data = context.get("registration_data", {})
            registration_data["address"] = user_message.strip()

            await self.conversation_memory.update_session_context(session_id, {
                "registration_step": "pending_backend",
                "registration_data": registration_data,
            })

            response = (
                "Thanks — I have all the details:\n\n"
                f"Email: {registration_data.get('email', '')}\n"
                f"Name: {registration_data.get('full_name', '')}\n"
                f"Phone: {registration_data.get('phone', '')}\n"
                f"Date of Birth: {registration_data.get('date_of_birth', '')}\n"
                f"Address: {registration_data.get('address', '')}\n\n"
                "Registration backend isn't connected in this build, so I "
                "can't finalize a new account from chat. Please use the "
                "Setup page to provision a demo user, or sign in with an "
                "existing account."
            )

            # Do NOT call set_user_identified — nothing was actually
            # registered. Marking the user identified would mask later
            # tool calls failing because there is no real backend user.

            assistant_msg = ChatMessage.create_assistant_message(
                session_id,
                response,
                {"registration_completed": False, "registration_pending_backend": True},
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)

            return response
        
        # If we get here, registration flow didn't handle the message
        return None

    async def process_message_with_tracing(
        self,
        user_message: str,
        session_id: str,
        stream_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Process a user message with real-time execution tracing and visualization.
        
        Args:
            user_message: The user's input message
            session_id: The chat session ID
            stream_context: Optional dict with websocket_handler for stream_event (tool + LLM token) streaming
            
        Returns:
            str: The agent's response
        """
        # Create execution tracer
        tracer = self._create_tracer(session_id)
        
        try:
            # Log user input with detailed WebSocket message simulation
            self._log_websocket_message(tracer, "incoming", {
                "type": "user_message",
                "content": user_message,
                "session_id": str(session_id),  # Ensure session_id is string
                "timestamp": datetime.now().isoformat()
            })
            self._log_user_input(tracer, user_message, session_id)
            
            # Log agent start
            self._log_agent_start(tracer)
            
            if not self._agent_executor:
                await self.initialize_tools()
                if not self._agent_executor:
                    tracer.log_step("initialization_error", "LangChain Agent", {
                        "error": "Agent not properly configured with tools"
                    })
                    html_file = tracer.save_trace_and_create_visualization()
                    logger.info(f"Error trace saved: {html_file}")
                    return "I'm sorry, but I'm not properly configured with tools right now. Please try again later."
            
            logger.info(f"Processing message for session {session_id}: {user_message[:100]}...")
            
            # Check if this message indicates authorization completion
            if self._is_authorization_complete_message(user_message):
                tracer.log_step("oauth_completion", "OAuth Manager", {
                    "message_type": "authorization_complete"
                })
                
                logger.info("User has completed authorization, retrying original tool call...")
                
                try:
                    result = await self.mcp_tool_provider.retry_pending_tool_call(session_id, tracer)
                    if result:
                        tracer.log_step("tool_retry_success", "MCP Tool Provider", {
                            "result_length": len(str(result))
                        })
                        
                        # Log that no LLM formatting is used for retry responses
                        tracer.log_step("direct_response_return", "Response Handler", {
                            "response_type": "tool_retry_result",
                            "response": result,
                            "llm_formatting": False,
                            "reason": "Tool retry results are pre-formatted by MCP tool provider",
                            "bypass_agent_processing": True
                        })
                        
                        # Store conversation in memory
                        user_msg = ChatMessage.create_user_message(session_id, user_message)
                        await self.conversation_memory.add_message(session_id, user_msg)
                        
                        assistant_msg = ChatMessage.create_assistant_message(
                            session_id, 
                            result, 
                            {"auth_completed": True}
                        )
                        await self.conversation_memory.add_message(session_id, assistant_msg)
                        
                        self._log_response_sent(tracer, result, session_id)
                        html_file = tracer.save_trace_and_create_visualization()
                        logger.info(f"OAuth completion trace saved: {html_file}")
                        
                        return result
                    else:
                        tracer.log_step("tool_retry_failed", "MCP Tool Provider", {
                            "reason": "No pending tool call found"
                        })
                        logger.warning("No pending tool call found for this session")
                except Exception as e:
                    self._log_error(tracer, "MCP Tool Provider", e)
                    logger.error(f"Error retrying tool call after authorization: {e}")
                    html_file = tracer.save_trace_and_create_visualization()
                    logger.info(f"OAuth error trace saved: {html_file}")
                    return f"I encountered an error processing your request after authorization: {str(e)}. Please try your original request again."
            
            # Check if we're in a registration flow
            context = await self.conversation_memory.get_session_context(session_id)
            if context.get("registration_offered", False):
                tracer.log_step("registration_flow", "LangChain Agent", {
                    "registration_step": context.get("registration_step", "unknown"),
                    "registration_offered": True
                })
                
                logger.info("User is in registration flow, checking for registration response")
                registration_response = await self._handle_registration_flow(user_message, session_id)
                if registration_response:
                    user_msg = ChatMessage.create_user_message(session_id, user_message)
                    await self.conversation_memory.add_message(session_id, user_msg)
                    
                    self._log_response_sent(tracer, registration_response, session_id)
                    html_file = tracer.save_trace_and_create_visualization()
                    logger.info(f"Registration flow trace saved: {html_file}")
                    
                    return registration_response
            
            # Check if user is identified for this session
            is_user_identified = await self.conversation_memory.is_user_identified(session_id)
            self._log_memory_check(tracer, is_user_identified)
            
            logger.info(f"User identification status for session {session_id}: {is_user_identified}")
            
            # If user is not identified and this is not an email address, ask for identification
            if not is_user_identified and not self._looks_like_email(user_message):
                tracer.log_step("identification_request", "LangChain Agent", {
                    "reason": "User not identified and message is not email"
                })
                
                logger.info("User not identified, requesting email address")
                
                user_msg = ChatMessage.create_user_message(session_id, user_message)
                await self.conversation_memory.add_message(session_id, user_msg)
                
                identification_response = """Hello! I'm your AI banking assistant. To help you with your banking needs, I need to identify you first.

Please provide your email address so I can:
- Check if you have an existing account
- Help you register a new account if needed
- Provide personalized banking services

What's your email address?"""
                
                assistant_msg = ChatMessage.create_assistant_message(
                    session_id, 
                    identification_response,
                    {"identification_requested": True}
                )
                await self.conversation_memory.add_message(session_id, assistant_msg)
                
                self._log_response_sent(tracer, identification_response, session_id)
                html_file = tracer.save_trace_and_create_visualization()
                logger.info(f"Identification request trace saved: {html_file}")
                
                return identification_response
            
            # If user is not identified but message looks like an email, try to identify them
            if not is_user_identified and self._looks_like_email(user_message):
                tracer.log_step("email_detection", "LangChain Agent", {
                    "detected_email": user_message.strip(),
                    "action": "user_identification_attempt"
                })
                
                logger.info("Attempting to identify user with provided email")
                response = await self._handle_user_identification(user_message.strip(), session_id, tracer)
                
                self._log_response_sent(tracer, response, session_id)
                html_file = tracer.save_trace_and_create_visualization()
                logger.info(f"User identification trace saved: {html_file}")
                
                return response
            
            # Main agent processing
            logger.debug(f"Agent executor type: {type(self._agent_executor)}")
            logger.debug(f"Number of available tools: {len(self._tools)}")
            
            # Get conversation history for context
            tracer.log_step("context_preparation", "Conversation Memory", {
                "action": "get_conversation_history"
            })
            
            logger.info("Getting conversation history...")
            chat_history = await self.conversation_memory.get_conversation_history(session_id)
            logger.info(f"Chat history length: {len(chat_history)}")
            
            # Prepare input for agent
            agent_input = {
                "input": user_message,
                "chat_history": chat_history
            }
            
            # Set session context for tools and tracer
            tracer.log_step("mcp_context_setup", "MCP Tool Provider", {
                "session_id": session_id,
                "action": "set_session_context"
            })
            
            logger.info(f"Setting session context for tools...")
            await self.mcp_tool_provider.set_session_context(session_id)
            
            # Set tracer for MCP tool execution logging
            self.mcp_tool_provider.set_tracer(tracer)
            
            # Get session-specific agent executor with user context
            tracer.log_step("agent_executor_creation", "LangChain Agent", {
                "executor_type": "session_specific",
                "tools_count": len(self._tools) if self._tools else 0
            })
            
            logger.info("Getting session-specific agent executor...")
            agent_executor = await self._get_agent_executor_for_session(session_id)
            
            # Add detailed tracing callback to the agent executor
            detailed_callback = DetailedTracingCallbackHandler(tracer)
            if hasattr(agent_executor, 'callbacks'):
                if agent_executor.callbacks is None:
                    agent_executor.callbacks = []
                agent_executor.callbacks.append(detailed_callback)
            else:
                # For older versions, try to add to the agent
                if hasattr(agent_executor, 'agent') and hasattr(agent_executor.agent, 'callbacks'):
                    if agent_executor.agent.callbacks is None:
                        agent_executor.agent.callbacks = []
                    agent_executor.agent.callbacks.append(detailed_callback)

            self._maybe_attach_websocket_streaming(agent_executor, session_id, stream_context)
            
            # Execute agent
            prompt_text = f"User: {user_message}\nContext: {len(chat_history)} previous messages"
            estimated_input_tokens = len(prompt_text.split()) * 1.3  # Rough estimate
            self._log_llm_start(tracer, "Processing user request with agent executor", prompt_text, int(estimated_input_tokens))
            
            logger.info("Executing agent with prepared input...")
            start_time = datetime.now()
            result = await agent_executor.ainvoke(agent_input)
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # Extract response
            response = result.get("output", "I'm sorry, I couldn't process your request.")
            estimated_output_tokens = len(response.split()) * 1.3  # Rough estimate
            self._log_llm_end(tracer, response, processing_time, int(estimated_output_tokens))
            
            logger.info(f"Agent response length: {len(response)} characters")
            
            # Check for pending authorization challenges
            if hasattr(self.mcp_tool_provider.mcp_client_manager, '_session_challenges'):
                session_challenges = self.mcp_tool_provider.mcp_client_manager._session_challenges
                if session_id in session_challenges:
                    challenge_info = session_challenges[session_id]
                    auth_challenge = challenge_info.get('auth_challenge', {})
                    
                    if auth_challenge.get('method') == 'redirect_popup':
                        tracer.log_step("oauth_challenge", "OAuth Manager", {
                            "method": "redirect_popup",
                            "auth_url": auth_challenge.get('authorizationUrl', ''),
                            "popup_width": auth_challenge.get('uiHints', {}).get('popupWidth', 500),
                            "popup_height": auth_challenge.get('uiHints', {}).get('popupHeight', 650)
                        })
                        
                        logger.info("Intercepting response to inject popup authorization UI")
                        
                        # Create the popup authorization response
                        auth_url = auth_challenge.get('authorizationUrl', '')
                        ui_hints = auth_challenge.get('uiHints', {})
                        popup_width = ui_hints.get('popupWidth', 500)
                        popup_height = ui_hints.get('popupHeight', 650)
                        popup_title = ui_hints.get('popupTitle', 'Authorization Required')
                        status_endpoint = auth_challenge.get('statusEndpoint', '')
                        scope = auth_challenge.get('scope', '')
                        expires_at = auth_challenge.get('expiresAt', '')
                        session_id_auth = auth_challenge.get('sessionId', '')
                        
                        # WR-05: injection-safe JSON via shared helper.
                        popup_response = build_auth_popup_message(
                            auth_url=auth_url,
                            popup_width=popup_width,
                            popup_height=popup_height,
                            popup_title=popup_title,
                            status_endpoint=status_endpoint,
                            session_id=session_id_auth,
                            scope=scope,
                            expires_at=expires_at,
                        )

                        response = popup_response
            
            # Store conversation in memory
            self._log_memory_update(tracer, "store_conversation", {
                "user_message_length": len(user_message),
                "assistant_response_length": len(response)
            })
            
            user_msg = ChatMessage.create_user_message(session_id, user_message)
            await self.conversation_memory.add_message(session_id, user_msg)
            
            assistant_msg = ChatMessage.create_assistant_message(
                session_id, 
                response, 
                {"tools_used": [tool.name for tool in self._tools]}
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)
            
            # Log final response with WebSocket message
            self._log_websocket_message(tracer, "outgoing", {
                "type": "assistant_response",
                "content": response,
                "session_id": str(session_id),  # Ensure session_id is string
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": int((datetime.now() - tracer.start_time).total_seconds() * 1000)
            })
            self._log_response_sent(tracer, response, session_id)
            
            # Save trace and create visualization
            html_file = tracer.save_trace_and_create_visualization()
            logger.info(f"Complete execution trace saved: {html_file}")
            
            logger.info(f"Successfully processed message for session {session_id}")
            return response
            
        except Exception as e:
            self._log_error(tracer, "LangChain Agent", e)
            logger.error(f"Error processing message for session {session_id}: {e}")
            
            # Save error trace
            html_file = tracer.save_trace_and_create_visualization()
            logger.info(f"Error trace saved: {html_file}")
            
            # Try to provide a helpful error response
            if "authentication" in str(e).lower() or "authorization" in str(e).lower():
                return "I encountered an authentication issue while trying to help you. Some actions may require additional authorization. Please try again or contact support if the issue persists."
            elif "timeout" in str(e).lower():
                return "I'm sorry, but your request took too long to process. Please try again with a simpler request."
            else:
                return "I encountered an error while processing your request. Please try again or rephrase your question."

    async def process_message(self, user_message: str, session_id: str) -> str:
        """
        Process a user message and return the agent's response.
        
        Args:
            user_message: The user's input message
            session_id: The chat session ID
            
        Returns:
            str: The agent's response
            
        Raises:
            RuntimeError: If agent is not properly initialized
            Exception: If message processing fails
        """
        if not self._agent_executor:
            await self.initialize_tools()
            if not self._agent_executor:
                return "I'm sorry, but I'm not properly configured with tools right now. Please try again later."
        
        try:
            logger.info(f"Processing message for session {session_id}: {user_message[:100]}...")
            logger.debug(f"Full user message: {user_message}")
            
            # Check if this message indicates authorization completion
            if self._is_authorization_complete_message(user_message):
                logger.info("User has completed authorization, retrying original tool call...")
                
                # Try to retry the pending tool call
                try:
                    result = await self.mcp_tool_provider.retry_pending_tool_call(session_id)
                    if result:
                        logger.info("Successfully retried tool call after authorization")
                        
                        # Store conversation in memory
                        user_msg = ChatMessage.create_user_message(session_id, user_message)
                        await self.conversation_memory.add_message(session_id, user_msg)
                        
                        assistant_msg = ChatMessage.create_assistant_message(
                            session_id, 
                            result, 
                            {"auth_completed": True}
                        )
                        await self.conversation_memory.add_message(session_id, assistant_msg)
                        
                        return result
                    else:
                        logger.warning("No pending tool call found for this session")
                        # Fall through to normal processing
                except Exception as e:
                    logger.error(f"Error retrying tool call after authorization: {e}")
                    return f"I encountered an error processing your request after authorization: {str(e)}. Please try your original request again."
            
            # Check if we're in a registration flow
            context = await self.conversation_memory.get_session_context(session_id)
            if context.get("registration_offered", False):
                logger.info("User is in registration flow, checking for registration response")
                registration_response = await self._handle_registration_flow(user_message, session_id)
                if registration_response:
                    # Store the user's message
                    user_msg = ChatMessage.create_user_message(session_id, user_message)
                    await self.conversation_memory.add_message(session_id, user_msg)
                    return registration_response
            
            # Check if user is identified for this session
            is_user_identified = await self.conversation_memory.is_user_identified(session_id)
            logger.info(f"User identification status for session {session_id}: {is_user_identified}")
            
            # If user is not identified and this is not an email address, ask for identification
            if not is_user_identified and not self._looks_like_email(user_message):
                logger.info("User not identified, requesting email address")
                
                # Store the user's message
                user_msg = ChatMessage.create_user_message(session_id, user_message)
                await self.conversation_memory.add_message(session_id, user_msg)
                
                # Ask for email identification
                identification_response = """Hello! I'm your AI banking assistant. To help you with your banking needs, I need to identify you first.

Please provide your email address so I can:
- Check if you have an existing account
- Help you register a new account if needed
- Provide personalized banking services

What's your email address?"""
                
                # Store the assistant's response
                assistant_msg = ChatMessage.create_assistant_message(
                    session_id, 
                    identification_response,
                    {"identification_requested": True}
                )
                await self.conversation_memory.add_message(session_id, assistant_msg)
                
                return identification_response
            
            # If user is not identified but message looks like an email, try to identify them
            if not is_user_identified and self._looks_like_email(user_message):
                logger.info("Attempting to identify user with provided email")
                return await self._handle_user_identification(user_message.strip(), session_id)
            

            
            logger.debug(f"Agent executor type: {type(self._agent_executor)}")
            logger.debug(f"Number of available tools: {len(self._tools)}")
            
            # Get conversation history for context
            logger.info("Getting conversation history...")
            chat_history = await self.conversation_memory.get_conversation_history(session_id)
            logger.info(f"Chat history length: {len(chat_history)}")
            logger.info(f"Chat history preview: {[msg.content[:100] if hasattr(msg, 'content') else str(msg)[:100] for msg in chat_history[-5:]]}")
            
            # Also check raw messages for debugging
            raw_messages = await self.conversation_memory.get_raw_messages(session_id, limit=5)
            logger.info(f"Raw messages count: {len(raw_messages)}")
            logger.info(f"Recent raw messages: {[msg.content[:100] for msg in raw_messages[-3:]]}")
            
            # Prepare input for agent
            agent_input = {
                "input": user_message,
                "chat_history": chat_history
            }
            logger.debug(f"Agent input prepared: {agent_input}")
            
            # Set session context for tools
            logger.info(f"Setting session context for tools...")
            await self.mcp_tool_provider.set_session_context(session_id)
            logger.debug("Session context set for tools")
            
            # Get session-specific agent executor with user context
            logger.info("Getting session-specific agent executor...")
            agent_executor = await self._get_agent_executor_for_session(session_id)
            
            # Execute agent
            logger.info("Executing agent with prepared input...")
            logger.debug(f"About to call agent executor with input keys: {list(agent_input.keys())}")
            result = await agent_executor.ainvoke(agent_input)
            logger.debug(f"Agent execution result: {result}")
            logger.debug(f"Result type: {type(result)}")
            logger.debug(f"Result keys: {list(result.keys()) if isinstance(result, dict) else 'Not a dict'}")
            
            # Extract response
            logger.debug("Extracting response from agent result...")
            response = result.get("output", "I'm sorry, I couldn't process your request.")
            logger.debug(f"Extracted response: {response}")
            logger.info(f"Agent response length: {len(response)} characters")
            
            # Check if we have a pending authorization challenge that needs to be presented to the user
            if hasattr(self.mcp_tool_provider.mcp_client_manager, '_session_challenges'):
                session_challenges = self.mcp_tool_provider.mcp_client_manager._session_challenges
                if session_id in session_challenges:
                    challenge_info = session_challenges[session_id]
                    auth_challenge = challenge_info.get('auth_challenge', {})
                    
                    if auth_challenge.get('method') == 'redirect_popup':
                        logger.info("Intercepting response to inject popup authorization UI")
                        
                        # Create the popup authorization response
                        auth_url = auth_challenge.get('authorizationUrl', '')
                        ui_hints = auth_challenge.get('uiHints', {})
                        popup_width = ui_hints.get('popupWidth', 500)
                        popup_height = ui_hints.get('popupHeight', 650)
                        popup_title = ui_hints.get('popupTitle', 'Authorization Required')
                        status_endpoint = auth_challenge.get('statusEndpoint', '')
                        scope = auth_challenge.get('scope', '')
                        expires_at = auth_challenge.get('expiresAt', '')
                        session_id_auth = auth_challenge.get('sessionId', '')
                        
                        # WR-05: injection-safe JSON via shared helper.
                        # Return structured response that bypasses LLM processing
                        popup_response = build_auth_popup_message(
                            auth_url=auth_url,
                            popup_width=popup_width,
                            popup_height=popup_height,
                            popup_title=popup_title,
                            status_endpoint=status_endpoint,
                            session_id=session_id_auth,
                            scope=scope,
                            expires_at=expires_at,
                        )

                        logger.info("Returning popup authorization response directly")
                        response = popup_response
            
            # Store conversation in memory
            logger.debug("Storing conversation in memory...")
            # Store conversation in memory using the helper methods
            user_msg = ChatMessage.create_user_message(session_id, user_message)
            await self.conversation_memory.add_message(session_id, user_msg)
            logger.debug("User message stored in memory")
            
            assistant_msg = ChatMessage.create_assistant_message(
                session_id, 
                response, 
                {"tools_used": [tool.name for tool in self._tools]}
            )
            await self.conversation_memory.add_message(session_id, assistant_msg)
            logger.debug("Assistant message stored in memory")
            
            logger.info(f"Successfully processed message for session {session_id}")
            logger.debug(f"Final response to return: {response}")
            return response
            
        except Exception as e:
            logger.error(f"Error processing message for session {session_id}: {e}")
            
            # Try to provide a helpful error response
            if "authentication" in str(e).lower() or "authorization" in str(e).lower():
                return "I encountered an authentication issue while trying to help you. Some actions may require additional authorization. Please try again or contact support if the issue persists."
            elif "timeout" in str(e).lower():
                return "I'm sorry, but your request took too long to process. Please try again with a simpler request."
            else:
                return "I encountered an error while processing your request. Please try again or rephrase your question."
    
    async def execute_tool(self, tool_name: str, parameters: Dict[str, Any], session_id: str) -> Dict[str, Any]:
        """
        Execute a specific tool directly.
        
        Args:
            tool_name: Name of the tool to execute
            parameters: Parameters for the tool
            session_id: The chat session ID
            
        Returns:
            Dict containing the tool execution result
            
        Raises:
            ValueError: If tool is not found
            Exception: If tool execution fails
        """
        # Find the tool
        tool = None
        for t in self._tools:
            if t.name == tool_name:
                tool = t
                break
        
        if not tool:
            raise ValueError(f"Tool '{tool_name}' not found")
        
        try:
            logger.info(f"Executing tool {tool_name} for session {session_id}")
            
            # Set session context
            await self.mcp_tool_provider.set_session_context(session_id)
            
            # Execute tool
            result = await tool.arun(parameters)
            
            logger.info(f"Successfully executed tool {tool_name}")
            return {"result": result, "tool_name": tool_name, "parameters": parameters}
            
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}")
            raise
    
    async def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Get information about available tools.
        
        Returns:
            List of tool information dictionaries
        """
        if not self._tools:
            await self.initialize_tools()
        
        tools_info = []
        for tool in self._tools:
            tools_info.append({
                "name": tool.name,
                "description": tool.description,
                "parameters": getattr(tool, "args_schema", None)
            })
        
        return tools_info
    
    async def refresh_tools(self) -> None:
        """Refresh available tools from MCP servers."""
        try:
            logger.info("Refreshing MCP tools")
            
            # Reinitialize tools
            await self.initialize_tools()
            
            logger.info(f"Refreshed tools, now have {len(self._tools)} available")
            
        except Exception as e:
            logger.error(f"Error refreshing tools: {e}")
            raise
    
    async def get_agent_status(self) -> Dict[str, Any]:
        """
        Get status information about the agent.
        
        Returns:
            Dict containing agent status information
        """
        return {
            "initialized": self._agent_executor is not None,
            "tools_count": len(self._tools),
            "tools": [tool.name for tool in self._tools],
            "llm_model": getattr(self.llm, "model_name", "unknown"),
            "memory_sessions": await self.conversation_memory.get_active_sessions_count(),
            "mcp_manager_status": await self.mcp_client_manager.get_manager_status()
        }
    
    async def initialize_session_with_token(self, session_id: str, user_token: str) -> None:
        """
        Pre-identify a user STRICTLY from a validated, PingOne-issued access
        token delivered by the BFF proxy in `session_init` (Path A, CR-02/CR-04).

        Identity (`sub`, email claim) comes ONLY from the cryptographically
        validated token. There is no `/api/users/me` lookup and no fallback to
        a client-supplied id/email. A missing / invalid / expired / wrong-aud
        token is a hard refusal — the caller (message_processor) closes the
        session with an error.

        Args:
            session_id: The chat session ID
            user_token: PingOne access token resolved server-side by the BFF
                        proxy (never supplied by the browser).

        Raises:
            TokenValidationError: token absent / invalid / expired / wrong aud.
        """
        # Imported lazily so the agent module has no hard dependency on PyJWT
        # for code paths that never touch token validation.
        from authentication.token_validator import (
            get_token_validator,
            TokenValidationError,
        )

        if not user_token:
            raise TokenValidationError(
                "session_init carried no auth token — refusing session (Path A)"
            )

        identity = get_token_validator().validate(user_token)

        if not identity.email:
            # Identity must be usable for the banking flow. PingOne profile
            # without an email claim cannot be bound; refuse rather than guess.
            raise TokenValidationError(
                f"Validated token for sub={identity.sub} has no email claim — "
                f"cannot bind chat identity"
            )

        await self.conversation_memory.set_user_identified(
            session_id,
            user_email=identity.email,
            user_id=identity.sub,
        )
        logger.info(
            "Bound session %s to validated identity sub=%s (token-derived, Path A)",
            session_id,
            identity.sub,
        )

    async def clear_session_memory(self, session_id: str) -> None:
        """
        Clear conversation memory for a specific session.
        
        Args:
            session_id: The session ID to clear
        """
        await self.conversation_memory.clear_session(session_id)
        logger.info(f"Cleared memory for session {session_id}")
    
    async def shutdown(self) -> None:
        """Shutdown the agent and clean up resources."""
        try:
            await self.conversation_memory.cleanup()
            await self.mcp_client_manager.shutdown()
            logger.info("LangChain MCP Agent shutdown complete")
        except Exception as e:
            logger.error(f"Error during agent shutdown: {e}")