/**
 * Unit tests for Phase 170: Transfer HITL enforcement in transactionConsentChallenge.
 * Verifies that ALL transfers require consent challenges regardless of amount,
 * while withdrawals/deposits preserve the existing $500 threshold.
 */
'use strict';

const txConsent = require('../../services/transactionConsentChallenge');

// Mock dataStore to provide account data for validateIntent
jest.mock('../../data/store', () => ({
  getAccountById: jest.fn((id) => {
    const accounts = {
      'acc1': { id: 'acc1', userId: '5', balance: 10000 },
      'acc2': { id: 'acc2', userId: '5', balance: 5000 },
    };
    return accounts[id] || null;
  }),
  getAccountsByUserId: jest.fn(() => [
    { id: 'acc1', userId: '5', balance: 10000 },
    { id: 'acc2', userId: '5', balance: 5000 },
  ]),
  getUserById: jest.fn(() => null),
}));

function makeReq(overrides = {}) {
  return {
    user: { id: '5', role: 'customer', ...overrides.user },
    session: { txConsentChallenges: {}, ...overrides.session },
  };
}

describe('Phase 170 — Transfer HITL enforcement', () => {
  describe('createChallenge — transfer type always requires challenge', () => {
    test('transfer $1.00 creates a challenge (below $500 threshold)', () => {
      const req = makeReq();
      const body = { type: 'transfer', amount: 1.00, fromAccountId: 'acc1', toAccountId: 'acc2', description: 'Test' };
      const result = txConsent.createChallenge(req, body);
      expect(result.ok).toBe(true);
      expect(result.challengeId).toBeDefined();
      expect(result.challengeId.length).toBeGreaterThan(0);
    });

    test('transfer $0.01 creates a challenge (minimal amount)', () => {
      const req = makeReq();
      const body = { type: 'transfer', amount: 0.01, fromAccountId: 'acc1', toAccountId: 'acc2', description: 'Penny' };
      const result = txConsent.createChallenge(req, body);
      expect(result.ok).toBe(true);
      expect(result.challengeId).toBeDefined();
    });

    test('transfer $499.99 creates a challenge (just below old threshold)', () => {
      const req = makeReq();
      const body = { type: 'transfer', amount: 499.99, fromAccountId: 'acc1', toAccountId: 'acc2', description: 'Near threshold' };
      const result = txConsent.createChallenge(req, body);
      expect(result.ok).toBe(true);
      expect(result.challengeId).toBeDefined();
    });

    test('transfer $501.00 creates a challenge (above threshold — always did)', () => {
      const req = makeReq();
      const body = { type: 'transfer', amount: 501.00, fromAccountId: 'acc1', toAccountId: 'acc2', description: 'Large' };
      const result = txConsent.createChallenge(req, body);
      expect(result.ok).toBe(true);
      expect(result.challengeId).toBeDefined();
    });
  });

  describe('createChallenge — withdrawal/deposit threshold preserved', () => {
    test('withdrawal $100 rejected (below $500 threshold)', () => {
      const req = makeReq();
      const body = { type: 'withdrawal', amount: 100.00, fromAccountId: 'acc1', description: 'Withdrawal' };
      const result = txConsent.createChallenge(req, body);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.json.error).toBe('consent_challenge_not_required');
    });

    test('withdrawal $501 creates a challenge (above threshold)', () => {
      const req = makeReq();
      const body = { type: 'withdrawal', amount: 501.00, fromAccountId: 'acc1', description: 'Large withdrawal' };
      const result = txConsent.createChallenge(req, body);
      expect(result.ok).toBe(true);
      expect(result.challengeId).toBeDefined();
    });

    test('deposit $10000 rejected (deposits use threshold, not transfer logic)', () => {
      const req = makeReq();
      const body = { type: 'deposit', amount: 100.00, toAccountId: 'acc1', description: 'Deposit' };
      const result = txConsent.createChallenge(req, body);
      expect(result.ok).toBe(false);
      expect(result.json.error).toBe('consent_challenge_not_required');
    });
  });

  describe('createChallenge — admin bypass preserved', () => {
    test('admin transfer is rejected with consent_challenge_not_applicable', () => {
      const req = makeReq({ user: { role: 'admin' } });
      const body = { type: 'transfer', amount: 1.00, fromAccountId: 'acc1', toAccountId: 'acc2', description: 'Admin' };
      const result = txConsent.createChallenge(req, body);
      expect(result.ok).toBe(false);
      expect(result.json.error).toBe('consent_challenge_not_applicable');
    });
  });
});

