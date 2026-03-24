
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const Header = ({ user, onLogout }) => {
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  return (
    <header className="header" style={{borderBottom: '1px solid #e0e0e0', background: '#fff', padding: '12px 0'}}>
      <div className="container" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <img src="/logo.svg" alt="Banking App Logo" style={{height: 40, marginRight: 12, verticalAlign: 'middle'}} />
          <h1 style={{fontSize: 24, fontWeight: 700, color: '#6C2EB9', margin: 0}}>
            {isAdmin ? 'Accounts API Admin Dashboard' : 'Personal Account Dashboard'}
          </h1>
        </div>
        <nav className="nav" style={{display: 'flex', alignItems: 'center', gap: 24}}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{color: '#333'}}>Welcome, {user.firstName} {user.lastName}</span>
              <button onClick={onLogout} className="btn btn-secondary">
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
