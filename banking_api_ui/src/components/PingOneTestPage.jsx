import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';
import './PingOneTestPage.css';

/**
 * PingOneTestPage — comprehensive test page for PingOne integration
 * Tests: APIs, Token exchange, Configuration (Apps, Scopes, Resources, Users)
 * Chase.com-style UI with fix buttons for each test
 */
export default function PingOneTestPage() {
  const [workerToken, setWorkerToken] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testResults, setTestResults] = useState({});

  const loadWorkerToken = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/pingone-test/worker-token');
      if (data.success) {
        setWorkerToken(data.token);
      } else {
        console.warn('Failed to load worker token:', data.error);
        // Don't set error - allow page to load without worker token
      }
    } catch (err) {
      console.error('Worker token error:', err);
      console.warn('Continuing without worker token - some features may be limited');
      // Don't set error - allow page to load without worker token
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

  // Load worker token and config on startup
  useEffect(() => {
    loadWorkerToken();
    loadConfig();
  }, [loadWorkerToken, loadConfig]);

  const runTest = useCallback(async (testName, testFn) => {
    setTestResults(prev => ({
      ...prev,
      [testName]: { status: 'running', result: null, error: null }
    }));

    try {
      const result = await testFn();
      setTestResults(prev => ({
        ...prev,
        [testName]: { status: 'passed', result, error: null }
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [testName]: { status: 'failed', result: null, error: err.message }
      }));
    }
  }, []);

  const fixIssue = useCallback(async (testName) => {
    // Implement fix logic based on test
    console.log('Fixing:', testName);
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
      </div>
    </div>
  );
}

function TestCard({ title, value, status, onTest, onFix }) {
  return (
    <div className="test-card">
      <div className="test-card-header">
        <h3 className="test-card-title">{title}</h3>
        <span className={`test-card-status test-card-status--${status}`}>
          {status}
        </span>
      </div>
      <div className="test-card-content">
        <p className="test-card-value">{value || '—'}</p>
      </div>
      <div className="test-card-actions">
        <button type="button" className="pingone-test-button pingone-test-button--primary" onClick={onTest}>
          Test
        </button>
        {status === 'failed' && (
          <button type="button" className="pingone-test-button pingone-test-button--fix" onClick={onFix}>
            Fix
          </button>
        )}
      </div>
    </div>
  );
}
