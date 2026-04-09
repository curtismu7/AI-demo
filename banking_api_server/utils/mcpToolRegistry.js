/**
 * MCP Tool Registry — LangChain Tool Wrappers
 * Maps LangChain Tool interface to MCP tools via BFF endpoint (/api/mcp/tool)
 */

import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Call an MCP tool via the BFF /api/mcp/tool endpoint
 * Uses HTTP to ensure compatibility with MCP Gateway
 */
async function callMcpTool(toolName, params, agentToken, userId, tokenEvents = []) {
  try {
    // Call BFF /api/mcp/tool endpoint (same process or via localhost)
    // Note: This assumes the BFF is accessible at the same server or via localhost
    const mcpEndpoint = process.env.MCP_TOOL_ENDPOINT || 'http://localhost:3001/api/mcp/tool';

    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agentToken && { 'Authorization': `Bearer ${agentToken}` }),
        ...(userId && { 'X-User-Id': userId }),
      },
      body: JSON.stringify({
        tool: toolName,
        params: params,
      }),
    });

    const data = await response.json();

    // Track tool call event
    if (tokenEvents) {
      tokenEvents.push({
        type: 'tool_call',
        timestamp: new Date().toISOString(),
        tool: toolName,
        status: response.ok ? 'success' : 'failed',
        statusCode: response.status,
        actor: 'agent',
        onBehalfOf: userId,
      });
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: agent token may have expired');
      }
      throw new Error(data.error || `MCP tool failed: ${response.statusText}`);
    }

    return data.result || data;
  } catch (error) {
    if (tokenEvents) {
      tokenEvents.push({
        type: 'tool_error',
        timestamp: new Date().toISOString(),
        tool: toolName,
        error: error.message,
        actor: 'agent',
      });
    }
    throw error;
  }
}

/**
 * Base MCP Tool Wrapper — custom Tool subclass for LangChain integration
 */
class McpToolWrapper extends Tool {
  constructor(mcpToolName, description, schema) {
    super();
    this.name = mcpToolName;
    this.description = description;
    this.schema = schema;
  }

  async _call(input) {
    // LangChain invokes this method when tool is selected
    try {
      let toolInput = input;
      if (typeof input === 'string') {
        try {
          toolInput = JSON.parse(input);
        } catch (e) {
          // Keep as string if not JSON
        }
      }

      // Call MCP tool (note: called without auth in this context — will be enhanced in Plan 02)
      const result = await callMcpTool(this.name, toolInput);
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  }
}

/**
 * Initialize tool registry with all available MCP tools
 * Returns array of LangChain Tools ready for agent use
 */
export function createMcpToolRegistry() {
  return [
    new McpToolWrapper(
      'get_my_accounts',
      'Retrieve list of all user accounts with balances and details. No parameters required.',
      z.object({}).describe('No parameters required')
    ),
    new McpToolWrapper(
      'create_transfer',
      'Transfer money from one account to another (requires high-value confirmation for amounts >$500)',
      z.object({
        from_account_id: z.string().describe('Source account ID'),
        to_account_id: z.string().describe('Destination account ID'),
        amount: z.number().positive().describe('Amount in USD'),
        description: z.string().optional().describe('Optional transfer description'),
      })
    ),
    new McpToolWrapper(
      'create_deposit',
      'Deposit funds into an account (requires confirmation for amounts >$500)',
      z.object({
        account_id: z.string().describe('Target account ID'),
        amount: z.number().positive().describe('Deposit amount in USD'),
        description: z.string().optional().describe('Optional deposit description'),
      })
    ),
    new McpToolWrapper(
      'create_withdrawal',
      'Withdraw funds from an account (requires confirmation for amounts >$500)',
      z.object({
        account_id: z.string().describe('Source account ID'),
        amount: z.number().positive().describe('Withdrawal amount in USD'),
        description: z.string().optional().describe('Optional withdrawal description'),
      })
    ),
  ];
}

export { McpToolWrapper, callMcpTool };
