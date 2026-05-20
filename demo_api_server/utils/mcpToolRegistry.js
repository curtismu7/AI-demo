/**
 * MCP Tool Registry — LangChain 1.x tool() wrappers
 * All tools receive auth context via config.configurable.agentContext
 */

const { tool } = require('@langchain/core/tools');
const { z } = require('zod/v4');
const { explainTopic } = require('../services/educationTopics.js');
const { mcpCallTool } = require('../services/mcpWebSocketClient');
const { decodeJwtClaims, buildTokenEvent } = require('../services/agentMcpTokenService');
const { recordToolCall: recordMcpToolCall } = require('../services/mcpToolAuditStore');


const braveSearchService = require('../services/braveSearchService');
const oauthService = require('../services/oauthService');

/**
 * Internal MCP tool call with agent token (bypasses requireSession for agent context)
 * Used by agent tools which run in the same process but don't have session cookies
 */
async function callMcpToolInternal(toolName, params, agentToken, userId, tokenEvents = []) {
  console.log('[MCP_TOOL] === CALL MCP TOOL INTERNAL START ===');
  console.log('[MCP_TOOL] toolName:', toolName);
  console.log('[MCP_TOOL] params:', JSON.stringify(params));
  console.log('[MCP_TOOL] agentToken present:', !!agentToken);
  console.log('[MCP_TOOL] agentToken length:', agentToken?.length || 0);
  console.log('[MCP_TOOL] userId:', userId);
  console.log('[MCP_TOOL] tokenEvents count:', tokenEvents?.length || 0);

  try {
    // Decode userSub from agentToken for MCP metadata
    const userSub = agentToken ? decodeJwtClaims(agentToken)?.sub : null;
    console.log('[MCP_TOOL] userSub from agentToken:', userSub);

    // Track token event
    if (tokenEvents) {
      const decoded = agentToken ? { claims: decodeJwtClaims(agentToken)?.claims, header: decodeJwtClaims(agentToken)?.header } : null;
      tokenEvents.push(buildTokenEvent(
        'mcp-agent-token-presented',
        `Agent Token → MCP Tool: ${toolName}`,
        'active',
        decoded,
        `Agent presenting delegated token to call MCP tool "${toolName}" on behalf of user ${userId}.`,
        { type: 'agent_token_used', tool: toolName, actor: 'agent', onBehalfOf: userId }
      ));
      console.log('[MCP_TOOL] Added agent_token_used event');
    }

    // Call MCP server directly via WebSocket with agent token
    const correlationId = `agent-${Date.now()}`;
    console.log('[MCP_TOOL] Calling mcpCallTool with correlationId:', correlationId);
    const result = await mcpCallTool(toolName, params, agentToken, userSub, correlationId);
    console.log('[MCP_TOOL] mcpCallTool completed successfully');
    console.log('[MCP_TOOL] result type:', typeof result);
    console.log('[MCP_TOOL] result keys:', result ? Object.keys(result) : 'none');

    // Record in local audit store so /api/token-chain includes this agent-path call
    const _callDone = Date.now();
    try {
      const decoded = agentToken ? decodeJwtClaims(agentToken) : null;
      recordMcpToolCall({
        userId: userId || 'agent',
        toolName,
        success: !result?.isError,
        duration: 0,                   // duration not tracked here — measured in agentBuilder
        resultSummary: result?.isError ? `${toolName} failed` : `${toolName} completed`,
        isDelegated: !!agentToken,
        userToken: decoded?.claims ? { sub: decoded.claims.sub || userId, scope: decoded.claims.scope || '' } : null,
      });
    } catch (_) { /* non-blocking */ }

    // Track token event for Token Chain display
    if (tokenEvents) {
      tokenEvents.push(buildTokenEvent(
        'mcp-tool-result',
        `MCP Tool Result: ${toolName}`,
        'exchanged',
        null,
        `MCP tool "${toolName}" executed successfully on behalf of user ${userId}.`,
        { type: 'tool_call', tool: toolName, actor: 'agent', onBehalfOf: userId }
      ));
      console.log('[MCP_TOOL] Added tool_call event');
    }

    // Extract text content from MCP response format
    if (result?.content?.[0]?.type === 'text') {
      console.log('[MCP_TOOL] Returning text content from result');
      return result.content[0].text;
    }

    console.log('[MCP_TOOL] Returning result as-is');
    return result;
  } catch (error) {
    console.error('[MCP_TOOL] ERROR: MCP tool call failed');
    console.error('[MCP_TOOL] Error name:', error.name);
    console.error('[MCP_TOOL] Error message:', error.message);
    console.error('[MCP_TOOL] Error stack:', error.stack);
    
    if (tokenEvents) {
      tokenEvents.push({
        type: 'tool_error',
        timestamp: new Date().toISOString(),
        tool: toolName,
        error: error.message,
        actor: 'agent',
      });
      console.log('[MCP_TOOL] Added tool_error event');
    }
    throw error;
  }
}

