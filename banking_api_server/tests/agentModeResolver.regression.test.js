// banking_api_server/tests/agentModeResolver.regression.test.js
const { resolveAgentMode, AGENT_MODES } = require('../services/agentModeResolver');

describe('resolveAgentMode', () => {
  test('mode 1 heuristics: no provider, heuristic routing on', () => {
    expect(resolveAgentMode('heuristics')).toEqual({
      mode: 'heuristics', provider: null, heuristicRouting: true, externalWiring: null,
    });
  });
  test('mode 2 helix-google: helix provider, routing off', () => {
    expect(resolveAgentMode('helix_google')).toEqual({
      mode: 'helix_google', provider: 'helix', heuristicRouting: false, externalWiring: null,
    });
  });
  test('mode 3 heuristics+helix: helix, routing on', () => {
    expect(resolveAgentMode('heuristics_helix')).toEqual({
      mode: 'heuristics_helix', provider: 'helix', heuristicRouting: true, externalWiring: null,
    });
  });
  test('mode 4 chatgpt defaults to bff wiring', () => {
    expect(resolveAgentMode('chatgpt')).toEqual({
      mode: 'chatgpt', provider: 'openai', heuristicRouting: false, externalWiring: 'bff',
    });
  });
  test('mode 5 claude platform wiring honored', () => {
    expect(resolveAgentMode('claude', 'platform')).toEqual({
      mode: 'claude', provider: 'anthropic', heuristicRouting: false, externalWiring: 'platform',
    });
  });
  test('unknown mode falls back to heuristics_helix (current default)', () => {
    expect(resolveAgentMode('bogus')).toEqual({
      mode: 'heuristics_helix', provider: 'helix', heuristicRouting: true, externalWiring: null,
    });
  });
  test('external wiring ignored for non-external modes', () => {
    expect(resolveAgentMode('helix_google', 'platform').externalWiring).toBeNull();
  });
  test('AGENT_MODES lists exactly the five', () => {
    expect(AGENT_MODES.map((m) => m.id)).toEqual([
      'heuristics', 'helix_google', 'heuristics_helix', 'chatgpt', 'claude',
    ]);
  });
});
