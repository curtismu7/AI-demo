/**
 * hitlRoute.regression.test.js
 * Regression tests for POST /api/transactions HTTP route HITL enforcement
 *
 * Tests the Phase 170 critical rule: transfers ALWAYS require consent regardless of amount.
 * Also covers: admin bypass, feature flag bypass, deposit threshold logic.
 *
 * Note: This tests the HTTP route layer, not just the transactionConsentChallenge service.
 */
'use strict';

const express = require('express');
const request = require('supertest');

// Test configuration - adjust these values as needed
const TEST_CONFIG = {
  HITL_ENABLED: 'true',
  CONSENT_THRESHOLD_USD: 500,
  MAX_TRANSACTION_AMOUNT: 1000000,
};

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const userHeader = req.headers['x-test-user'];
    if (userHeader) {
      try {
        req.user = JSON.parse(userHeader);
        req.session = req.session || {};
        req.session.user = req.user;
        return next();
      } catch {
        return res.status(401).json({ error: 'invalid_token' });
      }
    }
    res.status(401).json({ error: 'authentication_required' });
  },
  requireSession: (req, res, next) => next(),
  requireScopes: () => (req, res, next) => next(),
}));

jest.mock('../../middleware/hitlGatewayMiddleware', () => (req, res, next) => next());
jest.mock('../../middleware/demoMode', () => ({
  blockInDemoMode: () => (req, res, next) => next(),
}));
jest.mock('express-rate-limit', () => jest.fn(() => (req, res, next) => next()));

// Mock data store
jest.mock('../../data/store', () => ({
  getAccountById: jest.fn((id) => {
    const accounts = {
      'chk-user1': { id: 'chk-user1', userId: 'user-1', type: 'checking', balance: 500000 },
      'sav-user1': { id: 'sav-user1', userId: 'user-1', type: 'savings', balance: 100000 },
      'chk-admin': { id: 'chk-admin', userId: 'admin-1', type: 'checking', balance: 500000 },
    };
    return accounts[id] || null;
  }),
  getAccountsByUserId: jest.fn((userId) => {
    const accounts = {
      'user-1': [
        { id: 'chk-user1', userId: 'user-1', type: 'checking', balance: 500000 },
        { id: 'sav-user1', userId: 'user-1', type: 'savings', balance: 100000 },
      ],
      'admin-1': [
        { id: 'chk-admin', userId: 'admin-1', type: 'checking', balance: 500000 },
      ],
    };
    return accounts[userId] || [];
  }),
  getUserById: jest.fn(() => null),
  createTransaction: jest.fn((transaction) => ({ ...transaction, id: 'txn-123' })),
  getTransactionsByUserId: jest.fn(() => []),
}));

// Mock services used by transactions route
jest.mock('../../services/transactionConsentChallenge', () => ({
  HIGH_VALUE_CONSENT_USD: 500,
  verifyAndConsumeChallenge: jest.fn(() => ({ ok: true })),
}));

jest.mock('../../services/demoScenarioStore', () => ({
  load: jest.fn(() => Promise.resolve({ accountSnapshot: [], transactionSnapshot: [] })),
  save: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/appEventService', () => ({
  logEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/transactionAuthorizationService', () => ({
  isAuthorizedTransaction: jest.fn(() => true),
}));

jest.mock('../../config/runtimeSettings', () => ({
  isDemoMode: jest.fn(() => false),
  get: jest.fn((key) => {
    const defaults = {
      'stepUpEnabled': false,
      'stepUpAmountThreshold': 500,
      'stepUpAcrValue': 'urn:mace:incommon:iap:silver',
      'stepUpTransactionTypes': [],
      'stepUpWithdrawalsAlways': false,
      'stepUpMethod': 'ciba',
    };
    return defaults[key] || null;
  }),
}));

jest.mock('../../services/emailService', () => ({
  sendTransactionConfirmation: jest.fn(() => Promise.resolve()),
}));

// Mock configStore (critical for feature flags)
jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn((key) => {
    const defaults = {
      'ff_hitl_enabled': 'true',
      'confirm_threshold_usd': '500',
      'max_transaction_amount': '1000000',
    };
    return defaults[key] || null;
  }),
}));

// Import after mocks so it uses the mocked versions
const configStore = require('../../services/configStore');

/**
 * Build a test Express app with the transactions router mounted
 */
function buildApp() {
  const app = express();
  app.use(express.json());

  // Mount transactions router
  const txnRoutes = require('../../routes/transactions');
  app.use('/api/transactions', txnRoutes);

  return app;
}

