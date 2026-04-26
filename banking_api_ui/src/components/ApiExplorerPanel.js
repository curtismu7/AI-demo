// banking_api_ui/src/components/ApiExplorerPanel.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ApiExplorerPanel.css';

const POLL_MS = 3000;

function formatJson(val) {
  if (val == null) return null;
  if (typeof val === 'string') {
    try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
  }
  return JSON.stringify(val, null, 2);
}

function methodCls(method) {
  return `aep-method aep-method--${(method || 'GET').toUpperCase()}`;
}

function statusCls(status) {
  return `aep-status ${status >= 200 && status < 300 ? 'aep-status--ok' : 'aep-status--err'}`;
}

function CallRow({ call, isSelected, onClick }) {
  const status = call.response?.status;
  const isErr = !call.success;
  return (
    <div
      className={`aep-call-row${isSelected ? ' aep-call-row--selected' : ''}${isErr ? ' aep-call-row--err' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="aep-call-meta">
        <span className={methodCls(call.method)}>{call.method}</span>
        {status != null && <span className={statusCls(status)}>{status}</span>}
        {call.durationMs != null && <span className="aep-dur">{call.durationMs}ms</span>}
      </div>
      <div className="aep-url" title={call.url}>{call.url}</div>
    </div>
  );
}

function DetailView({ call }) {
  if (!call) {
    return <div className="aep-detail-empty">Select a call to inspect request &amp; response</div>;
  }
  const status = call.response?.status;
  return (
    <div className="aep-detail">
      <div className="aep-detail-title">
        <span className={methodCls(call.method)}>{call.method}</span>
        {status != null && <span className={statusCls(status)}>{status}</span>}
        {call.durationMs != null && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{call.durationMs}ms</span>}
      </div>
      <div className="aep-url-full">{call.url}</div>

      <div className="aep-section">
        <div className="aep-section-label">Request Body</div>
        {call.request?.body ? (
          <pre className="aep-json">{formatJson(call.request.body)}</pre>
        ) : (
          <pre className="aep-json aep-json--none">No request body</pre>
        )}
      </div>

      <div className="aep-section">
        <div className="aep-section-label">Response Body</div>
        {call.response?.body ? (
          <pre className="aep-json">{formatJson(call.response.body)}</pre>
        ) : (
          <pre className="aep-json aep-json--none">No response body</pre>
        )}
      </div>

      <div className="aep-section">
        <div className="aep-section-label">Request Headers</div>
        {call.request?.headers && Object.keys(call.request.headers).length > 0 ? (
          <pre className="aep-json">{formatJson(call.request.headers)}</pre>
        ) : (
          <pre className="aep-json aep-json--none">—</pre>
        )}
      </div>
    </div>
  );
}

export default function ApiExplorerPanel() {
  const [calls, setCalls] = useState([]);
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(null);
  const [live, setLive] = useState(true);
  const [error, setError] = useState(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  const fetchCalls = useCallback(async () => {
    if (!liveRef.current) return;
    try {
      const res = await fetch('/api/api-calls?limit=100', { credentials: 'include' });
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      const data = await res.json();
      setCalls(data.calls || []);
      setStats(data.stats || null);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
    const id = setInterval(fetchCalls, POLL_MS);
    return () => clearInterval(id);
  }, [fetchCalls]);

  const reversed = [...calls].reverse();

  return (
    <div className="aep-root">
      <div className="aep-toolbar">
        <span className="aep-title">📡 API Explorer</span>
        <span className="aep-count">{calls.length} calls</span>
        {error && <span style={{ fontSize: '0.78rem', color: '#991b1b' }}>⚠ {error}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="aep-btn" onClick={() => { setLive(v => !v); }}>
            {live ? '⏸ Pause' : '▶ Live'}
          </button>
          <button className="aep-btn" onClick={() => {
            fetch('/api/api-calls', { method: 'DELETE', credentials: 'include' })
              .then(() => { setCalls([]); setSelected(null); });
          }}>🗑 Clear</button>
        </div>
      </div>

      {stats && (
        <div className="aep-stats-row">
          <div className="aep-stat"><span>Total:</span><strong>{stats.total}</strong></div>
          <div className="aep-stat"><span>Success:</span><strong style={{ color: '#15803d' }}>{stats.success}</strong></div>
          <div className="aep-stat"><span>Errors:</span><strong style={{ color: stats.errors > 0 ? '#991b1b' : '#64748b' }}>{stats.errors}</strong></div>
          {stats.avgDurationMs != null && (
            <div className="aep-stat"><span>Avg:</span><strong>{Math.round(stats.avgDurationMs)}ms</strong></div>
          )}
        </div>
      )}

      <div className="aep-body">
        <div className="aep-list">
          {reversed.length === 0 ? (
            <div className="aep-list-empty">
              No API calls yet.<br />Use the AI agent or test pages to generate calls.
            </div>
          ) : (
            reversed.map(call => (
              <CallRow
                key={call.id}
                call={call}
                isSelected={selected?.id === call.id}
                onClick={() => setSelected(prev => prev?.id === call.id ? null : call)}
              />
            ))
          )}
        </div>
        <DetailView call={selected} />
      </div>
    </div>
  );
}
