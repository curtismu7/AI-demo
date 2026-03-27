// banking_api_ui/src/components/DashboardQuickNav.js
import { Link, useLocation } from 'react-router-dom';
import { isDashboardQuickNavRoute } from '../utils/embeddedAgentFabVisibility';
import './DashboardQuickNav.css';

const POPOUT = 'width=1400,height=900,scrollbars=yes,resizable=yes';

/**
 * Fixed upper-left controls (Home, role-based Dashboard, API + Log viewer popouts).
 * Signed-in quick nav on home routes /, /admin, /dashboard, plus /admin/banking for admins (not landing, /config, etc.).
 */
export default function DashboardQuickNav({ user }) {
  const { pathname } = useLocation();
  if (!user || !isDashboardQuickNavRoute(pathname, user)) {
    return null;
  }

  const isAdmin = user?.role === 'admin';
  const dashboardPath = user ? (isAdmin ? '/admin' : '/dashboard') : '/dashboard';

  const openApiPopout = () => {
    window.open('/api-traffic', 'ApiTraffic', POPOUT);
  };

  const openLogPopout = () => {
    window.open('/logs', 'BankingLogs', POPOUT);
  };

  const homeActive = pathname === '/';
  const dashActive = user
    ? (isAdmin ? pathname === '/admin' : pathname === '/dashboard')
    : pathname === '/dashboard';
  const bankingAdminActive = isAdmin && pathname.replace(/\/$/, '') === '/admin/banking';

  return (
    <nav className="dashboard-quick-nav" aria-label="Quick navigation">
      <Link
        to="/"
        className={`dashboard-quick-nav__btn${homeActive ? ' dashboard-quick-nav__btn--active' : ''}`}
        title="Home"
      >
        Home
      </Link>
      <Link
        to={dashboardPath}
        className={`dashboard-quick-nav__btn${dashActive ? ' dashboard-quick-nav__btn--active' : ''}`}
        title={isAdmin ? 'Admin dashboard' : 'Customer dashboard'}
      >
        Dashboard
      </Link>
      {isAdmin && (
        <Link
          to="/admin/banking"
          className={`dashboard-quick-nav__btn${bankingAdminActive ? ' dashboard-quick-nav__btn--active' : ''}`}
          title="Banking admin — lookup accounts, seed demo charges"
        >
          Banking
        </Link>
      )}
      <button type="button" className="dashboard-quick-nav__btn" onClick={openApiPopout} title="Open API traffic in a new window">
        API
      </button>
      <button type="button" className="dashboard-quick-nav__btn" onClick={openLogPopout} title="Open log viewer in a new window">
        Logs
      </button>
    </nav>
  );
}