// Helper function to set configStore defaults
function setupDefaultMocks() {
  configStore.getEffective.mockImplementation((key) => {
    const defaults = {
      'ff_hitl_enabled': TEST_CONFIG.HITL_ENABLED,
      'confirm_threshold_usd': String(TEST_CONFIG.CONSENT_THRESHOLD_USD),
      'max_transaction_amount': String(TEST_CONFIG.MAX_TRANSACTION_AMOUNT),
    };
    return defaults[key] || null;
  });
}

describe('POST /api/transactions — HITL Enforcement (Phase 170)', () => {
  afterEach(() => {
    // Just restore mocks without clearing, to preserve test overrides
    setupDefaultMocks();
  });

  describe('Transfer type — ALWAYS requires consent (regardless of amount)', () => {
    test('transfer $0.01 without consentChallengeId → 428 consent_challenge_required', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          username: 'customer',
          email: 'user@test.com',
          role: 'customer',
        }))
        .send({
          type: 'transfer',
          amount: 0.01,
          fromAccountId: 'chk-user1',
          toAccountId: 'sav-user1',
          description: 'Tiny transfer',
          // NO consentChallengeId
        });

      expect(res.status).toBe(428);
      expect(res.body.error).toBe('consent_challenge_required');
      expect(res.body.error_description).toContain('All transfers require explicit HITL approval');
    });

    test('transfer $1000 (above threshold) without consentChallengeId → 428', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'transfer',
          amount: 1000,
          fromAccountId: 'chk-user1',
          toAccountId: 'sav-user1',
        });

      expect(res.status).toBe(428);
      expect(res.body.error).toBe('consent_challenge_required');
    });

    test('transfer $100000 (way above threshold) without consent → 428', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'transfer',
          amount: 100000,
          fromAccountId: 'chk-user1',
          toAccountId: 'sav-user1',
        });

      expect(res.status).toBe(428);
    });
  });

  describe('Admin role → HITL bypassed', () => {
    test('admin transfer without consentChallengeId → allowed (no 428)', async () => {
      const app = buildApp();

      // Admin can transfer without consent challenge
      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'admin-1',
          username: 'admin',
          role: 'admin', // Key: admin role
        }))
        .send({
          type: 'transfer',
          amount: 50000,
          fromAccountId: 'chk-admin',
          toAccountId: 'chk-user1',
          // NO consentChallengeId
        });

      // Should NOT return 428 because admin role bypasses HITL
      expect(res.status).not.toBe(428);
      // May fail for other reasons (insufficient balance, etc.) but not HITL
      expect(res.body.error).not.toBe('consent_challenge_required');
    });
  });


  describe('Deposit type — uses amount threshold, NOT always required', () => {
    test('deposit $100 (at/below threshold $500) without consent → allowed', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'deposit',
          amount: 100,
          toAccountId: 'chk-user1',
          // NO consentChallengeId — should NOT require one for amount <= $500
        });

      // Should NOT return 428 (under threshold)
      expect(res.status).not.toBe(428);
      expect(res.body.error).not.toBe('consent_challenge_required');
    });

    test('deposit $600 (above $500 threshold) without consent → 428', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'deposit',
          amount: 600,
          toAccountId: 'chk-user1',
          // NO consentChallengeId — HITL required for amount > $500
        });

      expect(res.status).toBe(428);
      expect(res.body.error).toBe('consent_challenge_required');
    });

    test('deposit $500.00 exactly (at threshold boundary) → allowed', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'deposit',
          amount: 500.00,
          toAccountId: 'chk-user1',
        });

      // Exactly at threshold should NOT require consent (boundary: <= 500 allowed)
      expect(res.status).not.toBe(428);
    });

    test('deposit $500.01 (just above threshold) → 428', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'deposit',
          amount: 500.01,
          toAccountId: 'chk-user1',
        });

      expect(res.status).toBe(428);
      expect(res.body.error).toBe('consent_challenge_required');
    });
  });

  describe('Withdrawal type — uses amount threshold like deposit', () => {
    test('withdrawal $100 → allowed (under threshold)', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'withdrawal',
          amount: 100,
          fromAccountId: 'chk-user1',
        });

      expect(res.status).not.toBe(428);
    });

    test('withdrawal $750 → 428 (above threshold)', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'withdrawal',
          amount: 750,
          fromAccountId: 'chk-user1',
        });

      expect(res.status).toBe(428);
      expect(res.body.error).toBe('consent_challenge_required');
    });
  });

  describe('HITL combined conditions', () => {
    test('deposit, customer, HITL on, amount=$250 (under threshold) → allowed', async () => {
      const app = buildApp();

      const res = await request(app)
        .post('/api/transactions')
        .set('x-test-user', JSON.stringify({
          id: 'user-1',
          role: 'customer',
        }))
        .send({
          type: 'deposit',
          amount: 250,
          toAccountId: 'chk-user1',
        });

      expect(res.status).not.toBe(428);
    });
  });
});
