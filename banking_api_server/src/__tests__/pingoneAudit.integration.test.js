/**
 * Integration test for PingOne Audit Endpoint
 */

const request = require('supertest');
const axios = require('axios');
const app = require('../../server');

jest.mock('axios');

describe('GET /api/pingone/audit', () => {
  const mockEnvId = '12345678-1234-1234-1234-123456789012';
  const mockToken = 'mock-bearer-token';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    const response = await request(app)
      .get('/api/pingone/audit')
      .expect(401);

    expect(response.body.error).toBe('unauthorized');
  });

  it('should validate resources and scopes for authenticated user', async () => {
    // Mock token fetch
    axios.post.mockResolvedValueOnce({
      data: { access_token: mockToken }
    });

    // Mock resource listing
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

    axios.get.mockResolvedValueOnce({
      data: { _embedded: { resources: mockResources } }
    });

    // Mock scope fetches for each resource (5 resources)
    const scopeResponses = [
      { data: { _embedded: { scopes: [{ name: 'banking:agent:invoke' }] } } },
      { data: { _embedded: { scopes: [
        { name: 'banking:accounts:read' },
        { name: 'banking:transactions:read' },
        { name: 'banking:transactions:write' }
      ] } } },
      { data: { _embedded: { scopes: [
        { name: 'banking:accounts:read' },
        { name: 'banking:transactions:read' },
        { name: 'banking:transactions:write' }
      ] } } },
      { data: { _embedded: { scopes: [] } } },
      { data: { _embedded: { scopes: [
        { name: 'p1:read:user' },
        { name: 'p1:update:user' }
      ] } } }
    ];

    scopeResponses.forEach(resp => {
      axios.get.mockResolvedValueOnce(resp);
    });

    // Create a mock session
    const response = await request(app)
      .get('/api/pingone/audit')
      .set('Cookie', 'connect.sid=mock-session-id')
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('auditedAt');
    expect(response.body).toHaveProperty('resourceValidation');
    expect(response.body).toHaveProperty('scopeAudit');
  });

  it('should return detailed resource validation results', async () => {
    axios.post.mockResolvedValueOnce({
      data: { access_token: mockToken }
    });

    const mockResources = [
      {
        id: 'res-1',
        name: 'Super Banking AI Agent',
        audience: 'https://ai-agent.pingdemo.com',
        authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
      }
    ];

    axios.get.mockResolvedValueOnce({
      data: { _embedded: { resources: mockResources } }
    });

    axios.get.mockResolvedValueOnce({
      data: { _embedded: { scopes: [{ name: 'banking:agent:invoke' }] } }
    });

    const response = await request(app)
      .get('/api/pingone/audit')
      .set('Cookie', 'connect.sid=mock-session-id')
      .expect(200);

    const resourceValidation = response.body.resourceValidation;
    expect(resourceValidation).toContainEqual(
      expect.objectContaining({
        resourceName: 'Super Banking AI Agent',
        audienceUri: 'https://ai-agent.pingdemo.com',
        status: 'CORRECT'
      })
    );
  });

  it('should include scope audit details', async () => {
    axios.post.mockResolvedValueOnce({
      data: { access_token: mockToken }
    });

    const mockResources = [
      {
        id: 'res-1',
        name: 'Super Banking AI Agent',
        audience: 'https://ai-agent.pingdemo.com',
        authenticationMethods: [{ type: 'CLIENT_CREDENTIALS' }]
      }
    ];

    axios.get.mockResolvedValueOnce({
      data: { _embedded: { resources: mockResources } }
    });

    axios.get.mockResolvedValueOnce({
      data: { _embedded: { scopes: [{ name: 'banking:agent:invoke' }] } }
    });

    const response = await request(app)
      .get('/api/pingone/audit')
      .set('Cookie', 'connect.sid=mock-session-id')
      .expect(200);

    const scopeAudit = response.body.scopeAudit;
    expect(scopeAudit).toHaveLength(1);
    expect(scopeAudit[0]).toHaveProperty('resourceName');
    expect(scopeAudit[0]).toHaveProperty('expectedScopes');
    expect(scopeAudit[0]).toHaveProperty('currentScopes');
    expect(scopeAudit[0]).toHaveProperty('status');
  });

  it('should return error response when resource validation fails', async () => {
    axios.post.mockResolvedValueOnce({
      data: { access_token: mockToken }
    });

    axios.get.mockRejectedValueOnce(new Error('PingOne API error'));

    const response = await request(app)
      .get('/api/pingone/audit')
      .set('Cookie', 'connect.sid=mock-session-id')
      .expect(500);

    expect(response.body).toHaveProperty('error');
  });

  it('should return error when authentication token cannot be obtained', async () => {
    axios.post.mockRejectedValueOnce(new Error('Failed to get management token'));

    const response = await request(app)
      .get('/api/pingone/audit')
      .set('Cookie', 'connect.sid=mock-session-id')
      .expect(500);

    expect(response.body).toHaveProperty('error');
  });

  it('should include auditedAt timestamp', async () => {
    axios.post.mockResolvedValueOnce({
      data: { access_token: mockToken }
    });

    axios.get.mockResolvedValueOnce({
      data: { _embedded: { resources: [] } }
    });

    const response = await request(app)
      .get('/api/pingone/audit')
      .set('Cookie', 'connect.sid=mock-session-id')
      .expect(200);

    expect(response.body).toHaveProperty('auditedAt');
    expect(new Date(response.body.auditedAt)).toBeInstanceOf(Date);
  });
});
