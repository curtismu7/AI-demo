/**
 * Agent Builder — LangChain 1.x Agent Factory
 * Creates fresh ReactAgent per request with banking tools, system prompt, and auth context
 * 
 * Pattern (per LangChain 1.x):
 * - createAgent() from langchain root (NOT langchain/agents — that path doesn't exist in 1.x)
 * - ChatAnthropic model with system prompt
 * - Tools from createMcpToolRegistry()
 * - Config-driven agent context (auth, tokens, events)
 */

const { createAgent } = require('langchain');
const { ChatAnthropic } = require('@langchain/anthropic');
const { createMcpToolRegistry } = require('../utils/mcpToolRegistry');

/**
 * LangChain 1.x system prompt for banking agent
 */
const BANKING_AGENT_SYSTEM_PROMPT = `You are a banking assistant powered by LangChain and MCP tools.

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
 * Create a fresh banking agent for a user request
 * 
 * @param {object} config - Agent configuration
 * @param {string} config.userId - PingOne user ID
 * @param {string} config.userToken - User's OAuth access token
 * @param {string} config.sessionId - Express session ID
 * @param {array} config.tokenEvents - Token event tracking array (passed by reference)
 * @returns {Promise<object>} LangChain 1.x agent ready for invoke()
 */
async function createBankingAgent({ userId, userToken, sessionId, tokenEvents = [] }) {
  try {
    // Validate inputs
    if (!userId || !userToken) {
      throw new Error('Agent requires userId and userToken');
    }

    // Initialize model with system prompt and API key from environment
    const model = new ChatAnthropic({
      modelName: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 1024,
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Disable automatic tool calling for now
      // We'll handle tool invocation through MCP directly
    });

    // Get all available MCP tools wrapped as LangChain tools
    const tools = createMcpToolRegistry();

    // Create agent configuration with auth context available to tools
    const agentConfig = {
      configurable: {
        agentContext: {
          userId,
          userToken,
          sessionId,
          tokenEvents,
        },
      },
    };

    // Create the agent using LangChain 1.x createAgent()
    // This returns an agent that can be invoked
    const agent = await createAgent({
      llm: model,
      tools: tools,
      prompt: BANKING_AGENT_SYSTEM_PROMPT,
      // Type of agent to create
      agentType: 'react', // Reason + Act pattern
    });

    // Attach config to agent for use during invoke
    agent.configurable = agentConfig.configurable;

    return agent;
  } catch (error) {
    console.error('[agentBuilder] Failed to create agent:', error.message);
    throw error;
  }
}

module.exports = {
  createBankingAgent,
  BANKING_AGENT_SYSTEM_PROMPT,
};
