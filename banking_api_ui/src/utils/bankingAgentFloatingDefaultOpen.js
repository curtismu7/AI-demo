// banking_api_ui/src/utils/bankingAgentFloatingDefaultOpen.js
import { isBankingAgentDashboardRoute } from './embeddedAgentFabVisibility';

/**
 * Default open state for the **floating** BankingAgent panel when the route changes
 * or on first paint (before the user toggles the FAB).
 *
 * Collapsed on customer/admin home routes; open on tool routes (logs, MCP, etc.)
 * so the assistant is visible where there is no embedded dock.
 *
 * Do **not** use this to reset open state when `user` or `userAuthenticated` fires —
 * that caused a regression where opening the panel was immediately undone (flash).
 */
export function isBankingAgentFloatingDefaultOpen(pathname) {
  if (pathname == null || typeof pathname !== 'string') return false;
  const p = pathname.replace(/\/$/, '') || '/';
  // Marketing-only route: open the real floating agent by default (FAB alone was easy to miss).
  if (p === '/marketing') return true;
  return !isBankingAgentDashboardRoute(pathname);
}
