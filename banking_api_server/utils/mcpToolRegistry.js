/**
 * MCP Tool Registry — LangChain Tool Wrappers
 * Maps LangChain Tool interface to MCP tools via existing bankingAgentService
 */

import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { callMcpTool } from '../services/bankingAgentService.js';

/**
 * Base MCP Tool Wrapper — custom Tool subclass for MCP integration
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
    // Input is a string or structured object (depends on schema)
    try {
      // Parse input if it's a JSON string (LangChain may pass string representation)
      let toolInput = input;
      if (typeof input === 'string') {
        try {
          toolInput = JSON.parse(input);
        } catch (e) {
          // Not JSON — treat as-is
        }
      }

      // Call MCP tool via existing service
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
      'Retrieve list of all user accounts with balances and details',
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

export { McpToolWrapper };
