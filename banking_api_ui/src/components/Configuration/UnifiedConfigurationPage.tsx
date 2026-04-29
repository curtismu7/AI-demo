// banking_api_ui/src/components/Configuration/UnifiedConfigurationPage.tsx
import { type FC, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { notifySuccess, notifyError } from '../../utils/appToast';
import { savePublicConfig, loadPublicConfig } from '../../services/configService';
import { useAgentUiMode } from '../../context/AgentUiModeContext';
import { useEducationUI } from '../../context/EducationUIContext';
import { useIndustryBranding } from '../../context/IndustryBrandingContext';
import { useTheme } from '../../context/ThemeContext';
import './UnifiedConfigurationPage.css';
import { MCPToolsEducation } from '../MCPToolsEducation';

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
    sections: ['demo-scenarios', 'account-setup', 'transaction-data', 'agent-modes']
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
    description: 'Vercel deploy URL, worker app secrets, debug logging, and RSA keypair generation',
    requiresAuth: true,
    requiredRole: 'admin',
    sections: ['worker-app', 'debug-settings', 'api-keys']
  },
  {
    id: 'idp-setup',
    label: 'IDP Setup',
    icon: '🏛',
    description: 'Read-only reference — PingOne endpoints and registered OAuth client IDs',
    requiresAuth: true,
    requiredRole: 'admin',
    sections: ['idp-overview', 'idp-clients']
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
  agentTransactionCountLimit: 0,
  agentTransactionValueLimit: 0,
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

  const { placement: ctxAgentUiMode } = useAgentUiMode();
  useEducationUI();
  const { industryId: ctxIndustryId } = useIndustryBranding();
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
          agentTransactionCountLimit: Number(cfg.agent_transaction_count_limit) || 0,
          agentTransactionValueLimit: Number(cfg.agent_transaction_value_limit) || 0,
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
          debugShowTokenDetails: !!cfg.debug_show_token_details,
          debugShowApiCalls: !!cfg.debug_show_api_calls,
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
      });

      if (isAdminUser) {
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
        if (!settingsRes.ok) {
          throw new Error('Failed to update runtime security settings');
        }
      }

      setState(prev => ({ ...prev, saveStatus: 'saved' }));
      notifySuccess('Configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setState(prev => ({ ...prev, saveStatus: 'error' }));
      notifyError('Failed to save configuration');
    }
  }, [state, isAdminUser]);

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
      .then(r => r.json())
      .then((data: { flags?: FeatureFlag[] }) => {
        if (!cancelled) {
          setFeatureFlags(data.flags || []);
          setFlagsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFlagsError('Failed to load feature flags — is the API server running?');
          setFlagsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [activeTab]);

  const toggleFlag = useCallback(async (flagId: string, newValue: boolean) => {
    setFeatureFlags(prev => prev.map(f => f.id === flagId ? { ...f, value: newValue } : f));
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates: { [flagId]: newValue } }),
      });
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
          label="Admin Client ID"
          value={state.adminClientId}
          onChange={field('adminClientId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="Client ID of a PingOne Worker application with Management API roles (e.g. Environment Admin or Identity Data Admin). The BFF uses this to call PingOne Management APIs for user lookup, MFA enrollment, and configuration queries. Create one in PingOne → Applications → + Application → Worker."
        />
        <CfgSecretField
          label="Admin Client Secret"
          fieldKey="adminClientSecret"
          value={state.adminClientSecret}
          showSecrets={state.showSecrets}
          onToggle={toggleSecret}
          onChange={field('adminClientSecret')}
          help="The client secret for the Worker app. Found in PingOne → Applications → your Worker app → Overview → Client Secret."
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
        <p className="cfg-section-desc">Two OAuth 2.0 clients are needed: one for <strong>admin</strong> access (manages PingOne config) and one for <strong>end-user</strong> banking login. Both use Authorization Code flow. The admin app is a confidential client (has a secret); the user app uses PKCE (public client). Create each in PingOne → Applications, then paste the client ID, secret, and redirect URI here.</p>
        <h3 className="cfg-subsection-title">Admin App (Authorization Code)</h3>
        <CfgField label="Admin Client ID" value={state.adminClientId} onChange={field('adminClientId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" help="Client ID of the PingOne web application used for admin login (/admin route). In PingOne: Applications → your admin app → Overview → Client ID." />
        <CfgSecretField label="Admin Client Secret" fieldKey="adminClientSecret" value={state.adminClientSecret} showSecrets={state.showSecrets} onToggle={toggleSecret} onChange={field('adminClientSecret')} help="The client secret for the admin app. In PingOne: Applications → your admin app → Overview → Client Secret. This is sent server-side only — never exposed to the browser." />
        <CfgField label="Admin Redirect URI" value={state.adminRedirectUri} onChange={field('adminRedirectUri')} placeholder="https://yourdomain.com/api/auth/oauth/admin/callback" help="The callback URL PingOne redirects to after admin login. Must exactly match what’s registered in PingOne → admin app → Configuration → Redirect URIs. Format: https://yourdomain.com/api/auth/oauth/admin/callback" />
        <h3 className="cfg-subsection-title">User App (Authorization Code + PKCE)</h3>
        <CfgField label="User Client ID" value={state.userClientId} onChange={field('userClientId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" help="Client ID of the PingOne SPA application used for end-user banking login. In PingOne: Applications → your user app → Overview → Client ID. This app should have PKCE enabled (no client secret required for the flow)." />
        <CfgSecretField label="User Client Secret" fieldKey="userClientSecret" value={state.userClientSecret} showSecrets={state.showSecrets} onToggle={toggleSecret} onChange={field('userClientSecret')} help="Optional for PKCE flows. If your PingOne user app is configured as a confidential client, enter the secret here. For public SPA clients, leave blank." />
        <CfgField label="User Redirect URI" value={state.userRedirectUri} onChange={field('userRedirectUri')} placeholder="https://yourdomain.com/api/auth/oauth/user/callback" help="The callback URL PingOne redirects to after user login. Must exactly match the redirect URI in PingOne → user app → Configuration. Format: https://yourdomain.com/api/auth/oauth/user/callback" />
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
          label="Step-Up Threshold (USD)"
          value={String(state.mfaStepUpThreshold)}
          onChange={v => setState(prev => ({ ...prev, mfaStepUpThreshold: Number(v) || 0, saveStatus: 'idle' }))}
          type="number"
          help="Dollar amount that triggers MFA step-up. Any single transfer at or above this value will require the user to complete an MFA challenge before the agent can proceed. Default: $500. Set to 0 to require MFA for every transfer."
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
          <label className="form-label">
            <input
              type="checkbox"
              checked={state.cibaEnabled}
              onChange={e => setState(prev => ({ ...prev, cibaEnabled: e.target.checked, saveStatus: 'idle' }))}
              style={{ marginRight: '8px' }}
            />
            Enable CIBA (Backchannel Authentication)
          </label>
          <p className="cfg-field-help">CIBA (Client-Initiated Backchannel Authentication) sends out-of-band push notifications to the user’s registered device for MFA. When enabled, high-value transfers trigger a PingOne push instead of an inline challenge. Requires a PingOne MFA policy with push notifications configured.</p>
        </div>
      </div>
    );

    if (s === 'token-exchange') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">RFC 8693 Token Exchange lets the BFF swap a user’s access token (and optionally an agent client-credentials token) for a narrowly-scoped MCP Gateway token. This is how the AI agent gets permission to call banking tools on the user’s behalf — the resulting token carries an <code>act</code> claim showing who delegated and who is acting. Configure the MCP server connection and the PingOne app that performs the exchange.</p>
        <CfgField
          label="MCP Server URL"
          value={state.mcpServerUrl}
          onChange={field('mcpServerUrl')}
          placeholder="wss://your-mcp-server.railway.app"
          help="WebSocket URL where the MCP tool server is running. The BFF connects here to execute banking tools (get_accounts, transfer_funds, etc.). Usually deployed to Railway, Render, or Fly.io. Format: wss://your-host.railway.app"
        />
        <CfgField
          label="MCP Resource URI"
          value={state.mcpResourceUri}
          onChange={field('mcpResourceUri')}
          placeholder="https://your-mcp-server.railway.app"
          help="The audience (aud) claim value for exchanged MCP tokens. This must match the resource URI registered in PingOne for the MCP Token Exchanger app. PingOne uses this to scope the resulting token to only this resource server. Usually the HTTPS URL of your MCP server."
        />
        <CfgField
          label="Worker Client ID"
          value={state.workerClientId}
          onChange={field('workerClientId')}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          help="Client ID of the PingOne MCP Token Exchanger application (type: Worker or AI Agent). This app has the \u2018Token Exchange\u2019 grant type enabled and performs the RFC 8693 exchange. In PingOne: Applications → MCP Token Exchanger → Overview → Client ID."
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
          <strong>Step 2:</strong> Pick a demo scenario. Each preset loads different sample bank accounts, transaction amounts, and agent prompts. For example, <em>High-Value Transactions</em> pre-loads transfers above the MFA threshold so step-up authentication triggers immediately during a demo.
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
          help="Default: balanced mix of accounts and transactions. High-Value: large transfers that trigger MFA step-up. Agent Showcase: optimised for demonstrating AI agent delegation and consent flows. MFA Heavy: every action requires multi-factor authentication."
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
        <p className="cfg-section-desc">Choose the starting scenario for new demo sessions. Each preset configures the combination of accounts, transaction amounts, alert triggers, and agent prompt suggestions that appear when a user logs in. Switch scenarios between demos to showcase different capabilities.</p>
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
          help="Changing the scenario takes effect on the next session or page refresh. It does not affect currently active sessions."
        />
      </div>
    );

    if (s === 'account-setup') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">Set how many sample bank accounts each demo user gets. These are auto-generated with realistic names (Checking, Savings, Investment, etc.) and balances. More accounts give the AI agent more data to work with when answering questions like “What’s my total balance?”</p>
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
        <p className="cfg-section-desc">Control how the AI agent UI appears in the banking app. <em>Standard</em> shows the floating action button (FAB) in the corner and a chat panel that slides in. <em>Minimal</em> shows just the FAB with no animations. <em>Advanced</em> adds developer overlays showing internal state and tool calls. <em>Disabled</em> removes the agent completely.</p>
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
          help="Standard: best for customer-facing demos. Minimal: reduced visual footprint. Advanced: shows token details and tool execution in realtime — great for developer audiences. Disabled: hides all agent UI elements."
        />
      </div>
    );

    if (s === 'mcp-scopes') return (
      <div className="cfg-section">
        <p className="cfg-section-desc">
          Define which OAuth scopes the AI agent is allowed to request when performing an RFC 8693 token exchange. These scopes determine what the agent can do with the resulting MCP token. Enter one scope per line. Common scopes: <code>openid</code> (identity), <code>profile</code> (name/email), <code>p1:read:user</code> (PingOne user data), <code>bankingapi</code> (banking operations).
        </p>
        <div className="form-group">
          <label className="form-label">Allowed MCP Scopes (one per line)</label>
          <textarea
            className="form-input cfg-scopes-textarea"
            value={state.mcpScopes}
            onChange={e => setState(prev => ({ ...prev, mcpScopes: e.target.value, saveStatus: 'idle' }))}
            rows={8}
            placeholder={'openid\nprofile\nemail\np1:read:user\nbankingapi'}
            spellCheck={false}
          />
          <p className="cfg-field-help">One scope per line. These are passed as the <code>scope</code> parameter during RFC 8693 token exchange. The PingOne token endpoint will only grant scopes that are also configured on the MCP Token Exchanger application in PingOne. If a scope is listed here but not granted to the app, PingOne silently ignores it.</p>
        </div>
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
        <p className="cfg-section-desc">The education panel is a step-by-step overlay that explains what’s happening during OAuth flows (login, token exchange, MFA). It’s useful for demos and learning, but you may want to hide it for polished customer presentations.</p>
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

    // Feature Flags tab
    if (s === 'feature-flags') {
      if (flagsLoading) return <div className="cfg-section"><p className="cfg-section-desc">Loading flags…</p></div>;
      if (flagsError) return <div className="cfg-section"><p className="cfg-section-desc cfg-error-text">⚠ {flagsError}</p></div>;
      if (featureFlags.length === 0) return <div className="cfg-section"><p className="cfg-section-desc">No feature flags configured.</p></div>;

      const categories = Array.from(new Set(featureFlags.map(f => f.category)));
      return (
        <div className="cfg-section">
          <p className="cfg-section-desc">Toggle in-development features. Changes apply immediately and are persisted to the server — they survive restarts.</p>
          {categories.map(cat => (
            <div key={cat} className="ff-category-group">
              <h3 className="ff-category-title">{cat}</h3>
              {featureFlags.filter(f => f.category === cat).map(flag => (
                <div key={flag.id} className="ff-flag-card">
                  <div className="ff-flag-header">
                    <span className="ff-flag-name">{flag.name}</span>
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
                </div>
              ))}
            </div>
          ))}
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
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedConfigurationPage;
