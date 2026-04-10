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
1. Confirm you understand what they want
2. Use the appropriate tool to get information or perform the action
3. Report results clearly
4. Ask for consent if the action requires it

Be concise and professional in all responses.`;

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
  try {
    // Validate inputs
    if (!userId || !userToken) {
      throw new Error('Agent requires userId and userToken');
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
      console.error('[agentBuilder] No LLM API key configured (GROQ_API_KEY required)');
      throw new Error('No LLM API key configured. Please set GROQ_API_KEY environment variable to use the banking agent.');
    }

    // Define the agent node
    async function agentNode(state) {
      const messages = [
        { role: 'system', content: BANKING_AGENT_SYSTEM_PROMPT },
        ...state.messages,
      ];
      const response = await model.invoke(messages);
      // Ensure response is in the correct message format
      const messageContent = response.content || response.text || response;
      return { messages: [{ role: 'assistant', content: messageContent }] };
    }

    // Create the graph
    const workflow = new StateGraph(AgentAnnotation)
      .addNode('agent', agentNode)
      .addEdge('__start__', 'agent')
      .addEdge('agent', '__end__');

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
