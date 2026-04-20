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
const { ChatAnthropic } = require('@langchain/anthropic');
const { ChatOpenAI } = require('@langchain/openai');
const { ToolMessage } = require('@langchain/core/messages');
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
 * @param {object} config.langchainConfig - Session LLM config: { provider, model, fallback_order, groq_api_key, openai_api_key, ... }
 * @returns {Promise<object>} LangGraph agent ready for invoke()
 */
/**
 * Ensure tool_call args is always a plain object.
 * Prevents Anthropic API "Input should be a valid dictionary" errors
 * when args is empty string, undefined, or other non-object type
 * (can happen with cross-provider fallback or empty-schema tools).
 */
function normalizeToolCallArgs(args) {
  if (args && typeof args === 'object' && !Array.isArray(args)) return args;
  if (typeof args === 'string' && args.length > 0) {
    try { return JSON.parse(args); } catch { return {}; }
  }
  return {};
}

async function createBankingAgent({ userId, userToken, sessionId, tokenEvents = [], langchainConfig = {} }) {
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

        // Initialize model with fallback chain support
    // Priority: session langchain_config.fallback_order > environment variables > hardcoded defaults
    let model;
    let provider;
    
    // Default model names per provider — matched with langchainConfig.js and llm_factory.py
    const PROVIDER_DEFAULT_MODELS = {
      groq: 'llama-3.3-70b-versatile',
      anthropic: 'claude-haiku-4-20250414',
      openai: 'gpt-4o-mini',
      google: 'gemini-2.0-flash',
      lmstudio: 'default',
    };

    // Build provider config map from session + environment
    const groqKey = langchainConfig?.groq_api_key || process.env.GROQ_API_KEY;
    const anthropicKey = langchainConfig?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    const openaiKey = langchainConfig?.openai_api_key || process.env.OPENAI_API_KEY;
    const googleKey = langchainConfig?.google_api_key || process.env.GOOGLE_API_KEY;
    const lmStudioBase = langchainConfig?.lmstudio_base_url || process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';
    
    // Determine fallback order
    const fallbackOrder = langchainConfig?.fallback_order || ['groq', 'anthropic'];
    console.log('[agentBuilder] Fallback chain (from session config):', fallbackOrder);
    
    // Try to initialize model based on fallback order
    let initialized = false;
    for (const providerName of fallbackOrder) {
      try {
        // Resolve model: prefer an explicitly set model that belongs to this provider;
        // otherwise fall back to the per-provider default so cross-provider model names
        // don't leak (e.g. a Groq model name is never sent to OpenAI).
        const requestedModel = langchainConfig?.model;
        const defaultModel = PROVIDER_DEFAULT_MODELS[providerName];
        const resolvedModel = requestedModel || defaultModel;

        if (providerName === 'groq' && groqKey) {
          console.log('[agentBuilder] Initializing Groq LLM');
          model = new ChatGroq({
            model: resolvedModel,
            temperature: 0.7,
            maxTokens: 1024,
            apiKey: groqKey,
            timeout: 30000,
          });
          provider = 'groq';
          initialized = true;
          console.log(`[agentBuilder] LLM initialized: groq/${resolvedModel}`);
          break;
        } else if (providerName === 'anthropic' && anthropicKey) {
          console.log('[agentBuilder] Initializing Anthropic LLM');
          model = new ChatAnthropic({
            model: resolvedModel,
            temperature: 0.7,
            maxTokens: 1024,
            apiKey: anthropicKey,
            timeout: 30000,
          });
          provider = 'anthropic';
          initialized = true;
          console.log(`[agentBuilder] LLM initialized: anthropic/${resolvedModel}`);
          break;
        } else if (providerName === 'openai' && openaiKey) {
          console.log('[agentBuilder] Initializing OpenAI LLM');
          model = new ChatOpenAI({
            model: resolvedModel,
            temperature: 0.7,
            maxTokens: 1024,
            streaming: true,
            apiKey: openaiKey,
            timeout: 30000,
          });
          provider = 'openai';
          initialized = true;
          console.log(`[agentBuilder] LLM initialized: openai/${resolvedModel}`);
          break;
        } else if (providerName === 'lmstudio') {
          // LM Studio exposes an OpenAI-compatible endpoint — no API key required
          console.log('[agentBuilder] Initializing LM Studio LLM (OpenAI-compatible)');
          const lmModel = resolvedModel === 'default' ? '' : resolvedModel;
          model = new ChatOpenAI({
            model: lmModel,
            temperature: 0.7,
            maxTokens: 1024,
            streaming: true,
            apiKey: 'lm-studio',
            configuration: { baseURL: lmStudioBase },
            timeout: 30000,
          });
          provider = 'lmstudio';
          initialized = true;
          console.log(`[agentBuilder] LLM initialized: lmstudio@${lmStudioBase}`);
          break;
        } else if (providerName === 'google' && googleKey) {
          console.log('[agentBuilder] Google Generative AI not yet available in this runtime (missing @langchain/google-genai)');
          continue;
        } else if (providerName === 'ollama') {
          console.log('[agentBuilder] Ollama not yet available in this runtime (missing @langchain/ollama)');
          continue;
        }
      } catch (err) {
        console.warn(`[agentBuilder] Failed to initialize ${providerName}:`, err.message);
        continue;
      }
    }
    
    // Fallback to environment variables if session config didn't work
    if (!initialized) {
      console.log('[agentBuilder] No provider initialized from fallback chain, trying environment defaults');
      if (process.env.GROQ_API_KEY) {
        console.log('[agentBuilder] Using Groq from environment');
        model = new ChatGroq({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          maxTokens: 1024,
          apiKey: process.env.GROQ_API_KEY,
          timeout: 30000,
        });
        provider = 'groq';
        initialized = true;
      } else if (process.env.ANTHROPIC_API_KEY) {
        console.log('[agentBuilder] Using Anthropic from environment');
        model = new ChatAnthropic({
          model: 'claude-haiku-4-20250414',
          temperature: 0.7,
          maxTokens: 1024,
          apiKey: process.env.ANTHROPIC_API_KEY,
          timeout: 30000,
        });
        provider = 'anthropic';
        initialized = true;
      }
    }
    
    if (!initialized || !model) {
      console.error('[agentBuilder] ERROR: No LLM provider could be initialized');
      throw new Error('No LLM provider available. Configure at least one provider in /llm-config or set GROQ_API_KEY/ANTHROPIC_API_KEY.');
    }

    // Build fallback model for 429 rate-limit recovery (Anthropic if primary is not Anthropic)
    let fallbackModel = null;
    if (provider !== 'anthropic' && anthropicKey) {
      try {
        fallbackModel = new ChatAnthropic({
          model: PROVIDER_DEFAULT_MODELS.anthropic,
          temperature: 0.7,
          maxTokens: 1024,
          apiKey: anthropicKey,
          timeout: 30000,
        });
        console.log('[agentBuilder] Fallback model ready: anthropic');
      } catch (err) {
        console.warn('[agentBuilder] Could not initialize fallback model:', err.message);
      }
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
      let response;
      try {
        response = await model.bindTools(tools).invoke(messages, config);
      } catch (invokeError) {
        const is429 = invokeError.message?.includes('429') || invokeError.message?.includes('rate') || invokeError.status === 429;
        if (is429 && fallbackModel) {
          console.warn('[agentBuilder] Primary model rate-limited (429), falling back to Anthropic');
          provider = 'anthropic';
          response = await fallbackModel.bindTools(tools).invoke(messages, config);
        } else {
          throw invokeError;
        }
      }
      // Handle LangChain response format - it may have tool_calls or content as array
      let messageContent;
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Normalize tool_call args to always be plain objects.
        // Prevents Anthropic API "Input should be a valid dictionary" errors
        // in cross-provider fallback or empty-schema tools like get_my_accounts.
        for (const tc of response.tool_calls) {
          tc.args = normalizeToolCallArgs(tc.args);
        }
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
              const args = normalizeToolCallArgs(toolCall.args);
              const result = await tool.invoke(args, {
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
              toolMessages.push(new ToolMessage({
                content: resultString,
                tool_call_id: toolCall.id,
              }));
            } catch (error) {
              toolMessages.push(new ToolMessage({
                content: `Error: ${error.message}`,
                tool_call_id: toolCall.id,
              }));
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
