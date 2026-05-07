/**
 * @file simulatedAuthorizeService.test.js
 * In-process Authorize mimic — rules and return shape for education mode.
 */

const {
  evaluateTransaction,
  evaluateMcpFirstTool,
  isSimulatedModeEnabled,
  getSimulatedRecentDecisions,
  SIMULATED_DENY_AMOUNT_USD,
  SIMULATED_POLICY_STEPUP_USD,
  SIMULATED_CONFIRM_AMOUNT_USD,
} = require('../../services/simulatedAuthorizeService');

describe('simulatedAuthorizeService', () => {
  describe('evaluateTransaction', () => {
    it('returns PERMIT for small withdrawal with strong-looking acr', async () => {
      const r = await evaluateTransaction({
        userId: 'u1',
        amount: 100,
        type: 'withdrawal',
        acr: 'http://schemas.openid.net/pam/mfa',
      });
      expect(r.decision).toBe('PERMIT');
      expect(r.stepUpRequired).toBe(false);
      expect(r.path).toBe('simulated');
      expect(r.raw.engine).toBe('simulated');
    });

    it('returns DENY when amount exceeds ceiling', async () => {
      const r = await evaluateTransaction({
        userId: 'u1',
        amount: SIMULATED_DENY_AMOUNT_USD + 1,
        type: 'transfer',
        acr: 'mfa-strong',
      });
      expect(r.decision).toBe('DENY');
      expect(r.stepUpRequired).toBe(false);
    });

    it('returns stepUpRequired for large transfer without strong acr', async () => {
      const r = await evaluateTransaction({
        userId: 'u1',
        amount: SIMULATED_POLICY_STEPUP_USD + 100,
        type: 'transfer',
        acr: 'pwd',
      });
      expect(r.stepUpRequired).toBe(true);
      expect(r.decision).toBe('INDETERMINATE');
      expect(r.raw.obligations).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'STEP_UP' })])
      );
    });

    it('does not require step-up for deposit (deposit is not in default stepUpTypes)', async () => {
      // Use amount below all thresholds — deposit has no type-based step-up and no amount-based trigger.
      const r = await evaluateTransaction({
        userId: 'u1',
        amount: 10,
        type: 'deposit',
        acr: '',
      });
      expect(r.decision).toBe('PERMIT');
    });

    it('records recent decisions with decision-endpoint parameter shape', async () => {
      await evaluateTransaction({ userId: 'u-deposit', amount: 42, type: 'transfer', acr: '' });
      const recent = getSimulatedRecentDecisions(5);
      expect(recent.length).toBeGreaterThanOrEqual(1);
      const last = recent[0];
      expect(last.parameters).toMatchObject({
        Amount: 42,
        TransactionType: 'transfer',
        UserId: 'u-deposit',
      });
      expect(last.parameters.Timestamp).toBeTruthy();
      expect(last.raw).toBeUndefined();
    });

    it('raw includes Trust Framework parameters and engine metadata', async () => {
      const r = await evaluateTransaction({ userId: 'u2', amount: 5, type: 'withdrawal', acr: 'mfa' });
      expect(r.raw.requestShape).toBe('decision-endpoint');
      expect(r.raw.engine).toBe('simulated');
      expect(r.raw.parameters).toMatchObject({
        Amount: 5,
        TransactionType: 'withdrawal',
        UserId: 'u2',
      });
    });
  });

  describe('evaluateMcpFirstTool — MCP path: highest gate wins, no type-based consent', () => {
    // fc46af7c / 93626945: MCP path uses amount thresholds only. Type-based
    // consentTypes/stepUpTypes do NOT apply — 'transfer' type alone must not
    // trigger HITL; only amount decides the gate.

    const BASE = { userId: 'u-mcp', toolName: 'create_transfer', tokenAudience: 'https://mcp.example', actClientId: 'bff', acr: '' };

    it('read tool with no amount returns PERMIT', async () => {
      const r = await evaluateMcpFirstTool({ ...BASE, toolName: 'get_my_accounts', amount: null, transactionType: null });
      expect(r.decision).toBe('PERMIT');
      expect(r.stepUpRequired).toBe(false);
      expect(r.hitlRequired).toBe(false);
    });

    it('write tool with amount below confirm threshold returns PERMIT', async () => {
      const r = await evaluateMcpFirstTool({ ...BASE, amount: SIMULATED_CONFIRM_AMOUNT_USD - 1, transactionType: 'transfer' });
      expect(r.decision).toBe('PERMIT');
      expect(r.stepUpRequired).toBe(false);
      expect(r.hitlRequired).toBe(false);
    });

    it('write tool at confirm threshold returns hitlRequired only (no step-up)', async () => {
      const r = await evaluateMcpFirstTool({ ...BASE, amount: SIMULATED_CONFIRM_AMOUNT_USD, transactionType: 'transfer' });
      expect(r.decision).toBe('INDETERMINATE');
      expect(r.hitlRequired).toBe(true);
      expect(r.stepUpRequired).toBe(false);
    });

    it('write tool at step-up threshold returns stepUpRequired only — highest gate wins', async () => {
      // Regression (fc46af7c): previously both hitlRequired AND stepUpRequired were
      // returned for amounts >= stepUpAmount. Now highest gate wins: stepUpRequired
      // only, hitlRequired=false.
      const r = await evaluateMcpFirstTool({ ...BASE, amount: SIMULATED_POLICY_STEPUP_USD, transactionType: 'transfer' });
      expect(r.decision).toBe('INDETERMINATE');
      expect(r.stepUpRequired).toBe(true);
      expect(r.hitlRequired).toBe(false);
    });

    it('$600 transfer returns stepUpRequired only (not hitlRequired)', async () => {
      const r = await evaluateMcpFirstTool({ ...BASE, amount: 600, transactionType: 'transfer' });
      expect(r.stepUpRequired).toBe(true);
      expect(r.hitlRequired).toBe(false);
    });

    it('amount exceeding deny threshold returns DENY', async () => {
      const r = await evaluateMcpFirstTool({ ...BASE, amount: SIMULATED_DENY_AMOUNT_USD + 1, transactionType: 'withdrawal' });
      expect(r.decision).toBe('DENY');
      expect(r.stepUpRequired).toBe(false);
      expect(r.hitlRequired).toBe(false);
    });

    it('strong ACR bypasses step-up gate for write tool at step-up amount', async () => {
      const r = await evaluateMcpFirstTool({ ...BASE, amount: SIMULATED_POLICY_STEPUP_USD + 100, transactionType: 'transfer', acr: 'http://schemas.openid.net/pam/mfa' });
      expect(r.decision).toBe('PERMIT');
      expect(r.stepUpRequired).toBe(false);
    });

    it('transfer type alone (amount < confirm threshold) returns PERMIT — type-based consent not applied', async () => {
      // Regression (fc46af7c): previously consentTypes.has('transfer') triggered
      // HITL for ANY transfer regardless of amount. MCP path must ignore type rules.
      const r = await evaluateMcpFirstTool({ ...BASE, toolName: 'create_transfer', amount: SIMULATED_CONFIRM_AMOUNT_USD - 1, transactionType: 'transfer' });
      expect(r.decision).toBe('PERMIT');
      expect(r.hitlRequired).toBe(false);
    });

    it('raw output includes DecisionContext=McpToolCall and Amount', async () => {
      const r = await evaluateMcpFirstTool({ ...BASE, amount: 300, transactionType: 'deposit' });
      expect(r.raw.parameters.DecisionContext).toBe('McpToolCall');
      expect(r.raw.parameters.Amount).toBe(300);
      expect(r.raw.parameters.TransactionType).toBe('deposit');
    });
  });

  describe('isSimulatedModeEnabled', () => {
    it('returns true when configStore has ff_authorize_simulated true', () => {
      expect(isSimulatedModeEnabled({ get: (k) => (k === 'ff_authorize_simulated' ? 'true' : null) })).toBe(true);
    });
    it('returns false when flag absent', () => {
      expect(isSimulatedModeEnabled({ get: () => null })).toBe(false);
    });
  });
});
