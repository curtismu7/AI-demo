// banking_api_ui/src/utils/embeddedAgentFabVisibility.js

/**
 * Customer/admin home routes where the embedded bottom-dock agent is mounted.
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isBankingAgentDashboardRoute(pathname) {
  if (pathname == null || typeof pathname !== 'string') return false;
  const p = pathname.replace(/\/$/, '') || '/';
  return p === '/' || p === '/admin' || p === '/dashboard';
}

/**
 * Whether the global corner FAB floating agent should render.
 *
 * - Floating mode: FAB on all signed-in routes except Demo config (`/demo-data`), which uses an in-page icon only.
 * - Embedded mode: no FAB — assistant only as the bottom dock on `/`, `/admin`, `/dashboard`.
 *
 * @param {{ user?: { role?: string } | null | undefined; agentUiMode: 'floating' | 'embedded'; pathname?: string }} p
 * @returns {boolean}
 */
export function shouldShowGlobalFloatingBankingAgentFab({ user: _user, agentUiMode, pathname = '' }) {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  if (p === '/demo-data') return false;

  if (agentUiMode === 'floating') return true;

  return false;
}
