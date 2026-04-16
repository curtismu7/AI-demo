import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './AdminSideNav.css';


/**
 * AdminSideNav — PingIdentity-style persistent left sidebar for admin navigation.
 * 
 * Based on PingIdentity console design:
 * - Dark background sidebar (left)
 * - White text labels for all entries
 * - Expandable submenu sections
 * - Active link highlighting
 * - Consistent icon + label styling
 * - Responsive on mobile
 * 
 * Updated Phase 155: All routes verified against App.js; broken links fixed
 */
export default function AdminSideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  // Main navigation items (some with submenus) — ALL ROUTES VERIFIED
  const adminNavItems = [
    { label: 'Home', path: '/marketing', icon: '🏠' },
    { label: 'Dashboard', path: '/admin', icon: '📊' },
    {
      label: 'Users & Accounts',
      icon: '📑',
      children: [
        { label: 'Users', path: '/users', icon: '👥' },
        { label: 'Accounts', path: '/accounts', icon: '🏦' },
        { label: 'Transactions', path: '/transactions', icon: '💳' },
      ],
    },
    {
      label: 'Monitoring',
      icon: '📋',
      children: [
        { label: 'Activity Logs', path: '/activity', icon: '📝' },  // FIXED: was /activity-logs
        { label: 'Audit Trail', path: '/audit', icon: '🔍' },
        { label: 'API Traffic', path: '/api-traffic', icon: '📡' },  // ADDED: useful for debugging
      ],
    },
    {
      label: 'OAuth & Security',
      icon: '🔐',
      children: [
        { label: 'Security Settings', path: '/settings', icon: '⚙️' },  // FIXED: was /security-settings
        { label: 'OAuth Debug', path: '/oauth-debug-logs', icon: '🔑' },  // FIXED: was /oauth-debug
        { label: 'Client Registration', path: '/client-registration', icon: '📝' },  // FIXED: was /client-reg
        { label: 'Scope Audit', path: '/scope-audit', icon: '🔎' },
        { label: 'Scope Reference', path: '/scope-reference', icon: '📚' },
      ],
    },
    {
      label: 'System Tools',
      icon: '⚙️',
      children: [
        { label: 'Feature Flags', path: '/feature-flags', icon: '🚩' },
        { label: 'MCP Inspector', path: '/mcp-inspector', icon: '🔬' },
      ],
    },
  ];

  // Action items (buttons, not navigation links)
  const actionItems = [
    { label: 'Agent', action: 'agent', icon: '🤖' },
    { label: 'Dark Mode', action: 'dark-mode', icon: '🌙' },
    { label: 'Log Out', action: 'logout', icon: '🚪' },
  ];

  const isActive = (path) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const handleAction = (action) => {
    switch (action) {
      case 'agent': {
        const agentRoutes = ['/', '/admin', '/dashboard', '/marketing'];
        const norm = location.pathname.replace(/\/$/, '') || '/';
        if (agentRoutes.includes(norm)) {
          window.dispatchEvent(new CustomEvent('banking-agent-open'));
        } else {
          navigate('/admin', { state: { openAgent: true } });
        }
        break;
      }
      case 'dark-mode': {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        break;
      }
      case 'logout':
        if (window.confirm('Log out?')) {
          window.location.href = '/api/auth/logout';
        }
        break;
      default:
        break;
    }
  };

  const renderNavItem = (item, sectionKey, index) => {
    const itemKey = `${sectionKey}-${index}`;
    const isExpanded = expandedSections[itemKey];
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren) {
      return (
        <div key={itemKey}>
          <button
            className="admin-side-nav__item admin-side-nav__item--parent"
            onClick={() => toggleSection(itemKey)}
            title={collapsed ? item.label : undefined}
          >
            <span className="admin-side-nav__icon">{item.icon}</span>
            {!collapsed && (
              <>
                <span className="admin-side-nav__label">{item.label}</span>
                <span className={`admin-side-nav__chevron ${isExpanded ? 'admin-side-nav__chevron--expanded' : ''}`}>
                  ▶
                </span>
              </>
            )}
          </button>
          {isExpanded && !collapsed && (
            <div className="admin-side-nav__submenu">
              {item.children.map((child, childIdx) => (
                <Link
                  key={`${itemKey}-child-${childIdx}`}
                  to={child.path}
                  className={`admin-side-nav__item admin-side-nav__item--child ${isActive(child.path) ? 'admin-side-nav__item--active' : ''}`}
                  title={child.label}
                >
                  <span className="admin-side-nav__icon">{child.icon}</span>
                  <span className="admin-side-nav__label">{child.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={itemKey}
        to={item.path}
        className={`admin-side-nav__item ${isActive(item.path) ? 'admin-side-nav__item--active' : ''}`}
        title={collapsed ? item.label : undefined}
      >
        <span className="admin-side-nav__icon">{item.icon}</span>
        {!collapsed && <span className="admin-side-nav__label">{item.label}</span>}
      </Link>
    );
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
          {adminNavItems.map((item, idx) => renderNavItem(item, 'nav', idx))}
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
