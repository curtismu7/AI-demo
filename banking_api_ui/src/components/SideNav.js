import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './SideNav.css';

const ADMIN_NAV = [
  {
    group: 'Overview',
    items: [
      { to: '/admin',        label: 'Dashboard',       icon: '⊞' },
    ],
  },
  {
    group: 'Management',
    items: [
      { to: '/activity',     label: 'Activity Logs',   icon: '📋' },
      { to: '/users',        label: 'Users',           icon: '👥' },
      { to: '/accounts',     label: 'Accounts',        icon: '🏦' },
      { to: '/transactions', label: 'Transactions',    icon: '↔' },
    ],
  },
  {
    group: 'Developer Tools',
    items: [
      { to: '/mcp-inspector',      label: 'MCP Inspector',    icon: '🔌' },
      { to: '/oauth-debug-logs',   label: 'OAuth Logs',       icon: '🔍' },
      { to: '/client-registration',label: 'Client Reg.',      icon: '📝' },
    ],
  },
  {
    group: 'System',
    items: [
      { to: '/onboarding',   label: 'Setup Guide',     icon: '🚀' },
      { to: '/config',       label: 'Config',          icon: '⚙️' },
      { to: '/settings',     label: 'Security',        icon: '🔐' },
    ],
  },
];

const USER_NAV = [
  {
    group: 'My Banking',
    items: [
      { to: '/dashboard', label: 'My Dashboard', icon: '📊' },
    ],
  },
];

export default function SideNav({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const navGroups = isAdmin ? ADMIN_NAV : USER_NAV;

  return (
    <aside className={`sidenav${collapsed ? ' sidenav--collapsed' : ''}`}>
      {/* Brand */}
      <div className="sidenav-brand">
        <div className="sidenav-brand-logo">
          <div className="sidenav-logo-grid">
            <span /><span /><span /><span />
          </div>
        </div>
        {!collapsed && (
          <span className="sidenav-brand-name">BX Finance</span>
        )}
        <button
          type="button"
          className="sidenav-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* User badge */}
      {!collapsed && (
        <div className="sidenav-user">
          <div className="sidenav-user-avatar">
            {(user?.firstName?.[0] || '?').toUpperCase()}
          </div>
          <div className="sidenav-user-info">
            <div className="sidenav-user-name">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="sidenav-user-role">
              {isAdmin ? '👑 Admin' : '👤 Customer'}
            </div>
          </div>
        </div>
      )}

      {/* Nav groups */}
      <nav className="sidenav-nav">
        {navGroups.map(group => (
          <div key={group.group} className="sidenav-group">
            {!collapsed && (
              <div className="sidenav-group-label">{group.group}</div>
            )}
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin' || item.to === '/dashboard'}
                className={({ isActive }) =>
                  `sidenav-link${isActive ? ' sidenav-link--active' : ''}`
                }
                title={collapsed ? item.label : undefined}
              >
                <span className="sidenav-link-icon">{item.icon}</span>
                {!collapsed && (
                  <span className="sidenav-link-label">{item.label}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer: logout */}
      <div className="sidenav-footer">
        <button
          type="button"
          className="sidenav-logout-btn"
          onClick={onLogout}
          title="Sign out"
        >
          <span className="sidenav-link-icon">⏻</span>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
