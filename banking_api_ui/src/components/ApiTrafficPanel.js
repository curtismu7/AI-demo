// banking_api_ui/src/components/ApiTrafficPanel.js
import React, { useState, useEffect } from 'react';
import { subscribe, getAll } from '../services/apiTrafficStore';
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

/** Absolute URL for same-origin /api paths (shown in traffic detail). */
function absoluteApiUrl(relativePath) {
  if (typeof window === 'undefined' || !relativePath) return relativePath || '';
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${window.location.origin}${path}`;
}

/** Single JSON snapshot: full request + response for debugging. */
function buildHttpExchangeSnapshot(entry) {
  const fullUrl = absoluteApiUrl(entry.url);
  return {
    request: {
      method: (entry.method || 'GET').toUpperCase(),
      path: entry.url,
      fullUrl,
      headers: entry.requestHeaders || {},
      body: entry.requestBody ?? null,
    },
    response: {
      status: entry.status,
      headers: entry.responseHeaders || {},
      body: entry.responseBody ?? null,
      error: entry.error || null,
    },
    meta: {
      durationMs: entry.duration,
      timestamp: entry.timestamp,
      source: entry.source,
    },
  };
}

function HeadersView({ headers }) {
  if (!headers || !Object.keys(headers).length)
    return <p className="api-detail-muted">No headers captured.</p>;
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
    const icons = {
      'user-token':               { label: 'T1', cls: 'TOKEN-T1' },
      'exchanged-token':          { label: 'XCHG', cls: 'TOKEN-XCHG' },
      'exchange-required':        { label: '8693', cls: 'TOKEN-FAIL' },
      'user-scopes-insufficient': { label: 'SCP', cls: 'TOKEN-FAIL' },
      'exchange-failed':          { label: 'FAIL', cls: 'TOKEN-FAIL' },
      'mcp-token-reused':         { label: 'T2↩', cls: 'TOKEN-T2' },
    };
    const { label, cls } = icons[entry.eventId] || { label: 'TOK', cls: 'TOKEN-T1' };
    return <span className={`api-method-badge api-method-badge--${cls}`}>{label}</span>;
  }
  if (entry.url === '/api/mcp/tool' || entry.source === 'mcp') {
    return <span className="api-method-badge api-method-badge--MCP">MCP</span>;
  }
  const m = (entry.method || 'GET').toUpperCase();
  const cls = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m) ? m : 'GET';
  return <span className={`api-method-badge api-method-badge--${cls}`}>{m}</span>;
}

function entryLabel(entry) {
  if (entry.kind === 'token-event') return entry.url;
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
      <div className="api-detail-tabs" role="tablist" aria-label="Token event details">
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
  const [tab, setTab] = useState('full');
  const isMcp = entry.url === '/api/mcp/tool';
  const fullUrl = absoluteApiUrl(entry.url);
  const tabs = [
    { id: 'full', label: 'Full exchange' },
    { id: 'response', label: 'Response' },
    { id: 'request', label: 'Request body' },
    { id: 'req-headers', label: 'Req headers' },
    { id: 'res-headers', label: 'Res headers' },
  ];

  return (
    <>
      <div className="api-detail-tabs" role="tablist" aria-label="HTTP exchange details">
        {tabs.map(t => (
          <button key={t.id} type="button"
            className={`api-detail-tab${tab === t.id ? ' api-detail-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>
      <div className="api-detail-content">
        <div className="api-detail-summary">
          <div className="api-detail-summary-row">
            <span className="api-detail-summary-label">Full URL</span>
            <code className="api-detail-summary-value api-detail-summary-value--url">{fullUrl}</code>
          </div>
          <div className="api-detail-summary-row api-detail-summary-row--inline">
            <span><span className="api-detail-summary-label">Method</span>{' '}
              <strong>{(entry.method || 'GET').toUpperCase()}</strong></span>
            <span><span className="api-detail-summary-label">Status</span>{' '}
              <strong>{entry.status ?? '—'}</strong></span>
            {entry.duration != null && (
              <span><span className="api-detail-summary-label">Duration</span>{' '}
                <strong>{entry.duration}ms</strong></span>
            )}
            <span><span className="api-detail-summary-label">Time</span>{' '}
              <span className="api-detail-summary-mono">{entry.timestamp || '—'}</span></span>
          </div>
          {isMcp && (
            <p className="api-detail-mcp-line">
              🔌 MCP tool <strong>{entry.requestBody?.tool || 'tool call'}</strong>
            </p>
          )}
        </div>
        {entry.error && <div className="api-detail-err">Network error: {entry.error}</div>}
        {tab === 'full'       && <JsonView value={buildHttpExchangeSnapshot(entry)} />}
        {tab === 'response'   && <JsonView value={entry.responseBody} />}
        {tab === 'request'    && <JsonView value={entry.requestBody} />}
        {tab === 'req-headers' && <HeadersView headers={entry.requestHeaders} />}
        {tab === 'res-headers' && <HeadersView headers={entry.responseHeaders} />}
      </div>
    </>
  );
}

// ── Full-page viewer ───────────────────────────────────────────────────────────

/**
 * Read-only API traffic viewer: list + detail. Search and filter only; no agent chrome.
 */
export default function ApiTrafficPanel() {
  const [entries, setEntries] = useState(() => getAll());
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => subscribe(setEntries), []);

  const filtered = entries.filter(e => matchFilter(e, filter, search));

  return (
    <div className="api-traffic-panel api-traffic-panel--page">
      <header className="api-traffic-header api-traffic-header--page">
        <div className="api-traffic-title">
          <span>API traffic</span>
          <span className="api-traffic-count">{filtered.length}</span>
        </div>
        <div className="api-traffic-toolbar">
          <input
            className="api-traffic-search"
            placeholder="Filter by URL / tool…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Filter by URL or tool name"
          />
          <label className="api-traffic-filter-label">
            <span className="api-traffic-filter-sr">Category</span>
            <select
              className="api-traffic-filter-select"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              aria-label="Category filter"
            >
              {FILTERS.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="api-traffic-body">
        <div className="api-traffic-list">
          {filtered.length === 0 ? (
            <div className="api-traffic-empty">
              {entries.length === 0
                ? 'No traffic captured yet.\nUse the main app in another tab or window — API calls will appear here via shared storage.'
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
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(entry);
                  }
                }}
              >
                <MethodBadge entry={entry} />
                <StatusBadge entry={entry} />
                <span
                  className="api-entry-url"
                  title={entry.kind === 'token-event' ? entryLabel(entry) : absoluteApiUrl(entry.url)}
                >{entryLabel(entry)}</span>
                {entry.duration != null && <span className="api-entry-dur">{entry.duration}ms</span>}
              </div>
            ))
          )}
        </div>

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
