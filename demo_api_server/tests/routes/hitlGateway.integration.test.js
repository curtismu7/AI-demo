'use strict';

/**
 * Phase 2 — hitlGateway.integration.test.js
 *
 * Integration counterpart to hitlGateway.regression.test.js. Uses the REAL
 * configStore (reading whatever .env / runtime values exist on the host)
 * but still mocks the deep auth and data dependencies (session middleware,
 * agent service) so the test can run in CI without PingOne credentials.
 *
 * Per CLAUDE.md "Test patterns: Regression vs. Integration": the regression
 * test asserts logic in isolation against TEST_CONFIG; this integration
 * test confirms the route + middleware wire correctly through the live
 * configStore. Both must pass after CR-02 + CR-03 land.
 *
 * The integration coverage is intentionally smaller — just enough to prove
 * the in-memory consent store and crypto.randomUUID work against the real
 * configStore singleton. Behaviour-level coverage stays in the regression.
 */

const express = require('express');
const request = require('supertest');

jest.setTimeout(15000);

// configStore is NOT mocked — it reads real .env values.

jest.mock('../../middleware/agentSessionMiddleware', () => ({
  agentSessionMiddleware: (req, res, next) => {
    req.session = req.session || {
      id: 'integration-session-id',
      save: (cb) => cb && cb(),
    };
    req.agentContext = {
      userId: 'integration-user-1',
      accessToken: 'fake-bearer-token',
      tokenEvents: [],
    };
    next();
  },
}));

jest.mock('../../services/bankingAgentLangGraphService', () => ({
  processAgentMessage: jest.fn(() =>
    Promise.resolve({
      requiresConsent: true,
      action: 'create_transfer',
      amount: 5000,
      details: { fromAccountId: 'acct-1', toAccountId: 'acct-2' },
      message: 'High-value transfer requires approval',
      tokenEvents: [],
    }),
  ),
}));

jest.mock('../../services/appEventService', () => ({
  logEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/tokenChainService', () => ({
  trackTokenEvent: jest.fn(() => Promise.resolve()),
}));

function buildApp() {
  jest.resetModules();
  global.pendingConsents = {};

  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    req.session = {
      id: 'integ-' + Math.random().toString(36).slice(2, 10),
      save: (cb) => cb && cb(),
    };
    next();
  });

  const router = require('../../routes/bankingAgentRoutes');
  app.use('/api/banking-agent', router);
  return app;
}

describe('hitlGateway integration — real configStore, key alignment + secure consentId', () => {
  beforeEach(() => {
    global.pendingConsents = {};
    jest.clearAllMocks();
  });

  test('428 response carries a UUID consentId and indexes the store by that ID', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/banking-agent/message')
      .send({ message: 'transfer $5000' });

    expect(res.status).toBe(428);
    expect(res.body.consentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(global.pendingConsents[res.body.consentId]).toBeDefined();
  });

  test('approve then reject flow records both decisions under their own consentIds', async () => {
    const app = buildApp();

    const a = await request(app)
      .post('/api/banking-agent/message')
      .send({ message: 'transfer $5000' });
    const b = await request(app)
      .post('/api/banking-agent/message')
      .send({ message: 'transfer $6000' });

    await request(app)
      .post('/api/banking-agent/consent')
      .send({ consentId: a.body.consentId, approved: true });
    await request(app)
      .post('/api/banking-agent/consent')
      .send({ consentId: b.body.consentId, approved: false });

    expect(global.pendingConsents[a.body.consentId].decision).toBe('approve');
    expect(global.pendingConsents[b.body.consentId].decision).toBe('reject');
  });

  test('lookup with wrong key returns 500 / not-found — no phantom match', async () => {
    const app = buildApp();

    const init = await request(app)
      .post('/api/banking-agent/message')
      .send({ message: 'transfer $5000' });
    const realId = init.body.consentId;

    // Same session, but use a fabricated consentId — must NOT find the
    // real entry by walking the session id (which is what the old broken
    // keying would have effectively done).
    const wrong = await request(app)
      .post('/api/banking-agent/consent')
      .send({ consentId: 'wrong-id-' + realId.slice(0, 8), approved: true });

    expect(wrong.status).toBe(500);
    expect(wrong.body.error).toMatch(/not found/i);
    // And the real entry remains unmodified.
    expect(global.pendingConsents[realId].decision).toBeNull();
  });
});
