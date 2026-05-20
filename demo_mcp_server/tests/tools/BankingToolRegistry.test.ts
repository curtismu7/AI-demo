/**
 * Banking Tool Registry Tests
 */

import { BankingToolRegistry } from '../../src/tools/BankingToolRegistry';

describe('BankingToolRegistry', () => {
  const EXPECTED_TOOL_NAMES = [
    'get_my_accounts',
    'get_account_balance',
    'get_sensitive_account_details',
    'get_my_transactions',
    'create_deposit',
    'create_withdrawal',
    'create_transfer',
    'query_user_by_email',
    'lookup_customer',
    'get_customer_profile',
    'get_customer_accounts',
    'get_customer_transactions',
    'freeze_account',
    'reset_customer_password',
    'adjust_balance',
    'delete_customer',
    'sequential_think',
  ];

  describe('getAllTools', () => {
    it('should return all current banking tools', () => {
      const tools = BankingToolRegistry.getAllTools();
      const names = tools.map((t) => t.name);

      expect(names).toHaveLength(EXPECTED_TOOL_NAMES.length);
      expect(new Set(names)).toEqual(new Set(EXPECTED_TOOL_NAMES));
    });

    it('should return tools with required metadata fields', () => {
      const tools = BankingToolRegistry.getAllTools();

      tools.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('title');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('requiresUserAuth');
        expect(tool).toHaveProperty('requiredScopes');
        expect(tool).toHaveProperty('handler');
        expect(tool).toHaveProperty('readOnly');
        expect(tool).toHaveProperty('icons');
        expect(tool).toHaveProperty('annotations');

        expect(typeof tool.name).toBe('string');
        expect(typeof tool.title).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
        expect(typeof tool.requiresUserAuth).toBe('boolean');
        expect(Array.isArray(tool.requiredScopes)).toBe(true);
        expect(typeof tool.handler).toBe('string');
        expect(typeof tool.readOnly).toBe('boolean');
      });
    });
  });

  describe('getTool', () => {
    it('should return tool definition for valid tool name', () => {
      const tool = BankingToolRegistry.getTool('get_my_accounts');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('get_my_accounts');
      expect(tool?.title).toBe('My Bank Accounts');
      expect(tool?.requiresUserAuth).toBe(true);
      expect(tool?.requiredScopes).toEqual(['read']);
      expect(tool?.handler).toBe('executeGetMyAccounts');
      expect(tool?.readOnly).toBe(true);
    });

    it('should return undefined for invalid tool name', () => {
      const tool = BankingToolRegistry.getTool('invalid_tool');
      expect(tool).toBeUndefined();
    });
  });

  describe('getToolNames and hasTool', () => {
    it('should return all tool names', () => {
      const names = BankingToolRegistry.getToolNames();
      expect(new Set(names)).toEqual(new Set(EXPECTED_TOOL_NAMES));
    });

    it('should report existence accurately', () => {
      expect(BankingToolRegistry.hasTool('get_my_accounts')).toBe(true);
      expect(BankingToolRegistry.hasTool('create_transfer')).toBe(true);
      expect(BankingToolRegistry.hasTool('sequential_think')).toBe(true);
      expect(BankingToolRegistry.hasTool('invalid_tool')).toBe(false);
    });
  });

  describe('scope and safety helpers', () => {
    it('should return read tools with read scope', () => {
      // Phase 210+: scope model is flat (read / write / sensitive:read).
      const tools = BankingToolRegistry.getToolsByScope('read');
      const names = tools.map((t) => t.name);

      expect(names).toEqual(
        expect.arrayContaining(['get_my_accounts', 'get_account_balance', 'get_my_transactions'])
      );
    });

    it('should return write tools with write scope', () => {
      const tools = BankingToolRegistry.getToolsByScope('write');
      const names = tools.map((t) => t.name);

      expect(names).toEqual(
        expect.arrayContaining(['create_deposit', 'create_withdrawal', 'create_transfer'])
      );
    });

    it('should return read-only tools', () => {
      const tools = BankingToolRegistry.getReadOnlyTools();
      expect(tools.length).toBeGreaterThan(0);
      tools.forEach((tool) => expect(tool.readOnly).toBe(true));
      expect(tools.map((t) => t.name)).toContain('sequential_think');
    });

    it('should return authenticated/write tools helper set', () => {
      const tools = BankingToolRegistry.getAuthenticatedTools();
      expect(tools.length).toBeGreaterThan(0);
      tools.forEach((tool) => expect(tool.readOnly).toBe(false));
      expect(tools.map((t) => t.name)).toContain('create_transfer');
    });
  });

  describe('getMCPToolDefinitions', () => {
    it('should return MCP-compatible tool definitions without handler property', () => {
      const mcpTools = BankingToolRegistry.getMCPToolDefinitions();

      expect(mcpTools).toHaveLength(EXPECTED_TOOL_NAMES.length);

      mcpTools.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('title');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('icons');
        expect(tool).toHaveProperty('annotations');
        expect(tool).toHaveProperty('requiresUserAuth');
        expect(tool).toHaveProperty('requiredScopes');

        expect(tool).not.toHaveProperty('handler');
      });
    });
  });

  describe('Tool schema validation', () => {
    it('should have valid object schemas for all tools', () => {
      const tools = BankingToolRegistry.getAllTools();

      tools.forEach((tool) => {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema).toHaveProperty('properties');
        expect(tool.inputSchema).toHaveProperty('required');
        expect(tool.inputSchema.additionalProperties).toBe(false);
      });
    });

    it('should require query for sequential_think', () => {
      const tool = BankingToolRegistry.getTool('sequential_think');
      expect(tool?.inputSchema.required).toEqual(['query']);
      expect(tool?.inputSchema.properties?.query?.type).toBe('string');
    });

    it('should require read scope for sensitive account details', () => {
      const tool = BankingToolRegistry.getTool('get_sensitive_account_details');
      // After scope rename: sensitive:read was removed; tool uses only 'read' scope.
      // Sensitive access is gated by PingAuthorize policy, not scope enforcement.
      expect(tool?.requiredScopes).toEqual(['read']);
      expect(tool?.requiresUserAuth).toBe(true);
    });
  });
});
