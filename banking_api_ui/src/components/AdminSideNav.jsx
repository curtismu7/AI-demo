import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './AdminSideNav.css';

/**
 * AdminSideNav — PingIdentity-style persistent left sidebar for admin navigation.
 * 
 * Based on PingIdentity console design:
 * - Dark background sidebar (left)
 * - White text labels (clean, not button-styled)
 * - Active link highlighting
 * - Navigation and utility sections
 * - Responsive on mobile
 */
export default function AdminSideNav() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Main navigation items
  const adminNavItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Users', path: '/users', icon: '👥' },
    { label: 'Accounts', path: '/accounts', icon: '🏦' },
    { label: 'Transactions', path: '/transactions', icon: '💳' },
    { label: 'Activity Logs', path: '/activity-logs', icon: '📋' },
    { label: 'Audit', path: '/audit', icon: '🔍' },
    { label: 'Security', path: '/security-settings', icon: '🔐' },
    { label: 'Configuration', path: '/config', icon: '⚙️' },
  ];

  // Utility/Admin Ops items
  const adminOpsItems = [
    { label: 'Admin Ops', path: '/admin-ops', icon: '🛠️' },
    { label: 'API Calls', path: '/api-calls', icon: '🔗' },
    { label: 'Feature Flags', path: '/feature-flags', icon: '🚩' },
    { label: 'MCP Inspector', path: '/mcp-inspector', icon: '🔬' },
    { label: 'Demo Config', path: '/demo-config', icon: '⚡' },
    { label: 'OAuth Debug', path: '/oauth-debug', icon: '🔐' },
    { label: 'Client Registration', path: '/client-reg', icon: '📝' },
  ];

  // Action items (not navigation links)
  const actionItems = [
    { label: 'Export Seed JSON', action: 'export', icon: '💾' },
    { label: 'Reset Demo', action: 'reset', icon: '🔄' },
    { label: 'Dark Mode', action: 'dark-mode', icon: '🌙' },
    { label: 'Switch to Customer', action: 'switch-view', icon: '👤' },
    { label: 'Log Out', action: 'logout', icon: '🚪' },
  ];

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleAction = (action) => {
    switch (action) {
      case 'export':
        alert('Export seed JSON - feature to be implemented');
        break;
      case 'reset':
        if (window.confirm('Reset demo? This will clear all data.')) {
          alert('Reset demo - feature to be implemented');
        }
        break;
      case 'dark-mode':
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        break;
      case 'switch-view':
        alert('Switch to customer view - feature to be implemented');
        break;
      case 'logout':
        if (window.confirm('Log out?')) {
          window.location.href = '/api/auth/logout';
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className={`admin-side-nav ${collapsed ? 'admin-side-nav--collapsed' : ''}`}>
      {/* Collapse Toggle Button */}
      <button
        className="admin-side-nav__toggle"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '→' : '←'}
      </button>

      {/* Navigation Menu */}
      <nav className="admin-side-nav__menu">
        {/* Main Navigation Section */}
        <div className="admin-side-nav__section">
          {adminNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-side-nav__item ${isActive(item.path) ? 'admin-side-nav__item--active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="admin-side-nav__icon">{item.icon}</span>
              {!collapsed && <span className="admin-side-nav__label">{item.label}</span>}
            </Link>
          ))}
        </div>

        {/* Divider */}
        {!collapsed && <div className="admin-side-nav__divider" />}

        {/* Admin Ops Section */}
        <div className="admin-side-nav__section">
          {adminOpsItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-side-nav__item ${isActive(item.path) ? 'admin-side-nav__item--active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="admin-side-nav__icon">{item.icon}</span>
              {!collapsed && <span className="admin-side-nav__label">{item.label}</span>}
            </Link>
          ))}
        </div>

        {/* Divider */}
        {!collapsed && <div className="admin-side-nav__divider" />}

        {/* Actions Section */}
        <div className="admin-side-nav__section">
          {actionItems.map((item) => (
            <button
              key={item.action}
              onClick={() => handleAction(item.action)}
              className="admin-side-nav__item admin-side-nav__item--action"
              title={collapsed ? item.label : undefined}
            >
              <span className="admin-side-nav__icon">{item.icon}</span>
              {!collapsed && <span className="admin-side-nav__label">{item.label}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
