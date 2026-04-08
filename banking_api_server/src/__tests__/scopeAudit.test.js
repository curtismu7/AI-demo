/**
 * Tests for Scope Audit Service
 */

const axios = require('axios');
const { auditResourceScopes, SCOPE_REFERENCE_TABLE } = require('../../services/scopeAuditService');
const configStore = require('../../config/configStore');

jest.mock('axios');
jest.mock('../../config/configStore');

describe('Scope Audit Service', () => {
  const mockEnvId = '12345678-1234-1234-1234-123456789012';
  const mockToken = 'mock-bearer-token';

  beforeEach(() => {
    jest.clearAllMocks();
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'pingone_environment_id') return mockEnvId;
      if (key === 'pingone_region') return 'com';
      if (key === 'pingone_worker_client_id') return 'worker-client-id';
      if (key === 'pingone_worker_client_secret') return 'worker-secret';
      if (key === 'pingone_worker_oauth_endpoint') return 'https://auth.pingone.com';
      return null;
    });
  });

  describe('auditResourceScopes', () => {
    it('should audit scopes correctly for valid resources', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      // Mock getting scopes for each resource
      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          resourceName: 'Super Banking AI Agent',
          status: 'CORRECT',
          audienceUri: 'https://ai-agent.pingdemo.com'
        },
        {
          resourceId: 'res-2',
          resourceName: 'Super Banking Banking API',
          status: 'CORRECT',
          audienceUri: 'https://banking-api.pingdemo.com'
        }
      ];

      // Mock scope API responses
      axios.get
        .mockResolvedValueOnce({
          data: {
            _embedded: {
              scopes: [
                { name: 'banking:agent:invoke' }
              ]
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            _embedded: {
              scopes: [
                { name: 'banking:accounts:read' },
                { name: 'banking:transactions:read' },
                { name: 'banking:transactions:write' }
              ]
            }
          }
        });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      expect(result.scopeAudit).toHaveLength(2);
      expect(result.scopeAudit[0].status).toBe('CORRECT');
      expect(result.scopeAudit[0].resourceName).toBe('Super Banking AI Agent');
    });

    it('should detect MISMATCH when scopes differ', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          resourceName: 'Super Banking AI Agent',
          status: 'CORRECT',
          audienceUri: 'https://ai-agent.pingdemo.com'
        }
      ];

      // Mock scope with wrong scopes
      axios.get.mockResolvedValueOnce({
        data: {
          _embedded: {
            scopes: [
              { name: 'wrong:scope' }  // Not in expected
            ]
          }
        }
      });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      const mismatch = result.scopeAudit.find(r => r.resourceName === 'Super Banking AI Agent');
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
          resourceName: 'Super Banking AI Agent',
          status: 'CORRECT',
          audienceUri: 'https://ai-agent.pingdemo.com'
        },
        {
          resourceId: null,
          resourceName: 'Missing Resource',
          status: 'MISSING',
          audienceUri: null
        }
      ];

      axios.get.mockResolvedValueOnce({
        data: {
          _embedded: {
            scopes: [
              { name: 'banking:agent:invoke' }
            ]
          }
        }
      });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      // Should only audit the non-MISSING resource
      expect(result.scopeAudit).toHaveLength(1);
      expect(result.scopeAudit[0].resourceName).toBe('Super Banking AI Agent');
    });

    it('should handle empty scope lists', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          resourceName: 'Super Banking Agent Gateway',
          status: 'CORRECT',
          audienceUri: 'https://agent-gateway.pingdemo.com'
        }
      ];

      // Agent Gateway has no expected scopes
      axios.get.mockResolvedValueOnce({
        data: {
          _embedded: {
            scopes: []
          }
        }
      });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      expect(result.scopeAudit[0].status).toBe('CORRECT');
      expect(result.scopeAudit[0].currentScopes).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          resourceName: 'Super Banking AI Agent',
          status: 'CORRECT',
          audienceUri: 'https://ai-agent.pingdemo.com'
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
      const aiAgentScopes = SCOPE_REFERENCE_TABLE['Super Banking AI Agent'];
      expect(aiAgentScopes).toContain('banking:agent:invoke');
    });

    it('should have correct scopes for MCP Server', () => {
      const mcpScopes = SCOPE_REFERENCE_TABLE['Super Banking MCP Server'];
      expect(mcpScopes).toContain('banking:accounts:read');
      expect(mcpScopes).toContain('banking:transactions:read');
      expect(mcpScopes).toContain('banking:transactions:write');
    });

    it('should have correct scopes for Banking API', () => {
      const bankingApiScopes = SCOPE_REFERENCE_TABLE['Super Banking Banking API'];
      expect(bankingApiScopes).toContain('banking:accounts:read');
      expect(bankingApiScopes).toContain('banking:transactions:read');
      expect(bankingApiScopes).toContain('banking:transactions:write');
    });

    it('should have empty scopes for Agent Gateway', () => {
      const gatewayScopes = SCOPE_REFERENCE_TABLE['Super Banking Agent Gateway'];
      expect(gatewayScopes).toEqual([]);
    });

    it('should have correct scopes for PingOne API', () => {
      const p1Scopes = SCOPE_REFERENCE_TABLE['PingOne API'];
      expect(p1Scopes).toContain('p1:read:user');
      expect(p1Scopes).toContain('p1:update:user');
    });
  });
});
