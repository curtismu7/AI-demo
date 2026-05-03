// banking_api_ui/src/components/Configuration/UnifiedConfigurationPage.tsx
import React, { type FC, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { notifySuccess, notifyError } from '../../utils/appToast';
import { savePublicConfig, loadPublicConfig } from '../../services/configService';
import { useAgentUiMode } from '../../context/AgentUiModeContext';
import { useEducationUI } from '../../context/EducationUIContext';
import { useIndustryBranding } from '../../context/IndustryBrandingContext';
import { useTheme } from '../../context/ThemeContext';
import './UnifiedConfigurationPage.css';
import { MCPToolsEducation } from '../MCPToolsEducation';
import DemoSetupPanel from '../DemoSetupPanel';
import OllamaPanel from '../OllamaPanel';
import HelixPanel from '../HelixPanel';

// Configuration tab definitions
const CONFIGURATION_TABS = [
  {
    id: 'quick-start',
    label: 'Quick Start',
    icon: '🚀',
    description: 'Minimum setup to run the demo — PingOne region, environment ID, and branding',
    requiresAuth: false,
    sections: ['pingone-basics', 'demo-data-setup', 'industry-branding']
  },
  {
    id: 'pingone-config',
    label: 'PingOne Setup',
    icon: '🛡️',
    description: 'OAuth clients, MFA policies, and token exchange — the full PingOne wiring',
    requiresAuth: true,
    requiredRole: 'admin',
    sections: ['pingone-connection', 'oauth-flows', 'mfa-settings', 'token-exchange']
  },
  {
    id: 'demo-management',
    label: 'Demo Data',
    icon: '🗄️',
    description: 'Sample accounts, transactions, and demo presets — no PingOne credentials needed',
    requiresAuth: false,
    sections: ['demo-setup']
  },
  {
    id: 'llm-ollama',
    label: 'Ollama Setup',
    icon: '🤖',
    description: 'Local LLM inference with Ollama — fallback for natural language intent parsing',
    requiresAuth: false,
    sections: ['ollama-setup']
  },
  {
    id: 'llm-helix',
    label: 'Helix Setup',
    icon: '🧠',
    description: 'Cloud-based LLM with Helix — alternative to local inference',
    requiresAuth: false,
    sections: ['helix-setup']
  },
  {
    id: 'agent-configuration',
    label: 'Agent Settings',
    icon: '🤖',
    description: 'AI agent chat mode, MCP tool scopes, education panels, and token chain display',
    requiresAuth: true,
    sections: ['agent-ui-mode', 'mcp-scopes', 'mcp-tools', 'education-settings', 'token-chain']
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: '⚙️',
    description: 'Debug logging, log category filters, and RSA keypair generation',
    requiresAuth: true,
    requiredRole: 'admin',
    sections: ['debug-settings', 'api-keys']
  },
  {
    id: 'idp-setup',
    label: 'IDP Setup',
    icon: '🏛',
    description: 'Read-only reference — PingOne endpoints and registered OAuth client IDs',
    requiresAuth: true,
    requiredRole: 'admin',
    sections: ['idp-setup-guide', 'idp-overview', 'idp-clients']
  },
  {
    id: 'feature-flags',
    label: 'Feature Flags',
    icon: '🚩',
    description: 'Enable or disable experimental features — changes take effect immediately',
    requiresAuth: true,
    requiredRole: 'admin',
    sections: ['feature-flags']
  }
];

// Feature flag shape returned by /api/admin/feature-flags
interface FeatureFlag {
  id: string;
  name: string;
  category: string;
  description: string;
  impact: string;
  value: boolean;
}

// Flat configuration state
interface ConfigurationState {
  // PingOne connection
  pingoneRegion: string;
  pingoneEnvironmentId: string;
  // OAuth clients
  adminClientId: string;
  adminClientSecret: string;
  adminAuthMethod: string;
  adminRedirectUri: string;
  userClientId: string;
  userClientSecret: string;
  userRedirectUri: string;
  // MFA
  mfaPolicyId: string;
  mfaStepUpThreshold: number;
  agentTransactionCountLimit: number;
  agentTransactionValueLimit: number;
  cibaEnabled: boolean;
  // Token Exchange / MCP
  mcpServerUrl: string;
  mcpResourceUri: string;
  workerClientId: string;
  workerAuthMethod: string;
  // Quick start
  demoScenario: string;
  industryId: string;
  agentUiMode: string;
  // Agent configuration
  mcpScopes: string;
  showEducationPanel: boolean;
  maxTokenChainHistory: number;
  enableTokenChainDisplay: boolean;
  // Demo management
  accountCount: number;
  transactionPreset: string;
  agentMode: string;
  // Advanced
  vercelDeployUrl: string;
  workerClientSecret: string;
  logLevel: string;
  debugShowTokenDetails: boolean;
  debugShowApiCalls: boolean;
  logFilterCategories: string;
  keypairStatus: 'idle' | 'generating' | 'success' | 'error';
  keypairMessage: string;
  generatedPublicKey: string;
  // Secret show/hide map
  showSecrets: Record<string, boolean>;
  // Test connection state
  connectionTestStatus: 'idle' | 'testing' | 'success' | 'error';
  connectionTestMessage: string;
  // UI state
  activeSection: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

const getDefaultState = (): ConfigurationState => ({
  pingoneRegion: 'com',
  pingoneEnvironmentId: '',
  adminClientId: '',
  adminClientSecret: '',
  adminAuthMethod: 'client_secret_basic',
  adminRedirectUri: '',
  userClientId: '',
  userClientSecret: '',
  userRedirectUri: '',
  mfaPolicyId: '',
  mfaStepUpThreshold: 500,
  agentTransactionCountLimit: 3,
  agentTransactionValueLimit: 5000,
  cibaEnabled: false,
  mcpServerUrl: '',
  mcpResourceUri: '',
  workerClientId: '',
  workerAuthMethod: 'client_secret_basic',
  demoScenario: 'default',
  industryId: 'banking',
  agentUiMode: 'standard',
  mcpScopes: 'openid\nprofile\nemail\np1:read:user\nbankingapi',
  showEducationPanel: true,
  maxTokenChainHistory: 10,
  enableTokenChainDisplay: true,
  accountCount: 3,
  transactionPreset: 'standard',
  agentMode: 'hitl',
  vercelDeployUrl: '',
  workerClientSecret: '',
  logLevel: 'info',
  debugShowTokenDetails: false,
  debugShowApiCalls: false,
  logFilterCategories: '',
  keypairStatus: 'idle',
  keypairMessage: '',
  generatedPublicKey: '',
  showSecrets: {},
  connectionTestStatus: 'idle',
  connectionTestMessage: '',
  activeSection: 'pingone-basics',
  saveStatus: 'idle',
});

// Inline form helper components

const CfgField: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  help?: string;
  placeholder?: string;
  disabled?: boolean;
}> = ({ label, value, onChange, type = 'text', help, placeholder, disabled }) => (
  <div className="form-group">
    <div className="form-label">{label}</div>
    <input
      type={type}
      className="form-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
    {help && <p className="cfg-field-help">{help}</p>}
  </div>
);

const CfgSecretField: FC<{
  label: string;
  fieldKey: string;
  value: string;
  showSecrets: Record<string, boolean>;
  onToggle: (key: string) => void;
  onChange: (v: string) => void;
  help?: string;
}> = ({ label, fieldKey, value, showSecrets, onToggle, onChange, help }) => (
  <div className="form-group">
    <div className="form-label">{label}</div>
    <div className="cfg-secret-wrap">
      <input
        type={showSecrets[fieldKey] ? 'text' : 'password'}
        className="form-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={value ? '••••••••' : 'Not set'}
        autoComplete="new-password"
      />
      <button
        type="button"
        className="cfg-secret-toggle"
        onClick={() => onToggle(fieldKey)}
        aria-label={showSecrets[fieldKey] ? 'Hide' : 'Show'}
      >
        {showSecrets[fieldKey] ? '🙈' : '👁'}
      </button>
    </div>
    {help && <p className="cfg-field-help">{help}</p>}
  </div>
);

const CfgSelect: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  help?: string;
}> = ({ label, value, onChange, options, help }) => (
  <div className="form-group">
    <div className="form-label">{label}</div>
    <select className="form-input" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {help && <p className="cfg-field-help">{help}</p>}
  </div>
);

const CfgToggle: FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}> = ({ label, checked, onChange, help }) => (
  <div className="form-group cfg-toggle-row">
    <label className="cfg-toggle-label">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="cfg-toggle-input"
      />
      <span className="cfg-toggle-text">{label}</span>
    </label>
    {help && <p className="cfg-field-help">{help}</p>}
  </div>
);

// Static sub-components

