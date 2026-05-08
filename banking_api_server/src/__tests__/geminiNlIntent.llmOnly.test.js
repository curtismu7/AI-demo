'use strict';

/**
 * geminiNlIntent.llmOnly.test.js
 *
 * Tests for the LLM-only path added in the conversational-Helix update:
 *   1. When ff_heuristic_enabled=false, Helix JSON router kind:'none' falls
 *      through to answerWithHelix instead of short-circuiting.
 *   2. When ff_heuristic_enabled=false, Ollama is skipped entirely.
 *   3. answerWithHelix result is returned as source:'helix_fallback' with
 *      kind:'education' panel:'general-knowledge'.
 *   4. In normal (heuristic) mode, kind:'none' from Helix router still falls
 *      through to Ollama then answerWithHelix.
 */

jest.mock('../../services/nlIntentParser', () => ({
  parseHeuristic: jest.fn(),
  EDU: {},
}));

jest.mock('../../services/nlIntentSanitize', () => ({
  sanitizeNlResult: jest.fn((r) => ({ result: r, rejected: false, reason: '' })),
}));

jest.mock('../../services/configStore', () => ({
  get: jest.fn(() => null),
  getEffective: jest.fn(() => null),
}));

// callHelixAgent is used by both the JSON router path and answerWithHelix.
// We control its return value per test.
const { callHelixAgent } = jest.requireMock('../../services/helixLlmService');
jest.mock('../../services/helixLlmService', () => ({
  callHelixAgent: jest.fn(),
}));

// Block real Ollama HTTP
global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'));

const { parseHeuristic } = require('../../services/nlIntentParser');
const configStore = require('../../services/configStore');
const { parseNaturalLanguage } = require('../../services/geminiNlIntent');

// Helix needs at least base_url + api_key to be considered configured
const HELIX_CONFIG = {
  helix_base_url: 'https://helix.example.com',
  helix_api_key: 'test-key',
  helix_environment_id: 'env-1',
  helix_agent_id: 'agent-1',
  helix_prompt_field_id: 'field-1',
};

function setLlmOnlyMode() {
  configStore.getEffective.mockImplementation((key) =>
    key === 'ff_heuristic_enabled' ? 'false' : null,
  );
  configStore.get.mockImplementation((key) => HELIX_CONFIG[key] || null);
}

function setHeuristicMode() {
  configStore.getEffective.mockReturnValue(null); // absent → enabled
  configStore.get.mockImplementation((key) => HELIX_CONFIG[key] || null);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('geminiNlIntent — LLM-only mode (ff_heuristic_enabled=false)', () => {
  it('does not call parseHeuristic', async () => {
    setLlmOnlyMode();
    // Helix router returns kind:'none'; answerWithHelix also returns null
    callHelixAgent
      .mockResolvedValueOnce('{"kind":"none","message":"I don\'t know"}')
      .mockResolvedValueOnce(null);

    await parseNaturalLanguage('what is my biggest purchase', {}, 'auto', {});

    expect(parseHeuristic).not.toHaveBeenCalled();
  });

  it('skips Ollama — global.fetch is never called for Ollama endpoint', async () => {
    setLlmOnlyMode();
    callHelixAgent
      .mockResolvedValueOnce('{"kind":"none","message":"unknown"}')
      .mockResolvedValueOnce('Helix answer here');

    await parseNaturalLanguage('some open question', {}, 'auto', {});

    // fetch is mocked globally; if Ollama were called it would use fetch
    const ollamaCalls = global.fetch.mock.calls.filter(([url]) =>
      String(url).includes('11434'),
    );
    expect(ollamaCalls).toHaveLength(0);
  });

  it('falls through to answerWithHelix when JSON router returns kind:none', async () => {
    setLlmOnlyMode();
    callHelixAgent
      .mockResolvedValueOnce('{"kind":"none","message":"I cannot route this"}') // router
      .mockResolvedValueOnce('Here is my conversational answer'); // answerWithHelix

    const r = await parseNaturalLanguage('what is my biggest purchase', {}, 'auto', {});

    expect(r.source).toBe('helix_fallback');
    expect(r.result.kind).toBe('education');
    expect(r.result.education.panel).toBe('general-knowledge');
    expect(r.result.message).toBe('Here is my conversational answer');
  });

  it('falls through to answerWithHelix when JSON router parse fails', async () => {
    setLlmOnlyMode();
    callHelixAgent
      .mockResolvedValueOnce('not valid json') // router — parse fails
      .mockResolvedValueOnce('Fallback answer');

    const r = await parseNaturalLanguage('something unclear', {}, 'auto', {});

    expect(r.source).toBe('helix_fallback');
    expect(r.result.message).toBe('Fallback answer');
  });

  it('returns heuristic kind:none result when answerWithHelix also returns null', async () => {
    setLlmOnlyMode();
    callHelixAgent.mockResolvedValue(null); // both calls return null

    const r = await parseNaturalLanguage('something unclear', {}, 'auto', {});

    expect(r.source).toBe('heuristic');
    expect(r.result.kind).toBe('none');
  });

  it('routes a recognised banking phrase through Helix JSON router', async () => {
    setLlmOnlyMode();
    callHelixAgent.mockResolvedValueOnce(
      '{"kind":"banking","banking":{"action":"accounts","params":{}}}',
    );

    const r = await parseNaturalLanguage('show my accounts', {}, 'auto', {});

    expect(r.source).toBe('helix');
    expect(r.result.kind).toBe('banking');
    expect(r.result.banking.action).toBe('accounts');
    // answerWithHelix should NOT have been called (router matched)
    expect(callHelixAgent).toHaveBeenCalledTimes(1);
  });
});

describe('geminiNlIntent — heuristic mode kind:none fallthrough', () => {
  it('in normal mode, kind:none from helix router falls through to answerWithHelix after Ollama', async () => {
    setHeuristicMode();
    parseHeuristic.mockReturnValue({ kind: 'none', message: '' });

    // Helix router → kind:none; Ollama unavailable; answerWithHelix succeeds
    callHelixAgent
      .mockResolvedValueOnce('{"kind":"none","message":"unknown"}') // router
      .mockResolvedValueOnce('General knowledge answer'); // answerWithHelix fallback

    const r = await parseNaturalLanguage('random open question', {}, 'auto', {});

    expect(r.source).toBe('helix_fallback');
    expect(r.result.message).toBe('General knowledge answer');
  });

  it('in normal mode, heuristic match short-circuits before Helix', async () => {
    setHeuristicMode();
    parseHeuristic.mockReturnValue({
      kind: 'banking',
      banking: { action: 'transactions', params: {} },
    });

    const r = await parseNaturalLanguage('recent transactions', {}, 'auto', {});

    expect(r.source).toBe('heuristic');
    expect(r.result.banking.action).toBe('transactions');
    expect(callHelixAgent).not.toHaveBeenCalled();
  });
});
