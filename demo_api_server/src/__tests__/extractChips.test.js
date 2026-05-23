// banking_api_server/scripts/__tests__/extractChips.test.js
'use strict';
const { heuristicChips, llmChips, allChips } = require('../../scripts/extractChips');

describe('extractChips', () => {
  test('heuristicChips contains the 7 known built-in chips with exact messages', () => {
    const byId = Object.fromEntries(heuristicChips.map((c) => [c.id, c]));
    expect(heuristicChips).toHaveLength(7);
    expect(byId.balance.message).toBe('balance');
    expect(byId.accounts.message).toBe('accounts');
    expect(byId.transactions.message).toBe('transactions');
    expect(byId.transfer.message).toBe('transfer');
    expect(byId.transfer_600.message).toBe(
      'transfer $600 from my savings account to checking',
    );
    expect(byId.mortgage.message).toBe('show mortgage data');
    expect(byId.feature.message).toBe('show vertical feature');
  });

  test('llmChips are extracted with id/label/message and a group', () => {
    expect(llmChips.length).toBeGreaterThanOrEqual(20);
    for (const c of llmChips) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.label).toBe('string');
      expect(typeof c.message).toBe('string');
      expect(typeof c.group).toBe('string');
      expect(c.message.length).toBeGreaterThan(0);
    }
    const last30 = llmChips.find((c) => c.id === 'last_30_days');
    expect(last30.message).toBe('Show me transactions from the last 30 days');
    expect(last30.group).toBe('Time-Based');
  });

  test('allChips is the flat union with no duplicate ids and no empty messages', () => {
    expect(allChips.length).toBe(heuristicChips.length + llmChips.length);
    const ids = allChips.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(allChips.every((c) => c.message.trim().length > 0)).toBe(true);
  });
});
