'use strict';

const { buildToolSchemasForAgentForVertical } = require('../services/demoAgentLangGraphService');

const retailManifest = {
  id: 'retail',
  terminology: {
    account: 'Loyalty Account',
    accounts: 'Loyalty Accounts',
    balance: 'Reward Points',
    transaction: 'Purchase',
    transactions: 'Purchases',
    highValueAction: 'Large Purchase',
  }
};

const bankingManifest = { id: 'banking', terminology: null };

describe('buildToolSchemasForAgentForVertical', () => {
  it('overrides get_my_accounts description for retail vertical', () => {
    const schemas = buildToolSchemasForAgentForVertical(retailManifest);
    const tool = schemas.find(s => s.name === 'get_my_accounts');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('Loyalty Accounts');
    expect(tool.description).not.toMatch(/bank accounts/i);
  });

  it('overrides create_deposit description for retail vertical', () => {
    const schemas = buildToolSchemasForAgentForVertical(retailManifest);
    const tool = schemas.find(s => s.name === 'create_deposit');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('Reward Points');
  });

  it('overrides create_withdrawal description for retail vertical', () => {
    const schemas = buildToolSchemasForAgentForVertical(retailManifest);
    const tool = schemas.find(s => s.name === 'create_withdrawal');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('Reward Points');
  });

  it('overrides create_transfer description for retail vertical', () => {
    const schemas = buildToolSchemasForAgentForVertical(retailManifest);
    const tool = schemas.find(s => s.name === 'create_transfer');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('Large Purchase');
  });

  it('falls back to original descriptions for banking vertical (no terminology)', () => {
    const schemas = buildToolSchemasForAgentForVertical(bankingManifest);
    const tool = schemas.find(s => s.name === 'get_my_accounts');
    expect(tool).toBeDefined();
    expect(tool.description).toMatch(/accounts/i);
    expect(tool.description).not.toMatch(/loyalty/i);
  });

  it('returns an array with inputSchema for each tool', () => {
    const schemas = buildToolSchemasForAgentForVertical(retailManifest);
    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.length).toBeGreaterThan(0);
    schemas.forEach(s => {
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('description');
      expect(s).toHaveProperty('inputSchema');
    });
  });
});
