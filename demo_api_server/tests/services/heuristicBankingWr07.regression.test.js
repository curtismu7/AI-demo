'use strict';

/**
 * WR-07 — heuristicBankingWr07.regression.test.js
 *
 * (a) Non-Error throws from the inner /api/transactions call were swallowed
 *     by `catch (err) { ... err.message }` (undefined for a thrown string /
 *     object) and the function returned null — so processAgentMessage fell
 *     through to the LLM path which could RE-EXECUTE the write. Now non-Error
 *     throws for write actions (transfer/deposit/withdraw) propagate.
 * (b) The transfer `description` fallback interpolated raw, user-controlled
 *     account labels (accountType) — those flow to the audit log + Token
 *     Chain text. They are now sanitized.
 *
 * Test pattern (CLAUDE.md regression): configStore mocked with TEST_CONFIG;
 * data store, axios, appEventService, and agentBuilder mocked. agentBuilder
 * is mocked to FAIL loudly if the LLM path is ever reached — proving the
 * heuristic write error does not fall through.
 */

const TEST_CONFIG = { ff_heuristic_enabled: 'true' };

jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn((key) => TEST_CONFIG[key] ?? null),
}));

jest.mock('../../services/appEventService', () => ({ logEvent: jest.fn() }));

const mockAxios = jest.fn();
jest.mock('axios', () => (...args) => mockAxios(...args));

const mockGetAccounts = jest.fn();
jest.mock('../../data/store', () => ({
  getAccountsByUserId: (...a) => mockGetAccounts(...a),
}));

// If the heuristic write error is NOT propagated, processAgentMessage falls
// through to createBankingAgent — make that an explicit, loud failure.
jest.mock('../../services/agentBuilder', () => {
  const actual = jest.requireActual('../../services/agentBuilder');
  return {
    ...actual,
    createBankingAgent: jest.fn(async () => {
      throw new Error('LLM_FALLTHROUGH: heuristic write error must NOT reach the LLM path');
    }),
  };
});

const { processAgentMessage } = require('../../services/demoAgentLangGraphService');

describe('WR-07 — heuristic write error handling + description sanitization (regression)', () => {
  beforeEach(() => {
    mockAxios.mockReset();
    mockGetAccounts.mockReset();
    mockGetAccounts.mockResolvedValue([
      { id: 'acc-chk', accountType: 'checking', balance: 5000 },
      { id: 'acc-sav', accountType: 'savings', balance: 1000 },
    ]);
  });

  test('(a) a non-Error throw from the inner transactions call is surfaced (not "undefined") and not double-executed', async () => {
    // Inner _callTransactionsApi -> axios throws a non-Error (string). The
    // per-action catch must surface String(err), NOT `undefined`, and must
    // return a result (so the write is not retried under the LLM).
    mockAxios.mockImplementation(() => { throw 'string-failure-not-an-error'; });

    const result = await processAgentMessage({
      message: 'transfer $100 from checking to savings',
      userId: 'user-1',
      userToken: 'tok-1',
      sessionId: 'sess-1',
    });

    expect(result.success).toBe(false);
    expect(result.reply).toContain('string-failure-not-an-error');
    expect(result.reply).not.toContain('undefined');
    expect(result.error).not.toBe('LLM_FALLTHROUGH');
    // axios called exactly once: the write was NOT retried under the LLM.
    expect(mockAxios).toHaveBeenCalledTimes(1);
  });

  test('(a2) a non-Error throw OUTSIDE the inner try (data store) propagates for writes — no silent null → LLM double-execute', async () => {
    // getAccountsByUserId throws a non-Error BEFORE the inner try/catch.
    // Previously the outer catch logged `undefined` and returned null, so
    // processAgentMessage fell through to the LLM (re-execute hazard).
    mockGetAccounts.mockImplementation(() => { throw 'ds-non-error-failure'; });

    const result = await processAgentMessage({
      message: 'transfer $100 from checking to savings',
      userId: 'user-1',
      userToken: 'tok-1',
      sessionId: 'sess-1',
    });

    expect(result.success).toBe(false);
    // Propagated + converted by processAgentMessage's outer catch; detail
    // preserved, and crucially NOT the LLM fallthrough error.
    expect(result.error).toEqual(expect.stringContaining('ds-non-error-failure'));
    expect(result.error).not.toContain('LLM_FALLTHROUGH');
    // axios never reached; LLM (createBankingAgent) never reached.
    expect(mockAxios).not.toHaveBeenCalled();
  });

  test('(b) transfer description built from injection-ish account labels is sanitized', async () => {
    // Accounts matched by id (== params.fromId/toId from "checking"/"savings")
    // so the malicious accountType still flows into the description.
    mockGetAccounts.mockResolvedValue([
      { id: 'checking', accountType: '${process.env.SECRET}<b>', balance: 5000 },
      { id: 'savings', accountType: 'savings`rm -rf`', balance: 1000 },
    ]);
    mockAxios.mockResolvedValue({ status: 200, data: { ok: true } });

    await processAgentMessage({
      message: 'transfer $100 from checking to savings',
      userId: 'user-1',
      userToken: 'tok-1',
      sessionId: 'sess-1',
    });

    expect(mockAxios).toHaveBeenCalledTimes(1);
    const sentBody = mockAxios.mock.calls[0][0].data;
    expect(sentBody.type).toBe('transfer');
    // Injection chars stripped from the description.
    expect(sentBody.description).not.toMatch(/[`$<>{}\\]/);
    expect(sentBody.description).toContain('Transfer from');
    expect(sentBody.description).toContain('process.env.SECRETb'); // sanitized form
    expect(sentBody.description).toContain('savingsrm -rf'); // backticks stripped
  });

  test('(b control) a benign account label passes through unchanged in the description', async () => {
    mockAxios.mockResolvedValue({ status: 200, data: { ok: true } });

    await processAgentMessage({
      message: 'transfer $100 from checking to savings',
      userId: 'user-1',
      userToken: 'tok-1',
      sessionId: 'sess-1',
    });

    const sentBody = mockAxios.mock.calls[0][0].data;
    expect(sentBody.description).toBe('Transfer from checking to savings');
  });
});
