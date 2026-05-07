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

      // Mock getting scopes for each resource
      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          name: 'Super Banking AI Agent',
          status: 'CORRECT',
          audience: 'https://ai-agent.pingdemo.com'
        },
        {
          resourceId: 'res-2',
          name: 'Super Banking Banking API',
          status: 'CORRECT',
          audience: 'https://banking-api.pingdemo.com'
        }
      ];

      // Mock scope API responses
      axios.get
        .mockResolvedValueOnce({
          data: {
            scopes: [
              { name: 'banking:agent:invoke' }
            ]
          }
        })
        .mockResolvedValueOnce({
          data: {
            scopes: [
              { name: 'banking:accounts:read' },
              { name: 'banking:transactions:read' },
              { name: 'banking:transactions:write' }
            ]
          }
        });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      expect(result.scopeAudit).toHaveLength(2);
      expect(result.scopeAudit[0].status).toBe('CORRECT');
      expect(result.scopeAudit[0].name).toBe('Super Banking AI Agent');
    });

    it('should detect MISMATCH when scopes differ', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          name: 'Super Banking AI Agent',
          status: 'CORRECT',
          audience: 'https://ai-agent.pingdemo.com'
        }
      ];

      // Mock scope with wrong scopes
      axios.get.mockResolvedValueOnce({
        data: {
          scopes: [
            { name: 'wrong:scope' }  // Not in expected
          ]
        }
      });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      const mismatch = result.scopeAudit.find(r => r.name === 'Super Banking AI Agent');
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
          name: 'Super Banking AI Agent',
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
            { name: 'banking:agent:invoke' }
          ]
        }
      });

      const result = await auditResourceScopes(mockValidatedResources);

      expect(result.status).toBe('success');
      // Should only audit the non-MISSING resource
      expect(result.scopeAudit).toHaveLength(1);
      expect(result.scopeAudit[0].name).toBe('Super Banking AI Agent');
    });

    it('should handle empty scope lists (mismatch when expected scopes absent from API)', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockValidatedResources = [
        {
          resourceId: 'res-1',
          name: 'Super Banking Agent Gateway',
          status: 'CORRECT',
          audience: 'https://agent-gateway.pingdemo.com'
        }
      ];

      // API returns no scopes, but SCOPE_REFERENCE_TABLE expects banking:agent:invoke → MISMATCH
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
          name: 'Super Banking AI Agent',
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
      const aiAgentScopes = SCOPE_REFERENCE_TABLE['Super Banking AI Agent'];
      expect(aiAgentScopes).toContain('banking:agent:invoke');
    });

    it('should have correct scopes for MCP Server', () => {
      // Consolidated scope model: fine-grained scopes replaced by banking:read/write
      const mcpScopes = SCOPE_REFERENCE_TABLE['Super Banking MCP Server'];
      expect(mcpScopes).toContain('banking:read');
      expect(mcpScopes).toContain('banking:write');
    });

    it('should have correct scopes for Banking API', () => {
      // Consolidated scope model: fine-grained scopes replaced by banking:read/write
      const bankingApiScopes = SCOPE_REFERENCE_TABLE['Super Banking Banking API'];
      expect(bankingApiScopes).toContain('banking:read');
      expect(bankingApiScopes).toContain('banking:write');
    });

    it('should have correct scopes for Agent Gateway', () => {
      const gatewayScopes = SCOPE_REFERENCE_TABLE['Super Banking Agent Gateway'];
      expect(gatewayScopes).toContain('banking:agent:invoke');
    });

    it('should have correct scopes for PingOne API', () => {
      const p1Scopes = SCOPE_REFERENCE_TABLE['PingOne API'];
      expect(p1Scopes).toContain('p1:read:user');
      expect(p1Scopes).toContain('p1:update:user');
    });
  });
});
