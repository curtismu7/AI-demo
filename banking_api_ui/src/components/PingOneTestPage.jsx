import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';
import TokenDisplay from './TokenDisplay';
import ApiCallDisplay from './ApiCallDisplay';
import { notifySuccess, notifyError, notifyInfo } from '../utils/appToast';
import './PingOneTestPage.css';

// Configuration details for each test - what users need to verify in PingOne
const TEST_CONFIG = {
  authzToken: {
    appName: 'Super Banking User App',
    appType: 'WEB_APP',
    requiredScopes: ['openid', 'profile', 'email', 'banking:accounts:read', 'banking:transactions:read'],
    audience: null,
    spel: null
  },
  agentToken: {
    appName: 'Super Banking MCP Token Exchanger',
    appType: 'WORKER',
    requiredScopes: ['openid'],
    audience: null,
    spel: null
  },
  exchange1: {
    appName: 'Super Banking MCP Token Exchanger',
    appType: 'WORKER',
    requiredScopes: ['openid'],
    audience: 'https://mcp-server.pingdemo.com',
    spel: 'T1 (user token) → MCP token'
  },
  exchange2: {
    appName: 'Super Banking MCP Token Exchanger',
    appType: 'WORKER',
    requiredScopes: ['openid'],
    audience: 'https://mcp-gateway.pingdemo.com',
    spel: 'T1 (user token) + T2 (agent token) → MCP token'
  },
  exchange3: {
    appName: 'Super Banking AI Agent App',
    appType: 'AI_AGENT',
    requiredScopes: ['openid'],
    audience: 'https://agent-gateway.pingdemo.com',
    spel: 'T1 (user token) → T2 (agent token) → MCP token'
  },
  apps: {
    appName: 'Super Banking User App',
    appType: 'WEB_APP',
    requiredScopes: null,
    audience: null,
    spel: null
  },
  resources: {
    appName: 'Super Banking MCP Server',
    appType: 'RESOURCE_SERVER',
    requiredScopes: null,
    audience: 'https://mcp-server.pingdemo.com',
    spel: null
  },
  scopes: {
    appName: 'Super Banking MCP Server',
    appType: 'RESOURCE_SERVER',
    requiredScopes: ['banking:accounts:read', 'banking:accounts:write', 'banking:transactions:read', 'banking:transactions:write'],
    audience: 'https://mcp-server.pingdemo.com',
    spel: null
  },
  users: {
    appName: 'Super Banking User App',
    appType: 'WEB_APP',
    requiredScopes: null,
    audience: null,
    spel: null
  }
};

/**
 * PingOneTestPage — comprehensive test page for PingOne integration
 * Tests: APIs, Token exchange, Configuration (Apps, Scopes, Resources, Users)
 * Chase.com-style UI with fix buttons for each test
 */
