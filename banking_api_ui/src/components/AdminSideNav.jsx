import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './AdminSideNav.css';

const POPOUT = 'width=1400,height=900,scrollbars=yes,resizable=yes';

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
 */
export default function AdminSideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  // Main navigation items (some with submenus)
  const adminNavItems = [
    { label: 'Home', path: '/marketing', icon: '🏠' },
    { label: 'Dashboard', path: '/admin', icon: '📊' },
    {
      label: 'Data Management',
      icon: '📑',
      children: [
        { label: 'Users', path: '/users', icon: '👥' },
        { label: 'Accounts', path: '/accounts', icon: '🏦' },
        { label: 'Transactions', path: '/transactions', icon: '💳' },
      ],
    },
    { label: 'Banking', path: '/admin/banking', icon: '🏧' },
    {
      label: 'Audit & Logs',
      icon: '📋',
      children: [
        { label: 'Activity Logs', path: '/activity-logs', icon: '📝' },
        { label: 'Audit Trail', path: '/audit', icon: '🔍' },
      ],
    },
    {
      label: 'Security',
      icon: '🔐',
      children: [
        { label: 'Security Settings', path: '/security-settings', icon: '⚙️' },
        { label: 'OAuth Debug', path: '/oauth-debug', icon: '🔑' },
        { label: 'Client Registration', path: '/client-reg', icon: '📝' },
      ],
    },
  ];

  // Utility/Admin Ops items
  const adminOpsItems = [
    { label: 'Admin Ops', path: '/admin-ops', icon: '🛠️' },
    { label: 'API Calls', path: '/api-calls', icon: '🔗' },
    {
      label: 'Configuration',
      icon: '⚙️',
      children: [
        { label: 'Feature Flags', path: '/feature-flags', icon: '🚩' },
        { label: 'Demo Config', path: '/demo-config', icon: '⚡' },
        { label: 'MCP Inspector', path: '/mcp-inspector', icon: '🔬' },
      ],
    },
  ];

  // Action items (buttons, not navigation links)
  const actionItems = [
    { label: 'Agent', action: 'agent', icon: '🤖' },
    { label: 'API', action: 'api-popout', icon: '📡' },
    { label: 'Logs', action: 'logs-popout', icon: '📜' },
    { label: 'Export Seed JSON', action: 'export', icon: '💾' },
    { label: 'Reset Demo', action: 'reset', icon: '🔄' },
    { label: 'Dark Mode', action: 'dark-mode', icon: '🌙' },
    { label: 'Switch to Customer', action: 'switch-view', icon: '👤' },
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
      case 'api-popout':
        window.open('/api-traffic', 'ApiTraffic', POPOUT);
        break;
      case 'logs-popout':
        window.open('/logs', 'BankingLogs', POPOUT);
        break;
      case 'export':
        alert('Export seed JSON - feature to be implemented');
        break;
      case 'reset':
        if (window.confirm('Reset demo? This will clear all data.')) {
          alert('Reset demo - feature to be implemented');
        }
        break;
      case 'dark-mode': {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        break;
      }
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

        {/* Admin Ops Section */}
        <div className="admin-side-nav__section">
          {adminOpsItems.map((item, idx) => renderNavItem(item, 'ops', idx))}
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
