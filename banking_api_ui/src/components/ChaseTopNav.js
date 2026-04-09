// banking_api_ui/src/components/ChaseTopNav.js
import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import { useTheme } from '../context/ThemeContext';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import './ChaseTopNav.css';

/**
 * ChaseTopNav — Horizontal top navigation bar styled to match Chase.com design.
 * 
 * Props:
 *   user: Current user object (for greeting and role)
 *   onLogout: Callback function for logout
 *   currentPage: String for active link highlighting (e.g., 'landing', 'dashboard', 'admin-dashboard')
 *   onRoleSwitch: (optional) Callback for admin/user role toggling
 */
export default function ChaseTopNav({ user, onLogout, currentPage = 'home', onRoleSwitch }) {
  const { theme, toggleTheme } = useTheme();
  const { preset } = useIndustryBranding();
  
  const isAdmin = user?.role === 'admin';

  const navLinks = [
    { label: 'Home', path: '/', pages: ['landing', 'home'] },
    { label: 'Dashboard', path: '/dashboard', pages: ['dashboard', 'admin-dashboard'] },
    { label: 'Config', path: '/config', pages: ['config'] },
  ];

  return (
    <nav className="chase-top-nav">
      {/* LEFT: Logo + Brand Name */}
      <div className="chase-top-nav__left">
        <div className="chase-logo-container">
          <BrandLogo height={32} width={32} />
          <span className="chase-brand-name">{preset.shortName}</span>
        </div>
      </div>

      {/* CENTER: Navigation Links */}
      <div className="chase-top-nav__center">
        {navLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`chase-nav-link ${link.pages.includes(currentPage) ? 'chase-nav-link--active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* RIGHT: User Actions (Greeting, Theme Toggle, Role Switch, Logout) */}
      <div className="chase-top-nav__right">
        {/* User Greeting */}
        {user && (
          <div className="chase-user-greeting">
            <span className="chase-user-name">
              {(user.firstName || user.lastName)
                ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                : user.name || user.username || user.email?.split('@')[0] || 'Guest'}
            </span>
            <span className="chase-user-role">
              {isAdmin ? 'Admin' : 'User'}
            </span>
          </div>
        )}

        {/* Theme Toggle Button */}
        <button
          className="chase-nav-button chase-nav-button--theme"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Role Switch Button (Admin/User toggle) */}
        {onRoleSwitch && isAdmin && (
          <button
            className="chase-nav-button chase-nav-button--role"
            onClick={onRoleSwitch}
            title="Switch to user view"
            aria-label="Switch to user view"
          >
            👤 User View
          </button>
        )}

        {/* Logout Button */}
        <button
          className="chase-nav-button chase-nav-button--logout"
          onClick={onLogout}
          title="Sign out"
          aria-label="Sign out"
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
}
