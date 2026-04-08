/**
 * Tests for Resource Validation Service
 */

const axios = require('axios');
const { validateResources, RESOURCE_REFERENCE_TABLE } = require('../../services/resourceValidationService');
const configStore = require('../../config/configStore');

jest.mock('axios');
jest.mock('../../config/configStore');

describe('Resource Validation Service', () => {
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

  describe('validateResources', () => {
    it('should validate resources correctly', async () => {
      // Mock getting the management token
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      // Mock listing resources from PingOne
      const mockResources = [
        {
          id: 'res-1',
          name: 'Super Banking AI Agent',
          audience: 'https://ai-agent.pingdemo.com',
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        },
        {
          id: 'res-2',
          name: 'Super Banking MCP Server',
          audience: 'https://mcp-server.pingdemo.com',
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        },
        {
          id: 'res-3',
          name: 'Super Banking Banking API',
          audience: 'https://banking-api.pingdemo.com',
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        },
        {
          id: 'res-4',
          name: 'Super Banking Agent Gateway',
          audience: 'https://agent-gateway.pingdemo.com',
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        },
        {
          id: 'res-5',
          name: 'PingOne API',
          audience: 'https://api.pingone.com',
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        }
      ];

      axios.get.mockResolvedValueOnce({ data: { _embedded: { resources: mockResources } } });

      const result = await validateResources();

      expect(result.status).toBe('success');
      expect(result.resourceValidation).toHaveLength(5);
      expect(result.resourceValidation[0].status).toBe('CORRECT');
      expect(result.resourceValidation[0].resourceName).toBe('Super Banking AI Agent');
    });

    it('should detect MISSING resources', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      // Only return 3 resources instead of 5
      const mockResources = [
        {
          id: 'res-1',
          name: 'Super Banking AI Agent',
          audience: 'https://ai-agent.pingdemo.com',
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        },
        {
          id: 'res-2',
          name: 'Super Banking MCP Server',
          audience: 'https://mcp-server.pingdemo.com',
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        }
      ];

      axios.get.mockResolvedValueOnce({ data: { _embedded: { resources: mockResources } } });

      const result = await validateResources();

      expect(result.status).toBe('success');
      expect(result.resourceValidation).toHaveLength(5);
      
      const missingResources = result.resourceValidation.filter(r => r.status === 'MISSING');
      expect(missingResources.length).toBeGreaterThan(0);
      expect(missingResources[0].resourceName).toBe('Super Banking Banking API');
    });

    it('should detect CONFIG_ERROR when audience URI does not match', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      // Return resources with wrong audience
      const mockResources = [
        {
          id: 'res-1',
          name: 'Super Banking AI Agent',
          audience: 'https://wrong-audience.pingdemo.com',  // Wrong audience
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        }
      ];

      axios.get.mockResolvedValueOnce({ data: { _embedded: { resources: mockResources } } });

      const result = await validateResources();

      expect(result.status).toBe('success');
      const configErrors = result.resourceValidation.filter(r => r.status === 'CONFIG_ERROR');
      expect(configErrors.length).toBeGreaterThan(0);
    });

    it('should detect UNEXPECTED resources', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      const mockResources = [
        ...RESOURCE_REFERENCE_TABLE.map((ref, idx) => ({
          id: `res-${idx}`,
          name: ref.name,
          audience: ref.audience,
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        })),
        // Add an unexpected resource
        {
          id: 'res-extra',
          name: 'Unexpected Resource',
          audience: 'https://unexpected.com',
          authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
        }
      ];

      axios.get.mockResolvedValueOnce({ data: { _embedded: { resources: mockResources } } });

      const result = await validateResources();

      expect(result.status).toBe('success');
      const unexpected = result.resourceValidation.filter(r => r.status === 'UNEXPECTED');
      expect(unexpected.length).toBe(1);
      expect(unexpected[0].resourceName).toBe('Unexpected Resource');
    });

    it('should handle API errors gracefully', async () => {
      axios.post.mockResolvedValueOnce({
        data: { access_token: mockToken }
      });

      axios.get.mockRejectedValueOnce(new Error('PingOne API error'));

      const result = await validateResources();

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('should handle token fetch errors', async () => {
      axios.post.mockRejectedValueOnce(new Error('Failed to get token'));

      const result = await validateResources();

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });
  });

  describe('RESOURCE_REFERENCE_TABLE', () => {
    it('should have all 5 expected resources', () => {
      expect(RESOURCE_REFERENCE_TABLE).toHaveLength(5);
    });

    it('should have required fields for each resource', () => {
      RESOURCE_REFERENCE_TABLE.forEach((resource) => {
        expect(resource).toHaveProperty('name');
        expect(resource).toHaveProperty('audience');
        expect(resource).toHaveProperty('expectedScopes');
        expect(resource).toHaveProperty('authMethod');
      });
    });

    it('should have correct resource names', () => {
      const names = RESOURCE_REFERENCE_TABLE.map(r => r.name);
      expect(names).toContain('Super Banking AI Agent');
      expect(names).toContain('Super Banking MCP Server');
      expect(names).toContain('Super Banking Banking API');
      expect(names).toContain('Super Banking Agent Gateway');
      expect(names).toContain('PingOne API');
    });
  });
});
