'use strict';

/**
 * WR-07 — heuristicBankingWr07.integration.test.js
 *
 * Integration counterpart to heuristicBankingWr07.regression.test.js. Uses
 * the REAL configStore singleton (real .env values) but still mocks the data
 * store, axios transport, and agentBuilder so the test runs in CI without
 * PingOne / a live API. Forces the heuristic transfer path with a plain
 * "transfer …" message rather than mocking the feature flag.
 *
 * Per CLAUDE.md "Test patterns: Regression vs. Integration": confirms the
 * WR-07(a) propagation + WR-07(b) sanitization hold when wired through the
 * live configStore.
 */

// configStore NOT mocked.

jest.mock('../../services/appEventService', () => ({ logEvent: jest.fn() }));

const mockAxios = jest.fn();
jest.mock('axios', () => (...args) => mockAxios(...args));

const mockGetAccounts = jest.fn();
jest.mock('../../data/store', () => ({
  getAccountsByUserId: (...a) => mockGetAccounts(...a),
}));

jest.mock('../../services/agentBuilder', () => {
  const actual = jest.requireActual('../../services/agentBuilder');
  return {
    ...actual,
    createBankingAgent: jest.fn(async () => {
      throw new Error('LLM_FALLTHROUGH: heuristic write error must NOT reach the LLM path');
    }),
  };
});

const { processAgentMessage } = require('../../services/bankingAgentLangGraphService');

describe('WR-07 — propagation + sanitization via real configStore (integration)', () => {
  beforeEach(() => {
    mockAxios.mockReset();
    mockGetAccounts.mockReset();
    mockGetAccounts.mockResolvedValue([
      { id: 'acc-chk', accountType: 'checking', balance: 5000 },
      { id: 'acc-sav', accountType: 'savings', balance: 1000 },
    ]);
  });

  test('non-Error throw outside the inner try (data store) propagates for writes — not retried under the LLM', async () => {
    mockGetAccounts.mockImplementation(() => { throw { mcpCode: -32000 }; }); // non-Error object, no .message

    const result = await processAgentMessage({
      message: 'transfer $50 from checking to savings',
      userId: 'integration-user-1',
      userToken: 'integration-tok-1',
      sessionId: 'integration-sess-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('LLM_FALLTHROUGH');
    expect(mockAxios).not.toHaveBeenCalled();
  });

  test('injection-ish account label is sanitized in the persisted description', async () => {
    mockGetAccounts.mockResolvedValue([
      { id: 'checking', accountType: 'chk<script>', balance: 5000 },
      { id: 'savings', accountType: 'savings', balance: 1000 },
    ]);
    mockAxios.mockResolvedValue({ status: 200, data: { ok: true } });

    await processAgentMessage({
      message: 'transfer $50 from checking to savings',
      userId: 'integration-user-1',
      userToken: 'integration-tok-1',
      sessionId: 'integration-sess-1',
    });

    const sentBody = mockAxios.mock.calls[0][0].data;
    expect(sentBody.description).not.toMatch(/[`$<>{}\\]/);
    expect(sentBody.description).toContain('Transfer from chkscript to savings');
  });
});
