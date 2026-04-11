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

// Configuration state interface
interface ConfigurationState {
  // PingOne Configuration
  pingoneRegion: string;
  pingoneEnvironmentId: string;
  pingoneClientId: string;
  pingoneWorkerClientId: string;
  
  // Demo Data Configuration
  demoScenario: string;
  accountTypes: AccountTypeConfig[];
  transactionData: TransactionDataConfig;
  agentAuthDemoMode: string;
  
  // Agent Configuration
  agentUiMode: string;
  mcpScopes: string[];
  educationSettings: EducationConfig;
  tokenChainSettings: TokenChainConfig;
  
  // Industry Branding
  industryId: string;
  customBranding: CustomBrandingConfig;
  
  // Advanced Configuration
  vercelConfig: VercelConfig;
  workerAppConfig: WorkerAppConfig;
  debugSettings: DebugConfig;
  
  // UI State
  activeSection: string;
  validationErrors: Record<string, string[]>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

// Helper interfaces
interface AccountTypeConfig {
  type: string;
  label: string;
  icon: string;
  defaultName: string;
  enabled: boolean;
  balance: number;
}

interface TransactionDataConfig {
  enabled: boolean;
  count: number;
  dateRange: { start: string; end: string };
  categories: string[];
}

interface EducationConfig {
  enabled: boolean;
  autoShow: boolean;
  panel: string;
}

interface TokenChainConfig {
  enabled: boolean;
  showHistory: boolean;
  maxHistory: number;
}

interface CustomBrandingConfig {
  logo: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
}

interface VercelConfig {
  enabled: boolean;
  projectId: string;
  environmentVariables: Record<string, string>;
}

interface WorkerAppConfig {
  enabled: boolean;
  clientId: string;
  scopes: string[];
}

interface DebugConfig {
  enabled: boolean;
  logLevel: string;
  showDetailedErrors: boolean;
}

// Default configuration state
const getDefaultState = (): ConfigurationState => ({
  pingoneRegion: 'com',
  pingoneEnvironmentId: '',
  pingoneClientId: '',
  pingoneWorkerClientId: '',
  demoScenario: 'standard',
  accountTypes: [],
  transactionData: {
    enabled: true,
    count: 50,
    dateRange: { start: '', end: '' },
    categories: ['food', 'transport', 'shopping', 'entertainment']
  },
  agentAuthDemoMode: 'oauth_pkce',
  agentUiMode: 'default',
  mcpScopes: [],
  educationSettings: {
    enabled: true,
    autoShow: true,
    panel: 'default'
  },
  tokenChainSettings: {
    enabled: true,
    showHistory: true,
    maxHistory: 10
  },
  industryId: 'banking',
  customBranding: {
    logo: '',
    colors: {
      primary: '#007bff',
      secondary: '#6c757d',
      accent: '#28a745'
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter'
    }
  },
  vercelConfig: {
    enabled: false,
    projectId: '',
    environmentVariables: {}
  },
  workerAppConfig: {
    enabled: false,
    clientId: '',
    scopes: []
  },
  debugSettings: {
    enabled: false,
    logLevel: 'warn',
    showDetailedErrors: false
  },
  activeSection: 'pingone-basics',
  validationErrors: {},
  saveStatus: 'idle'
});

// Configuration Header Component
const ConfigurationHeader: React.FC<{
  title: string;
  subtitle: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onSave: () => void;
  onReset: () => void;
  onThemeToggle?: () => void;
  theme?: string;
}> = ({ title, subtitle, saveStatus, onSave, onReset, onThemeToggle, theme }) => {
  return (
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
};

// Configuration Tabs Component
const ConfigurationTabs: React.FC<{
  tabs: typeof CONFIGURATION_TABS;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}> = ({ tabs, activeTab, onTabChange }) => {
  return (
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
};

// Section Navigation Component
const SectionNavigation: React.FC<{
  sections: string[];
  activeSection: string;
  onSectionChange: (section: string) => void;
}> = ({ sections, activeSection, onSectionChange }) => {
  const sectionTitles = {
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

// Main Unified Configuration Page Component
const UnifiedConfigurationPage: React.FC<{
  user: any;
  onLogout: () => void;
}> = ({ user, onLogout }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // State management
  const [state, setState] = useState<ConfigurationState>(getDefaultState);
  const [activeTab, setActiveTab] = useState('quick-start');
  
  // Context hooks
  const { placement: agentUiMode } = useAgentUiMode();
  useEducationUI();
  const { industryId } = useIndustryBranding();
  const { theme, toggleTheme } = useTheme();

  // Load initial configuration
  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        const publicConfig = await loadPublicConfig();
        setState(prevState => ({
          ...prevState,
          ...publicConfig,
          agentUiMode: agentUiMode || 'default',
          industryId: industryId || 'banking'
        }));
      } catch (error) {
        console.error('Failed to load configuration:', error);
      }
    };

    loadConfiguration();
  }, [agentUiMode, industryId]);

  // Handle initial tab from URL params
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && CONFIGURATION_TABS.find(tab => tab.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Filter tabs based on user permissions
  const accessibleTabs = useMemo(() => {
    return CONFIGURATION_TABS.filter(tab => {
      if (tab.requiresAuth && !user) return false;
      if (tab.requiredRole && user?.role !== tab.requiredRole) return false;
      return true;
    });
  }, [user]);

  // Get current tab
  const currentTab = useMemo(() => {
    return accessibleTabs.find(tab => tab.id === activeTab);
  }, [accessibleTabs, activeTab]);

  // Update state
  const updateState = useCallback((updates: Partial<ConfigurationState>) => {
    setState(prevState => ({ ...prevState, ...updates }));
  }, []);

  // Save configuration
  const saveConfiguration = useCallback(async () => {
    setState(prev => ({ ...prev, saveStatus: 'saving' }));
    
    try {
      await savePublicConfig(state);
      setState(prev => ({ ...prev, saveStatus: 'saved' }));
      notifySuccess('Configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setState(prev => ({ ...prev, saveStatus: 'error' }));
      notifyError('Failed to save configuration');
    }
  }, [state]);

  // Reset configuration
  const resetConfiguration = useCallback(() => {
    const defaultState = getDefaultState();
    setState(defaultState);
    notifySuccess('Configuration reset to defaults');
  }, []);

  // Handle tab change
  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    const tab = CONFIGURATION_TABS.find(t => t.id === tabId);
    if (tab && tab.sections.length > 0) {
      updateState({ activeSection: tab.sections[0] });
    }
    // Update URL
    navigate(`/configure?tab=${tabId}`, { replace: true });
  }, [navigate, updateState]);

  // Handle section change
  const handleSectionChange = useCallback((sectionId: string) => {
    updateState({ activeSection: sectionId });
  }, [updateState]);

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
                {/* Section content will be rendered here */}
                <p>Configuration section content for {state.activeSection}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedConfigurationPage;
