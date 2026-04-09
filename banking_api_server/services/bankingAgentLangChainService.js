/**
 * LangChain Banking Agent Service (v1.x API)
 * Per-request stateless agent initialization with session-persisted history
 * RFC 8693 token exchange for agent-scoped MCP access
 */

import { createAgent } from 'langchain';
import { ChatAnthropic } from '@langchain/anthropic';
import { createMcpToolRegistry } from '../utils/mcpToolRegistry.js';

const MAX_HISTORY = 20;

/**
 * Create a new LangChain 1.x Agent
 * Called per-request (stateless); history is restored from session via processAgentMessage
 *
 * @returns {ReactAgent} Configured agent ready to invoke
 */
export function createBankingAgent() {
  const tools = createMcpToolRegistry();

  const agent = createAgent({
    model: new ChatAnthropic({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      apiKey: process.env.ANTHROPIC_API_KEY,
      temperature: 0.7,
      maxTokens: 1024,
    }),
    tools,
    systemPrompt: `You are a helpful banking assistant with access to account and transaction tools.

Your responsibilities:
- Help users check balances, view accounts, and perform transfers, deposits, and withdrawals
- Explain OAuth, token exchange, MCP protocol, and PingOne identity concepts
- Answer questions about the demo's security architecture
- For transactions over $500, inform the user that confirmation will be required

Always be concise, helpful, and security-conscious. Never expose tokens or credentials.`,
  });

  return agent;
}

/**
 * Process a user message through the LangChain agent
 * Re-initializes agent per request, restores history from session, persists updated history
 *
 * @param {string} message - User message to process
 * @param {object} agentContext - Auth context from middleware { accessToken, userId, email, sessionId, ... }
 * @param {array} sessionHistory - Persisted chat history from req.session.agentChatHistory (max 20)
 * @param {array} tokenEvents - Token event tracking array from middleware
 * @returns {Promise<{reply: string, updatedHistory: array, tokenEvents: array, interrupt: ?object}>}
 */
export async function processAgentMessage(
  message,
  agentContext,
  sessionHistory = [],
  tokenEvents = []
) {
  if (!message || typeof message !== 'string') {
    throw new Error('Message must be a non-empty string');
  }

  // Trim session history to MAX_HISTORY (in case session growth wasn't capped earlier)
  const trimmedHistory = sessionHistory.slice(-MAX_HISTORY);

  // Perform RFC 8693 token exchange if needed (get agent-scoped token)
  let agentToken = agentContext?.agentToken;
  if (!agentToken) {
    const exchangeResult = await exchangeTokenForAgent(agentContext, tokenEvents);
    agentToken = exchangeResult;
  }

  // Create fresh agent per request (stateless)
  const agent = createBankingAgent();

  // Invoke agent with history context
  const result = await agent.invoke(
    {
      messages: [
        ...trimmedHistory,
        { role: 'human', content: message },
      ],
    },
    {
      configurable: {
        agentContext: {
          agentToken,
          userId: agentContext?.userId,
          tokenEvents,
        },
      },
    }
  );

  // Extract AI reply from result.messages array
  // In langchain 1.x, result.messages is an array of Message objects
  const aiMsg = [...result.messages].reverse().find((m) =>
    m.constructor?.name === 'AIMessage' || m._getType?.() === 'ai'
  );
  const reply = typeof aiMsg?.content === 'string'
    ? aiMsg.content
    : (aiMsg?.content?.[0]?.text ?? 'I was unable to generate a response.');

  // Build updated history for session persistence (max 20 messages)
  const updatedHistory = [
    ...trimmedHistory,
    { role: 'human', content: message },
    { role: 'ai', content: reply },
  ].slice(-MAX_HISTORY);

  // Detect HITL interrupt (if humanInTheLoopMiddleware was invoked)
  const interrupt = result.__interrupt__?.[0] ?? null;

  return {
    reply,
    updatedHistory,
    tokenEvents,
    interrupt,
  };
}

/**
 * RFC 8693 Token Exchange (User acts on behalf of Agent)
 * Exchanges user's OAuth token for an agent-scoped token with 'act' claim
 *
 * @param {object} agentContext - Auth context from middleware
 * @param {array} tokenEvents - Event tracking array
 * @returns {Promise<string>} Agent-scoped access token
 */
export async function exchangeTokenForAgent(agentContext, tokenEvents = []) {
  if (!agentContext?.accessToken) {
    throw new Error('User access token required for token exchange');
  }

  try {
    // Build RFC 8693 token exchange request
    // Subject token: user's access token
    // Actor: identifies the banking agent
    const tokenEndpoint = process.env.PINGONE_TOKEN_ENDPOINT;
    if (!tokenEndpoint) {
      throw new Error(
        'PINGONE_TOKEN_ENDPOINT not configured — cannot perform RFC 8693 exchange'
      );
    }

    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('OAuth credentials not configured');
    }

    // RFC 8693 token exchange request body
    const exchangeRequest = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: agentContext.accessToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_use: 'access_token',
      // Act claim: identifies the agent as actor
      act: JSON.stringify({
        sub: 'banking-agent',
        name: 'BankingAgent',
        aud: 'banking-mcp-tools',
      }),
      client_id: clientId,
      client_secret: clientSecret,
      audience: 'Banking-MCP',
    });

    // Call PingOne token endpoint
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: exchangeRequest.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error_description ||
          data.error ||
          `Token exchange failed: ${response.status}`
      );
    }

    // Record successful token exchange
    if (tokenEvents) {
      tokenEvents.push({
        type: 'token_exchange',
        timestamp: new Date().toISOString(),
        from: 'user',
        to: 'agent',
        actor: { sub: 'banking-agent', name: 'BankingAgent' },
        status: 'success',
      });
    }

    // Return the new agent token
    return data.access_token;
  } catch (error) {
    // Record failed exchange
    if (tokenEvents) {
      tokenEvents.push({
        type: 'token_exchange_error',
        timestamp: new Date().toISOString(),
        error: error.message,
        status: 'failed',
      });
    }
    throw error;
  }
}
