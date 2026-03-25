/**
 * LogViewer Component
 * Displays application and Vercel logs in a real-time table with filtering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './LogViewer.css';

const LogViewer = ({ isOpen, onClose }) => {
  // ── Drag-to-move ────────────────────────────────────────────────────────
  const [dragPos, setDragPos] = useState(null); // null = default anchored position
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button, input, select, label')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!dragPos) setDragPos({ x: rect.left, y: rect.top });
    e.preventDefault();
  }, [dragPos]);

  useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingRef.current) return;
      // No clamping — allow dragging to secondary monitors
      setDragPos({ x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y });
    };
    const onUp = () => { isDraggingRef.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const resetPosition = () => setDragPos(null);

  // ── Pop out to new window ────────────────────────────────────────────────
  const popOut = () => {
    const w = window.open('', 'logviewer', 'width=1300,height=750,resizable=yes,scrollbars=yes');
    if (!w) return;
    const rows = logs.map(log => {
      const level = (log.level || 'info').toLowerCase();
      const colors = { error: '#ef4444', warn: '#f59e0b', info: '#3b82f6', debug: '#6b7280' };
      const color = colors[level] || '#9ca3af';
      const ts = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      const msg = typeof log.message === 'object' ? JSON.stringify(log.message, null, 2) : (log.message || '');
      return `<tr style="border-bottom:1px solid #2a2a2a">
        <td style="padding:8px 12px;color:#888;font-size:12px;white-space:nowrap">${ts}</td>
        <td style="padding:8px 12px;text-align:center"><span style="background:${color};padding:2px 7px;border-radius:3px;color:#fff;font-size:11px;font-weight:600">${level.toUpperCase()}</span></td>
        <td style="padding:8px 12px;font-size:11px;color:#9ca3af;text-transform:uppercase">${log._src||'—'}</td>
        <td style="padding:8px 12px;white-space:pre-wrap;word-break:break-word;font-family:monospace;color:#ddd">${msg.replace(/</g,'&lt;')}</td>
      </tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>BX Finance — Log Viewer</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1e1e1e;color:#ddd;font-family:-apple-system,sans-serif;font-size:13px}
      table{width:100%;border-collapse:collapse}thead{position:sticky;top:0;background:#252525;z-index:10}
      th{text-align:left;padding:10px 12px;color:#aaa;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #444}
      tr:hover{background:#252525}.src{font-size:.7rem}</style></head>
      <body><table><thead><tr><th style="width:110px">Time</th><th style="width:70px">Level</th><th style="width:60px">Src</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
  };
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState({
    level: '',
    search: '',
    source: 'all' // all, console, app, vercel
  });
  const [stats, setStats] = useState(null);
  const logContainerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        limit: 500,
        ...(filter.level && { level: filter.level }),
        ...(filter.search && { search: filter.search })
      };

      let incoming = [];
      if (filter.source === 'all') {
        const sources = ['console', 'app', 'vercel'];
        const results = await Promise.allSettled(
          sources.map(src => axios.get(`/api/logs/${src}`, { params }))
        );
        incoming = results
          .flatMap((r, i) =>
            r.status === 'fulfilled'
              ? (r.value.data.logs || []).map(l => ({ ...l, _src: sources[i] }))
              : []
          )
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } else {
        const response = await axios.get(`/api/logs/${filter.source}`, { params });
        incoming = (response.data.logs || []).map(l => ({ ...l, _src: filter.source }));
      }

      // Merge incoming with existing logs, deduplicating on timestamp+message
      setLogs(prev => {
        const seen = new Set(prev.map(l => `${l.timestamp}|${l.message}`));
        const newEntries = incoming.filter(l => !seen.has(`${l.timestamp}|${l.message}`));
        if (newEntries.length === 0) return prev;
        return [...prev, ...newEntries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      });
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get('/api/logs/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      fetchStats();
    }
  }, [isOpen, fetchLogs, fetchStats]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;

    const interval = setInterval(() => {
      if (!paused) {
        fetchLogs();
        fetchStats();
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, paused, fetchLogs, fetchStats]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const clearLogs = async () => {
    if (!window.confirm('Clear all console logs?')) return;

    try {
      await axios.delete('/api/logs/console');
      setLogs([]);
      fetchStats();
    } catch (err) {
      console.error('Error clearing logs:', err);
      setError(err.message);
    }
  };

  const [copied, setCopied] = useState(false);

  const copyLast10Lines = () => {
    const last10 = logs.slice(-10);
    const text = last10
      .map(log => `[${formatTimestamp(log.timestamp)}] [${(log.level || 'info').toUpperCase()}] ${typeof log.message === 'object' ? JSON.stringify(log.message) : log.message}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadLogs = () => {
    const content = logs.map(log => JSON.stringify(log)).join('\n');
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'error': return '#ef4444';
      case 'warn': return '#f59e0b';
      case 'info': return '#3b82f6';
      case 'debug': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  if (!isOpen) return null;

  const panelStyle = dragPos
    ? { position: 'fixed', left: dragPos.x, top: dragPos.y, right: 'auto', bottom: 'auto', transform: 'none' }
    : {};

  return (
    <div className="log-viewer-float" ref={panelRef} style={panelStyle}>
        <div className="log-viewer-header" onMouseDown={handleDragStart} style={{ cursor: 'grab' }}>
          <h2>📊 Log Viewer</h2>
          <div className="log-viewer-header-actions">
            <button className="log-action-btn" onClick={resetPosition} title="Reset position">⌂</button>
            <button className="log-action-btn" onClick={popOut} title="Pop out to new window">⤢</button>
            <button className="close-button" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="log-viewer-controls">
          <div className="control-group">
            <label>Source:</label>
            <select 
              value={filter.source} 
              onChange={(e) => setFilter({ ...filter, source: e.target.value })}
            >
              <option value="all">All Sources</option>
              <option value="console">Console Logs</option>
              <option value="app">Application Logs</option>
              <option value="vercel">Vercel Logs</option>
            </select>
          </div>

          <div className="control-group">
            <label>Level:</label>
            <select 
              value={filter.level} 
              onChange={(e) => setFilter({ ...filter, level: e.target.value })}
            >
              <option value="">All</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
          </div>

          <div className="control-group search-group">
            <label>Search:</label>
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter.search}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            />
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
          </div>

          <button onClick={fetchLogs} disabled={loading} className="refresh-button">
            🔄 Refresh
          </button>

          {autoRefresh && (
            <button
              onClick={() => setPaused(p => !p)}
              className={paused ? 'resume-button' : 'pause-button'}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
          )}

          <button onClick={downloadLogs} className="download-button">
            💾 Download
          </button>

          <button onClick={copyLast10Lines} className="copy-button" disabled={logs.length === 0}>
            {copied ? '✅ Copied!' : '📋 Copy last 10'}
          </button>

          {(filter.source === 'console' || filter.source === 'all') && (
            <button onClick={clearLogs} className="clear-button">
              🗑️ Clear
            </button>
          )}
        </div>

        {stats && (
          <div className="log-stats">
            <span>Total: {stats.total}</span>
            <span style={{ color: '#ef4444' }}>Errors: {stats.byLevel?.error || 0}</span>
            <span style={{ color: '#f59e0b' }}>Warnings: {stats.byLevel?.warn || 0}</span>
            <span style={{ color: '#3b82f6' }}>Info: {stats.byLevel?.info || 0}</span>
          </div>
        )}

        {error && (
          <div className="log-error">
            ⚠️ Error: {error}
          </div>
        )}

        <div className="log-table-container" ref={logContainerRef}>
          <table className="log-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Time</th>
                <th style={{ width: '80px' }}>Level</th>
                <th style={{ width: '70px' }}>Source</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="3" className="loading-cell">Loading logs...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="3" className="empty-cell">No logs found</td>
                </tr>
              ) : (
                logs.map((log, index) => (
                  <tr key={index} className={`log-row log-${log.level}`}>
                    <td className="log-time">{formatTimestamp(log.timestamp)}</td>
                    <td className="log-level">
                      <span 
                        className="level-badge" 
                        style={{ backgroundColor: getLevelColor(log.level) }}
                      >
                        {log.level?.toUpperCase() || 'INFO'}
                      </span>
                    </td>
                    <td className="log-source" style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{log._src || '—'}</td>
                    <td className="log-message">
                      {typeof log.message === 'object' 
                        ? JSON.stringify(log.message, null, 2)
                        : log.message}
                      {log.correlationId && (
                        <span className="correlation-id">
                          🔗 {log.correlationId}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="log-viewer-footer">
          <span>{logs.length} logs displayed</span>
          {autoRefresh && !paused && <span className="refresh-indicator">● Live</span>}
          {autoRefresh && paused && <span className="refresh-indicator paused-indicator">⏸ Paused</span>}
        </div>
    </div>
  );
};

export default LogViewer;
