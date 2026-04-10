/**
 * Banking Agent LangGraph Service
 * LangGraph agent executor for banking operations with MCP tools + HITL gates
 */

const { createBankingAgent } = require('./agentBuilder');

/**
 * Process incoming user message through the agent
 */
async function processAgentMessage({ message, userId, userToken, sessionId, tokenEvents = [] }) {
  try {
    console.log('[processAgentMessage] Starting');
    console.log('[processAgentMessage] userId:', userId);
    console.log('[processAgentMessage] userToken present:', !!userToken);
    console.log('[processAgentMessage] userToken length:', userToken?.length || 0);
    console.log('[processAgentMessage] sessionId:', sessionId);
    console.log('[processAgentMessage] tokenEvents count:', tokenEvents?.length || 0);
    console.log('[processAgentMessage] message length:', message?.length || 0);

    // Check if any LLM API key is configured
    if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
      console.warn('[processAgentMessage] No LLM API key configured (ANTHROPIC_API_KEY or GROQ_API_KEY), returning fallback response');
      return {
        reply: 'The banking agent is not configured. Please set ANTHROPIC_API_KEY or GROQ_API_KEY environment variable to enable AI-powered banking assistance.',
        success: false,
        error: 'No LLM API key configured',
        toolsCalled: [],
        tokensUsed: 0,
        requiresConsent: false,
        agentConfigured: false
      };
    }

    console.log('[processAgentMessage] Creating banking agent...');
    const { graph, initialState } = await createBankingAgent({
      userId,
      userToken,
      sessionId,
      tokenEvents
    });
    console.log('[processAgentMessage] Agent created successfully');

    // Invoke the LangGraph with the user message
    console.log('[processAgentMessage] Invoking LangGraph agent...');
    const finalState = await graph.invoke({
      ...initialState,
      messages: [{ role: 'user', content: message }],
    });
    console.log('[processAgentMessage] Agent invoke completed');
    console.log('[processAgentMessage] Final state keys:', Object.keys(finalState || {}));
    console.log('[processAgentMessage] Final messages count:', finalState?.messages?.length || 0);

    // Extract the last message from the agent response
    const lastMessage = finalState.messages[finalState.messages.length - 1];
    const responseContent = lastMessage?.content || lastMessage?.text || 'No response from agent';

    return {
      reply: responseContent,
      success: true,
      toolsCalled: [],
      tokensUsed: 0,
      requiresConsent: false,
      agentConfigured: true
    };
  } catch (error) {
    console.error('[processAgentMessage] ERROR: Agent processing error');
    console.error('[processAgentMessage] Error name:', error.name);
    console.error('[processAgentMessage] Error message:', error.message);
    console.error('[processAgentMessage] Error stack:', error.stack);
    console.error('[processAgentMessage] Error code:', error.code);
    console.error('[processAgentMessage] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    // Return a graceful error response instead of throwing
    let userMessage = 'The banking agent encountered an error. Please try again.';
    if (error.message.includes('model') && error.message.includes('not_found')) {
      userMessage = 'The AI model is not available. Please contact support or try again later.';
    } else if (error.message.includes('API key') || error.message.includes('401')) {
      userMessage = 'Authentication error. Please log out and log in again.';
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      userMessage = 'Too many requests. Please wait a moment and try again.';
    }
    return {
      reply: userMessage,
      success: false,
      error: error.message,
      toolsCalled: [],
      tokensUsed: 0,
      requiresConsent: false,
      agentError: true,
      errorMessage: error.message
    };
  }
}

module.exports = {
  processAgentMessage
};
