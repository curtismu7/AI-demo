import {
  MdAccountBalance, MdLogin, MdSearch,
  MdLocalHospital, MdShoppingCart, MdStorefront, MdWork, MdSportsBasketball,
  MdFlight, MdGavel, MdSchool, MdRestaurant, MdDirectionsCar,
} from "react-icons/md";
import { useLocation, useNavigate } from "react-router-dom";
import { useSessionToken } from "../context/SessionTokenContext";
import { useVertical } from "../vertical/useVertical";
import { navigateToCustomerOAuthLogin } from "../utils/authUi";
import AgentUiModeToggle from "./AgentUiModeToggle";
import ThresholdControls from "./ThresholdControls";
import UserMenu from "./UserMenu";
import VerticalSwitcher from "./VerticalSwitcher";
import "./TopNav.css";

// Curated react-icons/md set selectable per vertical via manifest identity.icon.
// Importing by name (not the whole md namespace) keeps the bundle small.
const BRAND_ICONS = {
  MdAccountBalance, MdLocalHospital, MdShoppingCart, MdStorefront, MdWork,
  MdSportsBasketball, MdFlight, MdGavel, MdSchool, MdRestaurant, MdDirectionsCar,
};

export default function TopNav({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { pageManifest } = useVertical();
  const identity = pageManifest?.identity;
  const { tokenSecondsLeft, openTokenModal } = useSessionToken();
  const brandName = (identity && (identity.headerTitle || identity.displayName)) || 'AI Demo';
  // Per-vertical brand icon (manifest identity.icon); unknown/absent → bank icon.
  const BrandIcon = (identity && BRAND_ICONS[identity.icon]) || MdAccountBalance;

  const isAdminView =
    user?.role === 'admin' &&
    (location.pathname.startsWith('/admin') ||
      location.pathname === '/users' ||
      location.pathname === '/activity' ||
      location.pathname === '/audit' ||
      location.pathname === '/configure' ||
      location.pathname === '/settings' ||
      location.pathname === '/scope-audit' ||
      location.pathname === '/scope-reference' ||
      location.pathname === '/feature-flags' ||
      location.pathname === '/pingone-test' ||
      location.pathname === '/mfa-test' ||
      location.pathname === '/error-audit' ||
      location.pathname === '/oauth-debug');

  const handleSwitchView = () => {
    if (isAdminView) {
      navigate('/dashboard');
    } else {
      navigate('/admin');
    }
  };

  function formatCountdown(seconds) {
    if (seconds === null || seconds < 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const tokenExpiring = tokenSecondsLeft !== null && tokenSecondsLeft > 0 && tokenSecondsLeft < 300;
  const tokenExpired = tokenSecondsLeft !== null && tokenSecondsLeft <= 0;

  const displayName =
    (user?.firstName && user?.lastName)
      ? `${user.firstName} ${user.lastName}`
      : user?.username || user?.email || null;

  return (
    <header className="topnav">
      <div className="topnav-container">

        {/* Left: Brand */}
        <div className="topnav-left">
          <button
            type="button"
            className="topnav-brand"
            onClick={() => navigate(user?.role === 'admin' ? '/admin' : '/dashboard')}
            aria-label="Go to dashboard"
          >
            <BrandIcon className="topnav-brand-icon" />
            <span className="topnav-brand-name">{brandName}</span>
          </button>
        </div>

        {/* Context chip — Customer / Admin / Setup */}
        {user && (
          <span className="topnav-context-chip">
            {location.pathname === '/setup' || location.pathname.startsWith('/setup/')
              ? 'Setup'
              : isAdminView
                ? 'Admin'
                : 'Customer'}
          </span>
        )}

        {/* Vertical switcher — visible to everyone (guests too) so the
            demo flow can be tailored before sign-in. The switcher hides
            itself when fewer than 2 verticals exist. */}
        <VerticalSwitcher variant="nav" />

        {/* 3-tab nav — admin gets all three; customer gets nothing here (chip is enough) */}
        {user?.role === 'admin' && (
          <nav className="topnav-nav">
            <button
              type="button"
              className={`topnav-nav-link${location.pathname === '/dashboard' ? ' topnav-nav-link--active' : ''}`}
              onClick={() => navigate('/dashboard')}
            >
              Customer
            </button>
            <button
              type="button"
              className={`topnav-nav-link${isAdminView ? ' topnav-nav-link--active' : ''}`}
              onClick={() => navigate('/admin')}
            >
              Admin
            </button>
            <button
              type="button"
              className={`topnav-nav-link${location.pathname.startsWith('/setup') ? ' topnav-nav-link--active' : ''}`}
              onClick={() => navigate('/setup')}
            >
              Setup
            </button>
          </nav>
        )}

        <span className="topnav-spacer" aria-hidden="true" />

        {/* Right: dashboard controls + token pill + search + user menu */}
        <div className="topnav-right">

          {/* Dashboard controls — only when viewing /dashboard.
              ThemePicker is globally useful, but the others are dashboard-specific
              (ThresholdControls = HITL/MFA modal; Reset Demo clears agent/token state).
              Reset Demo fires a window event consumed by UserDashboard so the
              confirmation modal can stay co-located with `onLogout`. */}
          {location.pathname === '/dashboard' && (
            <div className="topnav-dashboard-controls" role="toolbar" aria-label="Dashboard actions">
              <AgentUiModeToggle variant="config" />
              <ThresholdControls />
              <button
                type="button"
                className="topnav-reset-demo-btn"
                title="Reset demo: clear agent history and token chain"
                onClick={() => window.dispatchEvent(new CustomEvent('dashboard:open-reset-modal'))}
              >
                Reset Demo
              </button>
            </div>
          )}

          {/* Token pill — only when user is logged in */}
          {user && (
            <div
              className={`topnav-token-pill${tokenExpiring ? ' topnav-token-pill--expiring' : ''}${tokenExpired ? ' topnav-token-pill--expired' : ''}`}
              role="status"
              aria-label="Session status"
            >
              {tokenSecondsLeft === null && (
                <span className="topnav-token-pill__shimmer" aria-hidden="true" />
              )}
              {tokenSecondsLeft !== null && !tokenExpired && (
                <>
                  <span className="topnav-token-pill__dot" aria-hidden="true" />
                  {displayName && <span className="topnav-token-pill__name">{displayName}</span>}
                  <span className="topnav-token-pill__countdown">{formatCountdown(tokenSecondsLeft)}</span>
                  <button
                    type="button"
                    className="topnav-token-pill__view-btn"
                    onClick={openTokenModal}
                    title="View token details"
                  >
                    View Token
                  </button>
                </>
              )}
              {tokenExpired && (
                <>
                  <span className="topnav-token-pill__dot" aria-hidden="true" />
                  <span className="topnav-token-pill__expired-label">Session expired</span>
                  <button
                    type="button"
                    className="topnav-token-pill__view-btn"
                    onClick={() => navigateToCustomerOAuthLogin()}
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          )}

          {/* Search */}
          <div className="topnav-search">
            <button className="topnav-search-btn" onClick={() => {}} aria-label="Search" type="button">
              <MdSearch size={20} />
            </button>
          </div>

          {/* Login button — logged-out state */}
          {!user && (
            <button type="button" className="topnav-login-btn" onClick={() => navigateToCustomerOAuthLogin()}>
              <MdLogin size={18} />
              <span>Login</span>
            </button>
          )}

          {/* User menu */}
          <UserMenu
            user={user}
            onLogout={onLogout}
            isAdminView={isAdminView}
            onSwitchView={handleSwitchView}
          />
        </div>

      </div>
    </header>
  );
}
