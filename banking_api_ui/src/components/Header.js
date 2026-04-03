import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import './Header.css';

/**
 * Calls POST /api/auth/switch then navigates to the returned login URL.
 * The OAuth callback clears the _switch_target cookie and redirects to the
 * correct dashboard. The plan (P2) describes the full flow with token stashing.
 */
async function callSwitchRole(targetRole) {
  const r = await fetch('/api/auth/switch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetRole }),
  });
  if (!r.ok) throw new Error(`Switch failed: ${r.status}`);
  const { redirectUrl } = await r.json();
  window.location.href = redirectUrl;
}

const Header = ({ user, onLogout }) => {
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const [switching, setSwitching] = useState(false);

  const handleSwitchRole = async () => {
    setSwitching(true);
    try {
      await callSwitchRole(isAdmin ? 'customer' : 'admin');
    } catch (e) {
      console.error('[Header] Role switch failed:', e.message);
      setSwitching(false);
    }
  };

  return (
    <header className="header app-top-header">
      <div className="container">
        <div className="app-top-header__brand">
          <BrandLogo className="app-top-header__logo" height={32} width={32} />
          <h1 className="app-top-header__title">
            {isAdmin ? 'Accounts API Admin Dashboard' : 'Personal Account Dashboard'}
          </h1>
        </div>
        <nav className="nav">
            {isAdmin ? (
              <>
                <NavLink 
                  to="/admin" 
                  className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
                >
                  Admin Dashboard
                </NavLink>
                <NavLink 
                  to="/activity" 
                  className={`nav-link ${location.pathname === '/activity' ? 'active' : ''}`}
                >
                  Activity Logs
                </NavLink>
                <NavLink 
                  to="/users" 
                  className={`nav-link ${location.pathname === '/users' ? 'active' : ''}`}
                >
                  Users
                </NavLink>
                <NavLink 
                  to="/accounts" 
                  className={`nav-link ${location.pathname === '/accounts' ? 'active' : ''}`}
                >
                  Accounts
                </NavLink>
                <NavLink 
                  to="/transactions" 
                  className={`nav-link ${location.pathname === '/transactions' ? 'active' : ''}`}
                >
                  Transactions
                </NavLink>
                <NavLink 
                  to="/onboarding" 
                  className={`nav-link ${location.pathname === '/onboarding' ? 'active' : ''}`}
                >
                  Setup guide
                </NavLink>
                <NavLink 
                  to="/config" 
                  className={`nav-link ${location.pathname === '/config' ? 'active' : ''}`}
                >
                  ⚙️ Config
                </NavLink>
              </>
            ) : (
              <NavLink 
                to="/dashboard" 
                className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
              >
                My Dashboard
              </NavLink>
            )}
            <div className="app-top-header__user">
              <span>Welcome, {user.firstName} {user.lastName}</span>
              <button
                type="button"
                onClick={handleSwitchRole}
                disabled={switching}
                className="btn btn-secondary header-switch-role-btn"
                title={`Switch to ${isAdmin ? 'Customer' : 'Admin'} view`}
              >
                {switching ? '…' : `⇄ ${isAdmin ? 'Customer' : 'Admin'} view`}
              </button>
              <button type="button" onClick={onLogout} className="btn btn-secondary">
                Logout
              </button>
            </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
