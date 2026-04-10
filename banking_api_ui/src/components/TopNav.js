import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdAccountBalance, MdSearch, MdMenu, MdClose } from 'react-icons/md';
import UserMenu from './UserMenu';
import './TopNav.css';

export default function TopNav({ user, onLogout }) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const toggleDropdown = (groupLabel) => {
    setOpenDropdown(openDropdown === groupLabel ? null : groupLabel);
  };

  const navGroups = [
    {
      label: 'Overview',
      items: [
        { label: 'Dashboard', to: '/admin' },
        { label: 'AI Agent', to: '/agent' },
      ],
    },
    {
      label: 'Management',
      items: [
        { label: 'Activity Logs', to: '/activity' },
        { label: 'Users', to: '/users' },
        { label: 'Accounts', to: '/accounts' },
        { label: 'Transactions', to: '/transactions' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { label: 'App Config', to: '/config' },
        { label: 'Security', to: '/settings' },
        { label: 'Demo Data', to: '/demo-data' },
      ],
    },
  ];

  return (
    <header className="topnav">
      <div className="topnav-container">
        {/* Left side: Brand + Hamburger */}
        <div className="topnav-left">
          <button
            className="topnav-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            type="button"
          >
            {mobileMenuOpen ? <MdClose size={24} /> : <MdMenu size={24} />}
          </button>
          <div className="topnav-brand" onClick={() => navigate('/admin')}>
            <MdAccountBalance className="topnav-brand-icon" />
            <span className="topnav-brand-name">Super Bank</span>
          </div>
        </div>

        {/* Center: Navigation Groups (Desktop) */}
        <nav className="topnav-center">
          {navGroups.map(group => (
            <div key={group.label} className="topnav-group">
              <button
                className="topnav-group-trigger"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDropdown(group.label);
                }}
              >
                {group.label}
              </button>
              {openDropdown === group.label && (
                <div className="topnav-dropdown">
                  {group.items.map(item => (
                    <button
                      key={item.to}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(item.to);
                        setOpenDropdown(null);
                      }}
                      className="topnav-dropdown-item"
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

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

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="topnav-mobile-menu">
          <nav className="topnav-mobile-nav">
            {navGroups.map(group => (
              <div key={group.label} className="topnav-mobile-group">
                <div className="topnav-mobile-group-label">{group.label}</div>
                {group.items.map(item => (
                  <button
                    key={item.to}
                    onClick={() => {
                      navigate(item.to);
                      setMobileMenuOpen(false);
                    }}
                    className="topnav-mobile-item"
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
            <div className="topnav-mobile-group">
              <div className="topnav-mobile-group-label">Account</div>
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="topnav-mobile-item topnav-mobile-item--logout"
                type="button"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
