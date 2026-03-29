// banking_api_ui/src/utils/embeddedAgentFabVisibility.js

/**
 * Customer/admin home routes where the embedded bottom-dock agent is mounted.
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isBankingAgentDashboardRoute(pathname) {
  if (pathname == null || typeof pathname !== 'string') return false;
  const p = pathname.replace(/\/$/, '') || '/';
  return p === '/' || p === '/admin' || p === '/dashboard' || p === '/marketing';
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
 * Marketing / landing surfaces where we show the banking agent before sign-in (SPA path only).
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isPublicMarketingAgentPath(pathname) {
  if (pathname == null || typeof pathname !== 'string') return false;
  const p = pathname.replace(/\/$/, '') || '/';
  return p === '/' || p === '/marketing';
}

/**
 * App-level bottom dock on marketing: guests on `/` or `/marketing`, or any user on `/marketing`.
 * Does not include signed-in `/` (that is UserDashboard or admin home).
 * @param {string} [pathname]
 * @param {unknown} user
 * @returns {boolean}
 */
export function isMarketingEmbeddedDockSurface(pathname, user) {
  if (pathname == null || typeof pathname !== 'string') return false;
  const p = pathname.replace(/\/$/, '') || '/';
  if (!user && (p === '/' || p === '/marketing')) return true;
  if (user && p === '/marketing') return true;
  return false;
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
  // Also show on secondary pages so the nav rail is always accessible while signed in
  if (p === '/demo-data' || p === '/config' || p === '/mcp-inspector' || p === '/logs' || p === '/activity') return true;
  return false;
}

/**
 * Whether the global corner FAB floating agent should render.
 *
 * - Float-only (`placement === 'none'`) or Middle/Bottom with **+ FAB** checked.
 *
 * @param {{ user?: { role?: string } | null | undefined; placement: 'middle' | 'bottom' | 'none'; fab: boolean; pathname?: string }} p
 * @returns {boolean}
 */
export function shouldShowGlobalFloatingBankingAgentFab({ user, placement, fab, pathname = '' }) {
  if (!user) return false;
  if (placement !== 'none' && !fab) return false;
  return isBankingAgentDashboardRoute(pathname);
}