/**
 * Call an MCP tool via the BFF /api/mcp/tool endpoint
 * This endpoint handles token exchange before calling the MCP server
 * Used by external callers (browser, inspector) that have session cookies
 */
/**
 * Call an MCP tool via the BFF /api/mcp/tool endpoint.
 * Automatically attempts RFC 8693 scope upgrade on mcp_scope_denied (403) — retries once.
 * Used by external callers (browser, inspector) that have session cookies.
 */
async function callMcpTool(toolName, params, agentToken, userId, tokenEvents = [], _scopeUpgradeAttempted = false) {
  try {
    const mcpEndpoint = process.env.MCP_TOOL_ENDPOINT || 'https://api.ping.demo:3001/api/mcp/tool';

    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agentToken && { 'Authorization': `Bearer ${agentToken}` }),
        ...(userId && { 'X-User-Id': userId }),
      },
      body: JSON.stringify({ tool: toolName, params }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Scope upgrade: intercept mcp_scope_denied — RFC 8693 token exchange + single retry
      if (
        response.status === 403 &&
        data && data.error === 'mcp_scope_denied' &&
        !_scopeUpgradeAttempted &&
        agentToken
      ) {
        const audience = process.env.MCP_SERVER_RESOURCE_URI;
        const requestedScopes = [
          ...(data.availableScopes || []),
          ...(data.missingScopes || []),
        ];
        if (tokenEvents) {
          tokenEvents.push({
            type: 'scope_upgrade',
            timestamp: new Date().toISOString(),
            tool: toolName,
            missingScopes: data.missingScopes || [],
            requestedScopes,
            audience,
            actor: 'agent',
          });
        }
        let upgradedToken;
        try {
          const exchangeResult = await oauthService.performTokenExchange(agentToken, audience, requestedScopes);
          upgradedToken = exchangeResult.access_token;
        } catch (exchangeError) {
          if (tokenEvents) {
            tokenEvents.push({
              type: 'tool_error',
              timestamp: new Date().toISOString(),
              tool: toolName,
              error: 'scope_upgrade_failed: ' + exchangeError.message,
              missingScopes: data.missingScopes || [],
              actor: 'agent',
            });
          }
          throw new Error('Insufficient scope and upgrade failed (missing: ' + (data.missingScopes || []).join(', ') + '): ' + exchangeError.message);
        }
        // Retry exactly once with upgraded token
        return callMcpTool(toolName, params, upgradedToken, userId, tokenEvents, true);
      }

      if (tokenEvents) {
        tokenEvents.push({ type: 'tool_call', timestamp: new Date().toISOString(), tool: toolName, status: 'failed', statusCode: response.status, actor: 'agent', onBehalfOf: userId });
      }
      if (response.status === 401) throw new Error('Unauthorized: agent token may have expired');
      throw new Error(data.error || 'MCP tool failed: ' + response.statusText);
    }

    if (tokenEvents) {
      tokenEvents.push({ type: 'tool_call', timestamp: new Date().toISOString(), tool: toolName, status: 'success', statusCode: response.status, actor: 'agent', onBehalfOf: userId });
    }
    return data.result || data;
  } catch (error) {
    if (tokenEvents) {
      tokenEvents.push({ type: 'tool_error', timestamp: new Date().toISOString(), tool: toolName, error: error.message, actor: 'agent' });
    }
    throw error;
  }
}


/**
 * Helper to extract auth context from LangChain config
 */
function getAgentContext(config) {
  return config?.configurable?.agentContext ?? {};
}

/**
 * Initialize tool registry with all available MCP tools
 * Returns array of LangChain tools ready for agent use
 * All tools receive auth via config.configurable.agentContext
 */
