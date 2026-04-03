/**
 * @file mcp-local-hitl.test.js
 * Local MCP tool fallback must enforce the same high-value HITL gate as POST /api/transactions.
 * Also covers stale/fake account ID resolution (chk-N pattern from UI generateFakeAccounts).
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

describe('mcpLocalTools — stale/fake account ID resolution', () => {
  // User IDs whose account IDs happen to be short (e.g. 'chk-5') when userId='5'.
  // The UI generateFakeAccounts used to send these; the server must not 404 — it should
  // fall back to type-based resolution and complete the operation successfully.

  it('create_deposit succeeds when UI sends stale chk-N fake account ID', async () => {
    // userId='stale-test-user' ⇒ server provisions chk-staletestus / sav-staletestus,
    // but UI fallback would have sent 'chk-5' (a short fake ID that does not exist).
    const r = await callToolLocal(
      'create_deposit',
      { account_id: 'chk-5', amount: 50 },
      'stale-test-user',
    );
    // Must NOT return an account-not-found error — should resolve to the real checking account.
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
    expect(r.transaction_id).toBeDefined();
    expect(r.amount).toBe(50);
  });

  it('create_withdrawal succeeds when UI sends stale sav-N fake account ID', async () => {
    const r = await callToolLocal(
      'create_withdrawal',
      { account_id: 'sav-0', amount: 10 },
      'stale-test-user-2',
    );
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
  });

  it('create_deposit with plain type name "checking" resolves correctly', async () => {
    const r = await callToolLocal(
      'create_deposit',
      { account_id: 'checking', amount: 25 },
      'stale-test-user-3',
    );
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
  });

  it('create_deposit with no account_id still works (defaults to checking)', async () => {
    const r = await callToolLocal(
      'create_deposit',
      { amount: 15 },
      'stale-test-user-4',
    );
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
  });
});

