import React, { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAgentUiMode } from '../context/AgentUiModeContext';
import { persistBankingAgentUi } from '../services/demoScenarioService';
import { setDashboardLayout } from '../utils/dashboardLayout';
import './AdminSideNav.css';


/**
 * AdminSideNav — PingIdentity-style persistent left sidebar for navigation.
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
 * Updated Phase 163: Role-aware — renders for ALL logged-in users, filters items by role
 */
export default function AdminSideNav({ user }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  const isAdmin = user?.role === 'admin';
  const { placement, fab } = useAgentUiMode();

  const handleAgentPlacement = useCallback(async (p) => {
    if (p === placement) return;
    let next;
    if (p === 'middle') {
      setDashboardLayout('split3');
      next = { placement: 'middle', fab };
    } else if (p === 'bottom') {
      setDashboardLayout('classic');
      next = { placement: 'bottom', fab };
    } else if (p === 'right-dock') {
      setDashboardLayout('split3');
      next = { placement: 'right-dock', fab };
    } else {
      next = { placement: 'none', fab: true };
    }
    try { localStorage.setItem('banking_agent_ui_v2', JSON.stringify(next)); } catch (_e) { /* noop */ }
    await persistBankingAgentUi(next);
    window.setTimeout(() => window.location.reload(), 250);
  }, [placement, fab]);

  const handleFabToggle = useCallback(async () => {
    if (placement === 'none') return;
    const next = { placement, fab: !fab };
    try { localStorage.setItem('banking_agent_ui_v2', JSON.stringify(next)); } catch (_e) { /* noop */ }
    await persistBankingAgentUi(next);
    window.setTimeout(() => window.location.reload(), 250);
  }, [placement, fab]);

  // Main navigation items (some with submenus) — ALL ROUTES VERIFIED
  // Items with adminOnly: true are hidden for non-admin users
  const allNavItems = [
    { label: 'Home', path: '/marketing', icon: '🏠' },
    { label: 'Dashboard', path: isAdmin ? '/admin' : '/dashboard', icon: '📊' },
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
      adminOnly: true,
      children: [
        { label: 'Activity Logs', path: '/activity', icon: '📝' },
        { label: 'Audit Trail', path: '/audit', icon: '🔍' },
        { label: 'API Traffic', path: '/api-traffic', icon: '📡' },
      ],
    },
    {
      label: 'OAuth & Security',
      icon: '🔐',
      adminOnly: true,
      children: [
        { label: 'Security Settings', path: '/settings', icon: '⚙️' },
        { label: 'OAuth Debug', path: '/oauth-debug-logs', icon: '🔑' },
        { label: 'Client Registration', path: '/client-registration', icon: '📝' },
        { label: 'Scope Audit', path: '/scope-audit', icon: '🔎' },
        { label: 'Scope Reference', path: '/scope-reference', icon: '📚' },
      ],
    },
    {
      label: 'System Tools',
      icon: '⚙️',
      adminOnly: true,
      children: [
        { label: 'Feature Flags', path: '/feature-flags', icon: '🚩' },
        { label: 'MCP Inspector', path: '/mcp-inspector', icon: '🔬' },
      ],
    },
    { label: 'PingOne Test', path: '/pingone-test', icon: '🧪' },
    { label: 'MFA Test', path: '/mfa-test', icon: '🔒' },
  ];

  // Filter by role
  const navItems = allNavItems.filter(item => !item.adminOnly || isAdmin);

  // Agent UI placement options for the expandable dropdown
  const agentPlacementOptions = [
    { key: 'middle', label: 'Middle column', icon: '┃' },
    { key: 'right-dock', label: 'Right dock', icon: '◥' },
    { key: 'bottom', label: 'Bottom dock', icon: '▁' },
    { key: 'none', label: 'Float only', icon: '💬' },
  ];

  // Action items (buttons, not navigation links)
  const actionItems = [
    { label: 'Dark Mode', action: 'dark-mode', icon: '🌙' },
    { label: 'Log Out', action: 'logout', icon: '🚪' },
  ];

  const isActive = (path) => {
    if (path === '/admin' || path === '/dashboard') return location.pathname === path;
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
          {navItems.map((item, idx) => renderNavItem(item, 'nav', idx))}
        </div>

        {/* Agent UI Placement — expandable dropdown */}
        {!collapsed && <div className="admin-side-nav__divider" />}
        <div className="admin-side-nav__section">
          <div>
            <button
              className="admin-side-nav__item admin-side-nav__item--parent"
              onClick={() => toggleSection('agent-ui-placement')}
              title={collapsed ? 'Agent UI Placement' : undefined}
            >
              <span className="admin-side-nav__icon">🤖</span>
              {!collapsed && (
                <>
                  <span className="admin-side-nav__label">Agent UI</span>
                  <span className={`admin-side-nav__chevron ${expandedSections['agent-ui-placement'] ? 'admin-side-nav__chevron--expanded' : ''}`}>
                    ▶
                  </span>
                </>
              )}
            </button>
            {expandedSections['agent-ui-placement'] && !collapsed && (
              <div className="admin-side-nav__submenu">
                {agentPlacementOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => void handleAgentPlacement(opt.key)}
                    className={`admin-side-nav__item admin-side-nav__item--child${placement === opt.key ? ' admin-side-nav__item--active' : ''}`}
                    title={opt.label}
                  >
                    <span className="admin-side-nav__icon">{opt.icon}</span>
                    <span className="admin-side-nav__label">{opt.label}</span>
                  </button>
                ))}
                {placement !== 'none' && (
                  <label className="admin-side-nav__item admin-side-nav__item--child admin-side-nav__fab-toggle">
                    <input type="checkbox" checked={fab} onChange={() => void handleFabToggle()} />
                    <span className="admin-side-nav__label">+ Show FAB</span>
                  </label>
                )}
              </div>
            )}
          </div>
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
