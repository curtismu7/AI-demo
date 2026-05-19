// banking_api_server/tests/agentMode.heuristicGate.test.js
const { resolveAgentMode } = require('../services/agentModeResolver');
const parser = require('../services/nlIntentParser');

describe('agent mode → heuristic routing gate', () => {
  test('heuristics + heuristics_helix route via heuristic', () => {
    expect(resolveAgentMode('heuristics').heuristicRouting).toBe(true);
    expect(resolveAgentMode('heuristics_helix').heuristicRouting).toBe(true);
  });
  test('helix_google / chatgpt / claude do NOT route via heuristic', () => {
    ['helix_google', 'chatgpt', 'claude'].forEach((m) =>
      expect(resolveAgentMode(m).heuristicRouting).toBe(false));
  });
  test('Mode-1 no-match catalog message is the buildCatalogMessage output', () => {
    expect(typeof parser.buildCatalogMessage()).toBe('string');
    expect(parser.buildCatalogMessage()).toMatch(/can help/i);
  });
});