export default function PingOneTestPage() {
  const [workerToken, setWorkerToken] = useState(null);
  const [workerTokenExpiry, setWorkerTokenExpiry] = useState(null);
  const [workerTokenError, setWorkerTokenError] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testResults, setTestResults] = useState({});

  // Worker token configuration state
  const [workerConfig, setWorkerConfig] = useState({
    clientId: '',
    clientSecret: '',
    authMethod: 'basic'
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveError, setConfigSaveError] = useState(null);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);
  
  // Asset verification state
  const [assetVerification, setAssetVerification] = useState(null);
  const [verifyingAssets, setVerifyingAssets] = useState(false);
  
  // Token acquisition tests state
  const [authzTokenStatus, setAuthzTokenStatus] = useState('pending');
  const [agentTokenStatus, setAgentTokenStatus] = useState('pending');
  const [authzTokenError, setAuthzTokenError] = useState(null);
  const [agentTokenError, setAgentTokenError] = useState(null);
  
  // Token exchange tests state
  const [exchange1Status, setExchange1Status] = useState('pending');
  const [exchange2Status, setExchange2Status] = useState('pending');
  const [exchange3Status, setExchange3Status] = useState('pending');
  const [exchange1Error, setExchange1Error] = useState(null);
  const [exchange2Error, setExchange2Error] = useState(null);
  const [exchange3Error, setExchange3Error] = useState(null);

  // Current time for updating time remaining display
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second to refresh time remaining display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load test results from localStorage on mount
  useEffect(() => {
    const savedResults = localStorage.getItem('pingoneTestResults');
    if (savedResults) {
      const results = JSON.parse(savedResults);
      setAuthzTokenStatus(results.authzTokenStatus || 'pending');
      setAgentTokenStatus(results.agentTokenStatus || 'pending');
      setAuthzTokenError(results.authzTokenError || null);
      setAgentTokenError(results.agentTokenError || null);
      setExchange1Status(results.exchange1Status || 'pending');
      setExchange2Status(results.exchange2Status || 'pending');
      setExchange3Status(results.exchange3Status || 'pending');
      setExchange1Error(results.exchange1Error || null);
      setExchange2Error(results.exchange2Error || null);
      setExchange3Error(results.exchange3Error || null);
    }
  }, []);

  // Save test results to localStorage whenever they change
  useEffect(() => {
    const results = {
      authzTokenStatus,
      agentTokenStatus,
      authzTokenError,
      agentTokenError,
      exchange1Status,
      exchange2Status,
      exchange3Status,
      exchange1Error,
      exchange2Error,
      exchange3Error
    };
    localStorage.setItem('pingoneTestResults', JSON.stringify(results));
  }, [authzTokenStatus, agentTokenStatus, authzTokenError, agentTokenError, exchange1Status, exchange2Status, exchange3Status, exchange1Error, exchange2Error, exchange3Error]);

  // Load existing worker config from config endpoint on mount
  useEffect(() => {
    const loadWorkerConfig = async () => {
      try {
        const { data } = await apiClient.get('/api/pingone-test/config');
        if (data.success && data.config) {
          setWorkerConfig({
            clientId: data.config.mgmtClientId || '',
            clientSecret: data.config.mgmtClientSecret || '',
            authMethod: data.config.mgmtTokenAuthMethod || 'basic'
          });
        }
      } catch (err) {
        console.warn('Failed to load existing worker config:', err.message);
      }
    };
    loadWorkerConfig();
  }, []);

  const isTokenValid = (expiresAt) => {
    if (!expiresAt) return false;
    try {
      const expiryDate = new Date(expiresAt);
      const now = new Date();
      return expiryDate > now;
    } catch {
      return false;
    }
  };

  const formatExpiryTime = (expiresAt) => {
    if (!expiresAt) return 'Unknown';
    const expiryDate = new Date(expiresAt);
    return expiryDate.toLocaleString();
  };

  const formatTimeRemaining = (expiresAt) => {
    if (!expiresAt) return 'Unknown';
    const expiryDate = new Date(expiresAt);
    const now = currentTime;
    const diffMs = expiryDate - now;
    
    if (diffMs <= 0) return 'Expired';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    
    if (diffHours > 0) {
      return `${diffHours}h ${remainingMins}m`;
    } else {
      return `${remainingMins}m`;
    }
  };

  const loadWorkerToken = useCallback(async () => {
    try {
      notifyInfo('Fetching worker token...', { toastId: 'worker-token-loading' });
      const { data } = await apiClient.get('/api/pingone-test/worker-token');
      console.log('[loadWorkerToken] API response:', data);
      if (data.success) {
        setWorkerToken(data.token);
        setWorkerTokenExpiry({
          expiresAt: data.expiresAt,
          expiresIn: data.expiresIn
        });
        setWorkerTokenError(null);
        notifySuccess('Worker token fetched successfully');
      } else {
        const errorMsg = data.error || 'Failed to fetch worker token';
        setWorkerTokenError(errorMsg);
        notifyError(errorMsg);
      }
    } catch (error) {
      console.error('[loadWorkerToken] Error:', error);
      const errorMsg = error.message || 'Failed to fetch worker token';
      setWorkerTokenError(errorMsg);
      notifyError(errorMsg);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/pingone-test/config');
      if (data.success) {
        setConfig(data.config);
        setLoading(false);
      } else {
        setError('Failed to load config: ' + data.error);
        setLoading(false);
      }
    } catch (err) {
      console.error('Config error:', err);
      setError('Failed to load config: ' + err.message);
      setLoading(false);
    }
  }, []);

  // Load worker token and config on startup; also auto-check authz token so
  // the "Login required" state shows immediately without a manual Test click.
  useEffect(() => {
    loadWorkerToken();
    loadConfig();
    // Silently probe the authz token — if no session the card will show Login button
    apiClient.get('/api/pingone-test/authz-token').then(({ data }) => {
      if (data.success) {
        setAuthzTokenStatus('passed');
        setAuthzTokenError(null);
      } else {
        setAuthzTokenStatus('failed');
        setAuthzTokenError(data.error);
      }
    }).catch(() => { /* network error — leave as pending */ });
  }, [loadWorkerToken, loadConfig]);

  // Poll worker token status - every 5 minutes, or every 1 minute if under 5 minutes remaining
  useEffect(() => {
    if (!workerTokenExpiry) return;

    const getPollInterval = () => {
      if (!workerTokenExpiry.expiresAt) return 5 * 60 * 1000; // 5 minutes default
      const expiryDate = new Date(workerTokenExpiry.expiresAt);
      const now = new Date();
      const diffMs = expiryDate - now;
      const diffMins = Math.floor(diffMs / 60000);
      
      // If under 5 minutes remaining, poll every 1 minute
      if (diffMins < 5 && diffMins > 0) {
        return 1 * 60 * 1000; // 1 minute
      }
      return 5 * 60 * 1000; // 5 minutes
    };

    const interval = setInterval(() => {
      loadWorkerToken();
    }, getPollInterval());

    return () => clearInterval(interval);
  }, [workerTokenExpiry, loadWorkerToken]);

  const runTest = useCallback(async (testName, testFn) => {
    setTestResults(prev => ({
      ...prev,
      [testName]: { status: 'running', result: null, error: null }
    }));
    notifyInfo(`Running ${testName}…`, { toastId: `test-${testName}` });

    try {
      const result = await testFn();
      setTestResults(prev => ({
        ...prev,
        [testName]: { status: 'passed', result, error: null }
      }));
      notifySuccess(`${testName} passed ✓`);
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [testName]: { status: 'failed', result: null, error: err.message }
      }));
      notifyError(`${testName} failed: ${err.message}`);
    }
  }, []);

  const fixIssue = useCallback((testName) => {
    const envId = config?.environmentId;
    const consoleBase = envId
      ? `https://console.pingone.com/edit/${envId}/#`
      : 'https://console.pingone.com';

    const fixActions = {
      environmentId:             { msg: 'Set PINGONE_ENVIRONMENT_ID in your .env file, then restart the server.', url: 'https://console.pingone.com' },
      region:                    { msg: 'Set PINGONE_REGION in .env (e.g. com | eu | ca). Default is com.', url: null },
      adminClientId:             { msg: 'Set PINGONE_ADMIN_CLIENT_ID — copy Client ID from PingOne → Applications → Super Banking Admin App.', url: `${consoleBase}/application/list` },
      userClientId:              { msg: 'Set PINGONE_USER_CLIENT_ID — copy Client ID from PingOne → Applications → Super Banking User App.', url: `${consoleBase}/application/list` },
      mcpTokenExchangerClientId: { msg: 'Set PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID — copy from PingOne → Applications → Super Banking MCP Token Exchanger.', url: `${consoleBase}/application/list` },
      aiAgentClientId:           { msg: 'Set PINGONE_AI_AGENT_CLIENT_ID — copy from PingOne → Applications → Super Banking AI Agent App.', url: `${consoleBase}/application/list` },
      resourceMcpServerUri:      { msg: 'Set PINGONE_RESOURCE_MCP_SERVER_URI — copy the Audience URI from PingOne → Connections → Resource Servers → Super Banking MCP Server.', url: `${consoleBase}/foundation/Resource/list` },
      resourceMcpGatewayUri:     { msg: 'Set PINGONE_RESOURCE_MCP_GATEWAY_URI — Audience URI for the MCP Gateway resource server.', url: `${consoleBase}/foundation/Resource/list` },
      resourceAgentGatewayUri:   { msg: 'Set PINGONE_RESOURCE_AGENT_GATEWAY_URI — Audience URI for the Agent Gateway resource server.', url: `${consoleBase}/foundation/Resource/list` },
      'single-exchange':         { msg: 'Open the MCP Token Exchanger app in PingOne → enable Token Exchange grant → set audience to PINGONE_RESOURCE_MCP_SERVER_URI.', url: `${consoleBase}/application/list` },
      'double-exchange':         { msg: 'Enable Token Exchange with actor tokens on the MCP Token Exchanger app. Check may_act / actor policy in PingOne.', url: `${consoleBase}/application/list` },
      apps:                      { msg: 'In PingOne → Worker App → Roles → assign Read Clients / Applications role.', url: `${consoleBase}/application/list` },
      resources:                 { msg: 'In PingOne → Worker App → Roles → assign Read Resource Servers role.', url: `${consoleBase}/foundation/Resource/list` },
      scopes:                    { msg: 'In PingOne → Worker App → Roles → assign Read Scopes role.', url: `${consoleBase}/foundation/Resource/list` },
      users:                     { msg: 'In PingOne → Worker App → Roles → assign Read Users role.', url: `${consoleBase}/users/list` },
    };

    const action = fixActions[testName];
    if (!action) {
      notifyInfo('Check configuration for this item in PingOne admin console.');
      window.open('https://console.pingone.com', '_blank', 'noopener,noreferrer');
      return;
    }
    notifyInfo(action.msg, { autoClose: 10000 });
    if (action.url) window.open(action.url, '_blank', 'noopener,noreferrer');
  }, [config]);

  const saveWorkerConfig = useCallback(async () => {
    setSavingConfig(true);
    setConfigSaveError(null);
    setConfigSaveSuccess(false);

    try {
      notifyInfo('Saving worker configuration...', { toastId: 'worker-config-saving' });
      const { data } = await apiClient.post('/api/pingone-test/worker-config', {
        clientId: workerConfig.clientId,
        clientSecret: workerConfig.clientSecret,
        authMethod: workerConfig.authMethod
      });

      if (data.success) {
        setConfigSaveSuccess(true);
        notifySuccess('Worker configuration saved successfully');
        // Display details about the storage method
        if (data.details) {
          console.log('[PingOneTest] Storage details:', data.details);
        }
        // Reload config after saving
        const { data: configData } = await apiClient.get('/api/pingone-test/config');
        if (configData.success) {
          setConfig(configData);
        }
        setTimeout(() => setConfigSaveSuccess(false), 5000); // Show success for 5 seconds to allow reading details
      } else {
        const errorMsg = data.error || 'Failed to save configuration';
        setConfigSaveError(errorMsg);
        notifyError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to save configuration';
      setConfigSaveError(errorMsg);
      notifyError(errorMsg);
    } finally {
      setSavingConfig(false);
    }
  }, [workerConfig]);

  const verifyAssets = useCallback(async () => {
    setVerifyingAssets(true);
    setAssetVerification(null);

    try {
      notifyInfo('Verifying PingOne assets...', { toastId: 'verify-assets-loading' });
      const { data } = await apiClient.get('/api/pingone-test/verify-assets');
      if (data.success) {
        setAssetVerification(data.assets);
        notifySuccess('Asset verification completed');
      } else {
        const errorMsg = data.error || 'Asset verification failed';
        setAssetVerification({ error: errorMsg });
        notifyError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err.message || 'Asset verification failed';
      setAssetVerification({ error: errorMsg });
      notifyError(errorMsg);
    } finally {
      setVerifyingAssets(false);
    }
  }, []);

  const testAuthzToken = useCallback(async () => {
    setAuthzTokenStatus('running');
    setAuthzTokenError(null);
    notifyInfo('Testing authorization token…', { toastId: 'test-authz-token' });
    try {
      const { data } = await apiClient.get('/api/pingone-test/authz-token');
      if (data.success) {
        setAuthzTokenStatus('passed');
        notifySuccess('Authorization token found in session ✓');
      } else {
        setAuthzTokenStatus('failed');
        setAuthzTokenError(data.error);
        notifyError(`Auth token: ${data.error}`);
      }
    } catch (err) {
      setAuthzTokenStatus('failed');
      setAuthzTokenError(err.message);
      notifyError(`Auth token error: ${err.message}`);
    }
  }, []);

  const testAgentToken = useCallback(async () => {
    setAgentTokenStatus('running');
    setAgentTokenError(null);
    notifyInfo('Testing agent token (client credentials)…', { toastId: 'test-agent-token' });
    try {
      const { data } = await apiClient.get('/api/pingone-test/agent-token');
      if (data.success) {
        setAgentTokenStatus('passed');
        notifySuccess('Agent client-credentials token acquired ✓');
      } else {
        setAgentTokenStatus('failed');
        setAgentTokenError(data.error);
        notifyError(`Agent token: ${data.error}`);
      }
    } catch (err) {
      setAgentTokenStatus('failed');
      setAgentTokenError(err.message);
      notifyError(`Agent token error: ${err.message}`);
    }
  }, []);

  const testExchange1 = useCallback(async () => {
    setExchange1Status('running');
    setExchange1Error(null);
    notifyInfo('Testing User Token → MCP Token exchange…', { toastId: 'test-exchange1' });
    try {
      const { data } = await apiClient.get('/api/pingone-test/exchange-user-to-mcp');
      if (data.success) {
        setExchange1Status('passed');
        notifySuccess('User → MCP token exchange succeeded ✓');
      } else {
        setExchange1Status('failed');
        setExchange1Error(data.error);
        notifyError(`Exchange 1 failed: ${data.error}`);
      }
    } catch (err) {
      setExchange1Status('failed');
      setExchange1Error(err.message);
      notifyError(`Exchange 1 error: ${err.message}`);
    }
  }, []);

  const testExchange2 = useCallback(async () => {
    setExchange2Status('running');
    setExchange2Error(null);
    notifyInfo('Testing User + Agent Token → MCP Token exchange…', { toastId: 'test-exchange2' });
    try {
      const { data } = await apiClient.get('/api/pingone-test/exchange-user-agent-to-mcp');
      if (data.success) {
        setExchange2Status('passed');
        notifySuccess('User + Agent → MCP token exchange succeeded ✓');
      } else {
        setExchange2Status('failed');
        setExchange2Error(data.error);
        notifyError(`Exchange 2 failed: ${data.error}`);
      }
    } catch (err) {
      setExchange2Status('failed');
      setExchange2Error(err.message);
      notifyError(`Exchange 2 error: ${err.message}`);
    }
  }, []);

  const testExchange3 = useCallback(async () => {
    setExchange3Status('running');
    setExchange3Error(null);
    notifyInfo('Testing User → Agent → MCP three-step exchange…', { toastId: 'test-exchange3' });
    try {
      const { data } = await apiClient.get('/api/pingone-test/exchange-user-to-agent-to-mcp');
      if (data.success) {
        setExchange3Status('passed');
        notifySuccess('User → Agent → MCP three-step exchange succeeded ✓');
      } else {
        setExchange3Status('failed');
        setExchange3Error(data.error);
        notifyError(`Exchange 3 failed: ${data.error}`);
      }
    } catch (err) {
      setExchange3Status('failed');
      setExchange3Error(err.message);
      notifyError(`Exchange 3 error: ${err.message}`);
    }
  }, []);

  const testApps = useCallback(async () => {
    const { data } = await apiClient.get('/api/pingone-test/apps');
    if (!data.success) throw new Error(data.error);
    return { count: data.count, apps: data.apps };
  }, []);

  const testResources = useCallback(async () => {
    const { data } = await apiClient.get('/api/pingone-test/resources');
    if (!data.success) throw new Error(data.error);
    return { count: data.count, resources: data.resources };
  }, []);

  const testScopes = useCallback(async () => {
    // Get resources first to find a resource server ID
    const { data: resourcesData } = await apiClient.get('/api/pingone-test/resources');
    if (!resourcesData.success || !resourcesData.resources?.length) {
      throw new Error('No resource servers found');
    }
    const resourceServerId = resourcesData.resources[0].id;
    
    const { data } = await apiClient.get(`/api/pingone-test/scopes?resourceServerId=${resourceServerId}`);
    if (!data.success) throw new Error(data.error);
    return { count: data.count, scopes: data.scopes, resourceServerId };
  }, []);

  const testUsers = useCallback(async () => {
    const { data } = await apiClient.get('/api/pingone-test/users');
    if (!data.success) throw new Error(data.error);
    return { count: data.count, users: data.users };
  }, []);

  if (loading) {
    return (
      <div className="pingone-test-page">
        <div className="pingone-test-loading">
          <div className="spinner" />
          <p>Loading PingOne test environment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pingone-test-page">
        <div className="pingone-test-error">
          <p className="error-message">⚠️ {error}</p>
          <button type="button" className="pingone-test-button pingone-test-button--primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pingone-test-page">
      <div className="pingone-test-header">
        <h1 className="pingone-test-title">PingOne Integration Test Page</h1>
        <div className="pingone-test-meta">
          <div className="pingone-test-status">
            <span className={`status-indicator ${workerToken ? 'status-indicator--success' : 'status-indicator--error'}`}>
              {workerToken ? 'Worker Token: Active' : 'Worker Token: Missing'}
            </span>
          </div>
          <button
            type="button"
            className="pingone-test-button pingone-test-button--secondary"
            onClick={loadWorkerToken}
          >
            Refresh Worker Token
          </button>
        </div>
      </div>

      <div className="pingone-test-content">
        {/* Worker Token Configuration Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">Worker Token Configuration</h2>
          <div className="worker-token-config">
            <div className="worker-token-config-form">
              <div className="worker-token-info">
                <h3>PingOne Token Endpoint</h3>
                <code className="code-block">
                  POST https://auth.pingone.com/{config?.region || 'com'}/{config?.environmentId}/as/token
                </code>
                <div className="token-params">
                  <strong>Authentication Method: {workerConfig.authMethod || 'basic'}</strong>
                  {workerConfig.authMethod === 'post' ? (
                    <div className="request-details">
                      <strong>Request Body:</strong>
                      <pre className="code-block">
{`{
  "grant_type": "client_credentials",
  "client_id": "${workerConfig.clientId || '...'}",
  "client_secret": "***"
}`}
                      </pre>
                    </div>
                  ) : (
                    <div className="request-details">
                      <strong>Request Headers:</strong>
                      <pre className="code-block">
{`Content-Type: application/x-www-form-urlencoded
Authorization: Basic ${workerConfig.clientId && workerConfig.clientSecret ? '*** (base64(client_id:client_secret))' : '...'}`}
                      </pre>
                      <strong>Request Body:</strong>
                      <pre className="code-block">
{`grant_type=client_credentials`}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
              {workerTokenExpiry && (
                <div className="worker-token-status">
                  <span className={`status-indicator ${isTokenValid(workerTokenExpiry.expiresAt) ? 'status-indicator--success' : 'status-indicator--error'}`}>
                    {isTokenValid(workerTokenExpiry.expiresAt) ? '✓ Token Valid' : '✗ Token Expired'}
                  </span>
                  <span className="token-expiry">
                    Expires: {formatExpiryTime(workerTokenExpiry.expiresAt)}
                  </span>
                  <span className="token-time-remaining">
                    {formatTimeRemaining(workerTokenExpiry.expiresAt)}
                  </span>
                </div>
              )}
              {workerTokenError && (
                <div className="worker-token-error">
                  <span className="status-indicator status-indicator--error">✗ Error</span>
                  <span className="error-message">{workerTokenError}</span>
                </div>
              )}
              {workerToken && (
                <TokenDisplay
                  token={workerToken}
                  label="Worker Token (Management API)"
                  showFullToken={false}
                />
              )}
              <div className="token-actions">
                <button
                  type="button"
                  className="pingone-test-button pingone-test-button--secondary"
                  onClick={loadWorkerToken}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Fetch Worker Token'}
                </button>
                {workerToken && (
                  <button
                    type="button"
                    className="pingone-test-button pingone-test-button--fix"
                    onClick={() => {
                      setWorkerToken(null);
                      setWorkerTokenExpiry(null);
                      setWorkerTokenError(null);
                    }}
                  >
                    Clear Token
                  </button>
                )}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); saveWorkerConfig(); }}>
                <div className="form-group">
                  <label htmlFor="worker-client-id">Client ID</label>
                  <input
                    id="worker-client-id"
                    type="text"
                    className="form-input"
                    value={workerConfig.clientId}
                    onChange={(e) => setWorkerConfig(prev => ({ ...prev, clientId: e.target.value }))}
                    placeholder="Enter PingOne Worker App Client ID"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="worker-client-secret">Client Secret</label>
                  <input
                    id="worker-client-secret"
                    type="password"
                    className="form-input"
                    value={workerConfig.clientSecret}
                    onChange={(e) => setWorkerConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                    placeholder="Enter PingOne Worker App Client Secret"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="worker-auth-method">Token Auth Method</label>
                  <select
                    id="worker-auth-method"
                    className="form-select"
                    value={workerConfig.authMethod}
                    onChange={(e) => setWorkerConfig(prev => ({ ...prev, authMethod: e.target.value }))}
                  >
                    <option value="basic">Basic (Authorization header)</option>
                    <option value="post">Post (body parameters)</option>
                    <option value="none">None (no authentication)</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="pingone-test-button pingone-test-button--primary"
                    disabled={savingConfig}
                  >
                    {savingConfig ? 'Saving...' : 'Save Configuration'}
                  </button>
                {configSaveSuccess && (
                  <span className="config-success">✓ Configuration saved successfully</span>
                )}
                {configSaveError && (
                  <span className="config-error">✗ {configSaveError}</span>
                )}
              </div>
              </form>
            </div>
            <div className="worker-token-config-info">
              <p className="info-text">
                Configure the PingOne Worker App credentials for Management API access.
                These credentials will be saved to .env and Vercel environment variables.
              </p>
              <p className="info-text">
                <strong>Note:</strong> The Worker App must have the Management API roles (Applications, Users, etc.) configured in PingOne.
              </p>
            </div>
          </div>
        </section>

        {/* API Calls Display Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">API Calls</h2>
          <ApiCallDisplay sessionId="pingone-test" />
        </section>

        {/* PingOne Asset Verification Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">PingOne Asset Verification</h2>
          <div className="asset-verification-header">
            <p className="asset-verification-description">
              Verify that all required PingOne assets (Applications, Resources, Scopes, Users) are configured correctly using the worker token.
            </p>
            <div className="asset-verification-actions">
              <button
                type="button"
                className="pingone-test-button pingone-test-button--primary"
                onClick={loadWorkerToken}
                disabled={verifyingAssets}
              >
                Get Worker Token
              </button>
              <button
                type="button"
                className="pingone-test-button pingone-test-button--secondary"
                onClick={verifyAssets}
                disabled={verifyingAssets}
              >
                {verifyingAssets ? 'Verifying...' : 'Verify Assets'}
              </button>
            </div>
          </div>
          {assetVerification && (
            <div className="asset-verification-results">
              {assetVerification.error ? (
                <div className="asset-error">
                  <p className="error-message">Error: {assetVerification.error}</p>
                </div>
              ) : (
                <div className="asset-results-grid">
                  <AssetCard
                    title="Applications"
                    status={assetVerification.applications?.status}
                    count={assetVerification.applications?.count}
                    error={assetVerification.applications?.error}
                  />
                  <AssetCard
                    title="Resource Servers"
                    status={assetVerification.resources?.status}
                    count={assetVerification.resources?.count}
                    error={assetVerification.resources?.error}
                  />
                  <AssetCard
                    title="Scopes"
                    status={assetVerification.scopes?.status}
                    count={assetVerification.scopes?.count}
                    error={assetVerification.scopes?.error}
                  />
                  <AssetCard
                    title="Users"
                    status={assetVerification.users?.status}
                    count={assetVerification.users?.count}
                    error={assetVerification.users?.error}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Token Acquisition Tests Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">Token Acquisition Tests</h2>
          <div className="pingone-test-grid">
            <TestCard
              title="Authorization Code Token"
              status={authzTokenStatus}
              error={authzTokenError}
              onTest={testAuthzToken}
              config={TEST_CONFIG.authzToken}
              loginUrl={authzTokenStatus === 'failed' && authzTokenError && authzTokenError.toLowerCase().includes('log in') ? '/api/auth/oauth/user/login' : null}
            />
            <TestCard
              title="Agent Token (Client Credentials)"
              status={agentTokenStatus}
              error={agentTokenError}
              onTest={testAgentToken}
              config={TEST_CONFIG.agentToken}
            />
          </div>
        </section>

        {/* Token Exchange Tests Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">Token Exchange Tests</h2>
          {authzTokenStatus === 'failed' && authzTokenError && authzTokenError.toLowerCase().includes('log in') && (
            <div className="pingone-test-login-banner">
              <span className="pingone-test-login-banner__text">
                ⚠️ Token exchange requires a user access token. Log in to PingOne first using the Authorization Code + PKCE flow.
              </span>
              <a
                href="/api/auth/oauth/user/login"
                className="pingone-test-button pingone-test-button--primary pingone-test-login-banner__btn"
              >
                Login to PingOne →
              </a>
            </div>
          )}
          <div className="pingone-test-grid">
            <TestCard
              title="User Token → MCP Token"
              status={exchange1Status}
              error={exchange1Error}
              onTest={testExchange1}
              config={TEST_CONFIG.exchange1}
            />
            <TestCard
              title="User Token + Agent Token → MCP Token"
              status={exchange2Status}
              error={exchange2Error}
              onTest={testExchange2}
              config={TEST_CONFIG.exchange2}
            />
            <TestCard
              title="User Token → Agent Token → MCP Token"
              status={exchange3Status}
              error={exchange3Error}
              onTest={testExchange3}
              config={TEST_CONFIG.exchange3}
            />
          </div>
        </section>

        {/* Configuration Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">Configuration</h2>
          <div className="pingone-test-grid">
            <TestCard
              title="Environment ID"
              value={config?.environmentId}
              status={config?.environmentId ? 'passed' : 'failed'}
              onTest={() => runTest('environmentId', () => Promise.resolve(config?.environmentId))}
              onFix={() => fixIssue('environmentId')}
            />
            <TestCard
              title="Region"
              value={config?.region}
              status={config?.region ? 'passed' : 'failed'}
              onTest={() => runTest('region', () => Promise.resolve(config?.region))}
              onFix={() => fixIssue('region')}
            />
            <TestCard
              title="Admin Client ID"
              value={config?.adminClientId}
              status={config?.adminClientId ? 'passed' : 'failed'}
              onTest={() => runTest('adminClientId', () => Promise.resolve(config?.adminClientId))}
              onFix={() => fixIssue('adminClientId')}
            />
            <TestCard
              title="User Client ID"
              value={config?.userClientId}
              status={config?.userClientId ? 'passed' : 'failed'}
              onTest={() => runTest('userClientId', () => Promise.resolve(config?.userClientId))}
              onFix={() => fixIssue('userClientId')}
            />
            <TestCard
              title="MCP Token Exchanger Client ID"
              value={config?.mcpTokenExchangerClientId}
              status={config?.mcpTokenExchangerClientId ? 'passed' : 'failed'}
              onTest={() => runTest('mcpTokenExchangerClientId', () => Promise.resolve(config?.mcpTokenExchangerClientId))}
              onFix={() => fixIssue('mcpTokenExchangerClientId')}
            />
            <TestCard
              title="AI Agent Client ID"
              value={config?.aiAgentClientId}
              status={config?.aiAgentClientId ? 'passed' : 'failed'}
              onTest={() => runTest('aiAgentClientId', () => Promise.resolve(config?.aiAgentClientId))}
              onFix={() => fixIssue('aiAgentClientId')}
            />
          </div>
        </section>

        {/* Resources Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">Resources</h2>
          <div className="pingone-test-grid">
            <TestCard
              title="MCP Server URI"
              value={config?.resourceMcpServerUri}
              status={config?.resourceMcpServerUri ? 'passed' : 'failed'}
              onTest={() => runTest('resourceMcpServerUri', () => Promise.resolve(config?.resourceMcpServerUri))}
              onFix={() => fixIssue('resourceMcpServerUri')}
            />
            <TestCard
              title="MCP Gateway URI"
              value={config?.resourceMcpGatewayUri}
              status={config?.resourceMcpGatewayUri ? 'passed' : 'failed'}
              onTest={() => runTest('resourceMcpGatewayUri', () => Promise.resolve(config?.resourceMcpGatewayUri))}
              onFix={() => fixIssue('resourceMcpGatewayUri')}
            />
            <TestCard
              title="Agent Gateway URI"
              value={config?.resourceAgentGatewayUri}
              status={config?.resourceAgentGatewayUri ? 'passed' : 'failed'}
              onTest={() => runTest('resourceAgentGatewayUri', () => Promise.resolve(config?.resourceAgentGatewayUri))}
              onFix={() => fixIssue('resourceAgentGatewayUri')}
            />
          </div>
        </section>

        {/* Token Exchange Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">Token Exchange</h2>
          <div className="pingone-test-grid">
            <TestCard
              title="1-Exchange (User → MCP)"
              value="Test single token exchange"
              status={testResults['single-exchange']?.status || 'pending'}
              onTest={() => runTest('single-exchange', async () => {
                if (!workerToken) throw new Error('Worker token required');
                const { data } = await apiClient.post('/api/pingone-test/token-exchange', {
                  mode: 'single',
                  subjectToken: workerToken
                });
                return data;
              })}
              onFix={() => fixIssue('single-exchange')}
            />
            <TestCard
              title="2-Exchange (User + Agent → MCP)"
              value="Test double token exchange"
              status={testResults['double-exchange']?.status || 'pending'}
              onTest={() => runTest('double-exchange', async () => {
                if (!workerToken) throw new Error('Worker token required');
                const { data } = await apiClient.post('/api/pingone-test/token-exchange', {
                  mode: 'double',
                  subjectToken: workerToken,
                  actorToken: workerToken
                });
                return data;
              })}
              onFix={() => fixIssue('double-exchange')}
            />
          </div>
        </section>

        {/* PingOne API Tests Section */}
        <section className="pingone-test-section">
          <h2 className="pingone-test-section-title">PingOne API Tests</h2>
          <div className="pingone-test-grid">
            <TestCard
              title="Applications"
              value={testResults['apps']?.result?.count !== undefined ? `${testResults.apps.result.count} apps` : 'Test PingOne applications'}
              status={testResults['apps']?.status || 'pending'}
              onTest={() => runTest('apps', testApps)}
              onFix={() => fixIssue('apps')}
            />
            <TestCard
              title="Resource Servers"
              value={testResults['resources']?.result?.count !== undefined ? `${testResults.resources.result.count} resources` : 'Test PingOne resource servers'}
              status={testResults['resources']?.status || 'pending'}
              onTest={() => runTest('resources', testResources)}
              onFix={() => fixIssue('resources')}
            />
            <TestCard
              title="Scopes"
              value={testResults['scopes']?.result?.count !== undefined ? `${testResults.scopes.result.count} scopes` : 'Test PingOne scopes'}
              status={testResults['scopes']?.status || 'pending'}
              onTest={() => runTest('scopes', testScopes)}
              onFix={() => fixIssue('scopes')}
            />
            <TestCard
              title="Users"
              value={testResults['users']?.result?.count !== undefined ? `${testResults.users.result.count} users` : 'Test PingOne users'}
              status={testResults['users']?.status || 'pending'}
              onTest={() => runTest('users', testUsers)}
              onFix={() => fixIssue('users')}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const TestCard = ({ title, status, error, onTest, onFix, value, config, loginUrl }) => {
  const [testing, setTesting] = React.useState(false);

  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    try {
      await onTest();
    } finally {
      setTesting(false);
    }
  };

  const statusLabel = { passed: '✓ passed', failed: '✗ failed', running: '⟳ testing', pending: '— pending' };

  return (
    <div className={`test-card test-card--${status}`}>
      <div className="test-card-header">
        <h3 className="test-card-title">{title}</h3>
        <span className={`test-card-status test-card-status--${status}`}>
          {statusLabel[status] || status}
        </span>
      </div>
      {value && <p className="test-card-value">{value}</p>}
      {error && <div className="test-card-error">{error}</div>}
      {config && (
        <div className="test-card-config">
          <div className="config-item"><span className="config-label">App:</span><span className="config-value">{config.appName}</span></div>
          <div className="config-item"><span className="config-label">Type:</span><span className="config-value">{config.appType}</span></div>
          {config.requiredScopes && <div className="config-item"><span className="config-label">Scopes:</span><span className="config-value">{config.requiredScopes.join(', ')}</span></div>}
          {config.audience && <div className="config-item"><span className="config-label">Audience:</span><span className="config-value">{config.audience}</span></div>}
          {config.spel && <div className="config-item"><span className="config-label">Flow:</span><span className="config-value">{config.spel}</span></div>}
        </div>
      )}
      <div className="test-card-actions">
        {loginUrl && (
          <a
            href={loginUrl}
            className="pingone-test-button pingone-test-button--primary"
          >
            Login to PingOne →
          </a>
        )}
        {onTest && (
          <button
            type="button"
            className="pingone-test-button pingone-test-button--secondary"
            onClick={handleTest}
            disabled={testing || status === 'running'}
          >
            {testing || status === 'running' ? 'Testing…' : 'Test'}
          </button>
        )}
        {onFix && (
          <button
            type="button"
            className="pingone-test-button pingone-test-button--fix"
            onClick={onFix}
          >
            Fix in PingOne ↗
          </button>
        )}
      </div>
    </div>
  );
};

function AssetCard({ title, status, count, error }) {
  return (
    <div className="asset-card">
      <div className="asset-card-header">
        <h3 className="asset-card-title">{title}</h3>
        <span className={`asset-card-status asset-card-status--${status}`}>
          {status}
        </span>
      </div>
      <div className="asset-card-content">
        <p className="asset-card-count">{count !== undefined ? `${count} found` : '—'}</p>
        {error && <p className="asset-card-error">{error}</p>}
      </div>
    </div>
  );
}
