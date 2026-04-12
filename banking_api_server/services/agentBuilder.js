/**
 * Agent Builder — LangGraph StateGraph Factory
 * Creates fresh LangGraph agent per request with banking tools, system prompt, and auth context
 * 
 * Pattern (per LangGraph):
 * - StateGraph with defined state schema
 * - Nodes for agent reasoning and tool execution
 * - ChatAnthropic/ChatGroq model with system prompt
 * - Tools from createMcpToolRegistry()
 * - Config-driven agent context (auth, tokens, events)
 */

const { StateGraph } = require('@langchain/langgraph');
const { ChatGroq } = require('@langchain/groq');
const { Annotation } = require('@langchain/langgraph');
const { createMcpToolRegistry } = require('../utils/mcpToolRegistry');
const { resolveMcpAccessTokenWithEvents } = require('./agentMcpTokenService');

/**
 * LangGraph system prompt for banking agent
 */
const BANKING_AGENT_SYSTEM_PROMPT = `You are a banking assistant powered by LangGraph and MCP tools.

Your capabilities:
- Retrieve user accounts and balances
- Process transactions
- Manage account settings
- Provide banking information
- Answer financial questions

Always be helpful, accurate, and secure. For sensitive operations, you will be asked for consent before proceeding.

When a user asks you to perform an action:
1. Directly use the appropriate tool to get information or perform the action
2. Report results clearly and concisely
3. Ask for consent only if the action requires it

For simple queries like "show my accounts", "recent transactions", or "my balance" - directly execute the action without confirmation questions. Be concise and professional in all responses.`;

/**
 * Define the state schema for the banking agent
 */
const AgentAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userId: Annotation({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  userToken: Annotation({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  sessionId: Annotation({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  tokenEvents: Annotation({
    reducer: (x, y) => y || x,
    default: () => [],
  }),
  provider: Annotation({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
});

/**
 * Create a fresh banking agent for a user request
 * 
 * @param {object} config - Agent configuration
 * @param {string} config.userId - PingOne user ID
 * @param {string} config.userToken - User's OAuth access token
 * @param {string} config.sessionId - Express session ID
 * @param {array} config.tokenEvents - Token event tracking array (passed by reference)
 * @returns {Promise<object>} LangGraph agent ready for invoke()
 */
async function createBankingAgent({ userId, userToken, sessionId, tokenEvents = [] }) {
  console.log('[agentBuilder] === CREATE BANKING AGENT START ===');
  console.log('[agentBuilder] userId:', userId);
  console.log('[agentBuilder] userToken present:', !!userToken);
  console.log('[agentBuilder] userToken length:', userToken?.length || 0);
  console.log('[agentBuilder] sessionId:', sessionId);
  console.log('[agentBuilder] tokenEvents initial count:', tokenEvents?.length || 0);

  try {
    // Validate inputs
    if (!userId || !userToken) {
      console.error('[agentBuilder] ERROR: Missing required inputs - userId:', !!userId, 'userToken:', !!userToken);
      throw new Error('Agent requires userId and userToken');
    }

    // Perform token exchange to get MCP access token and generate token events
    console.log('[agentBuilder] Performing token exchange for MCP access...');
    const mockReq = {
      session: { oauthTokens: { accessToken: userToken }, id: sessionId },
      sessionID: sessionId,
    };
    
    let agentToken;
    let exchangeEvents;
    try {
      const result = await resolveMcpAccessTokenWithEvents(mockReq, 'banking_agent');
      agentToken = result.token;
      exchangeEvents = result.tokenEvents;
      console.log('[agentBuilder] Token exchange completed, agentToken present:', !!agentToken);
      console.log('[agentBuilder] agentToken length:', agentToken?.length || 0);
      console.log('[agentBuilder] Exchange events count:', exchangeEvents?.length || 0);
    } catch (exchangeError) {
      console.error('[agentBuilder] ERROR: Token exchange failed:', exchangeError.message);
      console.error('[agentBuilder] Exchange error stack:', exchangeError.stack);
      throw new Error(`Token exchange failed: ${exchangeError.message}`);
    }

    // Add exchange events to the token events array
    if (exchangeEvents && exchangeEvents.length > 0) {
      console.log('[agentBuilder] Adding exchange events to tokenEvents array');
      tokenEvents.push(...exchangeEvents);
      console.log('[agentBuilder] tokenEvents count after adding:', tokenEvents.length);
    }

    // Initialize model with system prompt and API key from environment
    // Using Groq (Llama 3.1) for reliable performance
    let model;
    let provider;

    if (process.env.GROQ_API_KEY) {
      console.log('[agentBuilder] Using Groq (Llama 3.1)');
      model = new ChatGroq({
        model: 'llama-3.1-8b-instant',
        temperature: 0.7,
        maxTokens: 1024,
        apiKey: process.env.GROQ_API_KEY,
      });
      provider = 'groq';
    } else {
      console.error('[agentBuilder] ERROR: No LLM API key configured (GROQ_API_KEY required)');
      throw new Error('No LLM API key configured. Please set GROQ_API_KEY environment variable to use the banking agent.');
    }

    // Define the agent node with tools
    const tools = createMcpToolRegistry();
    
    async function agentNode(state) {
      const messages = [
        { role: 'system', content: BANKING_AGENT_SYSTEM_PROMPT },
        ...state.messages,
      ];
      const config = {
        configurable: {
          agentContext: {
            agentToken,
            userId,
            tokenEvents,
          },
        },
      };
      const response = await model.bindTools(tools).invoke(messages, config);
      // Handle LangChain response format - it may have tool_calls or content as array
      let messageContent;
      if (response.tool_calls && response.tool_calls.length > 0) {
        // If there are tool calls, return the response as-is (tool_calls will be processed by toolNode)
        return { messages: [response] };
      } else if (Array.isArray(response.content)) {
        // Content might be an array of content blocks
        messageContent = response.content.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join('\n');
      } else {
        // Ensure response is in the correct message format
        messageContent = response.content || response.text || JSON.stringify(response);
      }
      return { messages: [{ role: 'assistant', content: messageContent }] };
    }

    // Tool execution node
    async function toolNode(state) {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage?.tool_calls) {
        const toolMessages = [];
        for (const toolCall of lastMessage.tool_calls) {
          const tool = tools.find(t => t.name === toolCall.name);
          if (tool) {
            try {
              const result = await tool.invoke(toolCall.args, {
                configurable: {
                  agentContext: {
                    agentToken,
                    userId,
                    tokenEvents,
                  },
                },
              });
              // Ensure result is a string for React rendering
              const resultString = typeof result === 'string' ? result : JSON.stringify(result);
              // Return individual tool message for each tool call
              toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: resultString,
              });
            } catch (error) {
              toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Error: ${error.message}`,
              });
            }
          }
        }
        return { messages: toolMessages };
      }
      return { messages: [] };
    }

    // Create the graph with conditional edge for tool calls
    const workflow = new StateGraph(AgentAnnotation)
      .addNode('agent', agentNode)
      .addNode('tools', toolNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges(
        'agent',
        (state) => {
          const lastMessage = state.messages[state.messages.length - 1];
          return lastMessage?.tool_calls?.length > 0 ? 'tools' : '__end__';
        },
        {
          tools: 'tools',
          __end__: '__end__',
        }
      )
      .addEdge('tools', 'agent');

    // Compile the graph
    const app = workflow.compile();

    // Return the compiled graph with initial state
    return {
      graph: app,
      initialState: {
        messages: [],
        userId,
        userToken,
        sessionId,
        tokenEvents,
        provider,
      },
    };
  } catch (error) {
    console.error('[agentBuilder] Failed to create agent:', error.message);
    throw error;
  }
}

module.exports = {
  createBankingAgent,
  BANKING_AGENT_SYSTEM_PROMPT,
};
