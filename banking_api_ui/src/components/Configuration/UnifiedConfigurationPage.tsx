// banking_api_ui/src/components/Configuration/UnifiedConfigurationPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { notifySuccess, notifyError } from '../../utils/appToast';
import { savePublicConfig, loadPublicConfig } from '../../services/configService';
import { useAgentUiMode } from '../../context/AgentUiModeContext';
import { useEducationUI } from '../../context/EducationUIContext';
import { useIndustryBranding } from '../../context/IndustryBrandingContext';
import { useTheme } from '../../context/ThemeContext';
import './UnifiedConfigurationPage.css';

// Configuration tab definitions
const CONFIGURATION_TABS = [
  {
    id: 'quick-start',
    label: 'Quick Start',
    icon: 'rocket',
    description: 'Get started with basic configuration',
    requiresAuth: false,
    sections: ['pingone-basics', 'demo-data-setup', 'industry-branding']
  },
  {
    id: 'pingone-config',
    label: 'PingOne Setup',
    icon: 'shield',
    description: 'Configure PingOne authentication and services',
    requiresAuth: true,
    requiredRole: 'admin',
    sections: ['pingone-connection', 'oauth-flows', 'mfa-settings', 'token-exchange']
  },
  {
    id: 'demo-management',
    label: 'Demo Data',
    icon: 'database',
    description: 'Manage demo scenarios and test data',
    requiresAuth: false,
    sections: ['demo-scenarios', 'account-setup', 'transaction-data', 'agent-modes']
  },
  {
    id: 'agent-configuration',
    label: 'Agent Settings',
    icon: 'robot',
    description: 'Configure AI agent behavior and integration',
    requiresAuth: true,
    sections: ['agent-ui-mode', 'mcp-scopes', 'education-settings', 'token-chain']
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: 'settings',
    description: 'Advanced configuration and troubleshooting',
    requiresAuth: true,
    requiredRole: 'admin',
    sections: ['vercel-config', 'worker-app', 'debug-settings', 'api-keys']
  }
];

