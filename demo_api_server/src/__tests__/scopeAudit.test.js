/**
 * Tests for Scope Audit Service
 */

const axios = require('axios');
const { auditResourceScopes, SCOPE_REFERENCE_TABLE } = require('../../services/scopeAuditService');
const configStore = require('../../services/configStore');

jest.mock('axios');
jest.mock('../../services/configStore');

describe('Scope Audit Service', () => {
  const mockEnvId = '12345678-1234-1234-1234-123456789012';
  const mockToken = 'mock-bearer-token';

  beforeEach(() => {
    jest.clearAllMocks();
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'pingone_environment_id') return mockEnvId;
      if (key === 'pingone_region') return 'com';
      if (key === 'pingone_client_id') return 'worker-client-id';
      if (key === 'pingone_client_secret') return 'worker-secret';
      return null;
    });
  });

  describe('auditResourceScopes', () => {
    it('should audit scopes correctly for valid resources', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      // Use names present in SCOPE_REFERENCE_TABLE (renamed from 'Super Banking *')
      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          name: 'Demo AI Agent',
          status: 'CORRECT',
          audience: 'https://ai-agent.pingdemo.com'
        },
        {
          resourceId: 'res-2',
          name: 'PingOne API',
          status: 'CORRECT',
          audience: 'https://api.pingone.com'
        }
      ];

      // Mock scope API responses matching SCOPE_REFERENCE_TABLE expectations
      axios.get
        .mockResolvedValueOnce({
          data: {
            scopes: [
              { name: 'agent:invoke' }
            ]
          }
        })
        .mockResolvedValueOnce({
          data: {
            scopes: [
              { name: 'p1:read:user' },
              { name: 'p1:update:user' }
            ]
          }
        });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      expect(result.scopeAudit).toHaveLength(2);
      expect(result.scopeAudit[0].status).toBe('CORRECT');
      expect(result.scopeAudit[0].name).toBe('Demo AI Agent');
    });

    it('should detect MISMATCH when scopes differ', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          name: 'Demo AI Agent',
          status: 'CORRECT',
          audience: 'https://ai-agent.pingdemo.com'
        }
      ];

      // Mock scope with wrong scopes (expected: ['agent:invoke'], got: ['wrong:scope'])
      axios.get.mockResolvedValueOnce({
        data: {
          scopes: [
            { name: 'wrong:scope' }  // Not in expected
          ]
        }
      });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      const mismatch = result.scopeAudit.find(r => r.name === 'Demo AI Agent');
      expect(mismatch.status).toBe('MISMATCH');
      expect(mismatch.mismatches).toBeDefined();
    });

    it('should skip MISSING resources', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          name: 'Demo AI Agent',
          status: 'CORRECT',
          audience: 'https://ai-agent.pingdemo.com'
        },
        {
          resourceId: null,
          name: 'Missing Resource',
          status: 'MISSING',
          audience: null
        }
      ];

      axios.get.mockResolvedValueOnce({
        data: {
          scopes: [
            { name: 'agent:invoke' }
          ]
        }
      });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      // Should only audit the non-MISSING resource
      expect(result.scopeAudit).toHaveLength(1);
      expect(result.scopeAudit[0].name).toBe('Demo AI Agent');
    });

    it('should handle empty scope lists (mismatch when expected scopes absent from API)', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      // Use 'Demo Agent Gateway' — the current name in SCOPE_REFERENCE_TABLE
      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          name: 'Demo Agent Gateway',
          status: 'CORRECT',
          audience: 'https://agent-gateway.pingdemo.com'
        }
      ];

      // API returns no scopes, but SCOPE_REFERENCE_TABLE expects agent:invoke → MISMATCH
      axios.get.mockResolvedValueOnce({
        data: { scopes: [] }
      });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      expect(result.scopeAudit[0].status).toBe('MISMATCH');
      expect(result.scopeAudit[0].currentScopes).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          name: 'Demo AI Agent',
          status: 'CORRECT',
          audience: 'https://ai-agent.pingdemo.com'
        }
      ];

      axios.get.mockRejectedValueOnce(new Error('PingOne API error'));

      const result = await auditResourceScopes(mockValidatedResources);

      // Should still return success, but individual resource might have error status
      expect(result.status).toBe('success');
    });

    it('should handle token fetch errors', async () => {
      axios.post.mockRejectedValueOnce(new Error('Failed to get token'));

      const mockValidatedResources = [];

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });
  });

  describe('SCOPE_REFERENCE_TABLE', () => {
    it('should have scope mappings for expected resources', () => {
      expect(SCOPE_REFERENCE_TABLE).toBeDefined();
      expect(Object.keys(SCOPE_REFERENCE_TABLE).length).toBeGreaterThan(0);
    });

    it('should have correct scopes for AI Agent', () => {
      // Production SCOPE_REFERENCE_TABLE uses 'Demo AI Agent' (renamed from 'Super Banking AI Agent')
      const aiAgentScopes = SCOPE_REFERENCE_TABLE['Demo AI Agent'];
      expect(aiAgentScopes).toContain('agent:invoke');
    });

    it('should have correct scopes for User App', () => {
      // Manifest-derived scope model: SCOPE_REFERENCE_TABLE is sourced from
      // scope-topology.json app grants (replaces stale 'Super Banking MCP Server').
      const userAppScopes = SCOPE_REFERENCE_TABLE['Super Banking User App'];
      expect(userAppScopes).toContain('read');
      expect(userAppScopes).toContain('write');
    });

    it('should have correct scopes for Admin App', () => {
      // Manifest-derived scope model: SCOPE_REFERENCE_TABLE is sourced from
      // scope-topology.json app grants (replaces stale 'Super Banking Banking API').
      const adminAppScopes = SCOPE_REFERENCE_TABLE['Super Banking Admin App'];
      expect(adminAppScopes).toContain('read');
      expect(adminAppScopes).toContain('write');
    });

    it('should have correct scopes for Agent Gateway', () => {
      // Production SCOPE_REFERENCE_TABLE uses 'Demo Agent Gateway' (renamed from 'Super Banking Agent Gateway')
      const gatewayScopes = SCOPE_REFERENCE_TABLE['Demo Agent Gateway'];
      expect(gatewayScopes).toContain('agent:invoke');
    });

    it('should have correct scopes for PingOne API', () => {
      const p1Scopes = SCOPE_REFERENCE_TABLE['PingOne API'];
      expect(p1Scopes).toContain('p1:read:user');
      expect(p1Scopes).toContain('p1:update:user');
    });
  });
});
