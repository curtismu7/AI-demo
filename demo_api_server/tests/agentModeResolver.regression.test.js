// banking_api_server/tests/agentModeResolver.regression.test.js
const { resolveAgentMode, AGENT_MODES, DEFAULT_MODE } = require('../services/agentModeResolver');

describe('resolveAgentMode', () => {
  test('mode 1 heuristics: no provider, heuristic routing on', () => {
    expect(resolveAgentMode('heuristics')).toEqual({
      mode: 'heuristics', provider: null, heuristicRouting: true, externalWiring: null,
    });
  });
  test('mode 2 helix-google: helix provider, routing off, hidden (external:true)', () => {
    // helix_google is marked external:true so it is filtered out of the compact
    // 2-option dropdown (coreOptions filter in AgentModeSelector). It still
    // resolves correctly when stored in configStore, and defaults to bff wiring.
    expect(resolveAgentMode('helix_google')).toEqual({
      mode: 'helix_google', provider: 'helix', heuristicRouting: false, externalWiring: 'bff',
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
  test('external wiring honored for external modes (helix_google is external)', () => {
    expect(resolveAgentMode('helix_google', 'platform').externalWiring).toBe('platform');
  });
  test('AGENT_MODES lists exactly the five', () => {
    expect(AGENT_MODES.map((m) => m.id)).toEqual([
      'heuristics', 'helix_google', 'heuristics_helix', 'chatgpt', 'claude',
    ]);
  });
  test('null/undefined/empty modeId falls back to default', () => {
    expect(resolveAgentMode(null).mode).toBe('heuristics_helix');
    expect(resolveAgentMode(undefined).mode).toBe('heuristics_helix');
    expect(resolveAgentMode('').mode).toBe('heuristics_helix');
  });
  test('externalWiring is case-sensitive — "PLATFORM" is treated as bff', () => {
    expect(resolveAgentMode('claude', 'PLATFORM').externalWiring).toBe('bff');
  });
  test('DEFAULT_MODE export is heuristics_helix', () => {
    expect(DEFAULT_MODE).toBe('heuristics_helix');
  });
});
