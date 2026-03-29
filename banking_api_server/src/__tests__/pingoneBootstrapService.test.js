// banking_api_server/src/__tests__/pingoneBootstrapService.test.js
'use strict';

jest.mock('../../services/pingOneClientService', () => ({
  listApplications: jest.fn(),
}));

const pingOneClientService = require('../../services/pingOneClientService');
const {
  planStepsFromManifest,
  probeManagementApiAccess,
} = require('../../services/pingoneBootstrapService');

describe('pingoneBootstrapService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('planStepsFromManifest', () => {
    it('returns steps for a minimal manifest', () => {
      const steps = planStepsFromManifest({
        version: 1,
        publicUrlTemplate: 'https://example.com',
        applications: { admin_oidc: { name: 'Admin', type: 'WEB_APP' } },
        demoUsers: [{ username: 'u1' }],
      });
      expect(steps.length).toBeGreaterThan(3);
      expect(steps.some((s) => /Manifest version 1/.test(s))).toBe(true);
      expect(steps.some((s) => /Admin/.test(s))).toBe(true);
      expect(steps.some((s) => /u1/.test(s))).toBe(true);
    });

    it('handles invalid manifest', () => {
      expect(planStepsFromManifest(null)[0]).toMatch(/Invalid manifest/);
    });
  });

  describe('probeManagementApiAccess', () => {
    it('returns ok when listApplications succeeds', async () => {
      pingOneClientService.listApplications.mockResolvedValue([{ id: '1', name: 'A', type: 'WEB_APP' }]);
      const r = await probeManagementApiAccess();
      expect(r.ok).toBe(true);
      expect(r.applicationCount).toBe(1);
    });

    it('returns ok false when listApplications throws', async () => {
      pingOneClientService.listApplications.mockRejectedValue(new Error('no creds'));
      const r = await probeManagementApiAccess();
      expect(r.ok).toBe(false);
      expect(r.error).toBe('no creds');
      expect(r.hint).toBeDefined();
    });
  });
});