const ConfigurationHeader: FC<{
  title: string;
  subtitle: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onSave: () => void;
  onReset: () => void;
  onThemeToggle?: () => void;
  theme?: string;
}> = ({ title, subtitle, saveStatus, onSave, onReset, onThemeToggle, theme }) => (
  <header className="configuration-header">
    <div className="configuration-header__content">
      <div className="configuration-header__text">
        <h1 className="configuration-header__title">{title}</h1>
        <p className="configuration-header__subtitle">{subtitle}</p>
      </div>
      <div className="configuration-header__actions">
        {onThemeToggle && (
          <button
            type="button"
            onClick={onThemeToggle}
            className="configuration-header__btn configuration-header__btn--theme"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className="configuration-header__btn configuration-header__btn--secondary"
          disabled={saveStatus === 'saving'}
        >
          Reset to Defaults
        </button>
        <button
          type="button"
          onClick={onSave}
          className={`configuration-header__btn configuration-header__btn--primary ${saveStatus}`}
          disabled={saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? 'Saving...' :
           saveStatus === 'saved' ? 'Saved!' :
           saveStatus === 'error' ? 'Error - Retry' : 'Save Changes'}
        </button>
      </div>
    </div>
    {saveStatus === 'error' && (
      <div className="configuration-header__error">
        Failed to save configuration. Please try again.
      </div>
    )}
  </header>
);

const ConfigurationTabs: FC<{
  tabs: typeof CONFIGURATION_TABS;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}> = ({ tabs, activeTab, onTabChange }) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const idx = tabs.findIndex(t => t.id === activeTab);
    if (e.key === 'ArrowRight') { onTabChange(tabs[(idx + 1) % tabs.length].id); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { onTabChange(tabs[(idx - 1 + tabs.length) % tabs.length].id); e.preventDefault(); }
    else if (e.key === 'Home') { onTabChange(tabs[0].id); e.preventDefault(); }
    else if (e.key === 'End') { onTabChange(tabs[tabs.length - 1].id); e.preventDefault(); }
  };
  return (
    <nav className="configuration-tabs" role="tablist" onKeyDown={handleKeyDown}>
      {tabs.map(tab => (
        <button
          type="button"
          key={tab.id}
          className={`configuration-tab configuration-tab--${tab.id} ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

const SectionNavigation: FC<{
  sections: string[];
  activeSection: string;
  onSectionChange: (section: string) => void;
}> = ({ sections, activeSection, onSectionChange }) => {
  const sectionTitles: Record<string, string> = {
    'pingone-basics': 'PingOne Basics',
    'demo-data-setup': 'Demo Data Setup',
    'industry-branding': 'Industry Branding',
    'pingone-connection': 'Connection Settings',
    'oauth-flows': 'OAuth Flows',
    'mfa-settings': 'Multi-Factor Authentication',
    'token-exchange': 'Token Exchange',
    'demo-scenarios': 'Demo Scenarios',
    'account-setup': 'Account Setup',
    'transaction-data': 'Transaction Data',
    'agent-modes': 'Agent Modes',
    'agent-ui-mode': 'Agent UI Mode',
    'mcp-scopes': 'MCP Scopes',
    'mcp-tools': 'MCP Tools',
    'education-settings': 'Education Settings',
    'token-chain': 'Token Chain',
    'worker-app': 'Worker Application',
    'debug-settings': 'Debug Settings',
    'api-keys': 'API Keys',
    'idp-setup-guide': 'Setup Guide',
    'idp-overview': 'Environment & Endpoints',
    'idp-clients': 'OAuth Clients',
    'feature-flags': 'Feature Flags'
  };

  return (
    <nav className="section-navigation">
      <h3 className="section-navigation__title">Sections</h3>
      <ul className="section-navigation__list">
        {sections.map(section => (
          <li key={section}>
            <button
              type="button"
              className={`section-nav-item ${activeSection === section ? 'active' : ''}`}
              onClick={() => onSectionChange(section)}
            >
              {sectionTitles[section] || section}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

// ── ScopeTable component ─────────────────────────────────────────────────────
const KNOWN_SCOPES: { scope: string; description: string; category: string }[] = [
  // OIDC
  { scope: 'openid',        description: 'Required for OIDC — enables id_token issuance',    category: 'OIDC' },
  { scope: 'profile',       description: 'User display name, locale, and picture',            category: 'OIDC' },
  { scope: 'email',         description: 'Email address and verification status',             category: 'OIDC' },
  { scope: 'address',       description: 'Physical address claim',                            category: 'OIDC' },
  { scope: 'phone',         description: 'Phone number claim',                                category: 'OIDC' },
  // PingOne
  { scope: 'p1:read:user',          description: 'Read PingOne user profile and attributes',  category: 'PingOne' },
  { scope: 'p1:update:user',        description: 'Update PingOne user attributes',            category: 'PingOne' },
  { scope: 'p1:read:userPassword',  description: 'Read password policy constraints',          category: 'PingOne' },
  { scope: 'p1:read:sessions',      description: 'Read active user sessions',                 category: 'PingOne' },
  // Banking API — flattened scope model
  { scope: 'banking:read',                 description: 'Read accounts, balances, and transactions',    category: 'Banking' },
  { scope: 'banking:write',               description: 'Submit transactions, transfers, and updates',   category: 'Banking' },
  { scope: 'banking:sensitive',            description: 'Access sensitive data (account numbers, PII)', category: 'Banking' },
  { scope: 'banking:admin',               description: 'Admin-level banking operations',                category: 'Banking' },
  { scope: 'banking:agent:invoke',         description: 'Authorize AI agent to act on behalf of user',  category: 'Banking' },
  { scope: 'banking:mcp:invoke',          description: 'Invoke MCP tools through the MCP gateway',      category: 'Banking' },
  { scope: 'transfer:execute',            description: 'Execute fund transfers',                         category: 'Banking' },
];

const ScopeTable: FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [newScope, setNewScope] = useState('');
  const activeSet = useMemo(
    () => new Set(value.split(/\s+/).map(s => s.trim()).filter(Boolean)),
    [value]
  );


  const toggle = (scope: string) => {
    const next = new Set(activeSet);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    onChange(Array.from(next).join('\n'));
  };

  const addCustom = () => {
    const trimmed = newScope.trim();
    if (!trimmed) return;
    const next = new Set(activeSet);
    next.add(trimmed);
    onChange(Array.from(next).join('\n'));
    setNewScope('');
  };

  const removeCustom = (scope: string) => {
    const next = new Set(activeSet);
    next.delete(scope);
    onChange(Array.from(next).join('\n'));
  };

  const categories = Array.from(new Set(KNOWN_SCOPES.map(s => s.category)));
  const knownScopeNames = new Set(KNOWN_SCOPES.map(s => s.scope));
  const customScopes = Array.from(activeSet).filter(s => !knownScopeNames.has(s));

  return (
    <div className="scope-table-wrap">
      <p className="cfg-field-help" style={{ marginBottom: '0.75rem' }}>
        Check scopes to include in the RFC 8693 token exchange request. PingOne only grants scopes that are also configured on the MCP Token Exchanger application — unchecked or unrecognised scopes are silently ignored.
      </p>
      {categories.map(cat => (
        <div key={cat} className="scope-cat-group">
          <div className="scope-cat-title">{cat}</div>
          <table className="scope-table">
            <thead>
              <tr>
                <th className="scope-th-check">Enabled</th>
                <th className="scope-th-name">Scope</th>
                <th className="scope-th-desc">Description</th>
              </tr>
            </thead>
            <tbody>
              {KNOWN_SCOPES.filter(s => s.category === cat).map(s => (
                <tr key={s.scope} className={activeSet.has(s.scope) ? 'scope-row scope-row--on' : 'scope-row'}>
                  <td className="scope-td-check">
                    <input
                      type="checkbox"
                      checked={activeSet.has(s.scope)}
                      onChange={() => toggle(s.scope)}
                      className="scope-checkbox"
                    />
                  </td>
                  <td className="scope-td-name"><code className="scope-code">{s.scope}</code></td>
                  <td className="scope-td-desc">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {customScopes.length > 0 && (
        <div className="scope-cat-group">
          <div className="scope-cat-title">Custom</div>
          <table className="scope-table">
            <thead>
              <tr>
                <th className="scope-th-check">Enabled</th>
                <th className="scope-th-name">Scope</th>
                <th className="scope-th-desc">Action</th>
              </tr>
            </thead>
            <tbody>
              {customScopes.map(s => (
                <tr key={s} className="scope-row scope-row--on scope-row--custom">
                  <td className="scope-td-check">
                    <input type="checkbox" checked readOnly className="scope-checkbox" />
                  </td>
                  <td className="scope-td-name"><code className="scope-code">{s}</code></td>
                  <td className="scope-td-desc">
                    <button type="button" className="scope-remove-btn" onClick={() => removeCustom(s)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="scope-add-row">
        <input
          type="text"
          className="form-input scope-add-input"
          value={newScope}
          onChange={e => setNewScope(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="custom:scope"
          spellCheck={false}
        />
        <button type="button" className="btn btn-secondary scope-add-btn" onClick={addCustom} disabled={!newScope.trim()}>
          + Add Scope
        </button>
      </div>
    </div>
  );
};

// ── IdpSetupGuide component ──────────────────────────────────────────────────

const IdpSetupGuide: FC<{
  pingoneRegion: string;
  pingoneEnvironmentId: string;
  adminRedirectUri: string;
  userRedirectUri: string;
  mcpResourceUri: string;
  adminClientId: string;
  userClientId: string;
  workerClientId: string;
  copyToClipboard: (value: string, label: string) => void;
}> = ({ pingoneRegion, pingoneEnvironmentId, adminRedirectUri, userRedirectUri, mcpResourceUri, adminClientId, userClientId, workerClientId, copyToClipboard }) => {
  const [activeTab, setActiveTab] = React.useState<string>('overview');

  const base        = pingoneRegion ? `https://auth.pingone.${pingoneRegion}` : 'https://auth.pingone.com';
  const envId       = pingoneEnvironmentId || '<your-environment-id>';
  const adminRedir  = adminRedirectUri  || `${window.location.origin}/api/auth/oauth/admin/callback`;
  const userRedir   = userRedirectUri   || `${window.location.origin}/api/auth/oauth/user/callback`;
  const mcpAud      = mcpResourceUri    || '<mcp-server-public-url>';

  const tabs = [
    { id: 'overview',   label: '📋 Overview & Checklist' },
    { id: 'apps',       label: '🔑 Applications' },
    { id: 'redirects',  label: '↩ Redirect URIs' },
    { id: 'resources',  label: '🗂 Resources & Scopes' },
    { id: 'endpoints',  label: '🌐 OAuth Endpoints' },
  ];

  const ValueRow = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <div className="idp-setup-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
        <span className="idp-setup-label">{label}</span>
        <span className="idp-setup-value">{value}</span>
        {value && !value.startsWith('<') && (
          <button type="button" className="idp-copy-btn" onClick={() => copyToClipboard(value, label)}>⎘ Copy</button>
        )}
      </div>
      {hint && <span style={{ fontSize: 11, color: '#6b7280', paddingLeft: 8 }}>{hint}</span>}
    </div>
  );

  const ScopeChip = ({ scope }: { scope: string }) => (
    <code style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 3, padding: '2px 6px', fontSize: 12, marginRight: 4, display: 'inline-block', marginBottom: 3 }}>{scope}</code>
  );

  const AppCard = ({ num, title, type, grant, redirectUri, scopes, configKey, notes }: {
    num: string; title: string; type: string; grant: string; redirectUri?: string;
    scopes: string[]; configKey: string; notes: string;
  }) => (
    <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 14 }}>{num}. {title}</span>
        <span style={{ fontSize: 11, fontWeight: 600, background: '#ede9fe', color: '#4338ca', borderRadius: 4, padding: '2px 7px' }}>{type}</span>
        <span style={{ fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '2px 7px' }}>{grant}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {redirectUri && (
            <tr>
              <td style={{ width: 140, fontWeight: 600, color: '#6b7280', paddingBottom: 6, verticalAlign: 'top' }}>Redirect URI</td>
              <td style={{ paddingBottom: 6 }}><code style={{ background: '#f3f4f6', borderRadius: 3, padding: '2px 6px', fontSize: 12 }}>{redirectUri}</code></td>
            </tr>
          )}
          <tr>
            <td style={{ width: 140, fontWeight: 600, color: '#6b7280', paddingBottom: 6, verticalAlign: 'top' }}>Scopes</td>
            <td style={{ paddingBottom: 6 }}>{scopes.map(s => <ScopeChip key={s} scope={s} />)}</td>
          </tr>
          <tr>
            <td style={{ width: 140, fontWeight: 600, color: '#6b7280', paddingBottom: 6, verticalAlign: 'top' }}>Config field</td>
            <td style={{ paddingBottom: 6 }}><code style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 3, padding: '2px 6px', fontSize: 12 }}>{configKey}</code></td>
          </tr>
        </tbody>
      </table>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{notes}</p>
    </div>
  );

  return (
    <div>
      {/* Internal tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 14px', border: 'none', borderBottom: `2px solid ${activeTab === t.id ? '#4f46e5' : 'transparent'}`,
              marginBottom: -2, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? '#4f46e5' : '#6b7280', whiteSpace: 'nowrap',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Overview & Checklist */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#1e3a5f', lineHeight: 1.7 }}>
              <strong>What is this tab?</strong> The IDP Setup tab is a reference for configuring PingOne as the identity provider for this app.
              It shows the OAuth endpoints computed from your Environment ID, the redirect URIs to register in PingOne, the scopes each application needs,
              and which config fields map to which PingOne objects. Share this with whoever sets up the PingOne tenant — it has everything they need.
            </p>
          </div>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: '0 0 4px' }}>What you need to create in PingOne</h4>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>Four applications and one custom resource are required. Use the tabs above for the exact values.</p>
          <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 8, padding: '12px 16px', fontSize: 13, lineHeight: 2.0 }}>
            <div>☐ PingOne region + Environment ID entered in <strong>PingOne Config</strong> tab → <button type="button" style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }} onClick={() => setActiveTab('endpoints')}>view endpoints →</button></div>
            <div>☐ <strong>Admin Web App</strong> created in PingOne → Client ID + Redirect URI saved → <button type="button" style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }} onClick={() => setActiveTab('apps')}>see details →</button></div>
            <div>☐ <strong>Customer Web App</strong> created in PingOne → Client ID + Redirect URI saved</div>
            <div>☐ <strong>Worker App</strong> created in PingOne → Client ID + Secret saved</div>
            <div>☐ <strong>AI Agent App</strong> created in PingOne → Client ID + Secret set in <code style={{ fontSize: 12, background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>.env</code></div>
            <div>☐ <strong>MCP Server Resource</strong> created with 3 scopes → URI saved → <button type="button" style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }} onClick={() => setActiveTab('resources')}>see details →</button></div>
            <div>☐ Redirect URIs registered in each PingOne app → <button type="button" style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }} onClick={() => setActiveTab('redirects')}>copy URIs →</button></div>
            <div>☐ <code style={{ fontSize: 12, background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>banking:*</code> scopes assigned to Customer App + AI Agent App</div>
            <div>☐ Test Connection passes on PingOne Config tab</div>
            <div>☐ Admin login works at <strong>/admin</strong> &nbsp;·&nbsp; User login works at <strong>/</strong></div>
          </div>
        </div>
      )}

      {/* Applications */}
      {activeTab === 'apps' && (
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
            Create these in PingOne Admin Console → <strong>Applications → Applications → + Add Application</strong>.
            After creating each, copy the Client ID into the corresponding field in the <strong>PingOne Config</strong> tab.
          </p>
          <AppCard
            num="1" title="Admin Web Application" type="Web Application" grant="Authorization Code"
            redirectUri={adminRedir}
            scopes={['openid', 'profile', 'email']}
            configKey="Admin Client ID / Admin Redirect URI"
            notes="Used for admin login at /admin. Token endpoint auth method: Client Secret Basic. Client Secret is required — save it in Admin Client Secret on the PingOne Config tab."
          />
          <AppCard
            num="2" title="Customer Web Application" type="Web Application" grant="Authorization Code + PKCE"
            redirectUri={userRedir}
            scopes={['openid', 'profile', 'email', 'banking:read', 'banking:write', 'banking:mcp:invoke']}
            configKey="User Client ID / User Redirect URI"
            notes="Used for end-user banking login at /. No client secret needed — PKCE only. Assign the banking:* scopes after creating the MCP Server Resource (see Resources & Scopes tab)."
          />
          <AppCard
            num="3" title="Worker Application" type="Worker" grant="Client Credentials"
            scopes={['(none — uses Management API roles)']}
            configKey="Worker Client ID + Secret"
            notes="Needed for the BFF to call PingOne Management API: user provisioning, MFA enrollment, group lookup. In PingOne: Roles tab → assign Identity Data Admin + Environment Admin. Copy Client ID + Secret into the Worker App section on PingOne Config tab."
          />
          <AppCard
            num="4" title="AI Agent App (Token Exchange)" type="Worker / AI Agent" grant="Client Credentials"
            scopes={['banking:read', 'banking:write', 'banking:mcp:invoke']}
            configKey="PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID + SECRET in .env"
            notes="Used by the BFF to exchange user tokens for narrowly-scoped MCP tokens (RFC 8693 delegation). Token endpoint auth method must be Client Secret POST. Set PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID and PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET in your .env file. Use type AI_AGENT in PingOne if available."
          />
        </div>
      )}

      {/* Redirect URIs */}
      {activeTab === 'redirects' && (
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
            Copy these exact URLs into the <strong>Redirect URIs</strong> field of each PingOne application.
            They must match character-for-character — PingOne rejects any URI not on the allowlist.
          </p>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>Admin Web Application</h4>
          <div style={{ marginBottom: 16 }}>
            <ValueRow label="Redirect URI" value={adminRedir} hint="PingOne → Admin App → Configuration → Redirect URIs → add this value" />
          </div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>Customer Web Application</h4>
          <div style={{ marginBottom: 16 }}>
            <ValueRow label="Redirect URI" value={userRedir} hint="PingOne → Customer App → Configuration → Redirect URIs → add this value" />
          </div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>Worker &amp; AI Agent Apps</h4>
          <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#6b7280' }}>
            No redirect URIs needed — these apps use Client Credentials (machine-to-machine) and never redirect a browser.
          </div>
          {adminClientId || userClientId || workerClientId ? (
            <>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '16px 0 8px' }}>Registered Client IDs (reference)</h4>
              <div>
                {adminClientId  && <ValueRow label="Admin Client ID"  value={adminClientId}  />}
                {userClientId   && <ValueRow label="User Client ID"   value={userClientId}   />}
                {workerClientId && <ValueRow label="Worker Client ID" value={workerClientId} />}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Resources & Scopes */}
      {activeTab === 'resources' && (
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
            Create this custom resource in PingOne Admin Console → <strong>Applications → Resources → + Add Resource</strong>.
            The audience URI becomes the token <code style={{ fontSize: 12, background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>aud</code> claim — it must match the public URL of your MCP server exactly.
          </p>
          <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 14 }}>MCP Server Resource</span>
              <span style={{ fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e', borderRadius: 4, padding: '2px 7px' }}>Custom Resource</span>
            </div>
            <ValueRow label="Audience (URI)" value={mcpAud} hint="This becomes the aud claim in MCP tokens. Must match PINGONE_RESOURCE_MCP_SERVER_URI in .env and the MCP Resource URI field." />
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>Scopes to create on this resource:</span>
              <div style={{ marginTop: 6 }}>
                {[
                  { scope: 'banking:read',        desc: 'Read account balances and transaction history' },
                  { scope: 'banking:write',        desc: 'Initiate transfers and payment actions' },
                  { scope: 'banking:mcp:invoke',   desc: 'Invoke MCP tools via the AI agent (required for token exchange)' },
                ].map(({ scope, desc }) => (
                  <div key={scope} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <ScopeChip scope={scope} />
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{desc}</span>
                    <button type="button" className="idp-copy-btn" onClick={() => copyToClipboard(scope, scope)}>⎘ Copy</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#78350f' }}>
            <strong>After creating the resource:</strong> Go to each of these apps and assign all three scopes:
            <ul style={{ margin: '6px 0 0 18px', lineHeight: 1.8 }}>
              <li>Customer Web Application (so users can consent to banking:* access)</li>
              <li>AI Agent App (so it can request banking:* during token exchange)</li>
            </ul>
          </div>
        </div>
      )}

      {/* OAuth Endpoints */}
      {activeTab === 'endpoints' && (
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
            These are computed automatically from your PingOne region and environment ID.
            You don't need to enter them manually — they're provided here for reference and troubleshooting.
          </p>
          {!pingoneEnvironmentId && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#856404', marginBottom: 16 }}>
              ⚠ Environment ID not set — endpoints shown with placeholder. Configure it in the <strong>PingOne Config</strong> tab first.
            </div>
          )}
          <div>
            {[
              { label: 'Authorization Endpoint', value: `${base}/${envId}/as/authorize`,    hint: 'Starts the PKCE / auth-code login flow' },
              { label: 'Token Endpoint',          value: `${base}/${envId}/as/token`,        hint: 'Exchanges auth codes and refresh tokens for access tokens' },
              { label: 'Introspection Endpoint',  value: `${base}/${envId}/as/introspect`,   hint: 'Used by the MCP gateway to validate bearer tokens' },
              { label: 'JWKS URI',                value: `${base}/${envId}/as/jwks`,         hint: 'Public keys for JWT signature verification' },
              { label: 'Userinfo Endpoint',       value: `${base}/${envId}/as/userinfo`,     hint: 'Returns claims for the authenticated user' },
              { label: 'OIDC Discovery',          value: `${base}/${envId}/as/.well-known/openid-configuration`, hint: 'Full OIDC metadata document' },
            ].map(({ label, value, hint }) => (
              <ValueRow key={label} label={label} value={value} hint={hint} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Main Component

const UnifiedConfigurationPage: FC<{
  user: unknown;
  onLogout: () => void;
}> = ({ user }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = useState<ConfigurationState>(getDefaultState);
  const [activeTab, setActiveTab] = useState('quick-start');
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [flagSearch, setFlagSearch] = useState("");

  const { placement: ctxAgentUiMode, setAgentUi } = useAgentUiMode();
  useEducationUI();
  const { industryId: ctxIndustryId, applyIndustryId } = useIndustryBranding();
  const { theme, toggleTheme } = useTheme();
  const isAdminUser = (user as { role?: string } | null)?.role === 'admin';

  // Load config
  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        const publicConfig = await loadPublicConfig();
        const cfg = publicConfig as Record<string, unknown>;
        setState(prevState => ({
          ...prevState,
          pingoneRegion: (cfg.pingone_region as string) || 'com',
          pingoneEnvironmentId: (cfg.pingone_environment_id as string) || '',
          adminClientId: (cfg.admin_client_id as string) || '',
          adminClientSecret: (cfg.admin_client_secret as string) || '',
          adminAuthMethod: (cfg.admin_token_endpoint_auth_method as string) || 'client_secret_basic',
          adminRedirectUri: (cfg.admin_redirect_uri as string) || '',
          userClientId: (cfg.user_client_id as string) || '',
          userClientSecret: (cfg.user_client_secret as string) || '',
          userRedirectUri: (cfg.user_redirect_uri as string) || '',
          mfaPolicyId: (cfg.pingone_mfa_policy_id as string) || '',
          mfaStepUpThreshold: Number(cfg.step_up_amount_threshold ?? cfg.mfa_step_up_threshold) || 500,
          agentTransactionCountLimit: Number(cfg.agent_transaction_count_limit) || 3,
          agentTransactionValueLimit: Number(cfg.agent_transaction_value_limit) || 5000,
          cibaEnabled: !!cfg.ciba_enabled,
          mcpServerUrl: (cfg.mcp_server_url as string) || '',
          mcpResourceUri: (cfg.mcp_resource_uri as string) || '',
          workerClientId: (cfg.authorize_worker_client_id as string) || '',
          workerAuthMethod: (cfg.pingone_admin_token_endpoint_auth_method as string) || 'client_secret_basic',
          demoScenario: (cfg.demo_scenario as string) || 'default',
          industryId: (cfg.industry_id as string) || ctxIndustryId || 'banking',
          agentUiMode: (cfg.agent_ui_mode as string) || ctxAgentUiMode || 'standard',
          mcpScopes: (cfg.agent_mcp_allowed_scopes as string) || 'openid\nprofile',
          showEducationPanel: cfg.show_education_panel !== false,
          maxTokenChainHistory: Number(cfg.max_token_chain_history) || 10,
          enableTokenChainDisplay: cfg.enable_token_chain_display !== false,
          accountCount: Number(cfg.demo_account_count) || 3,
          transactionPreset: (cfg.transaction_preset as string) || 'standard',
          agentMode: (cfg.agent_mode as string) || 'hitl',
          vercelDeployUrl: (cfg.vercel_deploy_url as string) || '',
          workerClientSecret: (cfg.authorize_worker_client_secret as string) || '',
          logLevel: (cfg.log_level as string) || 'info',
          debugShowTokenDetails: cfg.debug_show_token_details === true || cfg.debug_show_token_details === 'true',
          debugShowApiCalls: cfg.debug_show_api_calls === true || cfg.debug_show_api_calls === 'true',
          logFilterCategories: (cfg.log_filter_categories as string) || '',
        }));

        if (isAdminUser) {
          try {
            const settingsRes = await fetch('/api/admin/settings', {
              method: 'GET',
              credentials: 'include',
            });
            if (settingsRes.ok) {
              const settingsData = await settingsRes.json() as {
                settings?: {
                  stepUpAmountThreshold?: number;
                  agentTransactionCountLimit?: number;
                  agentTransactionValueLimit?: number;
                };
              };
              const s = settingsData.settings;
              if (s) {
                setState(prevState => ({
                  ...prevState,
                  mfaStepUpThreshold: Number(s.stepUpAmountThreshold) || prevState.mfaStepUpThreshold,
                  agentTransactionCountLimit: Number(s.agentTransactionCountLimit) || 0,
                  agentTransactionValueLimit: Number(s.agentTransactionValueLimit) || 0,
                }));
              }
            }
          } catch (_settingsError) {
            // Non-fatal: keep config-page values even if runtime settings API is unavailable.
          }
        }
      } catch (error) {
        console.error('Failed to load configuration:', error);
      }
    };
    loadConfiguration();
  }, [ctxAgentUiMode, ctxIndustryId, isAdminUser]);

  // Handle initial tab from URL params
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && CONFIGURATION_TABS.find(tab => tab.id === tabParam)) {
      setActiveTab(tabParam);
      const tab = CONFIGURATION_TABS.find(t => t.id === tabParam);
      if (tab && tab.sections.length > 0) {
        setState(prev => ({ ...prev, activeSection: tab.sections[0] }));
      }
    }
  }, [searchParams]);

  // Load fresh PingOne config when IDP Setup tab is accessed
  useEffect(() => {
    if (activeTab === 'idp-setup' && isAdminUser) {
      const loadIdpConfig = async () => {
        try {
          const res = await fetch('/api/admin/config', { credentials: 'include' });
          if (res.ok) {
            const data = await res.json() as { config?: Record<string, unknown> };
            const cfg = data.config || {};
            setState(prev => ({
              ...prev,
              pingoneRegion: (cfg.pingone_region as string) || 'com',
              pingoneEnvironmentId: (cfg.pingone_environment_id as string) || '',
              adminClientId: (cfg.admin_client_id as string) || '',
              userClientId: (cfg.user_client_id as string) || '',
              workerClientId: (cfg.authorize_worker_client_id as string) || '',
              adminRedirectUri: (cfg.admin_redirect_uri as string) || '',
              userRedirectUri: (cfg.user_redirect_uri as string) || '',
              mcpResourceUri: (cfg.mcp_resource_uri as string) || '',
            }));
          }
        } catch (err) {
          console.error('Failed to load IDP config:', err);
        }
      };
      loadIdpConfig();
    }
  }, [activeTab, isAdminUser]);

  // Callbacks

  const toggleSecret = useCallback((key: string) => {
    setState(prev => ({ ...prev, showSecrets: { ...prev.showSecrets, [key]: !prev.showSecrets[key] } }));
  }, []);

  const field = useCallback((key: keyof ConfigurationState) => (v: string) => {
    setState(prev => ({ ...prev, [key]: v, saveStatus: 'idle' }));
  }, []);

  const setIndustry = useCallback((id: string) => {
    setState(prev => ({ ...prev, industryId: id, saveStatus: 'idle' }));
    (applyIndustryId as (id: string) => void)(id);
  }, [applyIndustryId]);

  const testConnection = useCallback(async () => {
    setState(prev => ({ ...prev, connectionTestStatus: 'testing', connectionTestMessage: '' }));
    try {
      const res = await fetch('/api/admin/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pingone_environment_id: state.pingoneEnvironmentId,
          pingone_region: state.pingoneRegion,
          admin_client_id: state.adminClientId,
        }),
      });
      const data = await res.json() as { success: boolean; message: string };
      const msg = data.message || (data.success ? 'PingOne environment reached successfully.' : 'Connection failed');
      setState(prev => ({
        ...prev,
        connectionTestStatus: data.success ? 'success' : 'error',
        connectionTestMessage: msg,
      }));
      if (data.success) notifySuccess(msg);
      else notifyError(msg);
    } catch (_e) {
      setState(prev => ({ ...prev, connectionTestStatus: 'error', connectionTestMessage: 'Network error' }));
      notifyError('Connection test failed — network error');
    }
  }, [state.pingoneEnvironmentId, state.pingoneRegion, state.adminClientId]);

  const generateKeypair = useCallback(async () => {
    setState(prev => ({ ...prev, keypairStatus: 'generating', keypairMessage: '', generatedPublicKey: '' }));
    try {
      const res = await fetch('/api/admin/config/generate-keypair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json() as { ok?: boolean; success?: boolean; publicKeyPem?: string; publicKey?: string; message?: string; error?: string };
      setState(prev => ({
        ...prev,
        keypairStatus: (data.ok || data.success) ? 'success' : 'error',
        keypairMessage: data.message || data.error || ((data.ok || data.success) ? 'Keypair generated' : 'Generation failed'),
        generatedPublicKey: data.publicKeyPem || data.publicKey || '',
      }));
    } catch (_e) {
      setState(prev => ({ ...prev, keypairStatus: 'error', keypairMessage: 'Network error' }));
    }
  }, []);

  const saveConfiguration = useCallback(async () => {
    setState(prev => ({ ...prev, saveStatus: 'saving' }));
    try {
      await savePublicConfig({
        ...state,
        pingone_region: state.pingoneRegion,
        pingone_environment_id: state.pingoneEnvironmentId,
        admin_client_id: state.adminClientId,
        admin_client_secret: state.adminClientSecret,
        admin_token_endpoint_auth_method: state.adminAuthMethod,
        admin_redirect_uri: state.adminRedirectUri,
        user_client_id: state.userClientId,
        user_client_secret: state.userClientSecret,
        user_redirect_uri: state.userRedirectUri,
        pingone_mfa_policy_id: state.mfaPolicyId,
        step_up_amount_threshold: state.mfaStepUpThreshold,
        mfa_step_up_threshold: state.mfaStepUpThreshold,
        agent_transaction_count_limit: state.agentTransactionCountLimit,
        agent_transaction_value_limit: state.agentTransactionValueLimit,
        ciba_enabled: state.cibaEnabled,
        mcp_server_url: state.mcpServerUrl,
        mcp_resource_uri: state.mcpResourceUri,
        authorize_worker_client_id: state.workerClientId,
        pingone_admin_token_endpoint_auth_method: state.workerAuthMethod,
        demo_scenario: state.demoScenario,
        industry_id: state.industryId,
        agent_ui_mode: state.agentUiMode,
        agent_mcp_allowed_scopes: state.mcpScopes,
        show_education_panel: state.showEducationPanel,
        max_token_chain_history: state.maxTokenChainHistory,
        enable_token_chain_display: state.enableTokenChainDisplay,
        demo_account_count: state.accountCount,
        transaction_preset: state.transactionPreset,
        agent_mode: state.agentMode,
        vercel_deploy_url: state.vercelDeployUrl,
        authorize_worker_client_secret: state.workerClientSecret,
        log_level: state.logLevel,
        debug_show_token_details: state.debugShowTokenDetails,
        debug_show_api_calls: state.debugShowApiCalls,
        log_filter_categories: state.logFilterCategories,
      });

      if (isAdminUser) {
        try {
          const settingsRes = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              stepUpAmountThreshold: state.mfaStepUpThreshold,
              agentTransactionCountLimit: state.agentTransactionCountLimit,
              agentTransactionValueLimit: state.agentTransactionValueLimit,
            }),
          });
          if (!settingsRes.ok && settingsRes.status !== 401 && settingsRes.status !== 403) {
            console.warn('Runtime security settings update failed:', settingsRes.status);
          }
        } catch (_settingsErr) {
          // Non-fatal: runtime settings require a Bearer token session.
          // The main config has already been saved above.
          console.warn('Runtime settings update skipped (no Bearer token session).');
        }
      }

      setState(prev => ({ ...prev, saveStatus: 'saved' }));

      const agentUiModeMap: Record<string, { placement: string; fab: boolean }> = {
        standard: { placement: 'middle', fab: true },
        minimal:  { placement: 'none',   fab: true },
        advanced: { placement: 'right-dock', fab: true },
        disabled: { placement: 'none',   fab: true },
      };
      const mappedUiMode = agentUiModeMap[state.agentUiMode] ?? agentUiModeMap.standard;
      (setAgentUi as (v: { placement: string; fab: boolean }) => void)(mappedUiMode);

      notifySuccess('Configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setState(prev => ({ ...prev, saveStatus: 'error' }));
      notifyError('Failed to save configuration');
    }
  }, [state, isAdminUser, setAgentUi]);

  const resetConfiguration = useCallback(() => {
    setState(getDefaultState());
    notifySuccess('Configuration reset to defaults');
  }, []);

  // Feature flags
  useEffect(() => {
    if (activeTab !== 'feature-flags') return;
    let cancelled = false;
    setFlagsLoading(true);
    setFlagsError(null);
    fetch('/api/admin/feature-flags', { credentials: 'include' })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ flags?: FeatureFlag[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setFeatureFlags(data.flags ?? []);
          setFlagsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setFlagsError(`Failed to load feature flags (${msg}) — is the API server running?`);
          setFlagsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [activeTab]);

  // Deep-link: scroll to specific flag when ?flag=<id> is in the URL
  useEffect(() => {
    if (flagsLoading || featureFlags.length === 0) return;
    const flagParam = searchParams.get('flag');
    if (!flagParam) return;
    const el = document.getElementById(flagParam);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ff-flag-card--highlight');
      setTimeout(() => el.classList.remove('ff-flag-card--highlight'), 2500);
    }
  }, [flagsLoading, featureFlags, searchParams]);

  const toggleFlag = useCallback(async (flagId: string, newValue: boolean) => {
    setFeatureFlags(prev => prev.map(f => f.id === flagId ? { ...f, value: newValue } : f));
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates: { [flagId]: newValue } }),
      });
      if (res.status === 403) {
        setFeatureFlags(prev => prev.map(f => f.id === flagId ? { ...f, value: !newValue } : f));
        notifyError('Admin session required to change feature flags — sign in at /admin first.');
        return;
      }
      if (!res.ok) throw new Error('PATCH failed');
      notifySuccess(`Flag ${newValue ? 'enabled' : 'disabled'}`);
    } catch {
      setFeatureFlags(prev => prev.map(f => f.id === flagId ? { ...f, value: !newValue } : f));
      notifyError('Failed to toggle flag');
    }
  }, []);

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    if (!value) { notifyError(`${label} — nothing to copy`); return; }
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(`${label} copied!`);
    } catch {
      notifyError('Copy failed — select and copy manually');
    }
  }, []);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    const tab = CONFIGURATION_TABS.find(t => t.id === tabId);
    if (tab && tab.sections.length > 0) {
      setState(prev => ({ ...prev, activeSection: tab.sections[0] }));
    }
    navigate(`/configure?tab=${tabId}`, { replace: true });
  }, [navigate]);

  const handleSectionChange = useCallback((sectionId: string) => {
    setState(prev => ({ ...prev, activeSection: sectionId }));
  }, []);

  // Derived

  // /configure is intentionally unauthenticated. Show all tabs so the page is usable
  // for initial setup before PingOne is configured. Server routes remain protected.
  const accessibleTabs = CONFIGURATION_TABS;


  const currentTab = useMemo(() => {
    return accessibleTabs.find(tab => tab.id === activeTab);
  }, [accessibleTabs, activeTab]);

  // Section content renderer

  const renderSectionContent = () => {
    const s = state.activeSection;

    // PingOne Config tab
    if (s === 'pingone-connection') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Connect this demo to your PingOne environment. You need three values from the PingOne admin console — the region your tenant is in, the environment UUID, and a worker app client ID that has Management API roles assigned. After entering them, click <strong>Test Connection</strong> to verify the BFF can reach PingOne.</p>
        <CfgSelect
          label="PingOne Region"
          value={state.pingoneRegion}
          onChange={field('pingoneRegion')}
          options={[
            { value: 'com',    label: 'North America (.com)' },
            { value: 'eu',     label: 'Europe (.eu)' },
            { value: 'ca',     label: 'Canada (.ca)' },
            { value: 'asia',   label: 'Asia-Pacific (.asia)' },
            { value: 'com.au', label: 'Australia (.com.au)' },
          ]}
          help="The geographic region where your PingOne tenant was created. This determines the base URL for all API calls (e.g. auth.pingone.com vs auth.pingone.eu). Find it in PingOne Admin → Environment → Properties."
        />
        <CfgField
          label="Environment ID"
          value={state.pingoneEnvironmentId}
          onChange={field('pingoneEnvironmentId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="The UUID that uniquely identifies your PingOne environment. Find it in PingOne Admin → Environment → Properties → Environment ID. All OAuth and Management API calls include this in the URL path."
        />
        <CfgField
          label="PingOne Worker Client ID"
          value={state.adminClientId}
          onChange={field('adminClientId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="Client ID of a PingOne Worker application with Management API roles (e.g. Environment Admin or Identity Data Admin). The BFF uses this to call PingOne Management APIs for user lookup, MFA enrollment, and configuration queries. Create one in PingOne → Applications → + Application → Worker."
        />
        <CfgSecretField
          label="PingOne Worker Client Secret"
          fieldKey="adminClientSecret"
          value={state.adminClientSecret}
          showSecrets={state.showSecrets}
          onToggle={toggleSecret}
          onChange={field('adminClientSecret')}
          help="The client secret for the PingOne Worker app. Found in PingOne → Applications → your Worker app → Overview → Client Secret."
        />
        <CfgSelect
          label="Token Endpoint Auth Method"
          value={state.adminAuthMethod}
          onChange={v => setState(prev => ({ ...prev, adminAuthMethod: v, saveStatus: 'idle' }))}
          options={[
            { value: 'client_secret_basic', label: 'client_secret_basic (HTTP Basic — recommended)' },
            { value: 'client_secret_post', label: 'client_secret_post (POST body)' },
          ]}
          help="How the BFF authenticates when requesting tokens from PingOne. Must match the Token Endpoint Authentication Method on the Worker app in PingOne → Applications → Configuration."
        />
        <div className="cfg-test-connection">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={testConnection}
            disabled={state.connectionTestStatus === 'testing' || !state.pingoneEnvironmentId}
          >
            {state.connectionTestStatus === 'testing' ? 'Testing\u2026' : 'Test Connection'}
          </button>
          {state.connectionTestMessage && (
            <span className={`cfg-test-result cfg-test-result--${state.connectionTestStatus}`}>
              {state.connectionTestStatus === 'success' ? '\u2713' : '\u2717'} {state.connectionTestMessage}
            </span>
          )}
        </div>
      </div>
    );

    if (s === 'oauth-flows') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Two OAuth 2.0 clients are needed: one for <strong>Admin</strong> login and one for <strong>Customer</strong> login. Both use Authorization Code flow. The Worker app credentials (for PingOne Management API) are configured on the PingOne Connection tab.</p>
        <div className="cfg-info-box" style={{ marginBottom: '1rem' }}>
          Client secrets are generated and stored by this app — you do <strong>not</strong> need to copy them from PingOne. Only enter the Client ID and Redirect URI for each app.
        </div>
        <h3 className="cfg-subsection-title">Admin App (Authorization Code)</h3>
        <CfgField label="Admin Client ID" value={state.adminClientId} onChange={field('adminClientId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" help="Client ID of the PingOne web application used for admin login (/admin route). In PingOne: Applications → your admin app → Overview → Client ID." />
        <CfgField label="Admin Redirect URI" value={state.adminRedirectUri} onChange={field('adminRedirectUri')} placeholder="https://yourdomain.com/api/auth/oauth/admin/callback" help="The callback URL PingOne redirects to after admin login. Must exactly match what's registered in PingOne → admin app → Configuration → Redirect URIs." />
        <h3 className="cfg-subsection-title">User App (Authorization Code + PKCE)</h3>
        <CfgField label="User Client ID" value={state.userClientId} onChange={field('userClientId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" help="Client ID of the PingOne SPA application used for end-user banking login. In PingOne: Applications → your user app → Overview → Client ID. PKCE is required — no client secret needed." />
        <CfgField label="User Redirect URI" value={state.userRedirectUri} onChange={field('userRedirectUri')} placeholder="https://yourdomain.com/api/auth/oauth/user/callback" help="The callback URL PingOne redirects to after user login. Must exactly match the redirect URI in PingOne → user app → Configuration." />
      </div>
    );

    if (s === 'mfa-settings') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Multi-Factor Authentication adds a second verification step for sensitive actions. When the AI agent tries to execute a transfer above the step-up threshold, the BFF triggers a PingOne MFA challenge (push notification, TOTP, or email OTP depending on your policy). Configure the MFA policy ID and the dollar thresholds that trigger step-up here.</p>
        <CfgField
          label="MFA Policy ID"
          value={state.mfaPolicyId}
          onChange={field('mfaPolicyId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="UUID of the MFA policy to use for step-up challenges. Find it in PingOne Admin → Security → MFA → Policies → click your policy → copy the ID from the URL or Properties panel. The policy controls which MFA methods are available (push, TOTP, email, SMS)."
        />
        <CfgField
          label="Agent Transaction Count Limit"
          value={String(state.agentTransactionCountLimit)}
          onChange={v => setState(prev => ({ ...prev, agentTransactionCountLimit: Number(v) || 0, saveStatus: 'idle' }))}
          type="number"
          help="Maximum number of transactions the AI agent can execute within a single approval window before requiring fresh human approval. This prevents runaway batch operations. Set 0 for unlimited."
        />
        <CfgField
          label="Agent Transaction Value Limit (USD)"
          value={String(state.agentTransactionValueLimit)}
          onChange={v => setState(prev => ({ ...prev, agentTransactionValueLimit: Number(v) || 0, saveStatus: 'idle' }))}
          type="number"
          help="Maximum cumulative dollar value the AI agent can transfer within a single approval window. Once this limit is reached, the agent pauses and asks for fresh human consent. Set 0 for unlimited."
        />
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
            <input
              type="checkbox"
              checked={state.cibaEnabled}
              onChange={e => setState(prev => ({ ...prev, cibaEnabled: e.target.checked, saveStatus: 'idle' }))}
            />
            Enable CIBA (Backchannel Authentication)
          </label>
          <p className="cfg-field-help">CIBA sends out-of-band push notifications to the user's registered device for MFA. When enabled, high-value transfers trigger a PingOne push instead of an inline challenge. Requires a PingOne MFA policy with push notifications configured.</p>
        </div>
      </div>
    );

    if (s === 'token-exchange') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">RFC 8693 Token Exchange lets the BFF swap a user access token for a narrowly-scoped MCP Gateway token. The resulting token carries an <code>act</code> claim showing who delegated and who is acting.</p>
        {state.pingoneEnvironmentId && (
          <div className="cfg-info-box" style={{ marginBottom: '1rem' }}>
            <strong>Token endpoint:</strong> https://auth.pingone.{state.pingoneRegion || 'com'}/{state.pingoneEnvironmentId}/as/token<br />
            <strong>BFF origin:</strong> {window.location.origin}
          </div>
        )}
        <CfgField
          label="MCP Server URL"
          value={state.mcpServerUrl}
          onChange={field('mcpServerUrl')}
          placeholder="wss://your-mcp-server.railway.app"
          help="WebSocket URL where the MCP tool server is running. The BFF connects here to execute banking tools (get_accounts, transfer_funds, etc.)."
        />
        <CfgField
          label="MCP Resource URI"
          value={state.mcpResourceUri}
          onChange={field('mcpResourceUri')}
          placeholder="https://your-mcp-server.railway.app"
          help="The audience (aud) claim value for exchanged MCP tokens. Must match the resource URI registered in PingOne for the MCP Token Exchanger app."
        />
        <CfgField
          label="Worker Client ID"
          value={state.workerClientId}
          onChange={field('workerClientId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="Client ID of the PingOne MCP Token Exchanger application (type: Worker or AI Agent). This app has the Token Exchange grant type enabled. In PingOne: Applications → MCP Token Exchanger → Overview → Client ID."
        />
      </div>
    );

    // Quick Start tab
    if (s === 'pingone-basics') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          <strong>Step 1:</strong> Enter the two values that connect this demo to your PingOne tenant. You only need a PingOne environment ID and region to get started. For full OAuth client credentials, MFA, and token exchange setup, go to the <strong>PingOne Setup</strong> tab after completing this step.
        </p>
        <CfgSelect
          label="PingOne Region"
          value={state.pingoneRegion}
          onChange={field('pingoneRegion')}
          options={[
            { value: 'com',    label: 'North America (.com)' },
            { value: 'eu',     label: 'Europe (.eu)' },
            { value: 'ca',     label: 'Canada (.ca)' },
            { value: 'asia',   label: 'Asia-Pacific (.asia)' },
            { value: 'com.au', label: 'Australia (.com.au)' },
          ]}
          help="The geographic region of your PingOne tenant. This sets the base URL for all API calls (e.g. auth.pingone.com). Find it in PingOne Admin → Environment → Properties."
        />
        <CfgField
          label="Environment ID"
          value={state.pingoneEnvironmentId}
          onChange={field('pingoneEnvironmentId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="The UUID identifying your PingOne environment. Find it in PingOne Admin → Environment → Properties → Environment ID. This value appears in all OAuth and API URLs."
        />
        <div className="cfg-next-step-hint">
          <span>&#10003; Next:</span> Go to <strong>PingOne Config &#8594; OAuth Flows</strong> to add client credentials.
        </div>
      </div>
    );

    if (s === 'demo-data-setup') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          <strong>Step 2:</strong> Pick a demo scenario. Each preset loads different sample bank accounts, transaction amounts, and agent prompts. The scenario you choose changes how MFA step-up, agent consent (HITL), and transaction flows behave.<br /><br />
          <ul style={{ marginLeft: '1.5em' }}>
            <li><strong>Default Banking Demo:</strong> Balanced mix of checking, savings, and investment accounts. <em>Most transfers do NOT trigger MFA or consent.</em> <br />
              <span style={{ color: '#374151' }}>Example: Transfer $200 from Checking to Savings (no MFA, no consent required).</span>
            </li>
            <li><strong>High-Value Transactions (triggers MFA):</strong> Pre-loads large transfers above the MFA threshold. <em>Every significant transfer requires step-up MFA.</em> <br />
              <span style={{ color: '#374151' }}>Example: Transfer $2,000 from Checking to Investment (MFA required, consent optional).</span>
            </li>
            <li><strong>AI Agent Showcase:</strong> Optimized for demonstrating AI agent delegation, token exchange, and human-in-the-loop (HITL) consent. <em>Agent requests consent before AND step-up MFA for high-value transfers.</em> <br />
              <span style={{ color: '#374151' }}>Example: Agent proposes a transfer → user sees consent dialog → approves → MFA if over threshold.</span>
            </li>
            <li><strong>MFA & Step-Up Auth Focus:</strong> Step-up threshold is set to $1. <em>Every transfer requires both consent and MFA, even $5.</em> <br />
              <span style={{ color: '#374151' }}>Example: Transfer $5 from Checking to Savings (consent dialog + MFA required).</span>
            </li>
          </ul>
        </p>
        <CfgSelect
          label="Demo Scenario"
          value={state.demoScenario}
          onChange={v => setState(prev => ({ ...prev, demoScenario: v, saveStatus: 'idle' }))}
          options={[
            { value: 'default',       label: 'Default Banking Demo' },
            { value: 'high-value',    label: 'High-Value Transactions (triggers MFA)' },
            { value: 'agent-focused', label: 'AI Agent Showcase' },
            { value: 'mfa-heavy',     label: 'MFA & Step-Up Auth Focus' },
          ]}
          help={
            'Default: Most transfers do NOT trigger MFA. ' +
            'High-Value: Large transfers always require MFA. ' +
            'Agent Showcase: Agent requests consent before transfers. ' +
            'MFA & Step-Up: Every transfer requires MFA.'
          }
        />
      </div>
    );

    if (s === 'industry-branding') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          <strong>Step 3:</strong> Choose an industry vertical to rebrand the entire demo. Selecting a preset changes the logo, colour scheme, sidebar icons, and sample account names across the app. This lets you tailor the demo for a specific audience without editing code.
        </p>
        <div className="cfg-industry-tiles">
          {[
            { id: 'banking',    label: 'Banking & Finance',   icon: '\uD83C\uDFE6' },
            { id: 'healthcare', label: 'Healthcare',          icon: '\u2695\uFE0F' },
            { id: 'retail',     label: 'Retail & E-Commerce', icon: '\uD83D\uDED2' },
            { id: 'insurance',  label: 'Insurance',           icon: '\uD83D\uDEE1\uFE0F' },
            { id: 'government', label: 'Government Services', icon: '\uD83C\uDFDB\uFE0F' },
          ].map(ind => (
            <button
              key={ind.id}
              type="button"
              className={`cfg-industry-tile${state.industryId === ind.id ? ' cfg-industry-tile--active' : ''}`}
              onClick={() => setIndustry(ind.id)}
            >
              <span className="cfg-industry-icon">{ind.icon}</span>
              <span className="cfg-industry-label">{ind.label}</span>
            </button>
          ))}
        </div>
      </div>
    );

    // Demo Management tab
    if (s === 'demo-scenarios') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Choose the starting scenario for new demo sessions. Each preset configures the combination of accounts, transaction amounts, alert triggers, and agent prompt suggestions that appear when a user logs in. Save, then refresh to apply.</p>
        <div className="form-label" style={{ marginBottom: '0.75rem' }}>Active Demo Scenario</div>
        <div className="scenario-card-grid">
          {([
            {
              value: 'default',
              label: 'Default Banking Demo',
              icon: '🏦',
              thresholds: 'MFA step-up: $500 · Max transfers: $2,000',
              behavior: 'Balanced mix of checking, savings, and investment accounts. Transaction amounts stay below the MFA threshold so the agent can complete transfers without triggering step-up. Good for showing the core AI + banking flow.',
            },
            {
              value: 'high-value',
              label: 'High-Value Transactions',
              icon: '💸',
              thresholds: 'MFA step-up: $500 · Transactions: $500–$5,000',
              behavior: 'Pre-loads transfers well above the MFA step-up threshold. Every significant transfer will trigger a PingOne MFA challenge (push / TOTP). Ideal for demonstrating step-up authentication in a live demo.',
            },
            {
              value: 'agent-focused',
              label: 'AI Agent Showcase',
              icon: '🤖',
              thresholds: 'MFA step-up: $500 · HITL consent gate: ON',
              behavior: 'Optimised account and transaction set for demonstrating AI agent delegation, RFC 8693 token exchange, and human-in-the-loop (HITL) consent. The agent will request approval before executing transfers.',
            },
            {
              value: 'mfa-heavy',
              label: 'MFA & Step-Up Auth Focus',
              icon: '🛡️',
              thresholds: 'MFA step-up: $1 · Every action requires MFA',
              behavior: 'Step-up threshold is set to $1 so virtually every transfer triggers a PingOne MFA challenge. Use this to walk through the full MFA enrollment and challenge flow during a security-focused demo.',
            },
          ] as { value: string; label: string; icon: string; thresholds: string; behavior: string }[]).map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`scenario-card${state.demoScenario === opt.value ? ' scenario-card--active' : ''}`}
              onClick={() => setState(prev => ({ ...prev, demoScenario: opt.value, saveStatus: 'idle' }))}
            >
              <div className="scenario-card__header">
                <span className="scenario-card__icon">{opt.icon}</span>
                <span className="scenario-card__label">{opt.label}</span>
                {state.demoScenario === opt.value && <span className="scenario-card__badge">Active</span>}
              </div>
              <div className="scenario-card__thresholds">{opt.thresholds}</div>
              <p className="scenario-card__desc">{opt.behavior}</p>
            </button>
          ))}
        </div>
        <p className="cfg-field-help" style={{ marginTop: '0.75rem' }}>Changes take effect on next session or page refresh — active sessions are not affected.</p>
      </div>
    );

    if (s === 'account-setup') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Set how many sample bank accounts each demo user gets. These are auto-generated with realistic names (Checking, Savings, Investment, etc.) and balances. More accounts give the AI agent more data to work with when answering questions like "What's my total balance?"</p>
        <CfgField
          label="Number of Demo Accounts"
          value={String(state.accountCount)}
          onChange={v => setState(prev => ({ ...prev, accountCount: Number(v) || 1, saveStatus: 'idle' }))}
          type="number"
          help="Range: 1–5. Each account gets a random balance and recent transaction history. The AI agent can query all accounts."
        />
      </div>
    );

    if (s === 'transaction-data') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Control the sample transaction data that populates the dashboard and feeds into MFA step-up testing. The <em>High-Value</em> preset includes transactions above the step-up threshold, so MFA challenges trigger automatically during the demo. The <em>Mixed</em> preset gives a realistic range.</p>
        <CfgSelect
          label="Transaction Preset"
          value={state.transactionPreset}
          onChange={v => setState(prev => ({ ...prev, transactionPreset: v, saveStatus: 'idle' }))}
          options={[
            { value: 'standard',   label: 'Standard (mixed, all below threshold)' },
            { value: 'high-value', label: 'High-Value (some above MFA threshold)' },
            { value: 'mixed',      label: 'Mixed (range of values)' },
          ]}
          help="Standard: all transactions are below the MFA step-up threshold — no MFA triggers. High-Value: includes transfers of $500+ that will trigger step-up. Mixed: realistic variety from $5 to $2,000+."
        />
      </div>
    );

    if (s === 'agent-modes') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Set whether the AI banking agent requires human approval before acting. <strong>Human-in-the-Loop (HITL)</strong> is recommended for demos — the agent explains what it wants to do and waits for you to approve or deny each action. <em>Autonomous</em> mode lets the agent execute without asking (useful for automated testing). <em>Disabled</em> hides the agent entirely.</p>
        <CfgSelect
          label="Agent Operating Mode"
          value={state.agentMode}
          onChange={v => setState(prev => ({ ...prev, agentMode: v, saveStatus: 'idle' }))}
          options={[
            { value: 'hitl',       label: 'Human-in-the-Loop (recommended)' },
            { value: 'autonomous', label: 'Autonomous (agent acts without approval)' },
            { value: 'disabled',   label: 'Disabled (no agent visible)' },
          ]}
          help="HITL: the agent pauses before each bank action and shows a consent card. Autonomous: the agent executes immediately. Disabled: the FAB button and chat panel are hidden."
        />
      </div>
    );

    // Agent Configuration tab
    if (s === 'agent-ui-mode') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Control how the AI agent UI appears in the banking app. Click a mode to select it.</p>
        <div className="form-label" style={{ marginBottom: '0.75rem' }}>Agent UI Mode</div>
        <div className="scenario-card-grid">
          {([
            {
              value: 'standard',
              label: 'Standard',
              tag: 'Recommended for demos',
              desc: 'Shows the floating action button (FAB) in the bottom-right corner. Clicking it slides in a full chat panel where users interact with the AI agent. Includes animated transitions and the education panel.',
              preview: (
                <div className="uimode-preview uimode-preview--standard">
                  <div className="uimode-screen">
                    <div className="uimode-topbar" />
                    <div className="uimode-content">
                      <div className="uimode-row" /><div className="uimode-row uimode-row--short" />
                    </div>
                    <div className="uimode-panel">
                      <div className="uimode-bubble uimode-bubble--agent" />
                      <div className="uimode-bubble uimode-bubble--user" />
                      <div className="uimode-bubble uimode-bubble--agent uimode-bubble--short" />
                    </div>
                    <div className="uimode-fab">✦</div>
                  </div>
                </div>
              ),
            },
            {
              value: 'minimal',
              label: 'Minimal',
              tag: 'Reduced footprint',
              desc: 'Shows only the FAB button — no slide-in panel, no animations. The agent is available but unobtrusive. Useful when banking UI should be the focus and agent is secondary.',
              preview: (
                <div className="uimode-preview uimode-preview--minimal">
                  <div className="uimode-screen">
                    <div className="uimode-topbar" />
                    <div className="uimode-content">
                      <div className="uimode-row" /><div className="uimode-row uimode-row--short" />
                    </div>
                    <div className="uimode-fab uimode-fab--minimal">✦</div>
                  </div>
                </div>
              ),
            },
            {
              value: 'advanced',
              label: 'Advanced',
              tag: 'For developer audiences',
              desc: 'Everything in Standard plus live developer overlays: raw token chain, tool call log, RFC 8693 exchange details, and internal agent state. Use when presenting to engineers or security teams.',
              preview: (
                <div className="uimode-preview uimode-preview--advanced">
                  <div className="uimode-screen">
                    <div className="uimode-topbar" />
                    <div className="uimode-content">
                      <div className="uimode-row" /><div className="uimode-row uimode-row--short" />
                    </div>
                    <div className="uimode-panel">
                      <div className="uimode-bubble uimode-bubble--agent" />
                      <div className="uimode-bubble uimode-bubble--user" />
                    </div>
                    <div className="uimode-devbar">
                      <div className="uimode-devrow" /><div className="uimode-devrow uimode-devrow--dim" />
                      <div className="uimode-devrow" /><div className="uimode-devrow uimode-devrow--dim" />
                    </div>
                    <div className="uimode-fab uimode-fab--advanced">✦</div>
                  </div>
                </div>
              ),
            },
            {
              value: 'disabled',
              label: 'Disabled',
              tag: 'Agent hidden',
              desc: 'Removes all agent UI elements — no FAB, no chat panel, no overlays. The banking dashboard runs in stand-alone mode. Use for pure banking UI demos without AI.',
              preview: (
                <div className="uimode-preview uimode-preview--disabled">
                  <div className="uimode-screen">
                    <div className="uimode-topbar" />
                    <div className="uimode-content">
                      <div className="uimode-row" /><div className="uimode-row uimode-row--short" />
                      <div className="uimode-row uimode-row--short" />
                    </div>
                    <div className="uimode-disabled-label">No agent</div>
                  </div>
                </div>
              ),
            },
          ] as { value: string; label: string; tag: string; desc: string; preview: React.ReactNode }[]).map(opt => (
            <button
              key={opt.value}
              type="button"
              className={'scenario-card' + (state.agentUiMode === opt.value ? ' scenario-card--active' : '')}
              onClick={() => setState(prev => ({ ...prev, agentUiMode: opt.value, saveStatus: 'idle' }))}
            >
              {opt.preview}
              <div className="scenario-card__header" style={{ marginTop: '0.625rem' }}>
                <span className="scenario-card__label">{opt.label}</span>
                {state.agentUiMode === opt.value && <span className="scenario-card__badge">Active</span>}
              </div>
              <div className="scenario-card__thresholds">{opt.tag}</div>
              <p className="scenario-card__desc">{opt.desc}</p>
            </button>
          ))}
        </div>
        <p className="cfg-field-help" style={{ marginTop: '0.75rem' }}>Changes take effect on next page refresh.</p>
      </div>
    );

    if (s === 'mcp-scopes') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Select the OAuth scopes the AI agent is allowed to request during an RFC 8693 token exchange. Only scopes also granted to the MCP Token Exchanger app in PingOne will be issued — unrecognised scopes are silently ignored by PingOne.
        </p>
        <ScopeTable
          value={state.mcpScopes}
          onChange={v => setState(prev => ({ ...prev, mcpScopes: v, saveStatus: 'idle' }))}
        />
      </div>
    );


    if (s === 'mcp-tools') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Browse all MCP banking tools available to the AI agent. Each tool shows its name, required scopes, input parameters, and what it returns. Tools are registered in the MCP server and called via the <code>tools/call</code> protocol. The agent cannot invoke a tool unless the exchanged MCP token carries the required scopes.</p>
        <MCPToolsEducation />
      </div>
    );
    if (s === 'education-settings') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">The education panel is a step-by-step overlay that explains what's happening during OAuth flows (login, token exchange, MFA). It's useful for demos and learning, but you may want to hide it for polished customer presentations.</p>
        <CfgToggle
          label="Show Education Panel"
          checked={state.showEducationPanel}
          onChange={v => setState(prev => ({ ...prev, showEducationPanel: v, saveStatus: 'idle' }))}
          help="When enabled, a step-by-step panel appears on the dashboard after you log in as a demo user. It annotates each phase of the OAuth flow in real time. Disable for cleaner customer presentations."
        />
        <div className="cfg-info-box">
          <strong>Not seeing the panel?</strong> Make sure you are logged in as a demo user on the <a href="/dashboard" className="cfg-inline-link">Dashboard</a> (not an admin). The panel appears after the first token is issued. Check that PingOne credentials are configured in Quick Start.
        </div>
      </div>
    );

    if (s === 'token-chain') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">The token chain display is a live visualisation showing every token involved in the current session — from the initial authorization code exchange through agent delegation to MCP tool calls. Each token is shown with its claims, expiry, and lineage (which parent token it was derived from). This is the core educational feature of the demo.</p>
        <CfgToggle
          label="Enable Token Chain Display"
          checked={state.enableTokenChainDisplay}
          onChange={v => setState(prev => ({ ...prev, enableTokenChainDisplay: v, saveStatus: 'idle' }))}
          help="Shows/hides the token chain timeline panel on the dashboard. When enabled, you can see each token event as it happens: user access token → agent CC token → RFC 8693 exchange → MCP gateway token."
        />
        <CfgField
          label="Max Token History to Display"
          value={String(state.maxTokenChainHistory)}
          onChange={v => setState(prev => ({ ...prev, maxTokenChainHistory: Number(v) || 5, saveStatus: 'idle' }))}
          type="number"
          help="How many recent token events to keep visible in the chain (5–50). Older events scroll off. Higher values use more memory but are useful for long demo sessions with many exchanges."
        />
      </div>
    );

    // Advanced tab
    if (s === 'worker-app') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          PingOne Authorize worker application credentials used for token exchange and policy decisions.
        </p>
        <CfgField
          label="Worker Client ID"
          value={state.workerClientId}
          onChange={field('workerClientId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="PingOne Authorize worker app client ID"
        />
        <CfgSecretField
          label="Worker Client Secret"
          fieldKey="workerClientSecret"
          value={state.workerClientSecret}
          showSecrets={state.showSecrets}
          onToggle={toggleSecret}
          onChange={field('workerClientSecret')}
          help="Keep this secret — stored server-side and never sent to the browser after initial load"
        />
        <CfgSelect
          label="Token Endpoint Auth Method"
          value={state.workerAuthMethod}
          onChange={v => setState(prev => ({ ...prev, workerAuthMethod: v, saveStatus: 'idle' }))}
          options={[
            { value: 'client_secret_basic', label: 'client_secret_basic — HTTP Basic (Authorization header)' },
            { value: 'client_secret_post',  label: 'client_secret_post — POST body (form params)' },
          ]}
          help="Must match the Token Endpoint Authentication Method on the worker app in PingOne Admin → Applications → Configuration."
        />
      </div>
    );

    if (s === 'debug-settings') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Logging and debug overlays. Enable additional output during demo sessions to show internal OAuth and token exchange details.
        </p>
        <CfgSelect
          label="Server Log Level"
          value={state.logLevel}
          onChange={v => setState(prev => ({ ...prev, logLevel: v, saveStatus: 'idle' }))}
          options={[
            { value: 'error', label: 'Error only' },
            { value: 'warn',  label: 'Warn' },
            { value: 'info',  label: 'Info (default)' },
            { value: 'debug', label: 'Debug (verbose)' },
          ]}
          help="Affects banking_api_server console output"
        />
        <CfgToggle
          label="Show Token Details in UI"
          checked={state.debugShowTokenDetails}
          onChange={v => setState(prev => ({ ...prev, debugShowTokenDetails: v, saveStatus: 'idle' }))}
          help="Displays raw JWT contents in the token chain panel"
        />
        <CfgToggle
          label="Show API Call Details"
          checked={state.debugShowApiCalls}
          onChange={v => setState(prev => ({ ...prev, debugShowApiCalls: v, saveStatus: 'idle' }))}
          help="Logs all BFF API calls to the browser console"
        />
        <div className="form-group" style={{ marginTop: '1.5rem' }}>
          <div className="form-label">Log Category Filter</div>
          <p className="cfg-field-help" style={{ marginBottom: '0.75rem' }}>
            Select categories to show in the in-app Log Viewer. Leave all unchecked to show every category.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.4rem 1rem' }}>
            {[
              'McpExchangerToken', 'TokenExchange', 'TokenRefresh', 'TokenService',
              'AgentDelegation', 'AgentClientCredentials', 'OAuth', 'Authorize',
              'SessionCheck', 'CIBA', 'MFA', 'StepUp', 'ConsentChallenge',
              'PingOneAgentUser', 'PingOneUserLookup', 'ScopePolicy',
              'Thresholds', 'ConfigStore', 'SecurityMonitoring', 'ErrorHandler',
            ].map(cat => {
              const active = state.logFilterCategories.split(',').map(s => s.trim()).filter(Boolean);
              const checked = active.length === 0 || active.includes(cat);
              return (
                <label key={cat} className="cfg-toggle-label" style={{ fontSize: '0.875rem', fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    className="cfg-toggle-input"
                    checked={checked}
                    onChange={e => {
                      const prev = state.logFilterCategories.split(',').map(s => s.trim()).filter(Boolean);
                      let next: string[];
                      if (prev.length === 0) {
                        // All enabled — unchecking this one means "filter to all except this"
                        next = [
                          'McpExchangerToken', 'TokenExchange', 'TokenRefresh', 'TokenService',
                          'AgentDelegation', 'AgentClientCredentials', 'OAuth', 'Authorize',
                          'SessionCheck', 'CIBA', 'MFA', 'StepUp', 'ConsentChallenge',
                          'PingOneAgentUser', 'PingOneUserLookup', 'ScopePolicy',
                          'Thresholds', 'ConfigStore', 'SecurityMonitoring', 'ErrorHandler',
                        ].filter(c => c !== cat);
                      } else if (e.target.checked) {
                        next = [...prev, cat];
                      } else {
                        next = prev.filter(c => c !== cat);
                      }
                      setState(p => ({ ...p, logFilterCategories: next.join(','), saveStatus: 'idle' }));
                    }}
                  />
                  <span>{cat}</span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
            onClick={() => setState(p => ({ ...p, logFilterCategories: '', saveStatus: 'idle' }))}
          >
            Show All Categories
          </button>
        </div>
      </div>
    );

    if (s === 'api-keys') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Generate an RSA keypair for signed JWT operations. The private key is stored server-side only; the public key can be registered with PingOne.
        </p>
        <div className="cfg-keypair-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={generateKeypair}
            disabled={state.keypairStatus === 'generating'}
          >
            {state.keypairStatus === 'generating' ? 'Generating\u2026' : 'Generate New Keypair'}
          </button>
          {state.keypairMessage && (
            <span className={`cfg-test-result cfg-test-result--${state.keypairStatus}`}>
              {state.keypairStatus === 'success' ? '\u2713' : '\u2717'} {state.keypairMessage}
            </span>
          )}
        </div>
        {state.generatedPublicKey && (
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <div className="form-label">Public Key (copy to PingOne)</div>
            <textarea
              className="form-input cfg-scopes-textarea"
              readOnly
              value={state.generatedPublicKey}
              rows={6}
              onClick={e => (e.target as HTMLTextAreaElement).select()}
            />
            <p className="cfg-field-help">Click to select all. Register this in PingOne Admin &#8594; Credentials.</p>
          </div>
        )}
      </div>
    );

    // IDP Setup tab
    if (s === 'idp-setup-guide') {
      return (
        <div className="cfg-section" style={{ maxWidth: 'none' }}>
          <IdpSetupGuide
            pingoneRegion={state.pingoneRegion}
            pingoneEnvironmentId={state.pingoneEnvironmentId}
            adminRedirectUri={state.adminRedirectUri}
            userRedirectUri={state.userRedirectUri}
            mcpResourceUri={state.mcpResourceUri}
            adminClientId={state.adminClientId}
            userClientId={state.userClientId}
            workerClientId={state.workerClientId}
            copyToClipboard={copyToClipboard}
          />
        </div>
      );
    }


    if (s === 'idp-overview') {
      const base = `https://auth.pingone.${state.pingoneRegion}`;
      const envId = state.pingoneEnvironmentId || '(not configured)';
      const entries = [
        { label: 'PingOne Region', value: state.pingoneRegion || '(not configured)' },
        { label: 'Environment ID', value: envId },
        { label: 'Authorization Endpoint', value: state.pingoneEnvironmentId ? `${base}/${envId}/as/authorize` : '(not configured)' },
        { label: 'Token Endpoint', value: state.pingoneEnvironmentId ? `${base}/${envId}/as/token` : '(not configured)' },
        { label: 'JWKS URI', value: state.pingoneEnvironmentId ? `${base}/${envId}/as/jwks` : '(not configured)' },
        { label: 'Userinfo Endpoint', value: state.pingoneEnvironmentId ? `${base}/${envId}/as/userinfo` : '(not configured)' },
        { label: 'OIDC Discovery', value: state.pingoneEnvironmentId ? `${base}/${envId}/as/.well-known/openid-configuration` : '(not configured)' },
      ];
      return (
        <div className="cfg-section">
          <p className="cfg-section-desc">Current PingOne environment endpoints. Click any value to copy.</p>
          <div className="idp-setup-table">
            {entries.map(({ label, value }) => (
              <div key={label} className="idp-setup-row">
                <span className="idp-setup-label">{label}</span>
                <span className="idp-setup-value">{value}</span>
                {value !== '(not configured)' && (
                  <button type="button" className="idp-copy-btn" onClick={() => copyToClipboard(value, label)} title={`Copy ${label}`}>⎘ Copy</button>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (s === 'idp-clients') {
      const clients = [
        { label: 'Admin Client ID', value: state.adminClientId },
        { label: 'Admin Redirect URI', value: state.adminRedirectUri },
        { label: 'User Client ID', value: state.userClientId },
        { label: 'User Redirect URI', value: state.userRedirectUri },
        { label: 'Worker Client ID', value: state.workerClientId },
        { label: 'MCP Resource URI', value: state.mcpResourceUri },
      ];
      return (
        <div className="cfg-section">
          <p className="cfg-section-desc">OAuth client IDs and redirect URIs registered in PingOne. These are safe to display — register the redirect URIs in each PingOne application.</p>
          <div className="idp-setup-table">
            {clients.map(({ label, value }) => (
              <div key={label} className="idp-setup-row">
                <span className="idp-setup-label">{label}</span>
                <span className="idp-setup-value">{value || '(not configured)'}</span>
                {value && (
                  <button type="button" className="idp-copy-btn" onClick={() => copyToClipboard(value, label)} title={`Copy ${label}`}>⎘ Copy</button>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Feature Flags tab — searchable documentation + toggles
    if (s === 'feature-flags') {
      if (flagsLoading) return <div className="cfg-section"><p className="cfg-section-desc">Loading flags…</p></div>;
      if (flagsError) return <div className="cfg-section"><p className="cfg-section-desc cfg-error-text">⚠ {flagsError}</p></div>;
      if (featureFlags.length === 0) return <div className="cfg-section"><p className="cfg-section-desc">No feature flags configured.</p></div>;

      const q = flagSearch.toLowerCase().trim();
      const visibleFlags = q
        ? featureFlags.filter(f =>
            f.name.toLowerCase().includes(q) ||
            f.id.toLowerCase().includes(q) ||
            f.category.toLowerCase().includes(q) ||
            (f.description || '').toLowerCase().includes(q) ||
            (f.impact || '').toLowerCase().includes(q)
          )
        : featureFlags;
      const categories = Array.from(new Set(visibleFlags.map(f => f.category)));
      return (
        <div className="cfg-section">
          <p className="cfg-section-desc">
            Toggle features on or off — changes apply immediately and persist across restarts.
            Each flag shows its <strong>description</strong> (what it does) and <strong>impact</strong> (what changes when enabled vs disabled).
            Search by name, flag ID, category, or keyword.
          </p>
          <div className="ff-search-row">
            <input
              type="search"
              className="ff-search-input"
              placeholder="Search flags — e.g. &quot;authorize&quot;, &quot;token exchange&quot;, &quot;may_act&quot;…"
              value={flagSearch}
              onChange={e => setFlagSearch(e.target.value)}
              aria-label="Search feature flags"
            />
            {q && (
              <span className="ff-search-count">
                {visibleFlags.length} of {featureFlags.length} flag{featureFlags.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {q && visibleFlags.length === 0 && (
            <p className="ff-search-empty">No flags match "{flagSearch}" — try a different keyword.</p>
          )}
          {categories.map(cat => (
            <div key={cat} className="ff-category-group">
              <h3 className="ff-category-title">{cat}</h3>
              {visibleFlags.filter(f => f.category === cat).map(flag => (
                <div key={flag.id} id={flag.id} className="ff-flag-card">
                  <div className="ff-flag-header">
                    <div className="ff-flag-title-group">
                      <span className="ff-flag-name">{flag.name}</span>
                      <code className="ff-flag-id">{flag.id}</code>
                    </div>
                    <button
                      type="button"
                      className={`ff-toggle-btn${flag.value ? ' ff-toggle-btn--on' : ''}`}
                      onClick={() => toggleFlag(flag.id, !flag.value)}
                      aria-label={`${flag.value ? 'Disable' : 'Enable'} ${flag.name}`}
                    >
                      <span className="ff-toggle-track">
                        <span className="ff-toggle-thumb" />
                      </span>
                      <span className="ff-toggle-text">{flag.value ? 'On' : 'Off'}</span>
                    </button>
                  </div>
                  {flag.description && <p className="ff-flag-desc">{flag.description}</p>}
                  {flag.impact && <p className="ff-flag-impact"><strong>Impact:</strong> {flag.impact}</p>}
                  {(flag as FeatureFlag & { warnIfEnabled?: boolean }).warnIfEnabled && flag.value && (
                    <p className="ff-flag-warn">⚠️ Demo-only — reduces security, do not enable in production.</p>
                  )}
                  {(flag as FeatureFlag & { warnIfDisabled?: boolean }).warnIfDisabled && !flag.value && (
                    <p className="ff-flag-warn">⚠️ Disabling may block transactions or reduce safety.</p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    // Demo Data tab (demo-management) — consolidated from /demo-data
    if (s === 'demo-setup') {
      return (
        <div className="cfg-section cfg-section--full-width">
          <DemoSetupPanel />
        </div>
      );
    }

    if (s === 'ollama-setup') {
      return (
        <div className="cfg-section cfg-section--full-width">
          <OllamaPanel />
        </div>
      );
    }

    if (s === 'helix-setup') {
      return (
        <div className="cfg-section cfg-section--full-width">
          <HelixPanel />
        </div>
      );
    }

    // Fallback for any unknown/future section
    if (s) return (
      <p className="cfg-section-desc">Unknown section: <code>{s}</code></p>
    );

    return null;
  };

  // Render

  return (
    <div className="unified-configuration-page">
      <ConfigurationHeader
        title="Configuration"
        subtitle="Manage your banking demo settings"
        saveStatus={state.saveStatus}
        onSave={saveConfiguration}
        onReset={resetConfiguration}
        onThemeToggle={toggleTheme}
        theme={theme}
      />

      <ConfigurationTabs
        tabs={accessibleTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {currentTab && (
        <div className="configuration-tab-desc-bar">
          <span className="configuration-tab-desc-bar__text">{currentTab.description}</span>
        </div>
      )}

      {currentTab && (
        <div className="configuration-content">
          <div className="configuration-sidebar">
            <SectionNavigation
              sections={currentTab.sections}
              activeSection={state.activeSection}
              onSectionChange={handleSectionChange}
            />
          </div>

          <div className="configuration-main">
            <div className="configuration-section">
              <h2 className="configuration-section__title">
                {state.activeSection.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </h2>
              <div className="configuration-section__content">
                {renderSectionContent()}
              </div>
            </div>
            {activeTab !== 'feature-flags' && (
              <div className="cfg-section-save-bar">
                <button
                  type="button"
                  className={`btn cfg-section-save-btn${state.saveStatus === 'saving' ? ' cfg-section-save-btn--saving' : state.saveStatus === 'saved' ? ' cfg-section-save-btn--saved' : state.saveStatus === 'error' ? ' cfg-section-save-btn--error' : ''}`}
                  onClick={saveConfiguration}
                  disabled={state.saveStatus === 'saving'}
                >
                  {state.saveStatus === 'saving' ? 'Saving…' : state.saveStatus === 'saved' ? '✓ Saved' : state.saveStatus === 'error' ? 'Error — Retry' : 'Save Changes'}
                </button>
                {state.saveStatus === 'saved' && (
                  <span className="cfg-section-save-hint">Settings saved successfully.</span>
                )}
                {state.saveStatus === 'idle' && (
                  <span className="cfg-section-save-hint">Changes are not saved until you click Save Changes.</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedConfigurationPage;
