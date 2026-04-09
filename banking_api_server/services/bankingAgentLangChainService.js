/**
 * LangChain Banking Agent Service
 * Orchestrates agent executor, memory management, and tool invocation
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { AgentExecutor, createStructuredChatAgent } from 'langchain/agents';
import { ConversationBufferMemory } from 'langchain/memory';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { createMcpToolRegistry } from '../utils/mcpToolRegistry.js';

/**
 * Initialize the banking agent executor for a user session
 * Called once per authenticated session
 *
 * @returns {Promise<AgentExecutor>} Configured agent executor ready for message processing
 */
export async function initializeBankingAgent() {
  // Initialize Claude 3 LLM via Anthropic API
  const llm = new ChatAnthropic({
    modelName: 'claude-3-sonnet-20240229', // Use Sonnet for balance of cost/performance
    temperature: 0.7, // Balanced for banking domain (not too creative, not too rigid)
    maxTokens: 1024, // Adequate for agent responses + tool calls
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Note: API key should be set in environment or Vercel secrets
  });

  // Create MCP tool registry
  const tools = createMcpToolRegistry();

  // Initialize conversation memory (in-memory for now, persisted per-session)
  const memory = new ConversationBufferMemory({
    memoryKey: 'chat_history',
    returnMessages: true,
  });

  // System prompt defining agent behavior
  const systemPrompt = `You are a helpful banking assistant with access to account and transaction tools.

Your responsibilities:
1. Help users check account balances and account details
2. Process transfers, deposits, and withdrawals
3. Confirm that high-value operations (>$500) will require explicit user approval
4. Always be clear about what you're doing and why
5. For sensitive operations, ask for confirmation before proceeding

Always follow these guidelines:
- Be professional and courteous
- Explain financial operations clearly
- Never assume user intent — always confirm before executing transactions
- If unsure about a request, ask for clarification
- Always mention that operations over $500 require approval`;

  // Create the agent using structured chat format (good for tool calling with Claude)
  const agent = await createStructuredChatAgent({
    llm,
    tools,
    systemPrompt,
  });

  // Create executor that manages the agent loop
  const executor = new AgentExecutor({
    agent,
    tools,
    memory,
    verbose: false, // Set to true for debugging
    maxIterations: 10, // Prevent infinite loops
  });

  return executor;
}

/**
 * Process a user message through the agent
 * Returns the agent response + any token exchange events
 *
 * @param {string} message - User message to process
 * @param {AgentExecutor} executor - Agent executor instance
 * @param {string} userId - User ID for context
 * @param {object} agentContext - Auth context (will be added in Plan 02)
 * @param {array} tokenEvents - Token event tracking (will be added in Plan 02)
 * @returns {Promise<{success: boolean, message?: string, error?: string, toolCall?: object}>}
 */
export async function processBankingAgentMessage(
  message,
  executor,
  userId,
  agentContext = null,
  tokenEvents = []
) {
  try {
    // Invoke agent with message
    const response = await executor.invoke({
      input: message,
      userId, // Pass user context to memory
    });

    // Extract agent response
    const agentMessage = response.output || response.message || 'No response';

    return {
      success: true,
      message: agentMessage,
      // Note: toolCall, tokenEvents will be enhanced in Plan 02 (auth + token tracking)
    };
  } catch (error) {
    console.error('[bankingAgentLangChain] Agent error:', error.message);
    return {
      success: false,
      error: error.message || 'Agent processing failed',
    };
  }
}

/**
 * Get agent memory/chat history (for UI display)
 *
 * @param {AgentExecutor} executor - Agent executor with memory
 * @returns {Promise<array>} Chat history messages
 */
export async function getAgentChatHistory(executor) {
  try {
    // Access memory from executor if available
    if (executor.memory && executor.memory.loadMemoryVariables) {
      const vars = await executor.memory.loadMemoryVariables({});
      return vars.chat_history || [];
    }
    return [];
  } catch (error) {
    console.error('[bankingAgentLangChain] Error loading chat history:', error.message);
    return [];
  }
}

/**
 * Create a new agent executor with custom configuration
 * Useful for testing or advanced scenarios
 *
 * @param {object} config - Configuration options
 * @param {string} config.modelName - Anthropic model (default: claude-3-sonnet-20240229)
 * @param {number} config.temperature - Temperature (default: 0.7)
 * @param {number} config.maxTokens - Max tokens (default: 1024)
 * @param {string} config.systemPrompt - Custom system prompt
 * @returns {Promise<AgentExecutor>} Configured executor
 */
export async function createBankingAgentWithConfig(config = {}) {
  const {
    modelName = 'claude-3-sonnet-20240229',
    temperature = 0.7,
    maxTokens = 1024,
    systemPrompt = null,
  } = config;

  const llm = new ChatAnthropic({
    modelName,
    temperature,
    maxTokens,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const tools = createMcpToolRegistry();
  const memory = new ConversationBufferMemory({
    memoryKey: 'chat_history',
    returnMessages: true,
  });

  const defaultPrompt = `You are a helpful banking assistant with access to account and transaction tools.

Your responsibilities:
1. Help users check account balances and account details
2. Process transfers, deposits, and withdrawals
3. Confirm that high-value operations (>$500) will require explicit user approval
4. Always be clear about what you're doing and why`;

  const agent = await createStructuredChatAgent({
    llm,
    tools,
    systemPrompt: systemPrompt || defaultPrompt,
  });

  return new AgentExecutor({
    agent,
    tools,
    memory,
    verbose: false,
    maxIterations: 10,
  });
}

/**
 * Validate that agent executor is properly initialized
 *
 * @param {AgentExecutor} executor - Executor to validate
 * @returns {boolean} True if valid
 */
export function validateAgentExecutor(executor) {
  return (
    executor &&
    executor.agent &&
    executor.tools &&
    executor.tools.length > 0 &&
    executor.memory
  );
}

/**
 * Clear agent conversation history (for new sessions)
 *
 * @param {AgentExecutor} executor - Executor whose memory to clear
 * @returns {Promise<void>}
 */
export async function clearAgentMemory(executor) {
  if (executor.memory && executor.memory.clear) {
    await executor.memory.clear();
  }
}
