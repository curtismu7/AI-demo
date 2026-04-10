/**
 * Banking Agent LangChain Service
 * LangChain agent executor for banking operations with MCP tools + HITL gates
 */

const { createBankingAgent } = require('./agentBuilder');
const { callMcpTool } = require('../utils/mcpToolRegistry');

/**
 * Process incoming user message through the agent
 */
async function processAgentMessage({ message, userId, userToken, sessionId, tokenEvents = [] }) {
  try {
    const agent = await createBankingAgent({
      userId,
      userToken,
      sessionId,
      tokenEvents
    });

    // Simple agent loop
    const result = await agent.invoke({
      input: message,
      toolChoice: 'auto'
    });

    return {
      message: result.output,
      toolsCalled: result.toolsCalled || [],
      tokensUsed: result.tokensUsed || 0,
      requiresConsent: result.requiresConsent || false,
      action: result.action,
      amount: result.amount
    };
  } catch (error) {
    console.error('Agent processing error:', error);
    throw error;
  }
}

module.exports = {
  processAgentMessage
};
