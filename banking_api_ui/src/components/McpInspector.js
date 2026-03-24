import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import PageNav from './PageNav';
import './McpInspector.css';

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

  const loadContext = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/mcp/inspector/context');
      setContext(data);
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.message || 'Failed to load inspector context');
    }
  }, []);

  const refreshTools = useCallback(async () => {
    setLoadingTools(true);
    setError('');
    try {
      const { data } = await apiClient.get('/api/mcp/inspector/tools');
      setTools(data.tools || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'tools/list failed');
      setTools([]);
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
    refreshTools();
  }, [loadContext, refreshTools]);

  const handleSelectTool = (t) => {
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
      setError(e.response?.data?.message || e.message || 'Invoke failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mcp-inspector">
      <PageNav user={user} onLogout={onLogout} title="MCP Inspector" />
      <header className="mcp-inspector__header">
        <div>
          <h1>MCP Inspector</h1>
          <p className="mcp-inspector__subtitle">
            This page exercises the <strong>BFF</strong> MCP host (session + optional token exchange). The same MCP server and
            Banking API are also used by the <strong>LangChain</strong> MCP host — compare both below.
          </p>
        </div>
        <div className="mcp-inspector__header-actions">
          <div className="mcp-inspector__edu-btns">
            <button type="button" className="mcp-inspector__btn-ghost" onClick={() => open(EDU.MCP_PROTOCOL, 'what')}>
              What is MCP?
            </button>
            <button type="button" className="mcp-inspector__btn-ghost" onClick={() => open(EDU.TOKEN_EXCHANGE, 'why')}>
              Token exchange
            </button>
            <button type="button" className="mcp-inspector__btn-ghost" onClick={() => open(EDU.INTROSPECTION, 'why')}>
              Introspection
            </button>
            <button type="button" className="mcp-inspector__btn-ghost" onClick={() => open(EDU.AGENT_GATEWAY, 'overview')}>
              Agent Gateway
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mcp-inspector__banner mcp-inspector__banner--error" role="alert">
          {error}
        </div>
      )}

      <section className="mcp-inspector__panel">
        <h2>How MCP tools work (this demo)</h2>
        <p className="mcp-inspector__muted mcp-inspector__mb">
          Use the buttons in the header for deep dives: <strong>MCP protocol</strong>, <strong>token exchange</strong>,{' '}
          <strong>introspection</strong>, and <strong>Agent Gateway</strong>. Short version: the BFF holds your session and may
          RFC 8693 exchange before <code>tools/call</code>; the MCP server calls the Banking API with Bearer tokens.
        </p>
      </section>

      {context?.mcpHosts && (
        <section className="mcp-inspector__panel">
          <h2 className="mcp-inspector__h2-tight">Two MCP hosts — one MCP server — one protected Banking API</h2>
          <p className="mcp-inspector__muted mcp-inspector__mb">
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

      <section className="mcp-inspector__panel">
        <div className="mcp-inspector__row">
          <h2>Live tool catalog</h2>
          <button type="button" className="mcp-inspector__btn" onClick={refreshTools} disabled={loadingTools}>
            {loadingTools ? 'Refreshing…' : 'Refresh tools/list'}
          </button>
        </div>
        <div className="mcp-inspector__tools">
          {tools.length === 0 && !loadingTools && <p className="mcp-inspector__muted">No tools returned (is MCP server up?)</p>}
          {tools.map((t) => (
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
        <section className="mcp-inspector__panel">
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
            onChange={(e) => setParamsJson(e.target.value)}
            rows={8}
            spellCheck={false}
          />
          <button type="button" className="mcp-inspector__btn mcp-inspector__btn--primary" onClick={handleInvoke} disabled={busy}>
            {busy ? 'Calling tools/call…' : 'Run tools/call via BFF'}
          </button>
        </section>
      )}

      {lastInvoke && (
        <section className="mcp-inspector__panel">
          <h2>Last result</h2>
          <pre className="mcp-inspector__pre">{JSON.stringify(lastInvoke, null, 2)}</pre>
        </section>
      )}

      <section className="mcp-inspector__panel mcp-inspector__panel--agent">
        <h2>LangChain chat (separate from MCP WebSocket)</h2>
        <p className="mcp-inspector__muted">
          User messages go to the agent over the chat WebSocket (typically port {context?.langchain_chat_websocket_port || '…'}).
          The agent then calls MCP tools over its own MCP client connection — same server as the BFF, different host process.
        </p>
      </section>
    </div>
  );
};

export default McpInspector;
