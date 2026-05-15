'use strict';

/**
 * WR-03 — bankingAgentRecursion.regression.test.js
 *
 * Mocked-dependency suite proving the LangGraph agent⇄tools loop terminates
 * at a hard cap instead of running unbounded. Before WR-03 there was no
 * recursion limit / step counter — an LLM that always emits tool_calls would
 * loop tools→agent→tools until the upstream HTTP timeout (~60s).
 *
 * Test pattern follows CLAUDE.md "Test patterns: Regression vs. Integration":
 *   - configStore is mocked with TEST_CONFIG constants
 *   - agentBuilder.createBankingAgent is mocked so we can inject a graph whose
 *     .invoke() simulates a runaway loop (an LLM that always returns a tool
 *     call) by throwing the real GraphRecursionError once recursionLimit is
 *     exceeded.
 *   - We assert processAgentMessage RESOLVES with a clean "maximum tool
 *     iteration limit" response (not a throw, not a hang).
 */

const { GraphRecursionError } = require('@langchain/langgraph');

const TEST_CONFIG = {
  ff_heuristic_enabled: 'false', // force the LLM/LangGraph path
};

jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn((key) => TEST_CONFIG[key] ?? null),
}));

jest.mock('../../services/appEventService', () => ({
  logEvent: jest.fn(),
}));

// Mock the agent builder: build a graph whose invoke() honours recursionLimit
// the same way LangGraph does — an "LLM" that always returns a tool call will
// blow past the limit and throw GraphRecursionError.
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

describe('WR-03 — LangGraph max-iterations termination (regression)', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('an LLM that always returns a tool call terminates at the cap', async () => {
    // Simulate LangGraph's own behaviour: a graph whose agent node keeps
    // emitting tool_calls exceeds recursionLimit and throws GraphRecursionError.
    mockInvoke.mockImplementation(async (_state, opts) => {
      expect(opts).toBeDefined();
      expect(opts.recursionLimit).toBe(MAX_TOOL_ITERATIONS);
      throw new GraphRecursionError(
        `Recursion limit of ${opts.recursionLimit} reached without hitting a stop condition.`
      );
    });

    const result = await processAgentMessage({
      message: 'do something that loops forever',
      userId: 'user-1',
      userToken: 'tok-1',
      sessionId: 'sess-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('max_tool_iterations');
    expect(result.reply).toMatch(/maximum tool iteration limit/i);
    expect(result.agentConfigured).toBe(true);
    expect(Array.isArray(result.tokenEvents)).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  test('non-recursion invoke errors still propagate (not swallowed as a cap hit)', async () => {
    mockInvoke.mockImplementation(async () => {
      throw new Error('some other LLM failure');
    });

    const result = await processAgentMessage({
      message: 'normal query',
      userId: 'user-1',
      userToken: 'tok-1',
      sessionId: 'sess-1',
    });

    // processAgentMessage converts generic errors to a graceful response,
    // but it must NOT be the max-iterations one.
    expect(result.error).not.toBe('max_tool_iterations');
    expect(result.reply).not.toMatch(/maximum tool iteration limit/i);
  });

  test('happy path (no tool loop) returns the agent reply unchanged', async () => {
    mockInvoke.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Here are your accounts.' }],
      tokenEvents: [],
    });

    const result = await processAgentMessage({
      message: 'show my accounts',
      userId: 'user-1',
      userToken: 'tok-1',
      sessionId: 'sess-1',
    });

    expect(result.success).toBe(true);
    expect(result.reply).toBe('Here are your accounts.');
    expect(result.error).toBeUndefined();
  });
});
