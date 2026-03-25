// banking_api_ui/src/utils/agentToolSteps.js
/**
 * Maps a BankingAgent action to a short list of logical tool steps (for UI chips).
 * Mirrors backend behavior (reads, balance updates, ledger rows) without extra round-trips.
 */

/**
 * @param {string} actionId
 * @returns {{ name: string }[]}
 */
export function getToolStepsForAction(actionId) {
  const row = (name) => ({ name });
  switch (actionId) {
    case 'accounts':
      return [row('read_bankaccount')];
    case 'transactions':
      return [row('read_banktransaction')];
    case 'balance':
      return [row('read_bankaccount')];
    case 'deposit':
    case 'withdraw':
      return [row('read_bankaccount'), row('update_bankaccount'), row('create_banktransaction')];
    case 'transfer':
      return [
        row('update_bankaccount'),
        row('create_banktransaction'),
        row('update_bankaccount'),
        row('create_banktransaction'),
      ];
    case 'mcp_tools':
      return [];
    default:
      return [];
  }
}
