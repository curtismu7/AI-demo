import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdAccountBalance, MdSearch } from 'react-icons/md';
import UserMenu from './UserMenu';
import './TopNav.css';

export default function TopNav({ user, onLogout }) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
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
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
      </div>
    </header>
  );
}