// Flat configuration state
interface ConfigurationState {
  // PingOne connection
  pingoneRegion: string;
  pingoneEnvironmentId: string;
  // OAuth clients
  adminClientId: string;
  adminClientSecret: string;
  adminRedirectUri: string;
  userClientId: string;
  userClientSecret: string;
  userRedirectUri: string;
  // MFA
  mfaPolicyId: string;
  mfaStepUpThreshold: number;
  cibaEnabled: boolean;
  // Token Exchange / MCP
  mcpServerUrl: string;
  mcpResourceUri: string;
  workerClientId: string;
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
  adminRedirectUri: '',
  userClientId: '',
  userClientSecret: '',
  userRedirectUri: '',
  mfaPolicyId: '',
  mfaStepUpThreshold: 500,
  cibaEnabled: false,
  mcpServerUrl: '',
  mcpResourceUri: '',
  workerClientId: '',
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

const CfgField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  help?: string;
  placeholder?: string;
  disabled?: boolean;
}> = ({ label, value, onChange, type = 'text', help, placeholder, disabled }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
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

const CfgSecretField: React.FC<{
  label: string;
  fieldKey: string;
  value: string;
  showSecrets: Record<string, boolean>;
  onToggle: (key: string) => void;
  onChange: (v: string) => void;
  help?: string;
}> = ({ label, fieldKey, value, showSecrets, onToggle, onChange, help }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
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

const CfgSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  help?: string;
}> = ({ label, value, onChange, options, help }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    <select className="form-input" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {help && <p className="cfg-field-help">{help}</p>}
  </div>
);

const CfgToggle: React.FC<{
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

const ConfigurationHeader: React.FC<{
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
            onClick={onThemeToggle}
            className="configuration-header__btn configuration-header__btn--theme"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        )}
        <button
          onClick={onReset}
          className="configuration-header__btn configuration-header__btn--secondary"
          disabled={saveStatus === 'saving'}
        >
          Reset to Defaults
        </button>
        <button
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

const ConfigurationTabs: React.FC<{
  tabs: typeof CONFIGURATION_TABS;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}> = ({ tabs, activeTab, onTabChange }) => (
  <nav className="configuration-tabs" role="tablist">
    {tabs.map(tab => (
      <button
        key={tab.id}
        className={`configuration-tab ${activeTab === tab.id ? 'active' : ''}`}
        onClick={() => onTabChange(tab.id)}
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls={`tabpanel-${tab.id}`}
      >
        <span className="tab-icon">{tab.icon}</span>
        <div className="tab-content">
          <span className="tab-label">{tab.label}</span>
          <span className="tab-description">{tab.description}</span>
        </div>
      </button>
    ))}
  </nav>
);

const SectionNavigation: React.FC<{
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
    'education-settings': 'Education Settings',
    'token-chain': 'Token Chain',
    'vercel-config': 'Vercel Configuration',
    'worker-app': 'Worker Application',
    'debug-settings': 'Debug Settings',
    'api-keys': 'API Keys'
  };

  return (
    <nav className="section-navigation">
      <h3 className="section-navigation__title">Sections</h3>
      <ul className="section-navigation__list">
        {sections.map(section => (
          <li key={section}>
            <button
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

// Main Component

const UnifiedConfigurationPage: React.FC<{
  user: unknown;
  onLogout: () => void;
}> = ({ user }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = useState<ConfigurationState>(getDefaultState);
  const [activeTab, setActiveTab] = useState('quick-start');

  const { placement: ctxAgentUiMode } = useAgentUiMode();
  useEducationUI();
  const { industryId: ctxIndustryId } = useIndustryBranding();
  const { theme, toggleTheme } = useTheme();

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
          adminRedirectUri: (cfg.admin_redirect_uri as string) || '',
          userClientId: (cfg.user_client_id as string) || '',
          userClientSecret: (cfg.user_client_secret as string) || '',
          userRedirectUri: (cfg.user_redirect_uri as string) || '',
          mfaPolicyId: (cfg.pingone_mfa_policy_id as string) || '',
          mfaStepUpThreshold: Number(cfg.mfa_step_up_threshold) || 500,
          cibaEnabled: !!cfg.ciba_enabled,
          mcpServerUrl: (cfg.mcp_server_url as string) || '',
          mcpResourceUri: (cfg.mcp_resource_uri as string) || '',
          workerClientId: (cfg.authorize_worker_client_id as string) || '',
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
          debugShowTokenDetails: !!cfg.debug_show_token_details,
          debugShowApiCalls: !!cfg.debug_show_api_calls,
        }));
      } catch (error) {
        console.error('Failed to load configuration:', error);
      }
    };
    loadConfiguration();
  }, [ctxAgentUiMode, ctxIndustryId]);

  // Handle initial tab from URL params
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && CONFIGURATION_TABS.find(tab => tab.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Callbacks

  const toggleSecret = useCallback((key: string) => {
    setState(prev => ({ ...prev, showSecrets: { ...prev.showSecrets, [key]: !prev.showSecrets[key] } }));
  }, []);

  const field = useCallback((key: keyof ConfigurationState) => (v: string) => {
    setState(prev => ({ ...prev, [key]: v, saveStatus: 'idle' }));
  }, []);

  const setIndustry = useCallback((id: string) => {
    setState(prev => ({ ...prev, industryId: id, saveStatus: 'idle' }));
  }, []);

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
      setState(prev => ({
        ...prev,
        connectionTestStatus: data.success ? 'success' : 'error',
        connectionTestMessage: data.message || (data.success ? 'Connected!' : 'Connection failed'),
      }));
    } catch (_e) {
      setState(prev => ({ ...prev, connectionTestStatus: 'error', connectionTestMessage: 'Network error' }));
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
      const data = await res.json() as { success: boolean; publicKey?: string; message?: string };
      setState(prev => ({
        ...prev,
        keypairStatus: data.success ? 'success' : 'error',
        keypairMessage: data.message || (data.success ? 'Keypair generated' : 'Generation failed'),
        generatedPublicKey: data.publicKey || '',
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
        admin_redirect_uri: state.adminRedirectUri,
        user_client_id: state.userClientId,
        user_client_secret: state.userClientSecret,
        user_redirect_uri: state.userRedirectUri,
        pingone_mfa_policy_id: state.mfaPolicyId,
        mfa_step_up_threshold: state.mfaStepUpThreshold,
        ciba_enabled: state.cibaEnabled,
        mcp_server_url: state.mcpServerUrl,
        mcp_resource_uri: state.mcpResourceUri,
        authorize_worker_client_id: state.workerClientId,
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
      });
      setState(prev => ({ ...prev, saveStatus: 'saved' }));
      notifySuccess('Configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setState(prev => ({ ...prev, saveStatus: 'error' }));
      notifyError('Failed to save configuration');
    }
  }, [state]);

  const resetConfiguration = useCallback(() => {
    setState(getDefaultState());
    notifySuccess('Configuration reset to defaults');
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

  const accessibleTabs = useMemo(() => {
    return CONFIGURATION_TABS.filter(tab => {
      if (tab.requiresAuth && !user) return false;
      if ((tab as { requiredRole?: string }).requiredRole &&
          (user as { role?: string })?.role !== (tab as { requiredRole?: string }).requiredRole) return false;
      return true;
    });
  }, [user]);

  const currentTab = useMemo(() => {
    return accessibleTabs.find(tab => tab.id === activeTab);
  }, [accessibleTabs, activeTab]);

  // Section content renderer

  const renderSectionContent = () => {
    const s = state.activeSection;

    // PingOne Config tab
    if (s === 'pingone-connection') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Connect this demo to your PingOne environment. Enter the environment details, then test the connection.</p>
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
        />
        <CfgField
          label="Environment ID"
          value={state.pingoneEnvironmentId}
          onChange={field('pingoneEnvironmentId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="Found in PingOne Admin → Environment → Properties"
        />
        <CfgField
          label="Admin Client ID"
          value={state.adminClientId}
          onChange={field('adminClientId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="Worker app client ID with Management API roles"
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
        <p className="cfg-section-desc">Configure OAuth 2.0 client credentials for admin and customer user flows.</p>
        <h3 className="cfg-subsection-title">Admin App (Authorization Code)</h3>
        <CfgField label="Admin Client ID" value={state.adminClientId} onChange={field('adminClientId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        <CfgSecretField label="Admin Client Secret" fieldKey="adminClientSecret" value={state.adminClientSecret} showSecrets={state.showSecrets} onToggle={toggleSecret} onChange={field('adminClientSecret')} />
        <CfgField label="Admin Redirect URI" value={state.adminRedirectUri} onChange={field('adminRedirectUri')} placeholder="https://yourdomain.com/api/auth/oauth/admin/callback" />
        <h3 className="cfg-subsection-title">User App (Authorization Code + PKCE)</h3>
        <CfgField label="User Client ID" value={state.userClientId} onChange={field('userClientId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        <CfgSecretField label="User Client Secret" fieldKey="userClientSecret" value={state.userClientSecret} showSecrets={state.showSecrets} onToggle={toggleSecret} onChange={field('userClientSecret')} />
        <CfgField label="User Redirect URI" value={state.userRedirectUri} onChange={field('userRedirectUri')} placeholder="https://yourdomain.com/api/auth/oauth/user/callback" />
      </div>
    );

    if (s === 'mfa-settings') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Configure PingOne MFA policy and step-up authentication thresholds.</p>
        <CfgField
          label="MFA Policy ID"
          value={state.mfaPolicyId}
          onChange={field('mfaPolicyId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="PingOne Admin → Security → MFA → Policies"
        />
        <CfgField
          label="Step-Up Threshold (USD)"
          value={String(state.mfaStepUpThreshold)}
          onChange={v => setState(prev => ({ ...prev, mfaStepUpThreshold: Number(v) || 0, saveStatus: 'idle' }))}
          type="number"
          help="Transactions above this amount require MFA step-up. Default: 500"
        />
        <div className="form-group">
          <label className="form-label">
            <input
              type="checkbox"
              checked={state.cibaEnabled}
              onChange={e => setState(prev => ({ ...prev, cibaEnabled: e.target.checked, saveStatus: 'idle' }))}
              style={{ marginRight: '8px' }}
            />
            Enable CIBA (Backchannel Authentication)
          </label>
          <p className="cfg-field-help">Required for out-of-band MFA push notifications via PingOne.</p>
        </div>
      </div>
    );

    if (s === 'token-exchange') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Configure RFC 8693 Token Exchange for the AI Agent MCP server.</p>
        <CfgField
          label="MCP Server URL"
          value={state.mcpServerUrl}
          onChange={field('mcpServerUrl')}
          placeholder="wss://your-mcp-server.railway.app"
          help="WebSocket URL of the deployed MCP server"
        />
        <CfgField
          label="MCP Resource URI"
          value={state.mcpResourceUri}
          onChange={field('mcpResourceUri')}
          placeholder="https://your-mcp-server.railway.app"
          help="RFC 8693 audience URI for the MCP access token"
        />
        <CfgField
          label="Worker Client ID"
          value={state.workerClientId}
          onChange={field('workerClientId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="PingOne Authorize worker app for token exchange decisions"
        />
      </div>
    );

    // Quick Start tab
    if (s === 'pingone-basics') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Enter your PingOne environment details to get started. For full OAuth credentials and advanced settings, go to the <strong>PingOne Config</strong> tab.
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
          help="Select the region where your PingOne environment is hosted"
        />
        <CfgField
          label="Environment ID"
          value={state.pingoneEnvironmentId}
          onChange={field('pingoneEnvironmentId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="Found in PingOne Admin → Environment → Properties"
        />
        <div className="cfg-next-step-hint">
          <span>&#10003; Next:</span> Go to <strong>PingOne Config &#8594; OAuth Flows</strong> to add client credentials.
        </div>
      </div>
    );

    if (s === 'demo-data-setup') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Choose the demo scenario that best fits your use case. This sets the default transactions, accounts, and agent behaviour shown in the demo.
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
          help="Controls which transactions, alerts, and agent prompts appear by default"
        />
      </div>
    );

    if (s === 'industry-branding') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Select an industry to apply the matching branding preset — logo, colour palette, and sample account names update automatically.
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
        <p className="cfg-section-desc">Configure which demo banking scenarios are available to testers.</p>
        <CfgSelect
          label="Active Demo Scenario"
          value={state.demoScenario}
          onChange={v => setState(prev => ({ ...prev, demoScenario: v, saveStatus: 'idle' }))}
          options={[
            { value: 'default',       label: 'Default Banking Demo' },
            { value: 'high-value',    label: 'High-Value Transactions' },
            { value: 'agent-focused', label: 'AI Agent Showcase' },
            { value: 'mfa-heavy',     label: 'MFA & Step-Up Auth Focus' },
          ]}
          help="Sets the starting scenario when a new demo session begins"
        />
      </div>
    );

    if (s === 'account-setup') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Configure demo bank accounts generated for each test user.</p>
        <CfgField
          label="Number of Demo Accounts"
          value={String(state.accountCount)}
          onChange={v => setState(prev => ({ ...prev, accountCount: Number(v) || 1, saveStatus: 'idle' }))}
          type="number"
          help="How many bank accounts each demo user gets (1-5)"
        />
      </div>
    );

    if (s === 'transaction-data') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Configure the sample transaction data shown on the dashboard and used for MFA step-up testing.</p>
        <CfgSelect
          label="Transaction Preset"
          value={state.transactionPreset}
          onChange={v => setState(prev => ({ ...prev, transactionPreset: v, saveStatus: 'idle' }))}
          options={[
            { value: 'standard',   label: 'Standard (mixed, all below threshold)' },
            { value: 'high-value', label: 'High-Value (some above MFA threshold)' },
            { value: 'mixed',      label: 'Mixed (range of values)' },
          ]}
          help="Controls which sample transactions appear in the demo dashboards"
        />
      </div>
    );

    if (s === 'agent-modes') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Choose how the AI agent operates during a demo session.</p>
        <CfgSelect
          label="Agent Operating Mode"
          value={state.agentMode}
          onChange={v => setState(prev => ({ ...prev, agentMode: v, saveStatus: 'idle' }))}
          options={[
            { value: 'hitl',       label: 'Human-in-the-Loop (recommended)' },
            { value: 'autonomous', label: 'Autonomous (agent acts without approval)' },
            { value: 'disabled',   label: 'Disabled (no agent visible)' },
          ]}
          help="HITL mode requires human approval before executing transactions"
        />
      </div>
    );

    // Agent Configuration tab
    if (s === 'agent-ui-mode') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Control how much of the agent UI chrome is shown to end users.</p>
        <CfgSelect
          label="Agent UI Mode"
          value={state.agentUiMode}
          onChange={field('agentUiMode')}
          options={[
            { value: 'standard',  label: 'Standard (FAB + chat panel)' },
            { value: 'minimal',   label: 'Minimal (FAB only, no panel animations)' },
            { value: 'advanced',  label: 'Advanced (dev controls visible)' },
            { value: 'disabled',  label: 'Disabled (no agent UI shown)' },
          ]}
          help="Controls the FAB button, chat panel, and agent debug overlays"
        />
      </div>
    );

    if (s === 'mcp-scopes') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Scopes the AI agent is allowed to request when exchanging tokens via the MCP server. Enter one scope per line.
        </p>
        <div className="form-group">
          <label className="form-label">Allowed MCP Scopes</label>
          <textarea
            className="form-input cfg-scopes-textarea"
            value={state.mcpScopes}
            onChange={e => setState(prev => ({ ...prev, mcpScopes: e.target.value, saveStatus: 'idle' }))}
            rows={8}
            placeholder={'openid\nprofile\nemail\np1:read:user\nbankingapi'}
            spellCheck={false}
          />
          <p className="cfg-field-help">One scope per line. Passed as the &lsquo;scope&rsquo; parameter during RFC 8693 token exchange.</p>
        </div>
      </div>
    );

    if (s === 'education-settings') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Control the educational overlays and annotations shown during the demo.</p>
        <CfgToggle
          label="Show Education Panel"
          checked={state.showEducationPanel}
          onChange={v => setState(prev => ({ ...prev, showEducationPanel: v, saveStatus: 'idle' }))}
          help="Displays the step-by-step OAuth flow explanation panel on login pages"
        />
      </div>
    );

    if (s === 'token-chain') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Configure the token chain display that shows how tokens flow through the system.</p>
        <CfgToggle
          label="Enable Token Chain Display"
          checked={state.enableTokenChainDisplay}
          onChange={v => setState(prev => ({ ...prev, enableTokenChainDisplay: v, saveStatus: 'idle' }))}
          help="Shows the live token chain visualiser on the dashboard"
        />
        <CfgField
          label="Max Token History to Display"
          value={String(state.maxTokenChainHistory)}
          onChange={v => setState(prev => ({ ...prev, maxTokenChainHistory: Number(v) || 5, saveStatus: 'idle' }))}
          type="number"
          help="How many recent tokens to show in the chain (5-50)"
        />
      </div>
    );

    // Advanced tab
    if (s === 'vercel-config') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Environment configuration for Vercel serverless deployments. These values override automatic detection when deploying to Vercel.
        </p>
        <CfgField
          label="Deploy URL Override"
          value={state.vercelDeployUrl}
          onChange={field('vercelDeployUrl')}
          placeholder="https://your-app.vercel.app"
          help="Optional: override the auto-detected Vercel deploy URL. Leave blank in most cases."
        />
      </div>
    );

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
            <label className="form-label">Public Key (copy to PingOne)</label>
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
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedConfigurationPage;
