// banking_api_ui/src/utils/embeddedAgentFabVisibility.js

/**
 * Whether the global corner FAB floating agent should render.
 *
 * When the user selects `embedded`, the agent is shown as a bottom dock globally,
 * so the floating FAB must be hidden everywhere.
 *
 * @param {{ user: { role?: string } | null | undefined; agentUiMode: 'floating' | 'embedded'; pathname?: string }} p
 * @returns {boolean}
 */
export function shouldShowGlobalFloatingBankingAgentFab({ user, agentUiMode, pathname }) {
  return agentUiMode === 'floating';
}
