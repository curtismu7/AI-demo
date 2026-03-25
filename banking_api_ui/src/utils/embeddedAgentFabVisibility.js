// banking_api_ui/src/utils/embeddedAgentFabVisibility.js

/**
 * Whether the global corner FAB floating agent should render. On dashboard home in
 * embedded mode the bottom dock hosts BankingAgent instead, so the FAB is hidden.
 *
 * @param {{ user: { role?: string } | null | undefined; agentUiMode: 'floating' | 'embedded'; pathname: string }} p
 * @returns {boolean}
 */
export function shouldShowGlobalFloatingBankingAgentFab({ user, agentUiMode, pathname }) {
  const isAdminEmbeddedHome =
    user?.role === 'admin' &&
    agentUiMode === 'embedded' &&
    (pathname === '/' || pathname === '/admin');
  const isCustomerEmbeddedHome =
    Boolean(user) &&
    user.role !== 'admin' &&
    agentUiMode === 'embedded' &&
    (pathname === '/' || pathname === '/dashboard');
  const isEmbeddedHome = isAdminEmbeddedHome || isCustomerEmbeddedHome;
  return !user || agentUiMode === 'floating' || !isEmbeddedHome;
}
