// banking_api_server/tests/llmProviderResolver.regression.test.js
/**
 * Regression: one canonical provider resolver.
 * Rule (ARCHITECTURE-TRUTHS T-3): Heuristic runs upstream (not here).
 * When consulted: explicit choice honored; else Helix; Ollama ONLY if
 * explicitly selected AND configured, else fall back to Helix.
 */
const { resolveLlmProvider } = require('../services/llmProviderResolver');

describe('resolveLlmProvider', () => {
  let savedOllamaEnv;
  beforeEach(() => { savedOllamaEnv = process.env.OLLAMA_BASE_URL; delete process.env.OLLAMA_BASE_URL; });
  afterEach(() => { if (savedOllamaEnv === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = savedOllamaEnv; });

  test('defaults to helix when no provider set', () => {
    expect(resolveLlmProvider({})).toEqual({ provider: 'helix', model: undefined });
  });

  test('honors explicit helix', () => {
    expect(resolveLlmProvider({ provider: 'helix', model: 'gpt-4o-mini' }))
      .toEqual({ provider: 'helix', model: 'gpt-4o-mini' });
  });

  test('honors explicit ollama when configured (ollama_base_url present)', () => {
    expect(resolveLlmProvider({ provider: 'ollama', ollama_base_url: 'http://localhost:11434', model: 'llama3.2' }))
      .toEqual({ provider: 'ollama', model: 'llama3.2' });
  });

  test('falls back to helix when ollama selected but NOT configured', () => {
    expect(resolveLlmProvider({ provider: 'ollama' }))
      .toEqual({ provider: 'helix', model: undefined });
  });

  test('unknown provider falls back to helix', () => {
    expect(resolveLlmProvider({ provider: 'gpt5' }))
      .toEqual({ provider: 'helix', model: undefined });
  });

  test('honors explicit openai (pass-through; :3006 enforces creds)', () => {
    expect(resolveLlmProvider({ provider: 'openai', model: 'gpt-4o' }))
      .toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  test('honors explicit anthropic (pass-through; :3006 enforces creds)', () => {
    expect(resolveLlmProvider({ provider: 'anthropic', model: 'claude-sonnet-4-6' }))
      .toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
  });
});
