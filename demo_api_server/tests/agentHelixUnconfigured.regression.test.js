// banking_api_server/tests/agentHelixUnconfigured.regression.test.js
//
// Regression guard: when Helix is the resolved LLM provider but no API key is
// configured, processAgentMessage MUST return the heuristic catalog message
// (success:true) rather than attempting a doomed Helix call that produces
// reasoning_unavailable / "Advanced reasoning is temporarily unavailable."
//
// Root-cause: the "agent does nothing" bug where fresh sessions with no Helix
// creds silently failed. The fix: detect unconfigured Helix before the reason
// loop and short-circuit to the catalog message (same floor as Mode-1).

jest.mock('axios');
const axios = require('axios');

jest.mock('../services/configStore', () => ({
  getEffective: jest.fn((key) => {
    // Simulate a fresh install: agent_mode unset, helix_api_key absent.
    const defaults = {
      agent_mode: '',
      helix_api_key: '',
      helix_base_url: 'https://openam-helix.forgeblocks.com',
      helix_agent_id: 'LLM2',
      ff_heuristic_enabled: 'true',
    };
    return defaults[key] !== undefined ? defaults[key] : null;
  }),
}));

// Silence appEventService in tests
jest.mock('../services/appEventService', () => ({
  logEvent: jest.fn(),
}));

// data/store needed by executors inside processAgentMessage
jest.mock('../data/store', () => ({
  getUser: jest.fn(() => ({ id: 'u1', name: 'Test User', accounts: [] })),
  getAccounts: jest.fn(() => []),
  getTransactions: jest.fn(() => []),
}));

jest.mock('../middleware/delegationAuditLogger', () => ({
  logDelegationEvent: jest.fn(),
}));

// agentBuilder: return an empty tool list (no tools means executeBffTool can't
// match any tool name, so heuristic read actions gracefully error — but these
// tests send non-banking messages that skip the heuristic entirely).
jest.mock('../services/agentBuilder', () => ({
  getBankingToolDefinitions: jest.fn(() => []),
  buildToolSchemasForAgent: jest.fn(() => []),
  MAX_TOOL_ITERATIONS: 5,
}));

// executeBffTool needs token resolution — stub so it never touches the network.
jest.mock('../services/agentMcpTokenService', () => ({
  resolveMcpAccessTokenWithEvents: jest.fn().mockResolvedValue({ token: 'mock-tok', tokenEvents: [] }),
}));

const { processAgentMessage } = require('../services/demoAgentLangGraphService');
const { buildCatalogMessage } = require('../services/nlIntentParser');

describe('processAgentMessage — Helix unconfigured fallback', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns catalog message (success:true) when Helix API key is absent — :3006 never called', async () => {
    const result = await processAgentMessage({
      message: 'What can you do?',
      userId: 'u1',
      userToken: 'tok',
      sessionId: 'sess1',
      tokenEvents: [],
      langchainConfig: {}, // fresh session — no provider, no helix creds
      req: null,
    });

    expect(result.success).toBe(true);
    expect(result.reply).toBe(buildCatalogMessage());
    // :3006 must NOT have been called — no doomed Helix attempt
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('returns catalog message when langchainConfig.helix_api_key is empty string', async () => {
    // Use a non-banking message so the heuristic returns kind:'none' and
    // the message falls through to the Helix provider check.
    const result = await processAgentMessage({
      message: 'explain token exchange to me',
      userId: 'u1',
      userToken: 'tok',
      sessionId: 'sess2',
      tokenEvents: [],
      langchainConfig: { provider: 'helix', helix_api_key: '' },
      req: null,
    });

    expect(result.success).toBe(true);
    expect(result.reply).toBe(buildCatalogMessage());
    expect(axios.post).not.toHaveBeenCalled();
  });
});
