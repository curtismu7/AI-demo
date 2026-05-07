/**
 * @file geminiNlIntent.heuristic.test.js
 * Unit tests for the ff_heuristic_enabled feature flag in parseNaturalLanguage.
 *
 * Commit 7b1c6cae: the LLM-only toggle patches ff_heuristic_enabled=false via the
 * agent UI. When false, parseHeuristic must not be called — all messages go directly
 * to the LLM path (Ollama/Helix). When true (default), heuristic runs first.
 *
 * Strategy: mock nlIntentParser, configStore, and the LLM path so we can assert
 * parseHeuristic call count without spawning real HTTP requests.
 */

'use strict';

jest.mock('../../services/nlIntentParser', () => ({
  parseHeuristic: jest.fn(),
  EDU: {},
}));

jest.mock('../../services/nlIntentSanitize', () => ({
  sanitizeNlResult: jest.fn((r) => r),
}));

jest.mock('../../services/helixLlmService', () => ({
  callHelixAgent: jest.fn().mockRejectedValue(new Error('helix not configured')),
}));

jest.mock('../../services/configStore', () => ({
  get: jest.fn(() => null),
  getEffective: jest.fn(() => null),
}));

// Prevent real HTTP to Ollama — axios is used by the Ollama path
jest.mock('axios', () => ({
  post: jest.fn().mockRejectedValue(new Error('ollama not running')),
}));

const { parseHeuristic } = require('../../services/nlIntentParser');
const configStore = require('../../services/configStore');
const { parseNaturalLanguage } = require('../../services/geminiNlIntent');

beforeEach(() => {
  jest.clearAllMocks();
  // Default: heuristic enabled (flag absent → treated as true)
  configStore.getEffective.mockReturnValue(null);
});

describe('parseNaturalLanguage — ff_heuristic_enabled flag', () => {
  it('calls parseHeuristic when ff_heuristic_enabled is absent (default on)', async () => {
    parseHeuristic.mockReturnValue({ kind: 'banking', banking: { action: 'accounts', params: {} } });
    configStore.getEffective.mockReturnValue(null); // absent → enabled

    const r = await parseNaturalLanguage('show my accounts', {}, 'auto', {});

    expect(parseHeuristic).toHaveBeenCalledTimes(1);
    expect(r.source).toBe('heuristic');
  });

  it('calls parseHeuristic when ff_heuristic_enabled=true', async () => {
    parseHeuristic.mockReturnValue({ kind: 'banking', banking: { action: 'accounts', params: {} } });
    configStore.getEffective.mockImplementation((key) =>
      key === 'ff_heuristic_enabled' ? 'true' : null,
    );

    const r = await parseNaturalLanguage('show my accounts', {}, 'auto', {});

    expect(parseHeuristic).toHaveBeenCalledTimes(1);
    expect(r.source).toBe('heuristic');
  });

  it('does NOT call parseHeuristic when ff_heuristic_enabled=false (LLM-only mode)', async () => {
    // parseHeuristic would normally match "show my accounts" — but flag bypasses it
    parseHeuristic.mockReturnValue({ kind: 'banking', banking: { action: 'accounts', params: {} } });
    configStore.getEffective.mockImplementation((key) =>
      key === 'ff_heuristic_enabled' ? 'false' : null,
    );

    await parseNaturalLanguage('show my accounts', {}, 'auto', {});

    expect(parseHeuristic).not.toHaveBeenCalled();
  });

  it('parseHeuristic not called even for a well-known phrase when flag is false', async () => {
    // "Transfer $100" is a phrase the heuristic recognises, but the flag must suppress it.
    parseHeuristic.mockReturnValue({ kind: 'banking', banking: { action: 'transfer', params: {} } });
    configStore.getEffective.mockImplementation((key) =>
      key === 'ff_heuristic_enabled' ? 'false' : null,
    );

    // Result may succeed or fail depending on LLM availability — we only care that
    // parseHeuristic was bypassed, not what the LLM ultimately returned.
    try { await parseNaturalLanguage('Transfer $100', {}, 'auto', {}); } catch (_) { /* LLM unavailable */ }

    expect(parseHeuristic).not.toHaveBeenCalled();
  });
});
