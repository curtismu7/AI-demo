/**
 * @file mcp-local-hitl.test.js
 * Local MCP tool fallback must enforce the same high-value HITL gate as POST /api/transactions.
 */
const { callToolLocal } = require('../../services/mcpLocalTools');

describe('mcpLocalTools HITL (high-value writes)', () => {
  it('returns consent_challenge_required for create_transfer over $500 (non-admin)', async () => {
    const r = await callToolLocal(
      'create_transfer',
      { from_account_id: '1', to_account_id: '2', amount: 600 },
      '1',
    );
    expect(r.error).toBe('consent_challenge_required');
    expect(r.consent_challenge_required).toBe(true);
    expect(r.hitl_threshold_usd).toBe(500);
  });

  it('allows create_transfer at exactly $500 (non-admin)', async () => {
    const r = await callToolLocal(
      'create_transfer',
      { from_account_id: '1', to_account_id: '2', amount: 500 },
      '1',
    );
    expect(r.success).toBe(true);
    expect(r.transaction_id).toBeDefined();
  });

  it('allows transfer over $500 for admin user', async () => {
    const r = await callToolLocal(
      'create_transfer',
      { from_account_id: 'chk-4', to_account_id: 'sav-4', amount: 600 },
      '4',
    );
    expect(r.success).toBe(true);
    expect(r.transaction_id).toBeDefined();
  });

  it('returns consent_challenge_required for create_deposit over $500 (non-admin)', async () => {
    const r = await callToolLocal(
      'create_deposit',
      { to_account_id: '1', amount: 501 },
      '1',
    );
    expect(r.error).toBe('consent_challenge_required');
  });
});
