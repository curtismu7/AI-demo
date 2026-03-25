// banking_api_ui/src/components/McpInspector.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../services/apiClient';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import PageNav from './PageNav';
import '../styles/appShellPages.css';
import './DemoDataPage.css';
import './McpInspector.css';

/**
 * Normalize API errors so the UI shows the server's message (not generic axios text).
 * @param {import('axios').AxiosError} err
 * @param {string} fallback
 */
function formatAxiosError(err, fallback) {
  const d = err.response?.data;
  const msg =
    (typeof d?.message === 'string' && d.message.trim()) ||
    (typeof d?.error_description === 'string' && d.error_description.trim()) ||
    (typeof d?.error === 'string' && d.error.trim());
  if (msg) return msg;
  if (err.response?.status === 401) {
    return 'Not authorized (401). Sign out and sign in again — MCP needs a live OAuth token in your session.';
  }
  return err.message || fallback;
}

/**
 * Demo MCP Inspector: live tools/list + tools/call via BFF (MCP Host proxy).
 * Complements LangChain MCP Host JSON at REACT_APP_LANGCHAIN_INSPECTOR_URL (default :8081/inspector/mcp-host).
 */
const McpInspector = ({ user, onLogout }) => {
  const { open } = useEducationUI();
  const [context, setContext] = useState(null);
  const [tools, setTools] = useState([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const [paramsJson, setParamsJson] = useState('{}');
  const [lastInvoke, setLastInvoke] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const langchainInspector =
    process.env.REACT_APP_LANGCHAIN_INSPECTOR_URL || 'http://localhost:8081/inspector/mcp-host';

  const dashboardPath = user?.role === 'admin' ? '/admin' : '/dashboard';

  const loadContext = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/mcp/inspector/context');
      setContext(data);
    } catch (e) {
      console.error(e);
      setError(formatAxiosError(e, 'Failed to load inspector context'));
    }
  }, []);

  const refreshTools = useCallback(async () => {
    setLoadingTools(true);
    setError('');
    try {
      const { data } = await apiClient.get('/api/mcp/inspector/tools');
      setTools(data.tools || []);
    } catch (e) {
      setError(formatAxiosError(e, 'tools/list failed'));
      setTools([]);
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
    refreshTools();
  }, [loadContext, refreshTools]);

  const handleSelectTool = t => {
    setSelectedTool(t);
    setParamsJson('{}');
    setLastInvoke(null);
  };

  const handleInvoke = async () => {
    if (!selectedTool) return;
    let params;
    try {
      params = JSON.parse(paramsJson || '{}');
    } catch {
      setError('Arguments must be valid JSON');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await apiClient.post('/api/mcp/inspector/invoke', {
        tool: selectedTool.name,
        params,
      });
      setLastInvoke(data);
    } catch (e) {
      setLastInvoke(null);
      setError(formatAxiosError(e, 'Invoke failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mcp-inspector-page app-page-shell">
      <header className="app-page-shell__hero">
        <div className="app-page-shell__hero-top">
          <div>
            <h1 className="app-page-shell__title">MCP Inspector</h1>
            <div className="app-page-shell__lead">
              This page exercises the <strong>BFF</strong> MCP host (session + optional token exchange). The same MCP server and
              Banking API are also used by the <strong>LangChain</strong> MCP host — compare both below.
            </div>
          </div>
          <div className="app-page-shell__actions">
            <Link to={dashboardPath} className="app-page-shell__btn app-page-shell__btn--solid">
              ← Dashboard
            </Link>
            {onLogout && (
              <button type="button" className="app-page-shell__btn" onClick={onLogout}>
                Log out
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="app-page-shell__body">
        <PageNav user={user} onLogout={onLogout} title="MCP Inspector" />

        <div className="app-page-toolbar app-page-toolbar--start mcp-inspector__edu-toolbar">
          <button type="button" className="app-page-toolbar-btn" onClick={() => open(EDU.MCP_PROTOCOL, 'what')}>
            What is MCP?
          </button>
          <button type="button" className="app-page-toolbar-btn" onClick={() => open(EDU.TOKEN_EXCHANGE, 'why')}>
            Token exchange
          </button>
          <button type="button" className="app-page-toolbar-btn" onClick={() => open(EDU.INTROSPECTION, 'why')}>
            Introspection
          </button>
          <button type="button" className="app-page-toolbar-btn" onClick={() => open(EDU.AGENT_GATEWAY, 'overview')}>
            Agent Gateway
          </button>
        </div>

        <div className="mcp-inspector">
          {error && (
            <div className="mcp-inspector__banner mcp-inspector__banner--error" role="alert">
              {error}
            </div>
          )}

          <section className="app-page-card demo-data-section">
            <h2>How MCP tools work (this demo)</h2>
            <p className="demo-data-hint mcp-inspector__hint-tight">
              Use the education buttons above for deep dives: <strong>MCP protocol</strong>, <strong>token exchange</strong>,{' '}
              <strong>introspection</strong>, and <strong>Agent Gateway</strong>. Short version: the BFF holds your session and may
              RFC 8693 exchange before <code>tools/call</code>; the MCP server calls the Banking API with Bearer tokens.
            </p>
          </section>

          {context?.mcpHosts && (
            <section className="app-page-card demo-data-section">
              <h2 className="mcp-inspector__h2-tight">Two MCP hosts — one MCP server — one protected Banking API</h2>
              <p className="demo-data-hint mcp-inspector__hint-mb">
                Demo best practice: show <strong>human</strong> access (BFF) and <strong>agent</strong> access (LangChain) without
                bypassing PingOne, scopes, or MCP.
              </p>
              <div className="mcp-inspector__host-grid">
                <article className="mcp-inspector__host-card mcp-inspector__host-card--bff">
                  <h3>{context.mcpHosts.bff?.title}</h3>
                  <dl className="mcp-inspector__dl">
                    <dt>Audience</dt>
                    <dd>{context.mcpHosts.bff?.audience}</dd>
                    <dt>PingOne / OAuth</dt>
                    <dd>{context.mcpHosts.bff?.pingOneOAuth}</dd>
                    <dt>Token exchange</dt>
                    <dd>{context.mcpHosts.bff?.tokenExchange}</dd>
                    <dt>MCP client</dt>
                    <dd>{context.mcpHosts.bff?.mcpClientTransport}</dd>
                    <dt>Best for the demo</dt>
                    <dd className="mcp-inspector__dd-highlight">{context.mcpHosts.bff?.bestForShowing}</dd>
                  </dl>
                  {context.flow?.length > 0 && (
                    <>
                      <h4 className="mcp-inspector__h4">BFF flow (this inspector)</h4>
                      <ul className="mcp-inspector__flow mcp-inspector__flow--tight">
                        {context.flow.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                      <p className="mcp-inspector__meta">
                        Token exchange here: <strong>{context.tokenExchangeEnabled ? 'enabled' : 'disabled'}</strong> · MCP:{' '}
                        <strong>{context.mcpProtocolVersion}</strong>
                      </p>
                    </>
                  )}
                </article>
                <article className="mcp-inspector__host-card mcp-inspector__host-card--agent">
                  <h3>{context.mcpHosts.langchain?.title}</h3>
                  <dl className="mcp-inspector__dl">
                    <dt>Audience</dt>
                    <dd>{context.mcpHosts.langchain?.audience}</dd>
                    <dt>PingOne / OAuth</dt>
                    <dd>{context.mcpHosts.langchain?.pingOneOAuth}</dd>
                    <dt>Token exchange</dt>
                    <dd>{context.mcpHosts.langchain?.tokenExchange}</dd>
                    <dt>MCP client</dt>
                    <dd>{context.mcpHosts.langchain?.mcpClientTransport}</dd>
                    <dt>Best for the demo</dt>
                    <dd className="mcp-inspector__dd-highlight">{context.mcpHosts.langchain?.bestForShowing}</dd>
                  </dl>
                  <a
                    className="mcp-inspector__btn mcp-inspector__btn--primary mcp-inspector__btn--block"
                    href={langchainInspector}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open LangChain host JSON ({langchainInspector})
                  </a>
                </article>
              </div>
              {context.mcpHosts.shared && (
                <div className="mcp-inspector__shared-strip">
                  <strong>Shared</strong>
                  <p>{context.mcpHosts.shared.mcpServer}</p>
                  <p>{context.mcpHosts.shared.bankingApi}</p>
                </div>
              )}
            </section>
          )}

          <section className="app-page-card demo-data-section">
            <div className="mcp-inspector__row">
              <h2>Live tool catalog</h2>
              <button type="button" className="mcp-inspector__btn" onClick={refreshTools} disabled={loadingTools}>
                {loadingTools ? 'Refreshing…' : 'Refresh tools/list'}
              </button>
            </div>
            <div className="mcp-inspector__tools">
              {tools.length === 0 && !loadingTools && (
                <p className="mcp-inspector__muted">No tools returned (is MCP server up?)</p>
              )}
              {tools.map(t => (
                <button
                  key={t.name}
                  type="button"
                  className={`mcp-inspector__tool-chip${selectedTool?.name === t.name ? ' is-selected' : ''}`}
                  onClick={() => handleSelectTool(t)}
                >
                  <span className="mcp-inspector__tool-name">{t.name}</span>
                  {t.requiresUserAuth && <span className="mcp-inspector__badge">user auth</span>}
                </button>
              ))}
            </div>
          </section>

          {selectedTool && (
            <section className="app-page-card demo-data-section">
              <h2>Invoke: {selectedTool.name}</h2>
              <p className="mcp-inspector__desc">{selectedTool.description}</p>
              {selectedTool.requiredScopes?.length > 0 && (
                <p className="mcp-inspector__scopes">
                  Required scopes: <code>{selectedTool.requiredScopes.join(', ')}</code>
                </p>
              )}
              <label className="mcp-inspector__label">Arguments (JSON)</label>
              <textarea
                className="mcp-inspector__textarea"
                value={paramsJson}
                onChange={e => setParamsJson(e.target.value)}
                rows={8}
                spellCheck={false}
              />
              <button type="button" className="mcp-inspector__btn mcp-inspector__btn--primary" onClick={handleInvoke} disabled={busy}>
                {busy ? 'Calling tools/call…' : 'Run tools/call via BFF'}
              </button>
            </section>
          )}

          {lastInvoke && (
            <section className="app-page-card demo-data-section">
              <h2>Last result</h2>
              <pre className="mcp-inspector__pre">{JSON.stringify(lastInvoke, null, 2)}</pre>
            </section>
          )}

          <section className="app-page-card demo-data-section app-page-card--muted">
            <h2>LangChain chat (separate from MCP WebSocket)</h2>
            <p className="mcp-inspector__muted mcp-inspector__muted--block">
              User messages go to the agent over the chat WebSocket (typically port {context?.langchain_chat_websocket_port || '…'}).
              The agent then calls MCP tools over its own MCP client connection — same server as the BFF, different host process.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default McpInspector;
