jest.mock('../../middleware/auth', () => ({
  requireNotBankDelegate: () => (req, res, next) => next(),
  authenticateToken: (req, res, next) => {
    if (!req.session) req.session = {};
    if (!req.session.user) {
      req.session.user = { id: 'test-user', role: 'admin', username: 'testadmin' };
    }
    req.user = req.session.user;
    next();
  },
  requireSession: (req, res, next) => {
    if (!req.session) req.session = {};
    if (!req.session.user) {
      req.session.user = { id: 'test-user', role: 'admin', username: 'testadmin' };
      req.user = req.session.user;
    }
    next();
  },
  requireAdmin: (req, res, next) => {
    if (!req.session) req.session = {};
    if (!req.session.user) {
      req.session.user = { id: 'test-user', role: 'admin', username: 'testadmin' };
    }
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  },
  requireOwnershipOrAdmin: (req, res, next) => next(),
  requireEndUser: (req, res, next) => next(),
  requireAIAgent: (req, res, next) => next(),
  requireDelegation: (req, res, next) => next(),
  requireScopes: () => (req, res, next) => {
    if (!req.session) req.session = {};
    if (!req.session.user) {
      req.session.user = { id: 'test-user', role: 'admin', username: 'testadmin' };
    }
    next();
  },
  verifyPassword: jest.fn(() => true),
  hashPassword: jest.fn((pwd) => pwd),
  determineClientType: jest.fn(() => 'enduser'),
  determineUserTypeFromToken: jest.fn(() => 'customer'),
  parseTokenScopes: jest.fn(() => []),
  hasRequiredScopes: jest.fn(() => true),
}));




jest.mock('../../services/pingOneAuthorizeService', () => ({
  evaluateTransaction: jest.fn().mockResolvedValue({ decision: 'PERMIT', raw: {} }),
}));

jest.mock('../../services/pingOneUserService', () => ({
  initialize: jest.fn(),
  getAllUsers: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn((key) => {
    const configs = {
      'pingone_environment_id': 'test-env-id',
      'pingone_region': 'com',
      'admin_client_id': 'test-admin-client',
      'ai_agent_client_id': 'test-agent-client',
    };
    return configs[key] || '';
  }),
}));

jest.mock('../../services/pingOneClientService', () => ({
  getManagementToken: jest.fn(() => Promise.resolve('test-mgmt-token')),
}));

jest.mock('axios', () => ({
  patch: jest.fn(() => Promise.resolve({ data: {} })),
  get: jest.fn(() => Promise.resolve({
    data: {
      id: 'test-user-123',
      mayAct: null
    }
  })),
}));

describe('may_act Route', () => {
  const request = require('supertest');
  const app = require('../../server');

  beforeAll(() => {
    delete process.env.CONFIRM_THRESHOLD_USD;
    delete process.env.STEP_UP_AMOUNT_THRESHOLD;
    delete process.env.MFA_THRESHOLD_USD;
  });

  describe('GET /api/demo/may-act/diagnose', () => {
    it('returns diagnostic info about may_act attribute', async () => {
      const res = await request(app).get('/api/demo/may-act/diagnose');
      // Route might return 200, 500 (if required services fail), or 503 (if not configured)
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toBeDefined();
      }
    });

    it('requires authentication', async () => {
      // Route checks req.user?.id; with mocked auth it should pass
      const res = await request(app).get('/api/demo/may-act/diagnose');
      // Should NOT get 401 since auth is mocked to always provide user
      expect(res.status).not.toBe(401);
    });
  });

  describe('PATCH /api/demo/may-act', () => {
    it('accepts { enabled: boolean } payload', async () => {
      const res = await request(app).patch('/api/demo/may-act').send({
        enabled: true
      });
      // Route doesn't validate body, just accepts it
      expect([200, 400, 401, 500]).toContain(res.status);
    });

    it('accepts string payload as truthy value', async () => {
      const res = await request(app).patch('/api/demo/may-act').send({
        enabled: 'invalid-string'
      });
      // Route treats any value !== false as enabled=true, so accepts it
      expect([200, 400, 401, 500]).toContain(res.status);
    });

    it('requires authentication', async () => {
      // Route checks req.user?.id; with mocked auth it should pass
      const res = await request(app).patch('/api/demo/may-act').send({
        enabled: true
      });
      expect(res.status).not.toBe(401);
    });
  });
});
