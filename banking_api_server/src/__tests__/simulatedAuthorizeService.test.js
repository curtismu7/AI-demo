/**
 * @file simulatedAuthorizeService.test.js
 * In-process Authorize mimic — rules and return shape for education mode.
 */

const {
  evaluateTransaction,
  isSimulatedModeEnabled,
  getSimulatedRecentDecisions,
  SIMULATED_DENY_AMOUNT_USD,
  SIMULATED_POLICY_STEPUP_USD,
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

    it('does not require step-up for deposit (Authorize types may still include deposit via ff)', async () => {
      const r = await evaluateTransaction({
        userId: 'u1',
        amount: SIMULATED_POLICY_STEPUP_USD + 1000,
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

  describe('isSimulatedModeEnabled', () => {
    it('returns true when configStore has ff_authorize_simulated true', () => {
      expect(isSimulatedModeEnabled({ get: (k) => (k === 'ff_authorize_simulated' ? 'true' : null) })).toBe(true);
    });
    it('returns false when flag absent', () => {
      expect(isSimulatedModeEnabled({ get: () => null })).toBe(false);
    });
  });
});
