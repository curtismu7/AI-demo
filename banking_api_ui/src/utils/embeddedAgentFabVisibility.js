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
 * Routes where the embedded bottom-dock agent is mounted (dashboard homes + Application Configuration).
 * Floating FAB still uses {@link isBankingAgentDashboardRoute} only — not `/config`.
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isEmbeddedAgentDockRoute(pathname) {
  if (pathname == null || typeof pathname !== 'string') return false;
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === '/config') return true;
  return isBankingAgentDashboardRoute(pathname);
}

/**
 * Routes where the fixed upper-left quick nav (Home, Dashboard, API, Logs) is shown.
 * Includes admin banking ops so admins can jump back without losing the rail.
 * @param {string} [pathname]
 * @param {{ role?: string } | null | undefined} [user]
 */
export function isDashboardQuickNavRoute(pathname, user) {
  if (pathname == null || typeof pathname !== 'string') return false;
  const p = pathname.replace(/\/$/, '') || '/';
  if (isBankingAgentDashboardRoute(pathname)) return true;
  if (user?.role === 'admin' && p === '/admin/banking') return true;
  return false;
}

/**
 * Whether the global corner FAB floating agent should render.
 *
 * - Only when signed in, floating or both, and on dashboard home routes (`/`, `/admin`, `/dashboard`).
 * - Embedded mode: no FAB — assistant only as the bottom dock on those same routes.
 * - `both`: FAB + dock; App hides duplicate FAB when customer uses split3 (inline agent) layout.
 *
 * @param {{ user?: { role?: string } | null | undefined; agentUiMode: 'floating' | 'embedded' | 'both'; pathname?: string }} p
 * @returns {boolean}
 */
export function shouldShowGlobalFloatingBankingAgentFab({ user, agentUiMode, pathname = '' }) {
  if (!user) return false;
  if (agentUiMode !== 'floating' && agentUiMode !== 'both') return false;
  return isBankingAgentDashboardRoute(pathname);
}
