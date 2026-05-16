'use strict';

/**
 * WR-03 — bankingAgentRecursion.integration.test.js
 *
 * Integration counterpart to bankingAgentRecursion.regression.test.js. Uses
 * the REAL configStore (reading whatever .env / runtime values exist on the
 * host) but still mocks the reason-loop client so the test can run in CI
 * without :3006 / Ollama / PingOne. Forces the LLM path by passing a message
 * the heuristic parser will not match, rather than mocking ff_heuristic_enabled.
 *
 * Phase 2 (agent consolidation): the bound is enforced BFF-side in
 * agentReasoningClient.runReasonLoop's for(i < maxIterations) cap (still
 * MAX_TOOL_ITERATIONS). This confirms the recursion cap holds when wired
 * through the live configStore singleton.
 *
 * Per CLAUDE.md "Test patterns: Regression vs. Integration": the regression
 * test asserts logic in isolation against TEST_CONFIG; this confirms the
 * cap holds when wired through the live configStore singleton.
 */

// configStore is NOT mocked — it reads real .env values.

jest.mock('../../services/appEventService', () => ({
  logEvent: jest.fn(),
}));

const mockRunReasonLoop = jest.fn();
jest.mock('../../services/agentReasoningClient', () => ({
  runReasonLoop: (...args) => mockRunReasonLoop(...args),
}));

const { MAX_TOOL_ITERATIONS } = require('../../services/agentBuilder');
const { processAgentMessage } = require('../../services/bankingAgentLangGraphService');

describe('WR-03 — agent max-iterations termination (integration, real configStore)', () => {
  beforeEach(() => {
    mockRunReasonLoop.mockReset();
  });

  test('runaway tool loop terminates with the limit response via live configStore', async () => {
    mockRunReasonLoop.mockImplementation(async (p) => {
      expect(p.maxIterations).toBe(MAX_TOOL_ITERATIONS);
      return { ok: false, reason: 'max_iterations' };
    });

    // A free-form question the heuristic parser will not classify as a
    // banking action — forces the LLM/reasoning path without mocking the flag.
    const result = await processAgentMessage({
      message: 'please ponder the meaning of recursion indefinitely',
      userId: 'integration-user-1',
      userToken: 'integration-tok-1',
      sessionId: 'integration-sess-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('max_tool_iterations');
    expect(result.reply).toMatch(/maximum tool iteration limit/i);
    expect(mockRunReasonLoop).toHaveBeenCalledTimes(1);
  });
});
