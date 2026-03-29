import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useEducationUIOptional } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import './SideNav.css';

const ADMIN_NAV = [
  {
    group: 'Overview',
    items: [
      { to: '/admin',        label: 'Dashboard',       icon: '⊞' },
      { to: '/agent',        label: 'AI Agent',         icon: '💬' },
    ],
  },
  {
    group: 'Management',
    items: [
      { to: '/activity',     label: 'Activity Logs',   icon: '📋' },
      { to: '/users',        label: 'Users',           icon: '👥' },
      { to: '/accounts',     label: 'Accounts',        icon: '🏦' },
      { to: '/admin/banking', label: 'Banking admin',   icon: '🏧' },
      { to: '/transactions', label: 'Transactions',    icon: '↔' },
    ],
  },
  {
    group: 'Developer Tools',
    items: [
      { to: '/demo-data',          label: 'Demo config',      icon: '⚙️' },
      { to: '/mcp-inspector',      label: 'MCP Inspector',    icon: '🔌' },
      { to: '/oauth-debug-logs',   label: 'OAuth Logs',       icon: '🔍' },
      { to: '/client-registration',label: 'Client Reg.',      icon: '📝' },
    ],
  },
  {
    group: 'System',
    items: [
      { to: '/onboarding',   label: 'Setup Guide',     icon: '🚀' },
      { to: '/setup/pingone', label: 'PingOne ref.',   icon: '📘' },
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
      { to: '/agent',     label: 'AI Agent',      icon: '💬' },
      { to: '/demo-data', label: 'Demo config',   icon: '⚙️' },
    ],
  },
];

export default function SideNav({ user, onLogout }) {
  const { preset } = useIndustryBranding();
  const [collapsed, setCollapsed] = useState(false);
  const edu = useEducationUIOptional();
  const isAdmin = user?.role === 'admin';
  const navGroups = isAdmin ? ADMIN_NAV : USER_NAV;

  function openCiba() {
    window.dispatchEvent(new CustomEvent('education-open-ciba', { detail: { tab: 'what' } }));
  }
  function openCimd() {
    window.dispatchEvent(new CustomEvent('education-open-cimd', { detail: { tab: 'what' } }));
  }

  const LEARN_ITEMS = [
    { label: 'Login Flow',       icon: '🔐', action: () => edu?.open(EDU.LOGIN_FLOW, 'what') },
    { label: 'Token Exchange',   icon: '🔄', action: () => edu?.open(EDU.TOKEN_EXCHANGE, 'why') },
    { label: 'may_act / act',    icon: '📋', action: () => edu?.open(EDU.MAY_ACT, 'what') },
    { label: 'PKCE',             icon: '🔑', action: () => edu?.open(EDU.LOGIN_FLOW, 'pkce') },
    { label: 'CIBA',             icon: '📲', action: openCiba },
    { label: 'MCP Protocol',     icon: '🔌', action: () => edu?.open(EDU.MCP_PROTOCOL, 'what') },
    { label: 'Introspection',    icon: '🔍', action: () => edu?.open(EDU.INTROSPECTION, 'why') },
    { label: 'Agent Gateway',    icon: '🌐', action: () => edu?.open(EDU.AGENT_GATEWAY, 'overview') },
    { label: 'RFC Index',        icon: '📑', action: () => edu?.open(EDU.RFC_INDEX, 'index') },
    { label: 'CIMD',             icon: '📄', action: openCimd },
  ];

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
          <span className="sidenav-brand-name">{preset.shortName}</span>
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

      {/* Learn & Explore — mirrors the Education Bar buttons across the top */}
      <div className="sidenav-group sidenav-learn">
        {!collapsed && (
          <div className="sidenav-group-label">Learn &amp; Explore</div>
        )}
        {LEARN_ITEMS.map(item => (
          <button
            key={item.label}
            type="button"
            className="sidenav-link sidenav-learn-btn"
            onClick={item.action}
            title={item.label}
          >
            <span className="sidenav-link-icon">{item.icon}</span>
            {!collapsed && (
              <span className="sidenav-link-label">{item.label}</span>
            )}
          </button>
        ))}
      </div>

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
