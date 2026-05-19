// banking_api_server/tests/platformAgentRuntime.regression.test.js
jest.mock('axios');
const { buildPlatformRequest } = require('../services/platformAgentRuntime');

describe('buildPlatformRequest', () => {
  const gwUrl = 'https://gw.example/mcp';
  const tok = 'eyJtok';

  test('openai → Responses API shape with mcp tool + authorization', () => {
    const r = buildPlatformRequest('openai', { gatewayMcpUrl: gwUrl, gatewayToken: tok, userMessage: 'List accounts', model: 'gpt-4o' });
    expect(r.url).toMatch(/openai|responses/i);
    expect(r.body.tools[0]).toMatchObject({ type: 'mcp', server_url: gwUrl, authorization: tok });
    expect(r.body.input).toBe('List accounts');
  });

  test('anthropic → Messages API shape with mcp_servers + authorization_token', () => {
    const r = buildPlatformRequest('anthropic', { gatewayMcpUrl: gwUrl, gatewayToken: tok, userMessage: 'List accounts', model: 'claude-sonnet-4-6' });
    expect(r.body.mcp_servers[0]).toMatchObject({ type: 'url', url: gwUrl, authorization_token: tok });
    expect(r.body.messages[0]).toMatchObject({ role: 'user', content: 'List accounts' });
  });

  test('unknown provider throws (no silent default)', () => {
    expect(() => buildPlatformRequest('mistral', {})).toThrow(/unsupported platform provider/i);
  });

  test('unknown provider throws even when opts omitted (no destructure crash)', () => {
    expect(() => buildPlatformRequest('mistral')).toThrow(/unsupported platform provider/i);
  });
});
