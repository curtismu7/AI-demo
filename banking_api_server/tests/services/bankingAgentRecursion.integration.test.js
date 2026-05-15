'use strict';

/**
 * WR-03 — bankingAgentRecursion.integration.test.js
 *
 * Integration counterpart to bankingAgentRecursion.regression.test.js. Uses
 * the REAL configStore (reading whatever .env / runtime values exist on the
 * host) but still mocks the agent builder so the test can run in CI without
 * Ollama / PingOne. Forces the LLM path by passing a message the heuristic
 * parser will not match, rather than mocking ff_heuristic_enabled.
 *
 * Per CLAUDE.md "Test patterns: Regression vs. Integration": the regression
 * test asserts logic in isolation against TEST_CONFIG; this confirms the
 * recursion cap holds when wired through the live configStore singleton.
 */

const { GraphRecursionError } = require('@langchain/langgraph');

// configStore is NOT mocked — it reads real .env values.

jest.mock('../../services/appEventService', () => ({
  logEvent: jest.fn(),
}));

const mockInvoke = jest.fn();
jest.mock('../../services/agentBuilder', () => {
  const actual = jest.requireActual('../../services/agentBuilder');
  return {
    ...actual,
    createBankingAgent: jest.fn(async () => ({
      graph: { invoke: mockInvoke },
      initialState: { messages: [], tokenEvents: [] },
    })),
  };
});

const { MAX_TOOL_ITERATIONS } = require('../../services/agentBuilder');
const { processAgentMessage } = require('../../services/bankingAgentLangGraphService');

describe('WR-03 — LangGraph max-iterations termination (integration, real configStore)', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('runaway tool loop terminates with the limit response via live configStore', async () => {
    mockInvoke.mockImplementation(async (_state, opts) => {
      expect(opts.recursionLimit).toBe(MAX_TOOL_ITERATIONS);
      throw new GraphRecursionError(
        `Recursion limit of ${opts.recursionLimit} reached.`
      );
    });

    // A free-form question the heuristic parser will not classify as a
    // banking action — forces the LangGraph path without mocking the flag.
    const result = await processAgentMessage({
      message: 'please ponder the meaning of recursion indefinitely',
      userId: 'integration-user-1',
      userToken: 'integration-tok-1',
      sessionId: 'integration-sess-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('max_tool_iterations');
    expect(result.reply).toMatch(/maximum tool iteration limit/i);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
