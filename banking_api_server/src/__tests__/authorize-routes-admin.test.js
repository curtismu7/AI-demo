/**
 * @file authorize-routes-admin.test.js
 * Admin-only Authorize helper routes (simulated recent + evaluation status).
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const h = req.headers['x-test-user'];
    if (!h) {
      return res.status(401).json({ error: 'authentication_required' });
    }
    try {
      req.user = JSON.parse(h);
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid_token' });
    }
  },
  requireScopes: () => (req, res, next) => next(),
}));

jest.mock('../../services/configStore');
jest.mock('../../services/pingOneAuthorizeService', () => ({
  isConfigured: jest.fn(() => false),
  isMcpDelegationDecisionReady: jest.fn(() => false),
}));

const configStore = require('../../services/configStore');
const pingOneAuthorizeService = require('../../services/pingOneAuthorizeService');
const { evaluateTransaction } = require('../../services/simulatedAuthorizeService');
const authorizeRouter = require('../../routes/authorize');

describe('authorize routes (admin)', () => {
  /** Builds a minimal Express app with the authorize router mounted. */
  function createApp() {
    const app = express();
    app.use('/api/authorize', authorizeRouter);
    return app;
  }

  it('GET simulated-recent-decisions returns 403 for non-admin', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/authorize/simulated-recent-decisions')
      .set('X-Test-User', JSON.stringify({ role: 'user', scopes: ['openid'], id: 'u1' }));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_only');
  });

  it('GET simulated-recent-decisions returns decisions for admin', async () => {
    await evaluateTransaction({ userId: 'route-test', amount: 7, type: 'transfer', acr: '' });
    const app = createApp();
    const res = await request(app)
      .get('/api/authorize/simulated-recent-decisions?limit=5')
      .set('X-Test-User', JSON.stringify({ role: 'admin', scopes: ['openid'] }));
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('simulated');
    expect(Array.isArray(res.body.decisions)).toBe(true);
    expect(res.body.decisions.some((d) => d.parameters?.UserId === 'route-test')).toBe(true);
  });

  it('GET evaluation-status returns summary for admin', async () => {
    configStore.get.mockImplementation((k) => {
      if (k === 'authorize_enabled') return 'true';
      if (k === 'ff_authorize_simulated') return 'true';
      return null;
    });
    pingOneAuthorizeService.isConfigured.mockReturnValue(false);

    const app = createApp();
    const res = await request(app)
      .get('/api/authorize/evaluation-status')
      .set('X-Test-User', JSON.stringify({ role: 'admin', scopes: ['openid'] }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      activeEngine: 'simulated',
      authorizeEnabledConfig: true,
      simulatedMode: true,
    });
  });

  it('GET evaluation-status returns 403 for non-admin', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/authorize/evaluation-status')
      .set('X-Test-User', JSON.stringify({ role: 'user', scopes: ['openid'] }));
    expect(res.status).toBe(403);
  });
});
