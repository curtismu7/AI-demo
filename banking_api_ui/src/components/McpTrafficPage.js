// banking_api_ui/src/components/McpTrafficPage.js
/**
 * MCP Traffic Viewer — shows live BFF↔MCP and BFF↔PingOne traffic.
 * Polls GET /api/mcp/traffic every 3 seconds.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_POLL_MS = 3000;
const DEFAULT_LIMIT = 200;

const DIR_COLORS = {
  'BFF→MCP':     { bg: '#dbeafe', color: '#1d4ed8', label: 'BFF→MCP' },
  'MCP→BFF':     { bg: '#dcfce7', color: '#15803d', label: 'MCP→BFF' },
  'BFF→PingOne': { bg: '#fef9c3', color: '#854d0e', label: 'BFF→PingOne' },
  'PingOne→BFF': { bg: '#fce7f3', color: '#9d174d', label: 'PingOne→BFF' },
};

const TYPE_LABEL = {
  rpc_request:       'RPC REQ',
  rpc_response:      'RPC RESP',
  exchange_request:  'EXCH REQ',
  exchange_response: 'EXCH RESP',
  error:             'ERROR',
};

function DirBadge({ dir }) {
  const style = DIR_COLORS[dir] || { bg: '#f3f4f6', color: '#374151', label: dir };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: '4px',
      fontSize: '0.7rem',
      fontWeight: 700,
      backgroundColor: style.bg,
      color: style.color,
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
    }}>
      {style.label}
    </span>
  );
}

function TypeBadge({ type, ok }) {
  const isErr = type === 'error' || ok === false;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '0.68rem',
      fontWeight: 600,
      backgroundColor: isErr ? '#fee2e2' : '#f1f5f9',
      color: isErr ? '#991b1b' : '#475569',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
    }}>
      {TYPE_LABEL[type] || type}
    </span>
  );
}

function EntryRow({ entry, idx }) {
  const isErr = entry.type === 'error' || entry.ok === false;
  const ts = new Date(entry.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });

  return (
    <tr style={{
      backgroundColor: isErr
        ? 'rgba(254,226,226,0.4)'
        : idx % 2 === 0 ? 'var(--surface-1, #fff)' : 'var(--surface-2, #f8fafc)',
      borderBottom: '1px solid var(--border-light, #e2e8f0)',
      fontSize: '0.82rem',
    }}>
      <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: 'var(--text-muted, #64748b)', whiteSpace: 'nowrap' }}>{ts}</td>
      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}><DirBadge dir={entry.dir} /></td>
      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}><TypeBadge type={entry.type} ok={entry.ok} /></td>
      <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: 'var(--text-secondary, #475569)', whiteSpace: 'nowrap' }}>
        {entry.method || '—'}
      </td>
      <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: 'var(--text-secondary, #475569)', whiteSpace: 'nowrap' }}>
        {entry.tool || '—'}
      </td>
      <td style={{ padding: '5px 8px', color: 'var(--text-muted, #64748b)', whiteSpace: 'nowrap' }}>
        {entry.durationMs != null ? `${entry.durationMs}ms` : '—'}
      </td>
      <td style={{ padding: '5px 10px', color: isErr ? '#991b1b' : 'var(--text-primary, #1e293b)', maxWidth: '480px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={entry.summary}>
        {entry.summary || '—'}
      </td>
    </tr>
  );
}

export default function McpTrafficPage() {
  const [entries, setEntries] = useState([]);
  const [live, setLive] = useState(true);
  const [error, setError] = useState(null);
  const [logFile, setLogFile] = useState('');
  const intervalRef = useRef(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  const fetchTraffic = useCallback(async () => {
    if (!liveRef.current) return;
    try {
      const res = await fetch(`/api/mcp/traffic?limit=${DEFAULT_LIMIT}`, { credentials: 'include' });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
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
      if (!prev) {
        // Resuming — fetch immediately
        liveRef.current = true;
        fetchTraffic();
      }
      return !prev;
    });
  };

  const handleClear = () => setEntries([]);

  const reversed = [...entries].reverse();

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary, #1e293b)' }}>
          🔌 MCP Traffic
        </h1>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #64748b)', fontFamily: 'monospace' }}>
          {entries.length} entries
          {logFile ? ` · ${logFile}` : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleLiveToggle}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #e2e8f0)',
              backgroundColor: live ? '#dcfce7' : 'var(--surface-1, #fff)',
              color: live ? '#15803d' : 'var(--text-secondary, #475569)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            {live ? '⏸ Pause' : '▶ Live'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #e2e8f0)',
              backgroundColor: 'var(--surface-1, #fff)',
              color: 'var(--text-secondary, #475569)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            🗑 Clear
          </button>
        </div>
      </div>

      {/* Live indicator */}
      {live && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontSize: '0.8rem', color: '#15803d' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block', animation: 'blink 1.5s infinite' }} />
          Live — polling every {API_POLL_MS / 1000}s
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b', marginBottom: '12px', fontSize: '0.85rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      {entries.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔌</div>
          <div>No MCP traffic yet. Use the AI agent to generate tool calls.</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-light, #e2e8f0)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surface-2, #f8fafc)', borderBottom: '2px solid var(--border-light, #e2e8f0)' }}>
                {['Time', 'Direction', 'Type', 'Method', 'Tool', 'Duration', 'Summary'].map(h => (
                  <th key={h} style={{ padding: '8px 8px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted, #64748b)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reversed.map((entry, idx) => (
                <EntryRow key={`${entry.ts}-${idx}`} entry={entry} idx={idx} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
