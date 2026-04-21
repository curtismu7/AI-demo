import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MdAccountBalance, MdSearch } from 'react-icons/md';
import UserMenu from './UserMenu';
import './TopNav.css';

export default function TopNav({ user, onLogout }) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  // Admin-only: detect whether currently in admin or customer view
  const isAdminView = user?.role === 'admin' && (
    location.pathname.startsWith('/admin') ||
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
    location.pathname === '/oauth-debug'
  );

  const handleSwitchView = () => {
    if (isAdminView) {
      navigate('/dashboard');
    } else {
      navigate('/admin');
    }
  };

  const handleLogout = () => {
    onLogout();
  };

  return (
    <header className="topnav">
      <div className="topnav-container">
        {/* Left side: Brand */}
        <div className="topnav-left">
          <button
            type="button"
            className="topnav-brand"
            onClick={() => navigate(user?.role === 'admin' ? '/admin' : '/dashboard')}
            aria-label="Go to dashboard"
          >
            <MdAccountBalance className="topnav-brand-icon" />
            <span className="topnav-brand-name">Super Bank</span>
          </button>
        </div>

        {/* Right side: Search + User Menu */}
        <div className="topnav-right">
          <div className="topnav-search">
            <button
              className="topnav-search-btn"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Search"
              type="button"
            >
              <MdSearch size={20} />
            </button>
            {searchOpen && (
              <input
                type="text"
                placeholder="Search..."
                className="topnav-search-input"
                autoFocus
              />
            )}
          </div>
          {user?.role === 'admin' && (
            <button
              type="button"
              className={`topnav-view-switch${isAdminView ? ' topnav-view-switch--customer' : ' topnav-view-switch--admin'}`}
              onClick={handleSwitchView}
              title={isAdminView ? 'Switch to Customer View' : 'Switch to Admin View'}
            >
              {isAdminView ? '👤 Customer View' : '🛡 Admin View'}
            </button>
          )}
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
      </div>
    </header>
  );
}