function createMcpToolRegistry() {
  return [
    // ─── Existing 4 banking tools (rewritten with tool() function) ───

    tool(
      async (input, config) => {
        const { agentToken, userId, tokenEvents } = getAgentContext(config);
        const result = await callMcpToolInternal('get_my_accounts', input, agentToken, userId, tokenEvents);
        return JSON.stringify(result);
      },
      {
        name: 'get_my_accounts',
        description: 'Retrieve list of all user accounts with balances and details. This tool requires NO parameters - it automatically uses the authenticated user session. Call this directly when the user asks to "show my accounts", "see my accounts", "what accounts do I have", "check my balance", or "view account information". Do NOT ask for account details or username.',
        schema: z.object({}),
      }
    ),

    tool(
      async (input, config) => {
        const { agentToken, userId, tokenEvents } = getAgentContext(config);
        const result = await callMcpToolInternal('create_transfer', input, agentToken, userId, tokenEvents);
        return JSON.stringify(result);
      },
      {
        name: 'create_transfer',
        description: 'Transfer money from one account to another. Requires user confirmation for amounts over $500. Call this when the user wants to send money between accounts.',
        schema: z.object({
          from_account_id: z.string().describe('Source account ID'),
          to_account_id: z.string().describe('Destination account ID'),
          amount: z.number().positive().describe('Amount in USD to transfer'),
          description: z.string().optional().describe('Optional transfer description'),
        }),
      }
    ),

    tool(
      async (input, config) => {
        const { agentToken, userId, tokenEvents } = getAgentContext(config);
        const result = await callMcpToolInternal('create_deposit', input, agentToken, userId, tokenEvents);
        return JSON.stringify(result);
      },
      {
        name: 'create_deposit',
        description: 'Deposit funds into a bank account. Requires user confirmation for amounts over $500. Call this when the user wants to deposit money.',
        schema: z.object({
          account_id: z.string().describe('Target account ID'),
          amount: z.number().positive().describe('Deposit amount in USD'),
          description: z.string().optional().describe('Optional deposit description'),
        }),
      }
    ),

    tool(
      async (input, config) => {
        const { agentToken, userId, tokenEvents } = getAgentContext(config);
        const result = await callMcpToolInternal('create_withdrawal', input, agentToken, userId, tokenEvents);
        return JSON.stringify(result);
      },
      {
        name: 'create_withdrawal',
        description: 'Withdraw funds from a bank account. Requires user confirmation for amounts over $500. Call this when the user wants to withdraw money.',
        schema: z.object({
          account_id: z.string().describe('Source account ID'),
          amount: z.number().positive().describe('Withdrawal amount in USD'),
          description: z.string().optional().describe('Optional withdrawal description'),
        }),
      }
    ),

    // ─── 3 new tools ───

    tool(
      async ({ topic }) => {
        return explainTopic(topic);
      },
      {
        name: 'explain_topic',
        description: 'Explain an OAuth, identity, or AI agent concept. Use for questions about login flows, token exchange, MCP protocol, HITL, LangChain, PingOne, or other demo concepts. Includes educational content about security patterns.',
        schema: z.object({
          topic: z.string().describe('Topic to explain. Examples: "login-flow", "token-exchange", "may-act", "langchain", "mcp-protocol", "introspection", "step-up", "human-in-loop", "agent-gateway", "pingone-authorize", "cimd"'),
        }),
      }
    ),

    tool(
      async ({ query }) => {
        try {
          const result = await braveSearchService.search(query, { count: 5 });
          if (!result.results?.length) return 'No search results found.';
          return result.results
            .map((r) => `**${r.title}**\n${r.description}\n${r.url}`)
            .join('\n\n');
        } catch (err) {
          if (err.code === 'BRAVE_NOT_CONFIGURED') {
            return 'Web search is not configured. Set BRAVE_SEARCH_API_KEY in the server environment.';
          }
          throw err;
        }
      },
      {
        name: 'brave_search',
        description: 'Search the web for current information. Use when the user asks about recent news, external documentation, or topics not covered by banking tools or education content.',
        schema: z.object({
          query: z.string().describe('Search query string'),
        }),
      }
    ),

    tool(
      async ({ username }, config) => {
        const { agentToken, userId } = getAgentContext(config);
        try {
          // Call BFF login activity endpoint
          const endpoint = process.env.MCP_TOOL_ENDPOINT
            ? new URL('/api/auth/activity/by-username', process.env.MCP_TOOL_ENDPOINT).href
            : 'https://api.ping.demo:3001/api/auth/activity/by-username';
          const res = await fetch(`${endpoint}?username=${encodeURIComponent(username)}`, {
            headers: {
              ...(agentToken && { Authorization: `Bearer ${agentToken}` }),
              ...(userId && { 'X-User-Id': userId }),
            },
          });
          if (!res.ok) {
            return `Unable to fetch login activity for "${username}" (HTTP ${res.status}).`;
          }
          const data = await res.json();
          const logs = data.logs?.slice(0, 5) ?? [];
          if (!logs.length) return `No login activity found for "${username}".`;
          return logs
            .map(
              (l) =>
                `- ${new Date(l.timestamp).toLocaleString()}: ${l.endpoint || '/auth'} from ${l.ipAddress || 'unknown IP'}`
            )
            .join('\n');
        } catch (err) {
          return `Could not retrieve login activity: ${err.message}`;
        }
      },
      {
        name: 'get_login_activity',
        description: 'Look up recent login activity for a specific username or email. Returns timestamps, endpoints, and IP addresses of recent logins. Useful for security audits.',
        schema: z.object({
          username: z.string().describe('The username or email address to look up'),
        }),
      }
    ),
  ];
}

module.exports = { callMcpTool, createMcpToolRegistry };