// ── verifyMfa tests ──────────────────────────────────────────────────────────

jest.mock('../../services/mfaService', () => ({
  initiateDeviceAuth: jest.fn(),
  selectDevice: jest.fn(),
  submitOtp: jest.fn(),
  submitFido2Assertion: jest.fn(),
}));

const mfaService = require('../../services/mfaService');

function makeReqWithMfaChallenge(challengeId, overrides = {}) {
  const ch = {
    userId: '5',
    snapshot: { type: 'withdrawal', amount: 600, fromAccountId: 'acc1', toAccountId: null, description: '' },
    status: 'otp_pending',
    mfaPath: true,
    daId: 'da-test-001',
    devices: [{ id: 'dev-1', type: 'EMAIL' }],
    createdAt: Date.now(),
    expiresAt: Date.now() + 600_000,
    otpAttempts: 0,
    otpExpiresAt: Date.now() + 300_000,
  };
  const session = { txConsentChallenges: { [challengeId]: { ...ch, ...overrides.challenge } } };
  return { user: { id: '5', role: 'customer' }, session };
}

describe('verifyMfa', () => {
  const CHALLENGE_ID = 'mfa-challenge-abc';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects if challenge has no mfaPath flag', async () => {
    const req = makeReqWithMfaChallenge(CHALLENGE_ID, { challenge: { mfaPath: false } });
    const result = await txConsent.verifyMfa(req, CHALLENGE_ID, { deviceId: 'dev-1', otp: '123456' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.json.error).toBe('not_mfa_path');
  });

  test('OTP path — calls submitOtp, promotes to confirmed', async () => {
    mfaService.submitOtp.mockResolvedValue({ status: 'COMPLETED' });
    const req = makeReqWithMfaChallenge(CHALLENGE_ID);
    const result = await txConsent.verifyMfa(req, CHALLENGE_ID, { deviceId: 'dev-1', otp: '654321' });
    expect(mfaService.submitOtp).toHaveBeenCalledWith('da-test-001', 'dev-1', '654321', undefined);
    expect(result.ok).toBe(true);
    expect(req.session.txConsentChallenges[CHALLENGE_ID].status).toBe('confirmed');
  });

  test('demo bypass OTP 123123 promotes to confirmed without calling submitOtp', async () => {
    const req = makeReqWithMfaChallenge(CHALLENGE_ID);
    const result = await txConsent.verifyMfa(req, CHALLENGE_ID, { deviceId: 'dev-1', otp: '123123' });
    expect(mfaService.submitOtp).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(req.session.txConsentChallenges[CHALLENGE_ID].status).toBe('confirmed');
  });

  test('FIDO2 path — calls submitFido2Assertion, promotes to confirmed', async () => {
    mfaService.submitFido2Assertion.mockResolvedValue({ status: 'COMPLETED' });
    const assertion = { id: 'cred-id', type: 'public-key' };
    const req = makeReqWithMfaChallenge(CHALLENGE_ID);
    const result = await txConsent.verifyMfa(req, CHALLENGE_ID, { deviceId: 'dev-1', fido2Assertion: assertion }, 'https://api.ping.demo:4000');
    expect(mfaService.submitFido2Assertion).toHaveBeenCalledWith('da-test-001', assertion, undefined, 'https://api.ping.demo:4000');
    expect(result.ok).toBe(true);
    expect(req.session.txConsentChallenges[CHALLENGE_ID].status).toBe('confirmed');
  });

  test('PingOne OTP failure returns 400 otp_incorrect', async () => {
    mfaService.submitOtp.mockRejectedValue(Object.assign(new Error('wrong'), { code: 'otp_incorrect' }));
    const req = makeReqWithMfaChallenge(CHALLENGE_ID);
    const result = await txConsent.verifyMfa(req, CHALLENGE_ID, { deviceId: 'dev-1', otp: '000000' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.json.error).toBe('otp_incorrect');
  });
});
