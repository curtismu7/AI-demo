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
  // Architecture diagram pages: start collapsed so the FAB button is visible.
  // Users click the FAB to open the agent when they want to interact with the diagram.
  if (p.startsWith('/architecture')) return false;
  return !isBankingAgentDashboardRoute(pathname);
}
