import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import './Header.css';

const Header = ({ user, onLogout }) => {
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

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
