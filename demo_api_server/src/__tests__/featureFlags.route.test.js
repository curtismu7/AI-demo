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

jest.mock('express-session', () => {
  return () => (req, res, next) => {
    if (!req.session) {
      req.session = {
        user: { id: 'test-user', role: 'admin', username: 'testadmin' },
        oauthType: 'admin'
      };
    }
    next();
  };
});

jest.mock('../../services/pingOneAuthorizeService', () => ({
  evaluateTransaction: jest.fn().mockResolvedValue({ decision: 'PERMIT', raw: {} }),
}));

jest.mock('../../services/pingOneUserService', () => ({
  initialize: jest.fn(),
  getAllUsers: jest.fn(() => Promise.resolve([])),
}));

describe('Feature Flags Route', () => {
  const request = require('supertest');
  const app = require('../../server');

  describe('GET /api/admin/feature-flags', () => {
    it('returns all flags with current values', async () => {
      const res = await request(app).get('/api/admin/feature-flags');
      expect(res.status).toBe(200);
      expect(res.body.flags).toBeDefined();
      expect(Array.isArray(res.body.flags)).toBe(true);
      expect(res.body.flags.length).toBeGreaterThan(0);

      const flagIds = res.body.flags.map(f => f.id);
      expect(flagIds).toContain('ff_inject_may_act');
      expect(flagIds).toContain('ff_hitl_enabled');
      expect(flagIds).toContain('step_up_enabled');
    });

    it('returns flag metadata (id, label, value, category)', async () => {
      const res = await request(app).get('/api/admin/feature-flags');
      const flag = res.body.flags[0];
      expect(flag.id).toBeDefined();
      expect(typeof flag.value).toBe('boolean');
      expect(flag.category).toBeDefined();
    });
  });

  describe('PATCH /api/admin/feature-flags', () => {
    it('updates a single flag and persists', async () => {
      // Get current value
      const getRes = await request(app).get('/api/admin/feature-flags');
      const currentFlag = getRes.body.flags.find(f => f.id === 'ff_inject_may_act');
      const originalValue = currentFlag.value;

      // Toggle it
      const newValue = !originalValue;
      const patchRes = await request(app).patch('/api/admin/feature-flags').send({
        updates: { ff_inject_may_act: newValue }
      });
      expect(patchRes.status).toBe(200);

      // Verify returned value
      const updatedFlag = patchRes.body.flags.find(f => f.id === 'ff_inject_may_act');
      expect(updatedFlag.value).toBe(newValue);

      // Verify persistence via GET
      const verifyRes = await request(app).get('/api/admin/feature-flags');
      const persistedFlag = verifyRes.body.flags.find(f => f.id === 'ff_inject_may_act');
      expect(persistedFlag.value).toBe(newValue);

      // Restore original
      await request(app).patch('/api/admin/feature-flags').send({
        updates: { ff_inject_may_act: originalValue }
      });
    });

    it('updates multiple flags at once', async () => {
      const patchRes = await request(app).patch('/api/admin/feature-flags').send({
        updates: {
          ff_inject_may_act: true,
          ff_hitl_enabled: false,
          step_up_enabled: true
        }
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.flags.find(f => f.id === 'ff_inject_may_act').value).toBe(true);
      expect(patchRes.body.flags.find(f => f.id === 'ff_hitl_enabled').value).toBe(false);
      expect(patchRes.body.flags.find(f => f.id === 'step_up_enabled').value).toBe(true);
    });

    it('accepts and stores non-boolean flag values', async () => {
      const res = await request(app).patch('/api/admin/feature-flags').send({
        updates: { ff_inject_may_act: 'invalid-string' }
      });
      // Route normalizes booleans to strings but accepts other values as-is
      expect(res.status).toBe(200);
    });
  });
});
