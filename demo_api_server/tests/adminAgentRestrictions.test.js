'use strict';

jest.mock('../middleware/auth', () => ({
  requireAdmin: (req, res, next) => next(),
  authenticateToken: (req, res, next) => { req.user = { id: 'admin-1' }; next(); },
}));

jest.mock('../services/pingoneManagementService', () => ({
  managementService: {
    initialize: jest.fn(),
    makeRequest: jest.fn().mockResolvedValue({ data: { agentRestrictions: 'read' } }),
  },
}));

jest.mock('../middleware/agentRestrictionsCache', () => ({
  cache: { get: jest.fn(() => null), set: jest.fn(), invalidate: jest.fn() },
}));

const request = require('supertest');
const express = require('express');

let adminManagementRoutes;
let app;

beforeEach(() => {
  jest.clearAllMocks();
  // Re-require after resetModules so all module-level variables
  // bind to the current (fresh) mock instances.
  adminManagementRoutes = require('../routes/adminManagement');
  app = express();
  app.use(express.json());
  app.use('/api/admin/management', adminManagementRoutes);

  // Restore mock implementations
  require('../services/pingoneManagementService').managementService.makeRequest
    .mockResolvedValue({ data: { agentRestrictions: 'read' } });
  require('../middleware/agentRestrictionsCache').cache.invalidate.mockImplementation(() => {});
});

describe('PATCH /users/:userId/agent-restrictions', () => {
  test('returns 400 for invalid value', async () => {
    const res = await request(app)
      .patch('/api/admin/management/users/user-1/agent-restrictions')
      .send({ agentRestrictions: 'superadmin' });
    expect(res.status).toBe(400);
  });

  test('returns 200 and calls PingOne PATCH for valid value', async () => {
    const { managementService } = require('../services/pingoneManagementService');
    const res = await request(app)
      .patch('/api/admin/management/users/user-1/agent-restrictions')
      .send({ agentRestrictions: 'read' });
    expect(res.status).toBe(200);
    expect(managementService.makeRequest).toHaveBeenCalledWith(
      'PATCH', '/users/user-1', { agentRestrictions: 'read' }
    );
  });

  test('invalidates the attribute cache on success', async () => {
    const { cache } = require('../middleware/agentRestrictionsCache');
    await request(app)
      .patch('/api/admin/management/users/user-1/agent-restrictions')
      .send({ agentRestrictions: 'none' });
    expect(cache.invalidate).toHaveBeenCalledWith('user-1');
  });
});
