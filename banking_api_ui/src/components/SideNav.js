import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useEducationUIOptional } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import { useTheme } from '../context/ThemeContext';
import { 
  MdLock, MdSettings, MdSearch, MdDataUsage, 
  MdDeploy, MdBook, MdPerson, MdDescription, MdListAlt, 
  MdSwapHoriz, MdSwapCalls, MdAccountBalance, 
  MdMoneyExchange, MdPlug, MdFileText, MdSecurity, MdApps,
  MdOutlineChat, MdManageAccounts
} from 'react-icons/md';
import { 
  HiOutlineUsers, HiOutlineBarChart3
} from 'react-icons/hi';
import './SideNav.css';

const ADMIN_NAV = [
  {
    group: 'Overview',
    items: [
      { to: '/admin',        label: 'Admin Dashboard', icon: 'MdManageAccounts' },
      { to: '/agent',        label: 'AI Agent',         icon: 'MdOutlineChat' },
    ],
  },
  {
    group: 'Management',
    items: [
      { to: '/activity',     label: 'Activity Logs',   icon: 'MdListAlt' },
      { to: '/users',        label: 'Users',           icon: 'HiOutlineUsers' },
      { to: '/accounts',     label: 'Accounts',        icon: 'MdAccountBalance' },
      { to: '/admin/banking', label: 'Banking admin',   icon: 'MdAccountBalance' },
      { to: '/transactions', label: 'Transactions',    icon: 'MdSwapHoriz' },
    ],
  },
  {
    group: 'Configuration',
    items: [
      { to: '/config',             label: 'App Config',       icon: 'MdSettings' },
      { to: '/settings',           label: 'Security',         icon: 'MdLock' },
      { to: '/demo-data',          label: 'Demo Data',        icon: 'MdDataUsage' },
      { to: '/onboarding',         label: 'Setup Guide',      icon: 'MdDeploy' },
      { to: '/setup/pingone',      label: 'PingOne Ref.',     icon: 'MdBook' },
    ],
  },
  {
    group: 'User Management',
    items: [
      { to: '/self-service',       label: 'Create Account',   icon: 'MdPerson' },
    ],
  },
  {
    group: 'Developer Tools',
    items: [
      { to: '/pingone-test',       label: 'Test Page',        icon: 'MdSettings' },
      { to: '/mcp-inspector',      label: 'MCP Inspector',    icon: 'MdPlug' },
      { label: 'MCP Tracking',     icon: 'MdSwapCalls', action: 'openMcpTracking' },
      { to: '/oauth-debug-logs',   label: 'OAuth Logs',       icon: 'MdSearch' },
      { to: '/scope-audit',        label: 'Scope Audit',      icon: 'MdSecurity' },
      { to: '/client-registration',label: 'Client Reg.',      icon: 'MdFileText' },
    ],
  },
];

const USER_NAV = [
  {
    group: 'My Banking',
    items: [
      { to: '/dashboard', label: 'My Dashboard', icon: 'HiOutlineBarChart3' },
      { to: '/agent',     label: 'AI Agent',      icon: 'MdOutlineChat' },
      { to: '/demo-data', label: 'Demo config',   icon: 'MdSettings' },
      { to: '/pingone-test', label: 'Test Page',   icon: 'MdSettings' },
    ],
  },
  {
    group: 'Self Service',
    items: [
      { to: '/self-service', label: 'Create Account',   icon: 'MdPerson' },
      { to: '/accounts',     label: 'My Accounts',     icon: 'MdAccountBalance' },
      { to: '/transactions', label: 'Transfer Money', icon: 'MdMoneyExchange' },
      { to: '/profile',      label: 'Profile Settings', icon: 'MdPerson' },
      { to: '/security',     label: 'Security Center', icon: 'MdSecurity' },
    ],
  },
];

