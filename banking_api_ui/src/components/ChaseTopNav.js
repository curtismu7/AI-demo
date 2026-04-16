// banking_api_ui/src/components/ChaseTopNav.js
import React, { useState } from 'react';
import BrandLogo from './BrandLogo';
import TRiSMTrainingPanel from './TRiSMTrainingPanel';
import { useTheme } from '../context/ThemeContext';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import './ChaseTopNav.css';

/**
 * ChaseTopNav — Brand-only horizontal top bar (Phase 163: nav links moved to sidebar).
 * 
 * Props:
 *   user: Current user object (for greeting and role)
 *   onLogout: Callback function for logout
 *   onRoleSwitch: (optional) Callback for admin/user role toggling
 */
export default function ChaseTopNav({ user, onLogout, onRoleSwitch }) {
  const { theme, toggleTheme } = useTheme();
  const { preset } = useIndustryBranding();
  const [showTRiSMPanel, setShowTRiSMPanel] = useState(false);
  
  const isAdmin = user?.role === 'admin';

  return (
    <nav className="chase-top-nav">
      {/* LEFT: Logo + Brand Name */}
      <div className="chase-top-nav__left">
        <div className="chase-logo-container">
          <BrandLogo height={32} width={32} />
          <span className="chase-brand-name">{preset.shortName}</span>
        </div>
      </div>

      {/* RIGHT: User Actions (Greeting, Learn, Theme Toggle, Role Switch, Logout) */}
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

        {/* AI TRiSM Training Button */}
        <button
          className={`chase-nav-button chase-nav-button--learn ${showTRiSMPanel ? 'active' : ''}`}
          onClick={() => setShowTRiSMPanel(!showTRiSMPanel)}
          title="AI TRiSM Training"
          aria-label="Open AI TRiSM Training Panel"
        >
          📚 Learn
        </button>

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

      {/* TRiSM Training Panel (Phase 160) */}
      <TRiSMTrainingPanel
        isOpen={showTRiSMPanel}
        onClose={() => setShowTRiSMPanel(false)}
      />
    </nav>
  );
}
