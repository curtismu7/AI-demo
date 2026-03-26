/**
 * @file transaction-consent-challenge.test.js
 * Session-bound HITL consent challenges for amounts > $500.
 */
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const userHeader = req.headers['x-test-user'];
    if (!userHeader) {
      return res.status(401).json({ error: 'authentication_required' });
    }
    try {
      req.user = JSON.parse(userHeader);
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid_token' });
    }
  },
  requireScopes: () => (req, res, next) => next(),
  requireAdmin: (req, res, next) => next(),
  hasRequiredScopes: () => true,
  parseTokenScopes: () => [],
  requireAIAgent: (_req, _res, next) => next(),
  requireOwnershipOrAdmin: (_req, _res, next) => next(),
  hashPassword: (p) => p,
}));

jest.mock('../../data/store', () => ({
  getUserById: jest.fn((id) =>
    id === 'test-user-id'
      ? { id: 'test-user-id', firstName: 'Test', lastName: 'User', email: 'test@bank.com' }
      : null,
  ),
  getAccountById: jest.fn((id) =>
    id === 'test-account-id'
      ? {
          id: 'test-account-id',
          userId: 'test-user-id',
          accountType: 'Checking',
          accountNumber: '****1234',
          balance: 10000,
        }
      : null,
  ),
  createTransaction: jest.fn((data) => ({
    ...data,
    id: 'tx-' + Date.now(),
    createdAt: new Date().toISOString(),
    status: 'completed',
  })),
  updateAccountBalance: jest.fn(),
  getTransactionsByUserId: jest.fn(() => []),
  getAllTransactions: jest.fn(() => []),
  getTransactionById: jest.fn(() => null),
}));

jest.mock('../../services/pingOneAuthorizeService', () => ({
  evaluateTransaction: jest.fn().mockResolvedValue({ decision: 'PERMIT', raw: {} }),
}));

const app = require('../../server');
const runtimeSettings = require('../../config/runtimeSettings');

const customerUser = () =>
  JSON.stringify({
    id: 'test-user-id',
    username: 'customer',
    email: 'customer@bank.com',
    role: 'user',
    scopes: ['banking:transactions:write', 'banking:accounts:read'],
    acr: 'Multi_factor',
  });

beforeAll(() => {
  runtimeSettings.update({ stepUpEnabled: false, authorizeEnabled: false });
});

afterAll(() => {
  runtimeSettings.update({ stepUpEnabled: true, authorizeEnabled: false });
});

describe('Transaction consent challenge', () => {
  it('rejects POST /transactions over $500 without consentChallengeId', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('x-test-user', customerUser())
      .send({
        fromAccountId: 'test-account-id',
        amount: 600,
        type: 'withdrawal',
        description: 'x',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('consent_challenge_required');
  });

  it('full flow: challenge → confirm → transaction with consentChallengeId returns 201', async () => {
    const agent = request.agent(app);
    const body = {
      fromAccountId: 'test-account-id',
      amount: 600,
      type: 'withdrawal',
      description: 'consent flow test',
    };
    const cr = await agent.post('/api/transactions/consent-challenge').set('x-test-user', customerUser()).send(body);
    expect(cr.status).toBe(201);
    const { challengeId } = cr.body;
    const cf = await agent
      .post(`/api/transactions/consent-challenge/${challengeId}/confirm`)
      .set('x-test-user', customerUser());
    expect(cf.status).toBe(200);
    const tx = await agent
      .post('/api/transactions')
      .set('x-test-user', customerUser())
      .send({ ...body, consentChallengeId: challengeId });
    expect(tx.status).toBe(201);
  });

  it('rejects second POST with same consentChallengeId (one-time consume)', async () => {
    const agent = request.agent(app);
    const body = {
      fromAccountId: 'test-account-id',
      amount: 620,
      type: 'withdrawal',
      description: 'one-time',
    };
    const cr = await agent.post('/api/transactions/consent-challenge').set('x-test-user', customerUser()).send(body);
    const { challengeId } = cr.body;
    await agent.post(`/api/transactions/consent-challenge/${challengeId}/confirm`).set('x-test-user', customerUser());
    const first = await agent
      .post('/api/transactions')
      .set('x-test-user', customerUser())
      .send({ ...body, consentChallengeId: challengeId });
    expect(first.status).toBe(201);
    const second = await agent
      .post('/api/transactions')
      .set('x-test-user', customerUser())
      .send({ ...body, consentChallengeId: challengeId });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('consent_challenge_invalid');
  });
});