export default function SideNav({ user, onLogout }) {
  const { preset } = useIndustryBranding();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const edu = useEducationUIOptional();
  const isAdmin = user?.role === 'admin';
  const navGroups = isAdmin ? ADMIN_NAV : USER_NAV;

  // Helper function to render React Icon component from icon string name
  const renderIcon = (iconName, size = 20) => {
    const iconMap = {
      MdOutlineChat, MdListAlt, HiOutlineUsers, MdAccountBalance,
      MdSwapHoriz, MdSettings, MdLock, MdDataUsage, MdDeploy, MdBook, MdPerson,
      MdPlug, MdSearch, MdFileText, HiOutlineBarChart3, MdMoneyExchange, MdSecurity,
      MdApps, MdDescription, MdSwapCalls, MdManageAccounts
    };
    
    const IconComponent = iconMap[iconName];
    if (IconComponent) {
      return <IconComponent size={size} className="sidenav-icon" />;
    }
    return <span className="sidenav-icon">{iconName}</span>;
  };

  const handleNavAction = (action) => {
    if (action === 'runScopeAudit') {
      navigate('/scope-audit');
    } else if (action === 'openMcpTracking') {
      // Dispatch event to open MCP tracking modal
      window.dispatchEvent(new CustomEvent('open-mcp-tracking-modal'));
    }
  };

  function openCiba() {
    window.dispatchEvent(new CustomEvent('education-open-ciba', { detail: { tab: 'what' } }));
  }
  function openCimd() {
    window.dispatchEvent(new CustomEvent('education-open-cimd', { detail: { tab: 'what' } }));
  }

  const LEARN_ITEMS = [
    { label: 'Login Flow',       icon: 'MdLock', action: () => edu?.open(EDU.LOGIN_FLOW, 'what') },
    { label: 'Token Exchange',   icon: 'MdSwapHoriz', action: () => edu?.open(EDU.TOKEN_EXCHANGE, 'why') },
    { label: 'may_act / act',    icon: 'MdListAlt', action: () => edu?.open(EDU.MAY_ACT, 'what') },
    { label: 'PKCE',             icon: 'MdLock', action: () => edu?.open(EDU.LOGIN_FLOW, 'pkce') },
    { label: 'CIBA',             icon: 'MdPlug', action: openCiba },
    { label: 'MCP Protocol',     icon: 'MdPlug', action: () => edu?.open(EDU.MCP_PROTOCOL, 'what') },
    { label: 'Introspection',    icon: 'MdSearch', action: () => edu?.open(EDU.INTROSPECTION, 'why') },
    { label: 'Agent Gateway',    icon: 'MdApps', action: () => edu?.open(EDU.AGENT_GATEWAY, 'overview') },
    { label: 'RFC Index',        icon: 'MdFileText', action: () => edu?.open(EDU.RFC_INDEX, 'index') },
    { label: 'CIMD',             icon: 'MdDescription', action: openCimd },
    { label: '⭐ IETF Standards', icon: 'MdBook', action: () => edu?.open(EDU.IETF_STANDARDS, 'overview') },
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
            {group.items.map((item, idx) => {
              // Action button item
              if (item.action) {
                return (
                  <button
                    key={`${item.action}-${idx}`}
                    type="button"
                    className="sidenav-link sidenav-action-btn"
                    onClick={() => handleNavAction(item.action)}
                    title={collapsed ? item.label : undefined}
                  >
                    {renderIcon(item.icon)}
                    {!collapsed && (
                      <span className="sidenav-link-label">{item.label}</span>
                    )}
                  </button>
                );
              }
              // Regular link item
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/admin' || item.to === '/dashboard'}
                  className={({ isActive }) =>
                    `sidenav-link${isActive ? ' sidenav-link--active' : ''}`
                  }
                  title={collapsed ? item.label : undefined}
                >
                  {renderIcon(item.icon)}
                  {!collapsed && (
                    <span className="sidenav-link-label">{item.label}</span>
                  )}
                </NavLink>
              );
            })}
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
            {renderIcon(item.icon)}
            {!collapsed && (
              <span className="sidenav-link-label">{item.label}</span>
            )}
          </button>
        ))}
      </div>

      {/* Footer: theme toggle + logout */}
      <div className="sidenav-footer">
        {/* Theme toggle — global, persists across pages */}
        <button
          type="button"
          className="sidenav-link sidenav-theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle dark mode"
        >
          <span className="sidenav-link-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
          {!collapsed && (
            <span className="sidenav-link-label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          )}
        </button>
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
