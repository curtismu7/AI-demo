// banking_api_ui/src/components/McpTrafficPage.js
/**
 * MCP Traffic Viewer — shows live BFF↔MCP and BFF↔PingOne traffic.
 * Polls GET /api/mcp/traffic every 3 seconds.
 * Click any row to expand request/response JSON details in a side panel.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import McpPairView from './McpPairView';

const API_POLL_MS = 3000;
const DEFAULT_LIMIT = 200;

const DIR_COLORS = {
  'BFF→MCP':        { bg: '#dbeafe', color: '#1d4ed8' },
  'MCP→BFF':        { bg: '#dcfce7', color: '#15803d' },
  'BFF→PingOne':    { bg: '#fef9c3', color: '#854d0e' },
  'PingOne→BFF':    { bg: '#fce7f3', color: '#9d174d' },
  'BFF→Authorize':  { bg: '#ede9fe', color: '#6d28d9' },
  'Authorize→BFF':  { bg: '#f3e8ff', color: '#7c3aed' },
};

const TYPE_LABEL = {
  rpc_request:        'RPC REQ',
  rpc_response:       'RPC RESP',
  exchange_request:   'EXCH REQ',
  exchange_response:  'EXCH RESP',
  authorize_request:  'AUTHZ REQ',
  authorize_response: 'AUTHZ RESP',
  error:              'ERROR',
};

function DirBadge({ dir }) {
  const s = DIR_COLORS[dir] || { bg: '#f3f4f6', color: '#374151' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: '4px',
      fontSize: '0.7rem', fontWeight: 700, backgroundColor: s.bg, color: s.color,
      fontFamily: 'monospace', whiteSpace: 'nowrap',
    }}>
      {dir}
    </span>
  );
}

function TypeBadge({ type, ok }) {
  const isErr = type === 'error' || ok === false;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 6px', borderRadius: '4px',
      fontSize: '0.68rem', fontWeight: 600,
      backgroundColor: isErr ? '#fee2e2' : '#f1f5f9',
      color: isErr ? '#991b1b' : '#475569',
      fontFamily: 'monospace', whiteSpace: 'nowrap',
    }}>
      {TYPE_LABEL[type] || type}
    </span>
  );
}

function EntryRow({ entry, idx, isSelected, onClick }) {
  const isErr = entry.type === 'error' || entry.ok === false;
  const ts = new Date(entry.ts).toLocaleTimeString([], {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  });
  const baseBg = isErr ? 'rgba(254,226,226,0.4)' : idx % 2 === 0 ? 'var(--surface-1,#fff)' : 'var(--surface-2,#f8fafc)';
  return (
    <tr onClick={onClick} style={{
      backgroundColor: isSelected ? '#eff6ff' : baseBg,
      borderBottom: '1px solid var(--border-light,#e2e8f0)',
      fontSize: '0.82rem', cursor: 'pointer',
      outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: '-2px',
    }}>
      <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: 'var(--text-muted,#64748b)', whiteSpace: 'nowrap' }}>{ts}</td>
      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}><DirBadge dir={entry.dir} /></td>
      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}><TypeBadge type={entry.type} ok={entry.ok} /></td>
      <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: 'var(--text-secondary,#475569)', whiteSpace: 'nowrap' }}>{entry.method || '—'}</td>
      <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: 'var(--text-secondary,#475569)', whiteSpace: 'nowrap' }}>{entry.tool || '—'}</td>
      <td style={{ padding: '5px 8px', color: 'var(--text-muted,#64748b)', whiteSpace: 'nowrap' }}>{entry.durationMs != null ? `${entry.durationMs}ms` : '—'}</td>
      <td style={{ padding: '5px 10px', color: isErr ? '#991b1b' : 'var(--text-primary,#1e293b)', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.summary}>
        {entry.summary || '—'}
      </td>
      <td style={{ padding: '5px 8px', color: '#3b82f6', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
        {entry.payload ? '► JSON' : ''}
      </td>
    </tr>
  );
}

function JsonBlock({ obj }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(obj, null, 2);
  const copy = () => navigator.clipboard && navigator.clipboard.writeText(json).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  });
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={copy} style={{
        position: 'absolute', top: '6px', right: '6px', padding: '2px 8px',
        borderRadius: '4px', border: '1px solid #cbd5e1',
        background: copied ? '#dcfce7' : '#fff', color: copied ? '#15803d' : '#64748b',
        cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, zIndex: 1,
      }}>{copied ? '✓ Copied' : 'Copy'}</button>
      <pre style={{
        margin: 0, padding: '10px', background: '#f8fafc', borderRadius: '6px',
        border: '1px solid #e2e8f0', fontSize: '0.75rem', lineHeight: 1.6,
        color: '#1e293b', fontFamily: "'Courier New', monospace",
        overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        maxHeight: '480px', overflowY: 'auto',
      }}>{json}</pre>
    </div>
  );
}

function MetaTable({ data }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '4px 6px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top', width: '38%' }}>{k}</td>
            <td style={{ padding: '4px 6px', fontFamily: 'monospace', color: '#1e293b', wordBreak: 'break-all' }}>
              {typeof v === 'boolean'
                ? <span style={{ color: v ? '#15803d' : '#991b1b', fontWeight: 600 }}>{String(v)}</span>
                : String(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, data, raw }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: '1px solid var(--border-light,#e2e8f0)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '8px 14px',
        background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', textAlign: 'left',
      }}>
        <span>{open ? '▾' : '▸'}</span>{title}
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px' }}>
          {raw ? <JsonBlock obj={raw} /> : <MetaTable data={data} />}
        </div>
      )}
    </div>
  );
}

function DetailPanel({ entry, onClose }) {
  const isErr = entry.type === 'error' || entry.ok === false;
  const meta = Object.fromEntries(
    Object.entries({
      timestamp: new Date(entry.ts).toLocaleString(),
      direction: entry.dir,
      type: entry.type,
      method: entry.method,
      tool: entry.tool || null,
      ok: entry.ok,
      durationMs: entry.durationMs != null ? `${entry.durationMs}ms` : null,
      statusCode: entry.statusCode || null,
      correlationId: entry.correlationId || null,
    }).filter(([, v]) => v !== null && v !== undefined)
  );

  return (
    <div style={{
      width: '430px', minWidth: '300px', flexShrink: 0,
      borderLeft: '2px solid var(--border-light,#e2e8f0)',
      background: 'var(--surface-1,#fff)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border-light,#e2e8f0)',
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        background: isErr ? '#fef2f2' : 'var(--surface-2,#f8fafc)', flexShrink: 0,
      }}>
        <DirBadge dir={entry.dir} />
        <TypeBadge type={entry.type} ok={entry.ok} />
        {entry.durationMs != null && (
          <span style={{ fontSize: '0.74rem', color: '#64748b', fontFamily: 'monospace' }}>{entry.durationMs}ms</span>
        )}
        <button type="button" onClick={onClose} style={{
          marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '1.2rem', color: '#94a3b8', lineHeight: 1,
        }} title="Close">×</button>
      </div>
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--border-light,#e2e8f0)',
        fontSize: '0.8rem', color: isErr ? '#991b1b' : 'var(--text-primary,#1e293b)', fontStyle: 'italic',
      }}>{entry.summary || '—'}</div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <Section title="Metadata" data={meta} />
        {entry.payload && (
          <Section
            title={entry.dir && entry.dir.startsWith('BFF') ? 'Request Payload' : 'Response Payload'}
            raw={entry.payload}
          />
        )}
      </div>
    </div>
  );
}

function ToolCard({ tool }) {
  const [open, setOpen] = useState(false);
  const params = tool.inputSchema?.properties || {};
  const required = tool.inputSchema?.required || [];
  return (
    <div style={{
      border: '1px solid var(--border-light,#e2e8f0)', borderRadius: '8px',
      backgroundColor: 'var(--surface-1,#fff)', overflow: 'hidden',
    }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%',
        padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '3px' }}>{open ? '▾' : '▸'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.88rem', color: '#1d4ed8' }}>{tool.name}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary,#475569)', marginTop: '2px', lineHeight: 1.4 }}>{tool.description || '—'}</div>
        </div>
        <span style={{
          padding: '2px 7px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600,
          backgroundColor: '#dbeafe', color: '#1d4ed8', whiteSpace: 'nowrap', flexShrink: 0,
        }}>MCP TOOL</span>
      </button>
      {open && Object.keys(params).length > 0 && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border-light,#e2e8f0)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '6px', marginTop: '8px' }}>Parameters</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <tbody>
              {Object.entries(params).map(([name, schema]) => (
                <tr key={name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '4px 6px', fontFamily: 'monospace', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {name}{required.includes(name) && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
                  </td>
                  <td style={{ padding: '4px 6px', color: '#7c3aed', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{schema.type || 'any'}</td>
                  <td style={{ padding: '4px 6px', color: '#64748b' }}>{schema.description || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function McpToolsPanel() {
  const [tools, setTools] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [source, setSource] = useState(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/mcp/inspector/tools', { credentials: 'include' });
      const data = await res.json();
      setTools(data.tools || []);
      setSource(data._source || null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '0 24px 20px', borderBottom: '2px solid var(--border-light,#e2e8f0)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary,#1e293b)' }}>
          🛠 MCP Tools
        </h2>
        {tools !== null && (
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {tools.length} tool{tools.length !== 1 ? 's' : ''}{source ? ` · ${source}` : ''}
          </span>
        )}
        <button type="button" onClick={load} disabled={loading} style={{
          padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--border-light,#e2e8f0)',
          backgroundColor: tools === null ? '#3b82f6' : 'var(--surface-1,#fff)',
          color: tools === null ? '#fff' : 'var(--text-secondary,#475569)',
          cursor: loading ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.83rem',
        }}>
          {loading ? '⏳ Loading…' : tools === null ? 'Show Tools' : '↻ Refresh'}
        </button>
      </div>
      {err && (
        <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '0.83rem' }}>⚠️ {err}</div>
      )}
      {tools !== null && tools.length === 0 && !err && (
        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No tools returned.</div>
      )}
      {tools && tools.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
          {tools.map(t => <ToolCard key={t.name} tool={t} />)}
        </div>
      )}
    </div>
  );
}

export default function McpTrafficPage() {
  const [entries, setEntries] = useState([]);
  const [live, setLive] = useState(true);
  const [error, setError] = useState(null);
  const [logFile, setLogFile] = useState('');
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const intervalRef = useRef(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  const fetchTraffic = useCallback(async () => {
    if (!liveRef.current) return;
    try {
      const res = await fetch(`/api/mcp/traffic?limit=${DEFAULT_LIMIT}`, { credentials: 'include' });
      if (res.status === 401) { setError('unauthenticated'); return; }
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      const data = await res.json();
      setEntries(data.entries || []);
      setLogFile(data.logFile || '');
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchTraffic();
    intervalRef.current = setInterval(fetchTraffic, API_POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchTraffic]);

  const handleLiveToggle = () => {
    setLive(prev => {
      if (!prev) { liveRef.current = true; fetchTraffic(); }
      return !prev;
    });
  };

  const reversed = [...entries].reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px' }}>
      <div style={{ padding: '16px 24px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary,#1e293b)' }}>
            🔌 MCP Traffic
          </h1>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted,#64748b)', fontFamily: 'monospace' }}>
            {entries.length} entries{logFile ? ` · ${logFile}` : ''}
          </span>
          {!selected && entries.length > 0 && (
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>— click a row to inspect</span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setViewMode(v => v === 'pairs' ? 'list' : 'pairs')} style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-light,#e2e8f0)',
              backgroundColor: viewMode === 'pairs' ? '#ede9fe' : 'var(--surface-1,#fff)',
              color: viewMode === 'pairs' ? '#6d28d9' : 'var(--text-secondary,#475569)',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
            }}>{viewMode === 'pairs' ? '☰ List' : '⇄ Pairs'}</button>
            <button type="button" onClick={handleLiveToggle} style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-light,#e2e8f0)',
              backgroundColor: live ? '#dcfce7' : 'var(--surface-1,#fff)',
              color: live ? '#15803d' : 'var(--text-secondary,#475569)',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
            }}>{live ? '⏸ Pause' : '▶ Live'}</button>
            <button type="button" onClick={() => { setEntries([]); setSelected(null); }} style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-light,#e2e8f0)',
              backgroundColor: 'var(--surface-1,#fff)', color: 'var(--text-secondary,#475569)',
              cursor: 'pointer', fontSize: '0.85rem',
            }}>🗑 Clear</button>
          </div>
        </div>
        {live && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#15803d' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block', animation: 'mtp-blink 1.5s infinite' }} />
            Live — polling every {API_POLL_MS / 1000}s
          </div>
        )}
        {error === 'unauthenticated' ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🔒</div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Sign in to view MCP traffic</div>
            <div style={{ fontSize: '0.82rem' }}>MCP traffic is only available in authenticated sessions.</div>
          </div>
        ) : error ? (
          <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '0.85rem', marginTop: '8px' }}>
            ⚠️ {error}
          </div>
        ) : null}
      </div>

      <McpToolsPanel />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', borderTop: '1px solid var(--border-light,#e2e8f0)' }}>
        {viewMode === 'pairs' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <McpPairView entries={entries} />
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              {entries.length === 0 ? (
                <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted,#94a3b8)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔌</div>
                  <div>No MCP traffic yet. Use the AI agent to generate tool calls.</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ backgroundColor: 'var(--surface-2,#f8fafc)', borderBottom: '2px solid var(--border-light,#e2e8f0)' }}>
                      {['Time', 'Direction', 'Type', 'Method', 'Tool', 'Duration', 'Summary', 'Actions'].map((h) => (
                        <th key={h} style={{ padding: '8px 8px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted,#64748b)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reversed.map((entry, idx) => {
                      const key = `${entry.ts}-${idx}`;
                      const isSel = selected && selected._key === key;
                      return (
                        <EntryRow
                          key={key}
                          entry={entry}
                          idx={idx}
                          isSelected={isSel}
                          onClick={() => setSelected(isSel ? null : Object.assign({}, entry, { _key: key }))}
                        />
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {selected && <DetailPanel entry={selected} onClose={() => setSelected(null)} />}
          </>
        )}
      </div>

      <style>{'@keyframes mtp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} } tbody tr:hover td { background-color: #eff6ff; }'}</style>
    </div>
  );
}
