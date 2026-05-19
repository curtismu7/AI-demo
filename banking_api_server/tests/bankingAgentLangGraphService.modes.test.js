// banking_api_server/tests/bankingAgentLangGraphService.modes.test.js
//
// I-2: integration test exercising processAgentMessage's mode SEAMS directly
// (not just the resolver). Covers:
//   1. Platform branch (mode 4b/5b) + the I-1 regression guard — the RFC 8693
//      subject must be the session userToken, NOT req.body.subjectToken (the
//      token-custody-compliant route never sets the latter, so the pre-fix
//      code 401'd every platform request).
//   2. Mode-1 catalog terminal (heuristics-only, unrecognised query → catalog).
//   3. Back-compat (agent_mode unset → legacy heuristic/LLM path; platform and
//      Mode-1-terminal branches do NOT fire).
//
// Boundaries are mocked so the test is hermetic and fast — no network/IO on
// any of the three target branches.

// Mutable configStore so each case sets agent_mode / agent_external_wiring /
// ff_heuristic_enabled independently.
const _cfg = {};
jest.mock('../services/configStore', () => ({
  getEffective: jest.fn((key) => (key in _cfg ? _cfg[key] : null)),
}));

// Platform runtime — assert provider + that the loop ran.
jest.mock('../services/platformAgentRuntime', () => ({
  runPlatformLoop: jest.fn(async () => ({ ok: true, status: 200, data: 'PLATFORM_OK' })),
  buildPlatformRequest: jest.fn(),
}));

// RFC 8693 exchange — capture the subject argument.
jest.mock('../services/oauthService', () => ({
  performTokenExchange: jest.fn(async () => 'minted-gw-token'),
}));

// Heuristic parser: real buildCatalogMessage (pure, safe — needed for the
// Mode-1 assertion); parseHeuristic mocked to control routing per case.
jest.mock('../services/nlIntentParser', () => {
  const real = jest.requireActual('../services/nlIntentParser');
  return {
    ...real,
    parseHeuristic: jest.fn(() => ({ kind: 'none' })),
  };
});

// LLM reason loop — back-compat case falls through to here; keep it off the
// network and return a clean answer.
jest.mock('../services/agentReasoningClient', () => ({
  runReasonLoop: jest.fn(async () => ({ ok: true, answer: 'LLM_OK' })),
}));
jest.mock('../services/llmProviderResolver', () => ({
  resolveLlmProvider: jest.fn(() => ({ provider: 'ollama', model: 'test' })),
}));

// Silence the admin events feed (no IO assertions on it).
jest.mock('../services/appEventService', () => ({ logEvent: jest.fn() }));

const { performTokenExchange } = require('../services/oauthService');
const { runPlatformLoop } = require('../services/platformAgentRuntime');
const nlIntentParser = require('../services/nlIntentParser');
const { processAgentMessage } = require('../services/bankingAgentLangGraphService');

function resetCfg(next = {}) {
  for (const k of Object.keys(_cfg)) delete _cfg[k];
  Object.assign(_cfg, next);
}

beforeEach(() => {
  jest.clearAllMocks();
  nlIntentParser.parseHeuristic.mockReturnValue({ kind: 'none' });
  resetCfg();
});

describe('processAgentMessage — mode seams', () => {
  test('1. platform branch: RFC 8693 subject is the session userToken (I-1 regression guard)', async () => {
    resetCfg({
      agent_mode: 'chatgpt',
      agent_external_wiring: 'platform',
      pingone_resource_mcp_gateway_uri: 'https://gw.example',
    });

    const result = await processAgentMessage({
      message: 'hi',
      userId: 'u1',
      userToken: 'session-access-token',
      req: { body: {} }, // NO subjectToken — token-custody-compliant route
    });

    // I-1: subject MUST be the session token, never undefined / req.body.subjectToken.
    expect(performTokenExchange).toHaveBeenCalledTimes(1);
    const [subjectArg, audArg, scopeArg] = performTokenExchange.mock.calls[0];
    expect(subjectArg).toBe('session-access-token');
    expect(subjectArg).not.toBeUndefined();
    expect(audArg).toBe('https://gw.example');
    expect(scopeArg).toEqual(['mcp:invoke']);

    // Platform loop ran with provider 'openai' (chatgpt → openai).
    expect(runPlatformLoop).toHaveBeenCalledTimes(1);
    expect(runPlatformLoop.mock.calls[0][0]).toBe('openai');

    expect(result.degradedDelegation).toBe(true);
    expect(result.reply).toContain('PLATFORM_OK');
    expect(result.success).toBe(true);
  });

  test('2. Mode-1 catalog terminal: unrecognised query returns buildCatalogMessage, no LLM/platform', async () => {
    resetCfg({ agent_mode: 'heuristics' });
    nlIntentParser.parseHeuristic.mockReturnValue({ kind: 'none' });

    const result = await processAgentMessage({
      message: 'something the heuristic does not recognise',
      userId: 'u1',
      userToken: 'session-access-token',
      req: { body: {} },
    });

    expect(result.reply).toBe(nlIntentParser.buildCatalogMessage());
    expect(result.success).toBe(true);
    expect(runPlatformLoop).not.toHaveBeenCalled();
    expect(performTokenExchange).not.toHaveBeenCalled();
  });

  test('3. back-compat: agent_mode unset → platform & Mode-1-terminal branches do NOT fire', async () => {
    // agent_mode unset, ff_heuristic_enabled not 'false' (legacy default).
    resetCfg({});
    nlIntentParser.parseHeuristic.mockReturnValue({ kind: 'none' });

    const result = await processAgentMessage({
      message: 'hello',
      userId: 'u1',
      userToken: 'session-access-token',
      req: { body: {} },
    });

    // _agentMode is null → neither the platform short-circuit nor the
    // Mode-1 catalog terminal fired; legacy heuristic→LLM path was taken.
    expect(runPlatformLoop).not.toHaveBeenCalled();
    expect(performTokenExchange).not.toHaveBeenCalled();
    expect(result.reply).not.toBe(nlIntentParser.buildCatalogMessage());
    expect(result).toBeDefined();
  });
});
