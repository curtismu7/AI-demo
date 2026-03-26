// banking_api_ui/src/components/ApiTrafficPanel.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { subscribe, getAll, clearTraffic, setPaused, isPausedNow } from '../services/apiTrafficStore';
import './ApiTrafficPanel.css';

const FILTERS = ['All', 'MCP', 'Token', 'HTTP', 'Errors'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Syntax-highlight a JSON object as HTML spans. */
function JsonView({ value }) {
  if (value === null || value === undefined)
    return <pre className="api-json"><span className="api-json-null">null</span></pre>;
  if (typeof value === 'string')
    return <pre className="api-json">{value}</pre>;
  const text = JSON.stringify(value, null, 2);
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"\s*:/g, '<span class="api-json-key">"$1"</span>:')
    .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, ': <span class="api-json-str">"$1"</span>')
    .replace(/:\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g, ': <span class="api-json-num">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="api-json-bool">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="api-json-null">$1</span>');
  // eslint-disable-next-line react/no-danger
  return <pre className="api-json" dangerouslySetInnerHTML={{ __html: html }} />;
}

function HeadersView({ headers }) {
  if (!headers || !Object.keys(headers).length)
    return <p style={{ color: '#475569', fontSize: 12 }}>No headers captured.</p>;
  return (
    <div className="api-detail-kv">
      {Object.entries(headers).map(([k, v]) => (
        <React.Fragment key={k}>
          <span className="api-detail-kv-key">{k}</span>
          <span className="api-detail-kv-val">{String(v)}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function StatusBadge({ entry }) {
  if (entry.kind === 'token-event') {
    const s = entry.eventStatus || 'active';
    const cls = { failed: 'err', skipped: 'skip' }[s] || 'tok';
    return <span className={`api-status-badge api-status-badge--${cls}`}>{s}</span>;
  }
  const { status } = entry;
  if (!status) return <span className="api-status-badge api-status-badge--net">net</span>;
  const cls = status >= 200 && status < 400 ? 'ok' : status === 0 ? 'net' : 'err';
  return <span className={`api-status-badge api-status-badge--${cls}`}>{status}</span>;
}

function MethodBadge({ entry }) {
  if (entry.kind === 'token-event') {
    // Show a distinct badge per token event type
    const icons = {
      'user-token':       { label: 'T1', cls: 'TOKEN-T1' },
      'exchanged-token':  { label: 'XCHG', cls: 'TOKEN-XCHG' },
      'exchange-skipped': { label: 'SKIP', cls: 'TOKEN-SKIP' },
      'exchange-failed':  { label: 'FAIL', cls: 'TOKEN-FAIL' },
      'mcp-token-reused': { label: 'T2↩', cls: 'TOKEN-T2' },
    };
    const { label, cls } = icons[entry.eventId] || { label: 'TOK', cls: 'TOKEN-T1' };
    return <span className={`api-method-badge api-method-badge--${cls}`}>{label}</span>;
  }
  // MCP HTTP calls — show "MCP" badge instead of "POST"
  if (entry.url === '/api/mcp/tool' || entry.source === 'mcp') {
    return <span className="api-method-badge api-method-badge--MCP">MCP</span>;
  }
  const m = (entry.method || 'GET').toUpperCase();
  const cls = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m) ? m : 'GET';
  return <span className={`api-method-badge api-method-badge--${cls}`}>{m}</span>;
}

/** Human-readable label for the entry list. */
function entryLabel(entry) {
  if (entry.kind === 'token-event') return entry.url; // "[toolName] User Token"
  // Annotate /api/mcp/tool with the tool name from the request body
  if (entry.url === '/api/mcp/tool' && entry.requestBody?.tool)
    return `/api/mcp/tool → ${entry.requestBody.tool}`;
  return entry.url;
}

function matchFilter(entry, filter, search) {
  if (search) {
    const q = search.toLowerCase();
    if (!entryLabel(entry).toLowerCase().includes(q)) return false;
  }
  if (filter === 'MCP')
    return entry.url === '/api/mcp/tool' || entry.kind === 'token-event';
  if (filter === 'Token')
    return entry.kind === 'token-event';
  if (filter === 'HTTP')
    return entry.kind !== 'token-event';
  if (filter === 'Errors')
    return !!entry.error || entry.status >= 400 || entry.status === 0 ||
      entry.eventStatus === 'failed';
  return true;
}

// ── Token Event Detail ────────────────────────────────────────────────────────

function TokenEventDetail({ entry }) {
  const [tab, setTab] = useState('summary');
  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'claims', label: 'JWT Claims' },
    ...(entry.jwtHeader ? [{ id: 'header', label: 'JWT Header' }] : []),
    ...(entry.exchangeDetails ? [{ id: 'exchange', label: 'Exchange Params' }] : []),
  ];

  return (
    <>
      <div className="api-detail-tabs">
        {tabs.map(t => (
          <button key={t.id} type="button"
            className={`api-detail-tab${tab === t.id ? ' api-detail-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>
      <div className="api-detail-content">
        <div className="api-token-event-header">
          <span className="api-token-event-label">{entry.eventLabel || entry.eventId}</span>
          <span className={`api-token-event-status api-token-event-status--${entry.eventStatus || 'active'}`}>
            {entry.eventStatus || 'active'}
          </span>
          {entry.alg && <span className="api-token-event-alg">{entry.alg}</span>}
        </div>
        {entry.rfc && (
          <p className="api-token-event-rfc">📋 {entry.rfc}</p>
        )}
        {entry.mayActPresent !== undefined && (
          <p className="api-token-event-may-act">
            {entry.mayActPresent
              ? `✅ may_act present${entry.mayActValid === false ? ' (mismatch)' : ''}`
              : '⚠️ may_act absent'}
          </p>
        )}
        {tab === 'summary' && (
          <p className="api-token-event-explanation">{entry.explanation || 'No explanation available.'}</p>
        )}
        {tab === 'claims'    && <JsonView value={entry.claims} />}
        {tab === 'header'    && <JsonView value={entry.jwtHeader} />}
        {tab === 'exchange'  && <JsonView value={entry.exchangeDetails} />}
      </div>
    </>
  );
}

// ── HTTP Entry Detail ─────────────────────────────────────────────────────────

function HttpEntryDetail({ entry }) {
  const [tab, setTab] = useState('response');
  const isMcp = entry.url === '/api/mcp/tool';
  const tabs = [
    { id: 'response', label: 'Response' },
    { id: 'request', label: 'Request Body' },
    { id: 'req-headers', label: 'Req Headers' },
    { id: 'res-headers', label: 'Res Headers' },
  ];

  return (
    <>
      <div className="api-detail-tabs">
        {tabs.map(t => (
          <button key={t.id} type="button"
            className={`api-detail-tab${tab === t.id ? ' api-detail-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>
      <div className="api-detail-content">
        <p className="api-detail-url">
          {isMcp
            ? <>🔌 MCP <strong>{entry.requestBody?.tool || 'tool call'}</strong></>
            : <>{(entry.method || 'GET').toUpperCase()} {entry.url}</>
          }
          {entry.duration != null && ` — ${entry.duration}ms`}
          {' '}<span style={{ color: '#64748b', fontSize: 10 }}>{entry.timestamp}</span>
        </p>
        {entry.error && <div className="api-detail-err">Network error: {entry.error}</div>}
        {tab === 'response'    && <JsonView value={entry.responseBody} />}
        {tab === 'request'     && <JsonView value={entry.requestBody} />}
        {tab === 'req-headers' && <HeadersView headers={entry.requestHeaders} />}
        {tab === 'res-headers' && <HeadersView headers={entry.responseHeaders} />}
      </div>
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

/** Floating draggable API + MCP + Token-Exchange viewer. */
export default function ApiTrafficPanel({ onClose }) {
  const [entries, setEntries] = useState(() => getAll());
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [paused, setPausedState] = useState(() => isPausedNow());

  const panelRef = useRef(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => subscribe(setEntries), []);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragging.current = true;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragging.current || !panelRef.current) return;
      panelRef.current.style.left   = `${e.clientX - dragOffset.current.x}px`;
      panelRef.current.style.top    = `${e.clientY - dragOffset.current.y}px`;
      panelRef.current.style.right  = 'auto';
      panelRef.current.style.bottom = 'auto';
    };
    const handleMouseUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleTogglePause = () => { const n = !paused; setPaused(n); setPausedState(n); };
  const handleClear = () => { clearTraffic(); setSelected(null); };
  const handlePopOut = () => window.open('/api-traffic', 'ApiTraffic', 'width=1200,height=800,scrollbars=yes,resizable=yes');

  const filtered = entries.filter(e => matchFilter(e, filter, search));

  return (
    <div className="api-traffic-panel" ref={panelRef}>
      {/* Header */}
      <div className="api-traffic-header" onMouseDown={handleMouseDown}>
        <div className="api-traffic-title">
          <span>🌐 API Traffic</span>
          <span className="api-traffic-count">{filtered.length}</span>
          {paused && <span style={{ fontSize: 11, color: '#fbbf24' }}>⏸ paused</span>}
        </div>
        <div className="api-traffic-toolbar">
          <input
            className="api-traffic-search"
            placeholder="Filter by URL / tool…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onMouseDown={e => e.stopPropagation()}
          />
          <button type="button" className={`api-traffic-btn${paused ? ' api-traffic-btn--pause' : ''}`} onClick={handleTogglePause}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button type="button" className="api-traffic-btn" onClick={handleClear}>Clear</button>
          <button type="button" className="api-traffic-btn" onClick={handlePopOut} title="Open in new window">⤢</button>
          <button type="button" className="api-traffic-btn api-traffic-btn--close" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="api-traffic-filter-row">
        {FILTERS.map(f => (
          <button key={f} type="button"
            className={`api-traffic-chip${filter === f ? ' api-traffic-chip--active' : ''}`}
            onClick={() => setFilter(f)}
          >{f}</button>
        ))}
      </div>

      {/* Body */}
      <div className="api-traffic-body">
        {/* Entry list */}
        <div className="api-traffic-list">
          {filtered.length === 0 ? (
            <div className="api-traffic-empty">
              {entries.length === 0
                ? 'No traffic captured yet.\nUse the agent or make an API call.'
                : 'No entries match the current filter.'}
            </div>
          ) : (
            filtered.map(entry => (
              <div
                key={entry.id}
                className={[
                  'api-traffic-entry',
                  selected?.id === entry.id ? 'api-traffic-entry--selected' : '',
                  entry.kind === 'token-event' ? 'api-traffic-entry--token' : '',
                  (entry.error || entry.status >= 400 || entry.status === 0 || entry.eventStatus === 'failed')
                    ? 'api-traffic-entry--error' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelected(entry)}
              >
                <MethodBadge entry={entry} />
                <StatusBadge entry={entry} />
                <span className="api-entry-url" title={entryLabel(entry)}>{entryLabel(entry)}</span>
                {entry.duration != null && <span className="api-entry-dur">{entry.duration}ms</span>}
              </div>
            ))
          )}
        </div>

        {/* Detail pane */}
        <div className="api-traffic-detail">
          {!selected ? (
            <div className="api-detail-empty">← Select an entry to inspect</div>
          ) : selected.kind === 'token-event' ? (
            <TokenEventDetail entry={selected} />
          ) : (
            <HttpEntryDetail entry={selected} />
          )}
        </div>
      </div>
    </div>
  );
}
